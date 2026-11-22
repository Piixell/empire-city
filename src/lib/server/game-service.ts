// ---------------------------------------------------------------------------
// Game persistence + command processing.
//
// applyGameCommand():
//   BEGIN
//     SELECT ... FROM game_sessions WHERE id = $1 FOR UPDATE   -- serializes
//     idempotency check on game_actions(game_id, command_id)
//     load normalized rows -> GameState
//     engine.applyCommand()  (pure)
//     write changed rows + public snapshot + events + action record
//   COMMIT
// Supabase Realtime then broadcasts the updated game_sessions row.
// ---------------------------------------------------------------------------
import { randomInt, randomUUID } from "node:crypto";
import { boardOf } from "../game/board";
import { applyCommand, GameError, toPublicState, type Rng } from "../game/engine";
import type {
  AuctionState,
  Command,
  DeckKind,
  GameEvent,
  GameState,
  OwnershipState,
  PlayerState,
  PublicGameState,
  TradeOffer,
} from "../game/types";
import type { Database, Queryer, Row } from "./db";
import { ApiError, forbidden, notFound } from "./errors";

export const cryptoRng: Rng = {
  int: (max) => randomInt(max),
  uuid: () => randomUUID(),
};

const ms = (col: string) => `(extract(epoch from ${col}) * 1000)::float8`;
const ts = (n: number) => `to_timestamp($${n}::float8 / 1000)`;

interface EngineBlob {
  extraRoll: boolean;
  hasRolled: boolean;
  pendingTile: number | null;
  savedDeadline: number | null;
  turnStartedAt: number;
  debts: GameState["debts"];
  lastCard: GameState["lastCard"];
  eventSeq: number;
  /** Legacy rows only: the log now lives once, in public_state.log. */
  log?: GameEvent[];
}

// ------------------------------- loading -----------------------------------
// Latency matters: Vercel ⇄ Postgres round trips dominate command time, so
// independent statements are issued together (postgres.js pipelines them on
// the transaction's connection) instead of awaiting each one in turn.

/**
 * Locks the game row and, in the same round trip, reports whether `userId`
 * is an active room member and whether `commandId` was already processed.
 */
export async function lockGame(
  q: Queryer,
  gameId: string,
  opts: { userId?: string; commandId?: string } = {},
): Promise<{ row: Row; nowMs: number; isMember: boolean; duplicate: { ok: boolean; result: unknown } | null } | null> {
  const rows = await q.query(
    `select gs.id, gs.room_id, gs.status, gs.settings, gs.version, gs.turn_number, gs.current_player_id, gs.phase, gs.dice,
            gs.doubles_count, ${ms("gs.turn_deadline")} as turn_deadline_ms, gs.engine, gs.public_state -> 'log' as public_log,
            ${ms("gs.started_at")} as started_ms, ${ms("gs.ends_at")} as ends_ms, ${ms("gs.finished_at")} as finished_ms,
            gs.winner_player_id, gs.finish_reason,
            ${ms("clock_timestamp()")} as now_ms,
            exists (select 1 from public.room_players rp
                     where rp.room_id = gs.room_id and rp.user_id = $2::uuid and rp.status = 'active') as is_member,
            (select jsonb_build_object('ok', ga.ok, 'result', ga.result) from public.game_actions ga
              where ga.game_id = gs.id and ga.command_id = $3::uuid) as duplicate
       from public.game_sessions gs where gs.id = $1::uuid for update of gs`,
    [gameId, opts.userId ?? null, opts.commandId ?? null],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    row,
    nowMs: Number(row.now_ms),
    isMember: !!row.is_member,
    duplicate: (row.duplicate as { ok: boolean; result: unknown } | null) ?? null,
  };
}

export async function loadGameState(q: Queryer, session: Row): Promise<GameState> {
  const gameId = session.id as string;
  const engine = session.engine as EngineBlob;

  const [players, own, decks, auctions, trades] = await Promise.all([
    q.query(
      `select id, user_id, room_player_id, seat, display_name, color, token, avatar, balance, position, in_jail,
              jail_turns, jail_cards, status, eliminated_order, stats
         from public.game_players where game_id = $1::uuid order by seat`,
      [gameId],
    ),
    q.query(`select tile_idx, owner_player_id, houses, mortgaged from public.property_ownership where game_id = $1::uuid`, [
      gameId,
    ]),
    q.query(`select deck, card_order, next_index from public.game_decks where game_id = $1::uuid`, [gameId]),
    q.query(
      `select a.id, a.tile_idx, a.high_bid, a.high_bidder_id, a.passed_player_ids,
              ${ms("a.deadline")} as deadline_ms, ${ms("a.started_at")} as started_ms,
              coalesce((select jsonb_agg(jsonb_build_object('playerId', b.player_id, 'amount', b.amount,
                                         'at', ${ms("b.created_at")}) order by b.amount)
                          from public.auction_bids b where b.auction_id = a.id), '[]'::jsonb) as bids
         from public.game_auctions a where a.game_id = $1::uuid and a.status = 'open' limit 1`,
      [gameId],
    ),
    q.query(
      `select id, from_player_id, to_player_id, offer_tiles, request_tiles, offer_cash, request_cash, offer_cards,
              request_cards, status, parent_id, note, ${ms("created_at")} as created_ms, ${ms("resolved_at")} as resolved_ms
         from public.trade_offers where game_id = $1::uuid
        order by (status = 'pending') desc, created_at desc limit 40`,
      [gameId],
    ),
  ]);
  let auction: AuctionState | null = null;
  if (auctions[0]) {
    const a = auctions[0];
    auction = {
      id: a.id,
      tile: a.tile_idx,
      highBid: a.high_bid,
      highBidderId: a.high_bidder_id,
      passedIds: a.passed_player_ids ?? [],
      bids: ((a.bids ?? []) as { playerId: string; amount: number; at: number }[]).map((b) => ({
        playerId: b.playerId,
        amount: b.amount,
        at: Number(b.at),
      })),
      deadline: Number(a.deadline_ms),
      startedAt: Number(a.started_ms),
    };
  }

  const ownership: Record<number, OwnershipState> = {};
  for (const o of own) {
    ownership[o.tile_idx] = { tile: o.tile_idx, ownerId: o.owner_player_id, houses: o.houses, mortgaged: o.mortgaged };
  }
  const deckState = (kind: DeckKind) => {
    const d = decks.find((x) => x.deck === kind);
    return { kind, order: (d?.card_order ?? []) as string[], index: d?.next_index ?? 0 };
  };

  return {
    id: gameId,
    roomId: session.room_id,
    status: session.status,
    settings: session.settings,
    players: players.map(
      (p): PlayerState => ({
        id: p.id,
        userId: p.user_id,
        roomPlayerId: p.room_player_id,
        seat: p.seat,
        name: p.display_name,
        color: p.color,
        token: p.token,
        avatar: p.avatar,
        balance: p.balance,
        position: p.position,
        inJail: p.in_jail,
        jailTurns: p.jail_turns,
        jailCards: p.jail_cards ?? [],
        status: p.status,
        eliminatedOrder: p.eliminated_order,
        stats: { propertiesBought: 0, buildingsBuilt: 0, rentPaid: 0, rentReceived: 0, ...(p.stats ?? {}) },
      }),
    ),
    ownership,
    decks: { chance: deckState("chance"), community: deckState("community") },
    turn: {
      number: session.turn_number,
      playerId: session.current_player_id,
      phase: session.phase,
      dice: session.dice ?? null,
      doublesCount: session.doubles_count,
      extraRoll: !!engine.extraRoll,
      hasRolled: !!engine.hasRolled,
      pendingTile: engine.pendingTile ?? null,
      deadline: Number(session.turn_deadline_ms ?? 0),
      savedDeadline: engine.savedDeadline ?? null,
      startedAt: engine.turnStartedAt ?? Number(session.started_ms),
    },
    debts: engine.debts ?? [],
    auction,
    trades: trades.map(
      (t): TradeOffer => ({
        id: t.id,
        fromId: t.from_player_id,
        toId: t.to_player_id,
        offerTiles: t.offer_tiles ?? [],
        requestTiles: t.request_tiles ?? [],
        offerCash: t.offer_cash,
        requestCash: t.request_cash,
        offerCards: t.offer_cards ?? [],
        requestCards: t.request_cards ?? [],
        status: t.status,
        parentId: t.parent_id,
        note: t.note ?? undefined,
        createdAt: Number(t.created_ms),
        resolvedAt: t.resolved_ms == null ? null : Number(t.resolved_ms),
      }),
    ),
    lastCard: engine.lastCard ?? null,
    startedAt: Number(session.started_ms),
    endsAt: session.ends_ms == null ? null : Number(session.ends_ms),
    finishedAt: session.finished_ms == null ? null : Number(session.finished_ms),
    winnerId: session.winner_player_id ?? null,
    finishReason: session.finish_reason ?? null,
    version: session.version,
    eventSeq: engine.eventSeq ?? 0,
    log: (session.public_log as GameEvent[] | null) ?? engine.log ?? [],
  };
}

// ------------------------------- saving ------------------------------------

function engineBlob(s: GameState): EngineBlob {
  return {
    extraRoll: s.turn.extraRoll,
    hasRolled: s.turn.hasRolled,
    pendingTile: s.turn.pendingTile,
    savedDeadline: s.turn.savedDeadline,
    turnStartedAt: s.turn.startedAt,
    debts: s.debts,
    lastCard: s.lastCard,
    eventSeq: s.eventSeq,
  };
}

const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

async function writeSession(q: Queryer, s: GameState, insert: boolean) {
  const params = [
    s.id,
    s.roomId,
    s.status,
    JSON.stringify(s.settings),
    s.version,
    s.turn.number,
    s.turn.playerId,
    s.turn.phase,
    JSON.stringify(s.turn.dice),
    s.turn.doublesCount,
    s.turn.deadline,
    JSON.stringify(engineBlob(s)),
    JSON.stringify(toPublicState(s)),
    s.startedAt,
    s.endsAt,
    s.finishedAt,
    s.winnerId,
    s.finishReason,
    boardOf(s.settings.board).id,
  ];
  if (insert) {
    await q.query(
      `insert into public.game_sessions (id, room_id, status, settings, version, turn_number, current_player_id, phase,
          dice, doubles_count, turn_deadline, engine, public_state, started_at, ends_at, finished_at, winner_player_id, finish_reason, board)
       values ($1::uuid, $2::uuid, $3, $4::jsonb, $5::int, $6::int, $7::uuid, $8, $9::jsonb, $10::int, ${ts(11)}, $12::jsonb,
          $13::jsonb, ${ts(14)}, ${ts(15)}, ${ts(16)}, $17::uuid, $18, $19)`,
      params,
    );
  } else {
    await q.query(
      `update public.game_sessions set status = $3, settings = $4::jsonb, version = $5::int, turn_number = $6::int,
          current_player_id = $7::uuid, phase = $8, dice = $9::jsonb, doubles_count = $10::int, turn_deadline = ${ts(11)},
          engine = $12::jsonb, public_state = $13::jsonb, started_at = ${ts(14)}, ends_at = ${ts(15)}, finished_at = ${ts(16)},
          winner_player_id = $17::uuid, finish_reason = $18, board = $19, updated_at = now()
        where id = $1::uuid and room_id = $2::uuid`,
      params,
    );
  }
}

function playerRecord(gameId: string, p: PlayerState) {
  return {
    id: p.id,
    game_id: gameId,
    room_player_id: p.roomPlayerId,
    user_id: p.userId,
    seat: p.seat,
    display_name: p.name,
    color: p.color,
    token: p.token,
    avatar: p.avatar,
    balance: p.balance,
    position: p.position,
    in_jail: p.inJail,
    jail_turns: p.jailTurns,
    jail_cards: p.jailCards,
    status: p.status,
    eliminated_order: p.eliminatedOrder,
    stats: p.stats,
  };
}

const PLAYER_COLS = `id uuid, game_id uuid, room_player_id uuid, user_id uuid, seat int, display_name text, color text, token text,
  avatar text, balance int, position int, in_jail boolean, jail_turns int, jail_cards jsonb, status text, eliminated_order int, stats jsonb`;

async function insertEvents(q: Queryer, gameId: string, events: GameEvent[]) {
  if (!events.length) return;
  await q.query(
    `insert into public.game_events (game_id, seq, version, type, player_id, message, data, created_at)
     select $1::uuid, x.seq, x.version, x.type, x.player_id, x.message, x.data, to_timestamp(x.at / 1000)
       from jsonb_to_recordset($2::jsonb) as x(seq int, version int, type text, player_id uuid, message text, data jsonb, at float8)`,
    [gameId, JSON.stringify(events.map((e) => ({ ...e, player_id: e.playerId })))],
  );
}

/** Insert a freshly created game (inside the caller's transaction). */
export async function insertNewGame(q: Queryer, s: GameState) {
  await writeSession(q, s, true);
  await q.query(
    `insert into public.game_players (id, game_id, room_player_id, user_id, seat, display_name, color, token, avatar, balance,
        position, in_jail, jail_turns, jail_cards, status, eliminated_order, stats)
     select x.id, x.game_id, x.room_player_id, x.user_id, x.seat, x.display_name, x.color, x.token, x.avatar, x.balance,
        x.position, x.in_jail, x.jail_turns, x.jail_cards, x.status, x.eliminated_order, x.stats
       from jsonb_to_recordset($1::jsonb) as x(${PLAYER_COLS})`,
    [JSON.stringify(s.players.map((p) => playerRecord(s.id, p)))],
  );
  await q.query(
    `insert into public.property_ownership (game_id, board, tile_idx, owner_player_id, houses, mortgaged)
     select $1::uuid, $3, x.tile, x.owner, x.houses, x.mortgaged
       from jsonb_to_recordset($2::jsonb) as x(tile int, owner uuid, houses int, mortgaged boolean)`,
    [s.id, JSON.stringify(Object.values(s.ownership).map((o) => ({ tile: o.tile, owner: o.ownerId, houses: o.houses, mortgaged: o.mortgaged }))), boardOf(s.settings.board).id],
  );
  for (const kind of ["chance", "community"] as const) {
    await q.query(
      `insert into public.game_decks (game_id, deck, card_order, next_index) values ($1::uuid, $2, $3::jsonb, $4::int)`,
      [s.id, kind, JSON.stringify(s.decks[kind].order), s.decks[kind].index],
    );
  }
  await insertEvents(q, s.id, s.log);
  await q.query(
    `insert into public.game_turns (game_id, turn_number, player_id, started_at) values ($1::uuid, $2::int, $3::uuid, ${ts(4)})`,
    [s.id, s.turn.number, s.turn.playerId, s.turn.startedAt],
  );
}

export async function saveGameState(q: Queryer, prev: GameState, next: GameState, events: GameEvent[]): Promise<void> {
  const gameId = next.id;
  // Every statement below is issued immediately (no await in between), so
  // postgres.js pipelines them on the transaction's connection in this order:
  // FK order is preserved and the whole save costs ~one network round trip.
  const ops: Promise<unknown>[] = [];
  const run = (text: string, params: unknown[]) => ops.push(q.query(text, params));
  ops.push(writeSession(q, next, false));

  const changedPlayers = next.players.filter((p) => changed(p, prev.players.find((x) => x.id === p.id)));
  if (changedPlayers.length) {
    run(
      `update public.game_players gp set balance = x.balance, position = x.position, in_jail = x.in_jail,
          jail_turns = x.jail_turns, jail_cards = x.jail_cards, status = x.status, eliminated_order = x.eliminated_order,
          stats = x.stats, updated_at = now()
         from jsonb_to_recordset($1::jsonb) as x(${PLAYER_COLS})
        where gp.id = x.id and gp.game_id = $2::uuid`,
      [JSON.stringify(changedPlayers.map((p) => playerRecord(gameId, p))), gameId],
    );
  }

  const changedOwn = Object.values(next.ownership).filter((o) => changed(o, prev.ownership[o.tile]));
  if (changedOwn.length) {
    run(
      `update public.property_ownership po set owner_player_id = x.owner, houses = x.houses, mortgaged = x.mortgaged, updated_at = now()
         from jsonb_to_recordset($1::jsonb) as x(tile int, owner uuid, houses int, mortgaged boolean)
        where po.game_id = $2::uuid and po.tile_idx = x.tile`,
      [JSON.stringify(changedOwn.map((o) => ({ tile: o.tile, owner: o.ownerId, houses: o.houses, mortgaged: o.mortgaged }))), gameId],
    );
  }

  for (const kind of ["chance", "community"] as const) {
    if (changed(prev.decks[kind], next.decks[kind])) {
      run(`update public.game_decks set card_order = $3::jsonb, next_index = $4::int where game_id = $1::uuid and deck = $2`, [
        gameId,
        kind,
        JSON.stringify(next.decks[kind].order),
        next.decks[kind].index,
      ]);
    }
  }

  // Auctions: upsert the open one, record bids, close finished ones.
  if (next.auction && changed(prev.auction, next.auction)) {
    const a = next.auction;
    run(
      `insert into public.game_auctions (id, game_id, tile_idx, status, high_bid, high_bidder_id, passed_player_ids, deadline, started_at, board)
       values ($1::uuid, $2::uuid, $3::int, 'open', $4::int, $5::uuid, $6::jsonb, ${ts(7)}, ${ts(8)}, $9)
       on conflict (id) do update set high_bid = excluded.high_bid, high_bidder_id = excluded.high_bidder_id,
         passed_player_ids = excluded.passed_player_ids, deadline = excluded.deadline`,
      [a.id, gameId, a.tile, a.highBid, a.highBidderId, JSON.stringify(a.passedIds), a.deadline, a.startedAt, boardOf(next.settings.board).id],
    );
  }
  for (const e of events) {
    const d = (e.data ?? {}) as Record<string, unknown>;
    if (e.type === "bid") {
      run(
        `insert into public.auction_bids (auction_id, player_id, amount, created_at) values ($1::uuid, $2::uuid, $3::int, ${ts(4)})
         on conflict (auction_id, amount) do nothing`,
        [d.auctionId, e.playerId, d.amount, e.at],
      );
    } else if (e.type === "auctionWon" || e.type === "auctionNoBids") {
      run(
        `update public.game_auctions set status = 'closed', closed_at = ${ts(2)}, winner_player_id = $3::uuid, final_price = $4::int
          where id = $1::uuid`,
        [d.auctionId, e.at, e.type === "auctionWon" ? e.playerId : null, e.type === "auctionWon" ? d.amount : null],
      );
    }
  }

  // Trades
  const changedTrades = next.trades.filter((t) => changed(t, prev.trades.find((x) => x.id === t.id)));
  if (changedTrades.length) {
    run(
      `insert into public.trade_offers (id, game_id, from_player_id, to_player_id, offer_tiles, request_tiles, offer_cash,
          request_cash, offer_cards, request_cards, status, parent_id, note, created_at, resolved_at)
       select x.id, $2::uuid, x.from_id, x.to_id, x.offer_tiles, x.request_tiles, x.offer_cash, x.request_cash, x.offer_cards,
          x.request_cards, x.status, x.parent_id, x.note, to_timestamp(x.created_at / 1000),
          case when x.resolved_at is null then null else to_timestamp(x.resolved_at / 1000) end
         from jsonb_to_recordset($1::jsonb) as x(id uuid, from_id uuid, to_id uuid, offer_tiles jsonb, request_tiles jsonb,
          offer_cash int, request_cash int, offer_cards jsonb, request_cards jsonb, status text, parent_id uuid, note text,
          created_at float8, resolved_at float8)
       on conflict (id) do update set status = excluded.status, note = excluded.note, resolved_at = excluded.resolved_at`,
      [
        JSON.stringify(
          changedTrades.map((t) => ({
            id: t.id,
            from_id: t.fromId,
            to_id: t.toId,
            offer_tiles: t.offerTiles,
            request_tiles: t.requestTiles,
            offer_cash: t.offerCash,
            request_cash: t.requestCash,
            offer_cards: t.offerCards,
            request_cards: t.requestCards,
            status: t.status,
            parent_id: t.parentId,
            note: t.note ?? null,
            created_at: t.createdAt,
            resolved_at: t.resolvedAt,
          })),
        ),
        gameId,
      ],
    );
  }

  ops.push(insertEvents(q, gameId, events));

  // Turn history
  for (const e of events) {
    if (e.type === "turn") {
      const n = Number((e.data as { turn: number }).turn);
      run(`update public.game_turns set ended_at = ${ts(3)} where game_id = $1::uuid and turn_number = $2::int`, [
        gameId,
        n - 1,
        e.at,
      ]);
      run(
        `insert into public.game_turns (game_id, turn_number, player_id, started_at) values ($1::uuid, $2::int, $3::uuid, ${ts(4)})
         on conflict (game_id, turn_number) do nothing`,
        [gameId, n, e.playerId, e.at],
      );
    }
  }
  if (next.status === "finished" && prev.status !== "finished") {
    run(
      `update public.game_turns set ended_at = ${ts(3)} where game_id = $1::uuid and turn_number = $2::int and ended_at is null`,
      [gameId, next.turn.number, next.finishedAt],
    );
    run(`update public.game_rooms set status = 'finished', updated_at = now() where id = $1::uuid`, [next.roomId]);
  }
  await Promise.all(ops);
}

// ------------------------------- commands ----------------------------------

export interface CommandResult {
  ok: boolean;
  duplicate?: boolean;
  version: number;
  state?: PublicGameState;
  events?: GameEvent[];
  error?: { code: string; message: string; status: number };
}

export async function applyGameCommand(
  db: Database,
  input: { gameId: string; userId: string; commandId: string; command: Command; rng?: Rng; now?: number },
): Promise<CommandResult> {
  return db.tx(async (q) => {
    // One round trip: row lock + membership + idempotency check.
    const locked = await lockGame(q, input.gameId, { userId: input.userId, commandId: input.commandId });
    if (!locked) throw notFound("Partita non trovata.");
    const { row, nowMs } = locked;
    if (!locked.isMember) throw forbidden("Non fai parte di questa stanza.");

    if (locked.duplicate) {
      const prevResult = (locked.duplicate.result ?? {}) as Partial<CommandResult>;
      const snap = await q.query(`select public_state, version from public.game_sessions where id = $1::uuid`, [input.gameId]);
      return {
        ok: locked.duplicate.ok,
        duplicate: true,
        version: snap[0].version,
        state: { ...(snap[0].public_state as PublicGameState), serverTime: nowMs },
        error: prevResult.error,
      };
    }

    const state = await loadGameState(q, row);
    let next: GameState;
    let events: GameEvent[];
    try {
      ({ state: next, events } = applyCommand(state, input.userId, input.command, {
        now: input.now ?? nowMs,
        rng: input.rng ?? cryptoRng,
      }));
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      const error = { code: e.code, message: e.message, status: e.status };
      if (input.command.type !== "TIMEOUT") {
        await q.query(
          `insert into public.game_actions (game_id, command_id, user_id, command_type, command, ok, result, version_after)
           values ($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb, false, $6::jsonb, $7::int)`,
          [input.gameId, input.commandId, input.userId, input.command.type, JSON.stringify(input.command), JSON.stringify({ error }), state.version],
        );
      }
      return { ok: false, version: state.version, error, state: { ...toPublicState(state), serverTime: nowMs } };
    }

    // Save + action record are pipelined together (saveGameState issues all its
    // statements synchronously before this insert is issued).
    await Promise.all([
      saveGameState(q, state, next, events),
      q.query(
        `insert into public.game_actions (game_id, command_id, user_id, command_type, command, ok, result, version_after)
         values ($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb, true, $6::jsonb, $7::int)`,
        [
          input.gameId,
          input.commandId,
          input.userId,
          input.command.type,
          JSON.stringify(input.command),
          JSON.stringify({ version: next.version }),
          next.version,
        ],
      ),
    ]);
    return { ok: true, version: next.version, state: { ...toPublicState(next), serverTime: nowMs }, events };
  });
}

export async function getPublicGame(q: Queryer, gameId: string): Promise<PublicGameState | null> {
  const rows = await q.query(`select public_state from public.game_sessions where id = $1::uuid`, [gameId]);
  return (rows[0]?.public_state as PublicGameState) ?? null;
}

export function assertGameError(e: unknown): asserts e is ApiError {
  if (!(e instanceof ApiError)) throw e;
}
