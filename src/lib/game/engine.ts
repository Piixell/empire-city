// ---------------------------------------------------------------------------
// Empire City — authoritative game engine.
//
// Pure & deterministic: (state, actor, command, {now, rng}) -> new state + events.
// It never touches the network or the database. The server runs it inside a
// Postgres transaction while holding a row lock on the game, so commands are
// fully serialized. Clients only ever *display* its output.
// ---------------------------------------------------------------------------

import { JAIL_FINE, boardOf, districtTiles, isOwnable, tileAt, unmortgageCost } from "./board";
import { getCard, cardsOfDeck, DECK_NAMES } from "./cards";
import {
  AUCTION_EXTEND_MS,
  AUCTION_MIN_FIRST_BID,
  AUCTION_MIN_INCREMENT,
  AUCTION_START_MS,
  LOG_LIMIT,
  MAX_PENDING_TRADES_PER_PLAYER,
  RESUME_GRACE_MS,
  TRADE_HISTORY_LIMIT,
  activePlayers,
  computeRent,
  districtHasMortgage,
  findPlayer,
  formatCr,
  nearestForward,
  netWorth,
  ownedTiles,
  ownsDistrict,
  playersBySeat,
  tileIsFreeOfBuildings,
  type RentOptions,
} from "./rules";
import {
  MAX_BUILDINGS,
  type Command,
  type DeckKind,
  type GameEvent,
  type GameSettings,
  type GameState,
  type PlayerColor,
  type PlayerState,
  type PublicGameState,
  type TokenModel,
  type TradeOffer,
} from "./types";

export interface Rng {
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  uuid(): string;
}

export interface EngineContext {
  now: number;
  rng: Rng;
}

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "GameError";
  }
}

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export interface NewPlayerInput {
  id: string;
  userId: string;
  roomPlayerId: string;
  name: string;
  color: PlayerColor;
  token: TokenModel;
  avatar: string;
}

export function createInitialState(input: {
  gameId: string;
  roomId: string;
  settings: GameSettings;
  players: NewPlayerInput[];
  now: number;
  rng: Rng;
}): GameState {
  const { settings, now, rng } = input;
  if (input.players.length < 2) throw new GameError("NOT_ENOUGH_PLAYERS", "Servono almeno due giocatori.");
  const board = boardOf(settings.board);
  if (input.players.length > board.maxPlayers) {
    throw new GameError("TOO_MANY_PLAYERS", `La plancia ${board.label} ammette al massimo ${board.maxPlayers} giocatori.`);
  }
  const order = shuffle(input.players, rng);
  const players: PlayerState[] = order.map((p, seat) => ({
    ...p,
    seat,
    balance: settings.startingCash,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: [],
    status: "active",
    eliminatedOrder: null,
    stats: { propertiesBought: 0, buildingsBuilt: 0, rentPaid: 0, rentReceived: 0 },
  }));
  const ownership: GameState["ownership"] = {};
  for (const i of boardOf(settings.board).ownable) ownership[i] = { tile: i, ownerId: null, houses: 0, mortgaged: false };
  const deck = (kind: DeckKind) => ({ kind, order: shuffle(cardsOfDeck(kind).map((c) => c.id), rng), index: 0 });
  const state: GameState = {
    id: input.gameId,
    roomId: input.roomId,
    status: "active",
    settings,
    players,
    ownership,
    decks: { chance: deck("chance"), community: deck("community") },
    turn: {
      number: 1,
      playerId: players[0].id,
      phase: "ROLL",
      dice: null,
      doublesCount: 0,
      extraRoll: false,
      hasRolled: false,
      pendingTile: null,
      deadline: now + settings.turnSeconds * 1000,
      savedDeadline: null,
      startedAt: now,
    },
    debts: [],
    auction: null,
    trades: [],
    lastCard: null,
    startedAt: now,
    endsAt: settings.maxDurationMinutes > 0 ? now + settings.maxDurationMinutes * 60_000 : null,
    finishedAt: null,
    winnerId: null,
    finishReason: null,
    version: 1,
    eventSeq: 0,
    log: [],
  };
  const ev: GameEvent = {
    seq: ++state.eventSeq,
    version: 1,
    at: now,
    type: "gameStart",
    playerId: null,
    message: `La partita ha inizio! Primo turno: ${players[0].name}.`,
    data: { seating: players.map((p) => p.id) },
  };
  state.log.push(ev);
  return state;
}

// ---------------------------------------------------------------------------
// Public projection
// ---------------------------------------------------------------------------

export function toPublicState(s: GameState): PublicGameState {
  const { decks, ...rest } = s;
  return {
    ...rest,
    decks: {
      chance: { remaining: Math.max(0, decks.chance.order.length - decks.chance.index) },
      community: { remaining: Math.max(0, decks.community.order.length - decks.community.index) },
    },
  };
}

// ---------------------------------------------------------------------------
// Command application
// ---------------------------------------------------------------------------

class Ctx {
  events: GameEvent[] = [];
  constructor(
    public s: GameState,
    public now: number,
    public rng: Rng,
  ) {}
  emit(type: string, message: string, playerId: string | null = null, data?: Record<string, unknown>) {
    this.events.push({ seq: ++this.s.eventSeq, version: this.s.version, at: this.now, type, playerId, message, data });
  }
  get T() {
    return this.s.settings.turnSeconds * 1000;
  }
}

function actorKey(s: GameState): string {
  const who =
    s.turn.phase === "DEBT" && s.debts[0]
      ? s.debts[0].debtorId
      : s.turn.phase === "AUCTION"
        ? "auction"
        : s.turn.playerId;
  return `${s.turn.number}|${s.turn.phase}|${who}`;
}

/** Commands that never change state when they are rejected; listed for clarity. */
export function applyCommand(prev: GameState, actorUserId: string | null, cmd: Command, ectx: EngineContext): ApplyResult {
  if (prev.status !== "active") throw new GameError("GAME_OVER", "La partita è terminata.", 409);
  const s: GameState = structuredClone(prev);
  s.version = prev.version + 1;
  const c = new Ctx(s, ectx.now, ectx.rng);
  const actor = actorUserId ? s.players.find((p) => p.userId === actorUserId) : undefined;
  const prevKey = actorKey(s);
  const prevPhase = s.turn.phase;
  const prevTurn = s.turn.number;

  switch (cmd.type) {
    case "ROLL": {
      const p = requireCurrent(s, actor);
      requirePhase(s, "ROLL");
      doRoll(c, p);
      break;
    }
    case "BUY": {
      const p = requireCurrent(s, actor);
      requirePhase(s, "BUY");
      doBuy(c, p);
      break;
    }
    case "DECLINE_BUY": {
      const p = requireCurrent(s, actor);
      requirePhase(s, "BUY");
      doDecline(c, p);
      break;
    }
    case "BID": {
      const p = requireActive(actor);
      requirePhase(s, "AUCTION");
      doBid(c, p, cmd.amount);
      break;
    }
    case "AUCTION_PASS": {
      const p = requireActive(actor);
      requirePhase(s, "AUCTION");
      doAuctionPass(c, p);
      break;
    }
    case "PAY_JAIL": {
      const p = requireCurrent(s, actor);
      requirePhase(s, "ROLL");
      if (!p.inJail) throw new GameError("NOT_IN_JAIL", "Non sei nelle Segrete.");
      if (p.balance < JAIL_FINE) throw new GameError("INSUFFICIENT_FUNDS", `Servono ${formatCr(JAIL_FINE)} per pagare la cauzione.`);
      p.balance -= JAIL_FINE;
      p.inJail = false;
      p.jailTurns = 0;
      c.emit("jailPaid", `${p.name} paga la cauzione di ${formatCr(JAIL_FINE)} ed esce dalle Segrete.`, p.id, { amount: JAIL_FINE });
      break;
    }
    case "USE_JAIL_CARD": {
      const p = requireCurrent(s, actor);
      requirePhase(s, "ROLL");
      if (!p.inJail) throw new GameError("NOT_IN_JAIL", "Non sei nelle Segrete.");
      const cardId = p.jailCards.shift();
      if (!cardId) throw new GameError("NO_CARD", "Non possiedi carte di uscita.");
      s.decks[getCard(cardId).deck].order.push(cardId);
      p.inJail = false;
      p.jailTurns = 0;
      c.emit("jailCard", `${p.name} usa la carta "${getCard(cardId).title}" ed esce dalle Segrete.`, p.id, { cardId });
      break;
    }
    case "BUILD": {
      const p = requireCurrent(s, actor);
      requirePhase(s, "ROLL", "MANAGE");
      doBuild(c, p, cmd.tile);
      break;
    }
    case "SELL_BUILDING": {
      const p = requireManager(s, actor);
      doSellBuilding(c, p, cmd.tile);
      break;
    }
    case "MORTGAGE": {
      const p = requireManager(s, actor);
      doMortgage(c, p, cmd.tile);
      break;
    }
    case "UNMORTGAGE": {
      const p = requireCurrent(s, actor);
      requirePhase(s, "ROLL", "MANAGE");
      doUnmortgage(c, p, cmd.tile);
      break;
    }
    case "PAY_DEBT": {
      const p = requireDebtor(s, actor);
      payFirstDebt(c, p);
      break;
    }
    case "DECLARE_BANKRUPTCY": {
      const p = requireDebtor(s, actor);
      bankrupt(c, p, s.debts[0].creditorId);
      break;
    }
    case "RESIGN": {
      const p = requireActive(actor);
      if (s.turn.phase === "AUCTION") throw new GameError("BAD_PHASE", "Attendi la fine dell'asta per abbandonare.");
      const d = s.debts.find((x) => x.debtorId === p.id);
      c.emit("resign", `${p.name} abbandona la partita.`, p.id);
      bankrupt(c, p, d ? d.creditorId : null);
      break;
    }
    case "END_TURN": {
      requireCurrent(s, actor);
      requirePhase(s, "MANAGE");
      advanceTurn(c);
      break;
    }
    case "PROPOSE_TRADE": {
      const p = requireActive(actor);
      if (s.turn.phase === "AUCTION") throw new GameError("BAD_PHASE", "Non puoi proporre scambi durante un'asta.");
      doPropose(c, p, cmd);
      break;
    }
    case "ACCEPT_TRADE": {
      const p = requireActive(actor);
      if (s.turn.phase === "AUCTION") throw new GameError("BAD_PHASE", "Non puoi concludere scambi durante un'asta.");
      doAcceptTrade(c, p, cmd.tradeId);
      break;
    }
    case "REJECT_TRADE": {
      const p = requireActive(actor);
      const t = pendingTrade(s, cmd.tradeId);
      if (t.toId !== p.id) throw new GameError("FORBIDDEN", "Questa proposta non è indirizzata a te.", 403);
      t.status = "rejected";
      t.resolvedAt = c.now;
      c.emit("tradeRejected", `${p.name} rifiuta la proposta di ${nameOf(s, t.fromId)}.`, p.id, { tradeId: t.id });
      break;
    }
    case "CANCEL_TRADE": {
      const p = requireActive(actor);
      const t = pendingTrade(s, cmd.tradeId);
      if (t.fromId !== p.id) throw new GameError("FORBIDDEN", "Puoi annullare solo le tue proposte.", 403);
      t.status = "cancelled";
      t.resolvedAt = c.now;
      c.emit("tradeCancelled", `${p.name} ritira la proposta a ${nameOf(s, t.toId)}.`, p.id, { tradeId: t.id });
      break;
    }
    case "TIMEOUT": {
      doTimeout(c);
      break;
    }
    default: {
      const never: never = cmd;
      throw new GameError("UNKNOWN_COMMAND", `Comando sconosciuto: ${(never as { type: string }).type}`);
    }
  }

  settle(c, prevKey, prevPhase, prevTurn);
  s.log = [...s.log, ...c.events].slice(-LOG_LIMIT);
  // keep pending trades + bounded history
  const pending = s.trades.filter((t) => t.status === "pending");
  const done = s.trades
    .filter((t) => t.status !== "pending")
    .sort((a, b) => (b.resolvedAt ?? b.createdAt) - (a.resolvedAt ?? a.createdAt))
    .slice(0, TRADE_HISTORY_LIMIT);
  s.trades = [...pending, ...done];
  return { state: s, events: c.events };
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function requireActive(actor: PlayerState | undefined): PlayerState {
  if (!actor) throw new GameError("NOT_A_PLAYER", "Non partecipi a questa partita.", 403);
  if (actor.status !== "active") throw new GameError("SPECTATOR", "Sei in modalità spettatore.", 403);
  return actor;
}

function requireCurrent(s: GameState, actor: PlayerState | undefined): PlayerState {
  const p = requireActive(actor);
  if (s.turn.playerId !== p.id) throw new GameError("NOT_YOUR_TURN", "Non è il tuo turno.", 403);
  return p;
}

function requirePhase(s: GameState, ...phases: GameState["turn"]["phase"][]) {
  if (!phases.includes(s.turn.phase)) {
    throw new GameError("BAD_PHASE", `Azione non consentita in questa fase (${phaseLabel(s.turn.phase)}).`, 409);
  }
}

function requireDebtor(s: GameState, actor: PlayerState | undefined): PlayerState {
  const p = requireActive(actor);
  if (s.turn.phase !== "DEBT" || s.debts[0]?.debtorId !== p.id) {
    throw new GameError("NO_DEBT", "Non hai pagamenti in sospeso.", 409);
  }
  return p;
}

/** Who may sell buildings / mortgage: the current player in their own phases, or the debtor in DEBT. */
function requireManager(s: GameState, actor: PlayerState | undefined): PlayerState {
  const p = requireActive(actor);
  if (s.turn.phase === "DEBT") {
    if (s.debts[0]?.debtorId === p.id) return p;
    throw new GameError("BAD_PHASE", "Un altro giocatore sta saldando un debito.", 409);
  }
  if (s.turn.playerId !== p.id) throw new GameError("NOT_YOUR_TURN", "Puoi gestire le proprietà solo durante il tuo turno.", 403);
  requirePhase(s, "ROLL", "MANAGE", "BUY");
  return p;
}

export function phaseLabel(phase: GameState["turn"]["phase"]): string {
  switch (phase) {
    case "ROLL":
      return "lancio dei dadi";
    case "BUY":
      return "decisione di acquisto";
    case "AUCTION":
      return "asta in corso";
    case "DEBT":
      return "pagamento in sospeso";
    case "MANAGE":
      return "gestione e fine turno";
    case "GAME_OVER":
      return "partita terminata";
  }
}

function nameOf(s: GameState, id: string | null): string {
  if (!id) return "la Banca";
  return findPlayer(s, id)?.name ?? "?";
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

function charge(c: Ctx, payer: PlayerState, creditorId: string | null, amount: number, reason: string, isRent = false) {
  if (amount <= 0) return;
  const s = c.s;
  if (payer.balance >= amount) {
    transfer(c, payer, creditorId, amount, reason, isRent);
  } else {
    s.debts.push({ debtorId: payer.id, creditorId, amount, reason, isRent });
    c.emit(
      "debt",
      `${payer.name} deve ${formatCr(amount)} a ${nameOf(s, creditorId)} (${reason}) ma non ha abbastanza liquidità.`,
      payer.id,
      { amount, creditorId, reason },
    );
  }
}

function transfer(c: Ctx, payer: PlayerState, creditorId: string | null, amount: number, reason: string, isRent: boolean) {
  const creditor = creditorId ? findPlayer(c.s, creditorId) : undefined;
  payer.balance -= amount;
  if (creditor && creditor.status === "active") creditor.balance += amount;
  if (isRent) {
    payer.stats.rentPaid += amount;
    if (creditor) creditor.stats.rentReceived += amount;
  }
  c.emit(
    isRent ? "rent" : "payment",
    `${payer.name} paga ${formatCr(amount)} a ${creditor && creditor.status === "active" ? creditor.name : "la Banca"} — ${reason}.`,
    payer.id,
    { amount, creditorId: creditor?.status === "active" ? creditor.id : null, reason },
  );
}

function credit(c: Ctx, p: PlayerState, amount: number, reason: string) {
  p.balance += amount;
  c.emit("income", `${p.name} riceve ${formatCr(amount)} — ${reason}.`, p.id, { amount, reason });
}

function payFirstDebt(c: Ctx, p: PlayerState) {
  const d = c.s.debts[0];
  if (p.balance < d.amount) {
    throw new GameError("INSUFFICIENT_FUNDS", `Ti mancano ${formatCr(d.amount - p.balance)}. Vendi edifici, ipoteca o tratta.`);
  }
  c.s.debts.shift();
  transfer(c, p, d.creditorId, d.amount, d.reason, !!d.isRent);
}

// ---------------------------------------------------------------------------
// Movement & landing
// ---------------------------------------------------------------------------

function moveSteps(c: Ctx, p: PlayerState, steps: number) {
  const from = p.position;
  const to = (((from + steps) % boardOf(c.s).size) + boardOf(c.s).size) % boardOf(c.s).size;
  p.position = to;
  c.emit("move", `${p.name} si sposta su ${tileAt(c.s, to).name}.`, p.id, { from, to, steps, mode: "walk" });
  if (steps > 0 && from + steps >= boardOf(c.s).size) {
    credit(c, p, c.s.settings.goBonus, "passaggio dalla Fontana della Rinascita");
  }
}

function moveToTile(c: Ctx, p: PlayerState, target: number) {
  const steps = (target - p.position + boardOf(c.s).size) % boardOf(c.s).size;
  if (steps === 0) return;
  moveSteps(c, p, steps);
}

function sendToJail(c: Ctx, p: PlayerState, reason: string) {
  const from = p.position;
  p.position = boardOf(c.s).jailIndex;
  p.inJail = true;
  p.jailTurns = 0;
  if (c.s.turn.playerId === p.id) {
    c.s.turn.extraRoll = false;
    c.s.turn.doublesCount = 0;
  }
  c.emit("jail", `${p.name} finisce nelle Segrete del Re: ${reason}.`, p.id, { from, to: boardOf(c.s).jailIndex, mode: "jump" });
}

function doRoll(c: Ctx, p: PlayerState) {
  const s = c.s;
  const d1 = 1 + c.rng.int(6);
  const d2 = 1 + c.rng.int(6);
  const total = d1 + d2;
  const doubles = d1 === d2;
  s.turn.dice = [d1, d2];
  s.turn.hasRolled = true;
  c.emit("dice", `${p.name} lancia i dadi: ${d1} + ${d2} = ${total}${doubles ? " (doppio!)" : ""}.`, p.id, {
    dice: [d1, d2],
    doubles,
  });

  if (p.inJail) {
    s.turn.extraRoll = false;
    if (doubles) {
      p.inJail = false;
      p.jailTurns = 0;
      c.emit("jailRelease", `${p.name} fa un doppio ed evade dalle Segrete!`, p.id);
    } else {
      p.jailTurns += 1;
      if (p.jailTurns < 3) {
        c.emit("jailStay", `${p.name} resta nelle Segrete (tentativo ${p.jailTurns}/3).`, p.id);
        return;
      }
      p.inJail = false;
      p.jailTurns = 0;
      c.emit("jailForced", `${p.name} esaurisce i tentativi e deve pagare la cauzione.`, p.id);
      charge(c, p, null, JAIL_FINE, "cauzione");
    }
    moveSteps(c, p, total);
    resolveLanding(c, p, { diceTotal: total }, 0);
    return;
  }

  if (doubles) {
    s.turn.doublesCount += 1;
    if (s.turn.doublesCount >= 3) {
      sendToJail(c, p, "tre doppi consecutivi");
      return;
    }
    s.turn.extraRoll = true;
  } else {
    s.turn.extraRoll = false;
  }
  moveSteps(c, p, total);
  resolveLanding(c, p, { diceTotal: total }, 0);
}

function resolveLanding(c: Ctx, p: PlayerState, opts: RentOptions, depth: number) {
  const s = c.s;
  const t = tileAt(s, p.position);
  switch (t.kind) {
    case "go":
    case "parking":
      return;
    case "jail":
      if (!p.inJail) c.emit("visit", `${p.name} fa visita alle Segrete del Re.`, p.id);
      return;
    case "goToJail":
      sendToJail(c, p, "è stato catturato dalle guardie reali");
      return;
    case "tax":
      charge(c, p, null, t.taxAmount ?? 0, t.name);
      return;
    case "chance":
    case "community":
      if (depth < 3) drawCard(c, p, t.kind, depth);
      return;
    case "property":
    case "transport":
    case "utility": {
      const o = s.ownership[t.index];
      if (!o.ownerId) {
        s.turn.pendingTile = t.index;
        c.emit("landUnowned", `${p.name} è su ${t.name}, in vendita a ${formatCr(t.price ?? 0)}.`, p.id, { tile: t.index });
      } else if (o.ownerId === p.id) {
        c.emit("landOwn", `${p.name} è su una sua proprietà: ${t.name}.`, p.id, { tile: t.index });
      } else if (o.mortgaged) {
        c.emit("landMortgaged", `${t.name} è ipotecata: nessun affitto dovuto.`, p.id, { tile: t.index });
      } else {
        const rent = computeRent(s, t.index, opts);
        charge(c, p, o.ownerId, rent, `affitto di ${t.name}`, true);
      }
      return;
    }
  }
}

function drawCard(c: Ctx, p: PlayerState, kind: DeckKind, depth: number) {
  const s = c.s;
  const deck = s.decks[kind];
  if (deck.order.length === 0) return;
  if (deck.index >= deck.order.length) {
    deck.order = shuffle(deck.order, c.rng);
    deck.index = 0;
    c.emit("deckShuffle", `Il mazzo ${DECK_NAMES[kind]} viene rimescolato.`, null, { deck: kind });
  }
  const cardId = deck.order[deck.index];
  deck.index += 1;
  const card = getCard(cardId);
  s.lastCard = { deck: kind, cardId, playerId: p.id, at: c.now };
  c.emit("card", `${p.name} pesca "${card.title}" (${DECK_NAMES[kind]}): ${card.text}`, p.id, { deck: kind, cardId });
  const e = card.effect;
  switch (e.type) {
    case "money":
      if (e.amount >= 0) credit(c, p, e.amount, card.title);
      else charge(c, p, null, -e.amount, card.title);
      return;
    case "moveTo":
      moveToTile(c, p, boardOf(s).anchors[e.to] ?? 0);
      resolveLanding(c, p, { diceTotal: diceTotal(s) }, depth + 1);
      return;
    case "moveToNearest": {
      const target = nearestForward(s, p.position, e.kind);
      moveToTile(c, p, target);
      resolveLanding(
        c,
        p,
        e.kind === "transport"
          ? { diceTotal: diceTotal(s), transportMultiplier: 2 }
          : { diceTotal: diceTotal(s), utilityFixedMultiplier: 10 },
        depth + 1,
      );
      return;
    }
    case "moveBy":
      moveSteps(c, p, e.steps);
      resolveLanding(c, p, { diceTotal: diceTotal(s) }, depth + 1);
      return;
    case "goToJail":
      sendToJail(c, p, card.title);
      return;
    case "jailFree":
      deck.order.splice(deck.index - 1, 1);
      deck.index -= 1;
      p.jailCards.push(cardId);
      return;
    case "repairs": {
      let houses = 0;
      let towers = 0;
      for (const o of ownedTiles(s, p.id)) {
        if (o.houses === MAX_BUILDINGS) towers++;
        else houses += o.houses;
      }
      charge(c, p, null, houses * e.perHouse + towers * e.perTower, card.title);
      return;
    }
    case "collectFromEach":
      for (const other of activePlayers(s)) {
        if (other.id !== p.id) charge(c, other, p.id, e.amount, card.title);
      }
      return;
    case "payEach":
      for (const other of activePlayers(s)) {
        if (other.id !== p.id) charge(c, p, other.id, e.amount, card.title);
      }
      return;
  }
}

function diceTotal(s: GameState): number {
  return s.turn.dice ? s.turn.dice[0] + s.turn.dice[1] : 7;
}

// ---------------------------------------------------------------------------
// Buying & auctions
// ---------------------------------------------------------------------------

function doBuy(c: Ctx, p: PlayerState) {
  const s = c.s;
  const idx = s.turn.pendingTile;
  if (idx == null) throw new GameError("NOTHING_TO_BUY", "Nessuna proprietà da acquistare.");
  const t = tileAt(s, idx);
  const price = t.price ?? 0;
  if (p.balance < price) throw new GameError("INSUFFICIENT_FUNDS", `Fondi insufficienti: servono ${formatCr(price)}.`);
  p.balance -= price;
  s.ownership[idx].ownerId = p.id;
  p.stats.propertiesBought += 1;
  s.turn.pendingTile = null;
  c.emit("buy", `${p.name} acquista ${t.name} per ${formatCr(price)}.`, p.id, { tile: idx, price });
}

function doDecline(c: Ctx, p: PlayerState) {
  const s = c.s;
  const idx = s.turn.pendingTile;
  if (idx == null) throw new GameError("NOTHING_TO_BUY", "Nessuna proprietà in sospeso.");
  s.turn.pendingTile = null;
  if (s.settings.auctionsEnabled && activePlayers(s).length >= 2) {
    s.auction = {
      id: c.rng.uuid(),
      tile: idx,
      highBid: 0,
      highBidderId: null,
      passedIds: [],
      bids: [],
      deadline: c.now + AUCTION_START_MS,
      startedAt: c.now,
    };
    c.emit("auctionStart", `${p.name} rinuncia: ${tileAt(s, idx).name} va all'asta!`, p.id, { tile: idx, auctionId: s.auction.id });
  } else {
    c.emit("declined", `${p.name} rinuncia all'acquisto di ${tileAt(s, idx).name}.`, p.id, { tile: idx });
  }
}

export function minNextBid(highBid: number): number {
  return highBid === 0 ? AUCTION_MIN_FIRST_BID : highBid + AUCTION_MIN_INCREMENT;
}

function doBid(c: Ctx, p: PlayerState, amount: number) {
  const a = c.s.auction!;
  if (!Number.isInteger(amount)) throw new GameError("BAD_AMOUNT", "Importo non valido.");
  if (a.passedIds.includes(p.id)) throw new GameError("PASSED", "Hai già abbandonato questa asta.");
  if (a.highBidderId === p.id) throw new GameError("ALREADY_HIGHEST", "Sei già il miglior offerente.");
  const min = minNextBid(a.highBid);
  if (amount < min) throw new GameError("BID_TOO_LOW", `L'offerta minima è ${formatCr(min)}.`);
  if (amount > p.balance) throw new GameError("INSUFFICIENT_FUNDS", "Non puoi offrire più del tuo saldo.");
  a.highBid = amount;
  a.highBidderId = p.id;
  a.bids.push({ playerId: p.id, amount, at: c.now });
  a.deadline = Math.max(a.deadline, c.now + AUCTION_EXTEND_MS);
  c.emit("bid", `${p.name} offre ${formatCr(amount)} per ${tileAt(c.s, a.tile).name}.`, p.id, { amount, auctionId: a.id });
  maybeCloseAuction(c);
}

function doAuctionPass(c: Ctx, p: PlayerState) {
  const a = c.s.auction!;
  if (a.passedIds.includes(p.id)) throw new GameError("PASSED", "Hai già abbandonato questa asta.");
  if (a.highBidderId === p.id) throw new GameError("ALREADY_HIGHEST", "Sei il miglior offerente: non puoi ritirarti.");
  a.passedIds.push(p.id);
  c.emit("auctionPass", `${p.name} si ritira dall'asta.`, p.id, { auctionId: a.id });
  maybeCloseAuction(c);
}

function maybeCloseAuction(c: Ctx) {
  const a = c.s.auction!;
  const remaining = activePlayers(c.s).filter((p) => !a.passedIds.includes(p.id));
  if (a.highBidderId) {
    if (remaining.every((p) => p.id === a.highBidderId)) closeAuction(c);
  } else if (remaining.length === 0) {
    closeAuction(c);
  }
}

function closeAuction(c: Ctx) {
  const s = c.s;
  const a = s.auction;
  if (!a) return;
  s.auction = null;
  const t = tileAt(s, a.tile);
  const winner = findPlayer(s, a.highBidderId);
  if (winner && winner.status === "active" && winner.balance >= a.highBid && !s.ownership[a.tile].ownerId) {
    winner.balance -= a.highBid;
    s.ownership[a.tile].ownerId = winner.id;
    winner.stats.propertiesBought += 1;
    c.emit("auctionWon", `${winner.name} si aggiudica ${t.name} all'asta per ${formatCr(a.highBid)}.`, winner.id, {
      tile: a.tile,
      amount: a.highBid,
      auctionId: a.id,
    });
  } else {
    c.emit("auctionNoBids", `Nessuna offerta valida: ${t.name} resta alla Banca.`, null, { tile: a.tile, auctionId: a.id });
  }
}

// ---------------------------------------------------------------------------
// Buildings & mortgages
// ---------------------------------------------------------------------------

function requireOwnedProperty(s: GameState, p: PlayerState, tile: number) {
  if (!Number.isInteger(tile) || !isOwnable(s, tile)) throw new GameError("BAD_TILE", "Casella non valida.");
  const o = s.ownership[tile];
  if (o.ownerId !== p.id) throw new GameError("NOT_OWNER", "Non possiedi questa proprietà.", 403);
  return { o, t: tileAt(s, tile) };
}

export function canBuildReason(s: GameState, p: PlayerState, tile: number): string | null {
  if (!isOwnable(s, tile)) return "Casella non valida.";
  const o = s.ownership[tile];
  const t = tileAt(s, tile);
  if (o.ownerId !== p.id) return "Non possiedi questa proprietà.";
  if (t.kind !== "property" || !t.district) return "Si può costruire solo sulle proprietà delle regioni.";
  if (!ownsDistrict(s, p.id, t.district)) return "Devi possedere l'intera regione.";
  if (districtHasMortgage(s, t.district)) return "La regione ha proprietà ipotecate.";
  if (o.houses >= MAX_BUILDINGS) return "Edificio massimo già costruito.";
  const minH = Math.min(...districtTiles(s, t.district).map((i) => s.ownership[i].houses));
  if (o.houses > minH) return "Costruzione uniforme: costruisci prima sulle altre proprietà della regione.";
  if (p.balance < (t.houseCost ?? 0)) return "Fondi insufficienti.";
  return null;
}

export function canSellBuildingReason(s: GameState, p: PlayerState, tile: number): string | null {
  if (!isOwnable(s, tile)) return "Casella non valida.";
  const o = s.ownership[tile];
  const t = tileAt(s, tile);
  if (o.ownerId !== p.id) return "Non possiedi questa proprietà.";
  if (o.houses <= 0 || !t.district) return "Nessun edificio da vendere.";
  const maxH = Math.max(...districtTiles(s, t.district).map((i) => s.ownership[i].houses));
  if (o.houses < maxH) return "Vendita uniforme: vendi prima dalle proprietà con più edifici.";
  return null;
}

export function canMortgageReason(s: GameState, p: PlayerState, tile: number): string | null {
  if (!isOwnable(s, tile)) return "Casella non valida.";
  const o = s.ownership[tile];
  if (o.ownerId !== p.id) return "Non possiedi questa proprietà.";
  if (o.mortgaged) return "Già ipotecata.";
  if (!tileIsFreeOfBuildings(s, tile)) return "Vendi prima gli edifici della regione.";
  return null;
}

function doBuild(c: Ctx, p: PlayerState, tile: number) {
  const s = c.s;
  requireOwnedProperty(s, p, tile);
  const reason = canBuildReason(s, p, tile);
  if (reason) throw new GameError("CANNOT_BUILD", reason);
  const t = tileAt(s, tile);
  const o = s.ownership[tile];
  p.balance -= t.houseCost!;
  o.houses += 1;
  p.stats.buildingsBuilt += 1;
  c.emit(
    "build",
    `${p.name} costruisce ${o.houses === MAX_BUILDINGS ? "una fortezza" : `la torretta n.${o.houses}`} su ${t.name} (${formatCr(t.houseCost!)}).`,
    p.id,
    { tile, houses: o.houses },
  );
}

function doSellBuilding(c: Ctx, p: PlayerState, tile: number) {
  const s = c.s;
  requireOwnedProperty(s, p, tile);
  const reason = canSellBuildingReason(s, p, tile);
  if (reason) throw new GameError("CANNOT_SELL", reason);
  const t = tileAt(s, tile);
  const o = s.ownership[tile];
  const refund = Math.floor(t.houseCost! / 2);
  const wasTower = o.houses === MAX_BUILDINGS;
  o.houses -= 1;
  p.balance += refund;
  c.emit("sellBuilding", `${p.name} vende ${wasTower ? "la fortezza" : "una torretta"} su ${t.name} (+${formatCr(refund)}).`, p.id, {
    tile,
    houses: o.houses,
  });
}

function doMortgage(c: Ctx, p: PlayerState, tile: number) {
  const s = c.s;
  requireOwnedProperty(s, p, tile);
  const reason = canMortgageReason(s, p, tile);
  if (reason) throw new GameError("CANNOT_MORTGAGE", reason);
  const t = tileAt(s, tile);
  s.ownership[tile].mortgaged = true;
  p.balance += t.mortgage!;
  c.emit("mortgage", `${p.name} ipoteca ${t.name} (+${formatCr(t.mortgage!)}).`, p.id, { tile });
}

function doUnmortgage(c: Ctx, p: PlayerState, tile: number) {
  const s = c.s;
  const { o, t } = requireOwnedProperty(s, p, tile);
  if (!o.mortgaged) throw new GameError("NOT_MORTGAGED", "La proprietà non è ipotecata.");
  const cost = unmortgageCost(s, tile);
  if (p.balance < cost) throw new GameError("INSUFFICIENT_FUNDS", `Servono ${formatCr(cost)} per riscattarla.`);
  p.balance -= cost;
  o.mortgaged = false;
  c.emit("unmortgage", `${p.name} riscatta ${t.name} pagando ${formatCr(cost)} (interessi inclusi).`, p.id, { tile, cost });
}

// ---------------------------------------------------------------------------
// Bankruptcy
// ---------------------------------------------------------------------------

function bankrupt(c: Ctx, p: PlayerState, creditorId: string | null) {
  const s = c.s;
  let estate = p.balance;
  const tiles = ownedTiles(s, p.id);
  for (const o of tiles) {
    if (o.houses > 0) {
      estate += o.houses * Math.floor((tileAt(s, o.tile).houseCost ?? 0) / 2);
      o.houses = 0;
    }
  }
  const creditor = creditorId ? findPlayer(s, creditorId) : undefined;
  const toPlayer = creditor && creditor.status === "active" && creditor.id !== p.id ? creditor : undefined;
  if (toPlayer) {
    toPlayer.balance += estate;
    for (const o of tiles) o.ownerId = toPlayer.id;
    toPlayer.jailCards.push(...p.jailCards);
  } else {
    for (const o of tiles) {
      o.ownerId = null;
      o.mortgaged = false;
      o.houses = 0;
    }
    for (const cardId of p.jailCards) s.decks[getCard(cardId).deck].order.push(cardId);
  }
  p.jailCards = [];
  p.balance = 0;
  p.status = "bankrupt";
  p.inJail = false;
  p.eliminatedOrder = s.players.filter((x) => x.status === "bankrupt").length;
  s.debts = s.debts
    .filter((d) => d.debtorId !== p.id)
    .map((d) => (d.creditorId === p.id ? { ...d, creditorId: null } : d));
  for (const t of s.trades) {
    if (t.status === "pending" && (t.fromId === p.id || t.toId === p.id)) {
      t.status = "cancelled";
      t.resolvedAt = c.now;
    }
  }
  if (s.auction) {
    s.auction.passedIds = s.auction.passedIds.filter((id) => id !== p.id);
  }
  c.emit(
    "bankrupt",
    toPlayer
      ? `${p.name} dichiara bancarotta: patrimonio e proprietà passano a ${toPlayer.name}.`
      : `${p.name} dichiara bancarotta: le proprietà tornano alla Banca.`,
    p.id,
    { creditorId: toPlayer?.id ?? null, estate },
  );
  if (activePlayers(s).length <= 1) {
    finishGame(c, "lastStanding");
    return;
  }
  if (s.turn.playerId === p.id) {
    s.turn.pendingTile = null;
    s.turn.extraRoll = false;
    advanceTurn(c);
  }
}

/** Sells buildings and mortgages properties until `target` cash is reached (used on timeout). */
function raiseFunds(c: Ctx, p: PlayerState, target: number) {
  const s = c.s;
  let guard = 200;
  while (p.balance < target && guard-- > 0) {
    const sellable = ownedTiles(s, p.id)
      .filter((o) => canSellBuildingReason(s, p, o.tile) === null)
      .sort((a, b) => b.houses - a.houses);
    if (sellable.length) {
      doSellBuilding(c, p, sellable[0].tile);
      continue;
    }
    const mortgageable = ownedTiles(s, p.id)
      .filter((o) => canMortgageReason(s, p, o.tile) === null)
      .sort((a, b) => (tileAt(s, a.tile).mortgage ?? 0) - (tileAt(s, b.tile).mortgage ?? 0));
    if (mortgageable.length) {
      doMortgage(c, p, mortgageable[0].tile);
      continue;
    }
    break;
  }
}

function autoResolveDebtsOf(c: Ctx, debtorId: string) {
  const s = c.s;
  let guard = 20;
  while (s.status === "active" && s.debts[0]?.debtorId === debtorId && guard-- > 0) {
    const p = findPlayer(s, debtorId)!;
    const d = s.debts[0];
    raiseFunds(c, p, d.amount);
    if (p.balance >= d.amount) {
      payFirstDebt(c, p);
    } else {
      c.emit("autoBankrupt", `${p.name} non riesce a coprire il debito di ${formatCr(d.amount)}.`, p.id);
      bankrupt(c, p, d.creditorId);
    }
  }
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

function pendingTrade(s: GameState, id: string): TradeOffer {
  const t = s.trades.find((x) => x.id === id);
  if (!t) throw new GameError("TRADE_NOT_FOUND", "Proposta non trovata.", 404);
  if (t.status !== "pending") throw new GameError("TRADE_CLOSED", "Questa proposta non è più valida.", 409);
  return t;
}

export function validateTrade(s: GameState, t: Omit<TradeOffer, "id" | "status" | "createdAt" | "resolvedAt" | "parentId">): string | null {
  const from = findPlayer(s, t.fromId);
  const to = findPlayer(s, t.toId);
  if (!from || !to || from.status !== "active" || to.status !== "active") return "Entrambi i giocatori devono essere in gioco.";
  if (from.id === to.id) return "Non puoi scambiare con te stesso.";
  const ints = [t.offerCash, t.requestCash];
  if (ints.some((n) => !Number.isInteger(n) || n < 0 || n > 1_000_000)) return "Importi non validi.";
  const allTiles = [...t.offerTiles, ...t.requestTiles];
  if (new Set(allTiles).size !== allTiles.length) return "Proprietà duplicate nella proposta.";
  if (allTiles.some((i) => !Number.isInteger(i) || !isOwnable(s, i))) return "Proprietà non valide.";
  if (t.offerTiles.some((i) => s.ownership[i].ownerId !== from.id)) return `${from.name} non possiede più tutte le proprietà offerte.`;
  if (t.requestTiles.some((i) => s.ownership[i].ownerId !== to.id)) return `${to.name} non possiede più tutte le proprietà richieste.`;
  if (allTiles.some((i) => !tileIsFreeOfBuildings(s, i))) return "Non si possono scambiare proprietà di regioni con edifici.";
  if (from.balance < t.offerCash) return `${from.name} non ha abbastanza crediti.`;
  if (to.balance < t.requestCash) return `${to.name} non ha abbastanza crediti.`;
  const hasAll = (have: string[], want: string[]) => {
    const pool = [...have];
    return want.every((w) => {
      const i = pool.indexOf(w);
      if (i < 0) return false;
      pool.splice(i, 1);
      return true;
    });
  };
  if (!hasAll(from.jailCards, t.offerCards)) return `${from.name} non possiede le carte offerte.`;
  if (!hasAll(to.jailCards, t.requestCards)) return `${to.name} non possiede le carte richieste.`;
  const empty =
    t.offerTiles.length + t.requestTiles.length + t.offerCards.length + t.requestCards.length === 0 &&
    t.offerCash === 0 &&
    t.requestCash === 0;
  if (empty) return "La proposta è vuota.";
  return null;
}

function doPropose(c: Ctx, p: PlayerState, cmd: Extract<Command, { type: "PROPOSE_TRADE" }>) {
  const s = c.s;
  const draft = {
    fromId: p.id,
    toId: cmd.toId,
    offerTiles: [...cmd.offerTiles],
    requestTiles: [...cmd.requestTiles],
    offerCash: cmd.offerCash,
    requestCash: cmd.requestCash,
    offerCards: [...cmd.offerCards],
    requestCards: [...cmd.requestCards],
  };
  let parent: TradeOffer | null = null;
  if (cmd.counterOf) {
    parent = pendingTrade(s, cmd.counterOf);
    if (parent.toId !== p.id || parent.fromId !== cmd.toId) {
      throw new GameError("FORBIDDEN", "Puoi controproporre solo alle offerte ricevute.", 403);
    }
  }
  const err = validateTrade(s, draft);
  if (err) throw new GameError("INVALID_TRADE", err);
  const myPending = s.trades.filter((t) => t.status === "pending" && t.fromId === p.id);
  if (myPending.length >= MAX_PENDING_TRADES_PER_PLAYER) {
    throw new GameError("TOO_MANY_TRADES", `Puoi avere al massimo ${MAX_PENDING_TRADES_PER_PLAYER} proposte in attesa.`);
  }
  const committed = new Set(myPending.flatMap((t) => t.offerTiles));
  const clash = draft.offerTiles.find((i) => committed.has(i));
  if (clash != null) {
    throw new GameError("TILE_COMMITTED", `${tileAt(s, clash).name} è già impegnata in un'altra tua proposta.`, 409);
  }
  if (parent) {
    parent.status = "countered";
    parent.resolvedAt = c.now;
  }
  const trade: TradeOffer = {
    ...draft,
    id: c.rng.uuid(),
    status: "pending",
    parentId: parent?.id ?? null,
    createdAt: c.now,
    resolvedAt: null,
  };
  s.trades.push(trade);
  c.emit(
    parent ? "tradeCounter" : "tradeProposed",
    parent ? `${p.name} fa una controfferta a ${nameOf(s, trade.toId)}.` : `${p.name} propone uno scambio a ${nameOf(s, trade.toId)}.`,
    p.id,
    { tradeId: trade.id, toId: trade.toId },
  );
}

function doAcceptTrade(c: Ctx, p: PlayerState, tradeId: string) {
  const s = c.s;
  const t = pendingTrade(s, tradeId);
  if (t.toId !== p.id) throw new GameError("FORBIDDEN", "Questa proposta non è indirizzata a te.", 403);
  const err = validateTrade(s, t);
  if (err) {
    t.status = "invalid";
    t.resolvedAt = c.now;
    t.note = err;
    c.emit("tradeInvalid", `Scambio annullato: ${err}`, null, { tradeId: t.id });
    return;
  }
  const from = findPlayer(s, t.fromId)!;
  const to = findPlayer(s, t.toId)!;
  for (const i of t.offerTiles) s.ownership[i].ownerId = to.id;
  for (const i of t.requestTiles) s.ownership[i].ownerId = from.id;
  from.balance += t.requestCash - t.offerCash;
  to.balance += t.offerCash - t.requestCash;
  for (const card of t.offerCards) {
    from.jailCards.splice(from.jailCards.indexOf(card), 1);
    to.jailCards.push(card);
  }
  for (const card of t.requestCards) {
    to.jailCards.splice(to.jailCards.indexOf(card), 1);
    from.jailCards.push(card);
  }
  t.status = "accepted";
  t.resolvedAt = c.now;
  c.emit("tradeAccepted", `Scambio concluso tra ${from.name} e ${to.name}.`, p.id, {
    tradeId: t.id,
    fromId: from.id,
    toId: to.id,
  });
}

function revalidateTrades(c: Ctx) {
  const s = c.s;
  for (const t of s.trades) {
    if (t.status !== "pending") continue;
    const err = validateTrade(s, t);
    if (err) {
      t.status = "invalid";
      t.resolvedAt = c.now;
      t.note = err;
      c.emit("tradeInvalid", `La proposta di ${nameOf(s, t.fromId)} a ${nameOf(s, t.toId)} non è più valida: ${err}`, null, {
        tradeId: t.id,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

function advanceTurn(c: Ctx) {
  const s = c.s;
  if (s.status !== "active") return;
  if (s.endsAt && c.now >= s.endsAt) {
    finishGame(c, "timeLimit");
    return;
  }
  const order = playersBySeat(s);
  const curIdx = order.findIndex((p) => p.id === s.turn.playerId);
  let next: PlayerState | undefined;
  for (let k = 1; k <= order.length; k++) {
    const cand = order[(curIdx + k) % order.length];
    if (cand.status === "active") {
      next = cand;
      break;
    }
  }
  if (!next) {
    finishGame(c, "lastStanding");
    return;
  }
  s.turn = {
    number: s.turn.number + 1,
    playerId: next.id,
    phase: "ROLL",
    dice: s.turn.dice,
    doublesCount: 0,
    extraRoll: false,
    hasRolled: false,
    pendingTile: null,
    deadline: c.now + c.T,
    savedDeadline: null,
    startedAt: c.now,
  };
  c.emit("turn", `Turno ${s.turn.number}: tocca a ${next.name}${next.inJail ? " (nelle Segrete)" : ""}.`, next.id, {
    turn: s.turn.number,
  });
}

function finishGame(c: Ctx, reason: "lastStanding" | "timeLimit") {
  const s = c.s;
  if (s.status === "finished") return;
  let winner: PlayerState | undefined;
  const active = activePlayers(s);
  if (reason === "lastStanding") winner = active[0];
  else winner = [...active].sort((a, b) => netWorth(s, b.id) - netWorth(s, a.id))[0];
  s.status = "finished";
  s.finishedAt = c.now;
  s.finishReason = reason;
  s.winnerId = winner?.id ?? null;
  s.auction = null;
  s.debts = [];
  s.turn.phase = "GAME_OVER";
  s.turn.pendingTile = null;
  for (const t of s.trades) {
    if (t.status === "pending") {
      t.status = "cancelled";
      t.resolvedAt = c.now;
    }
  }
  c.emit(
    "gameOver",
    reason === "timeLimit"
      ? `Tempo scaduto! Vince ${winner?.name ?? "nessuno"} con il patrimonio più alto.`
      : `Partita terminata! ${winner?.name ?? "Nessuno"} è l'ultimo magnate rimasto.`,
    winner?.id ?? null,
    { winnerId: winner?.id ?? null, reason },
  );
}

function computePhase(s: GameState): GameState["turn"]["phase"] {
  if (s.status !== "active") return "GAME_OVER";
  if (s.debts.length) return "DEBT";
  if (s.auction) return "AUCTION";
  if (s.turn.pendingTile != null) return "BUY";
  const cur = findPlayer(s, s.turn.playerId);
  if (!s.turn.hasRolled) return "ROLL";
  if (s.turn.extraRoll && cur && !cur.inJail) return "ROLL";
  return "MANAGE";
}

function settle(c: Ctx, prevKey: string, prevPhase: GameState["turn"]["phase"], prevTurn: number) {
  const s = c.s;
  if (s.status === "active" && activePlayers(s).length <= 1) finishGame(c, "lastStanding");
  if (s.status !== "active") {
    s.turn.phase = "GAME_OVER";
    return;
  }
  s.turn.phase = computePhase(s);
  if (s.status === "active") revalidateTrades(c);
  const key = actorKey(s);
  if (key === prevKey || s.turn.number !== prevTurn) return;
  if (s.turn.phase === "DEBT") {
    if (prevPhase !== "DEBT") s.turn.savedDeadline = s.turn.deadline;
    s.turn.deadline = c.now + c.T;
  } else if (prevPhase === "DEBT") {
    s.turn.deadline = Math.max(s.turn.savedDeadline ?? 0, c.now + RESUME_GRACE_MS);
    s.turn.savedDeadline = null;
  } else if (prevPhase === "AUCTION") {
    s.turn.deadline = Math.max(s.turn.deadline, c.now + RESUME_GRACE_MS);
  }
}

/** The deadline that currently matters (auction or turn). */
export function activeDeadline(s: Pick<GameState, "turn" | "auction">): number {
  return s.turn.phase === "AUCTION" && s.auction ? s.auction.deadline : s.turn.deadline;
}

function doTimeout(c: Ctx) {
  const s = c.s;
  if (s.endsAt && c.now >= s.endsAt) {
    finishGame(c, "timeLimit");
    return;
  }
  const deadline = activeDeadline(s);
  if (c.now < deadline) throw new GameError("NOT_EXPIRED", "Il tempo non è ancora scaduto.", 409);

  if (s.turn.phase === "AUCTION") {
    c.emit("timeout", "Tempo scaduto per l'asta.", null);
    closeAuction(c);
    return;
  }
  if (s.turn.phase === "DEBT") {
    const debtorId = s.debts[0].debtorId;
    c.emit("timeout", `Tempo scaduto: ${nameOf(s, debtorId)} salda automaticamente i debiti.`, debtorId);
    autoResolveDebtsOf(c, debtorId);
    if (debtorId !== s.turn.playerId) return;
  } else {
    c.emit("timeout", `Tempo scaduto: il turno di ${nameOf(s, s.turn.playerId)} prosegue automaticamente.`, s.turn.playerId);
  }

  // Auto-play the AFK current player until their turn ends (or an auction needs everyone).
  const turnNo = s.turn.number;
  for (let i = 0; i < 40; i++) {
    if (s.status !== "active" || s.turn.number !== turnNo) return;
    s.turn.phase = computePhase(s);
    const cur = findPlayer(s, s.turn.playerId)!;
    switch (s.turn.phase) {
      case "ROLL":
        doRoll(c, cur);
        break;
      case "BUY":
        doDecline(c, cur);
        break;
      case "DEBT": {
        const debtorId = s.debts[0].debtorId;
        // Another player owes money (e.g. a "collect from each" card): they get their own timer.
        if (debtorId !== cur.id) return;
        autoResolveDebtsOf(c, debtorId);
        break;
      }
      case "MANAGE":
        advanceTurn(c);
        return;
      case "AUCTION":
      case "GAME_OVER":
        return;
    }
  }
}
