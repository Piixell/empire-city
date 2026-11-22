// ---------------------------------------------------------------------------
// Empire City — shared game types (used by the server engine and the client)
// ---------------------------------------------------------------------------

/** Board variants: classic 40, standard 48, maxi 64 tiles (see board.ts). */
export type BoardId = "classic" | "standard" | "maxi";
export const MAX_PLAYERS = 8;
export const MAX_BUILDINGS = 5; // 4 houses + 1 tower ("edificio principale")

export type TileKind =
  | "go"
  | "jail"
  | "parking"
  | "goToJail"
  | "property"
  | "transport"
  | "utility"
  | "chance"
  | "community"
  | "tax";

export type DistrictKey =
  | "bassofondo"
  | "approdo"
  | "paludi"
  | "sahrem"
  | "frontiera"
  | "kaori"
  | "picchi"
  | "ferro"
  | "aurelia"
  | "argentea";

export interface District {
  key: DistrictKey;
  name: string;
  color: string; // hex
  houseCost: number;
  icon: string; // emblem shown on the tiles
}

export interface TileDef {
  index: number;
  kind: TileKind;
  name: string;
  short?: string;
  district?: DistrictKey;
  price?: number;
  /** property: [base, 1–4 torrette, fortezza]; transport: by count owned */
  rent?: number[];
  houseCost?: number;
  mortgage?: number;
  /** utility: dice multipliers by count owned */
  multipliers?: number[];
  taxAmount?: number;
  icon?: string;
  /** Stable anchor used by cards (e.g. "palazzo-reale"); same on every board. */
  key?: string;
}

export type DeckKind = "chance" | "community";

export type CardEffect =
  | { type: "money"; amount: number }
  | { type: "moveTo"; to: string } // board anchor: "start", "jail", "palazzo-reale", ...
  | { type: "moveToNearest"; kind: "transport" | "utility" }
  | { type: "moveBy"; steps: number }
  | { type: "goToJail" }
  | { type: "jailFree" }
  | { type: "repairs"; perHouse: number; perTower: number }
  | { type: "collectFromEach"; amount: number }
  | { type: "payEach"; amount: number };

export interface CardDef {
  id: string;
  deck: DeckKind;
  title: string;
  text: string;
  effect: CardEffect;
}

export type PlayerColor = "red" | "blue" | "green" | "yellow" | "purple" | "orange" | "pink" | "teal";
export type TokenModel =
  | "car"
  | "ship"
  | "plane"
  | "rocket"
  | "crown"
  | "gem"
  | "dog"
  | "cat"
  | "train"
  | "bike";

export interface GameSettings {
  maxPlayers: number;
  startingCash: number;
  goBonus: number;
  turnSeconds: number;
  auctionsEnabled: boolean;
  chatEnabled: boolean;
  /** 0 = nessun limite */
  maxDurationMinutes: number;
  /** Board variant; legacy games without it use "standard". */
  board: BoardId;
}

export const DEFAULT_SETTINGS: GameSettings = {
  maxPlayers: 6,
  startingCash: 2000,
  goBonus: 250,
  turnSeconds: 120,
  auctionsEnabled: true,
  chatEnabled: true,
  maxDurationMinutes: 0,
  board: "standard",
};

export interface PlayerStats {
  propertiesBought: number;
  buildingsBuilt: number;
  rentPaid: number;
  rentReceived: number;
}

export interface PlayerState {
  id: string; // game_players.id
  userId: string;
  roomPlayerId: string;
  seat: number; // turn order (0..n-1)
  name: string;
  color: PlayerColor;
  token: TokenModel;
  avatar: string;
  balance: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: string[]; // card ids of held "evasione dalle Segrete" cards
  status: "active" | "bankrupt";
  eliminatedOrder: number | null;
  stats: PlayerStats;
}

export interface OwnershipState {
  tile: number;
  ownerId: string | null;
  houses: number; // 0..4 torrette, 5 = fortezza
  mortgaged: boolean;
}

export interface DeckState {
  kind: DeckKind;
  order: string[]; // remaining draw pile order (cards held by players excluded)
  index: number; // next card to draw
}

export interface AuctionBid {
  playerId: string;
  amount: number;
  at: number;
}

export interface AuctionState {
  id: string;
  tile: number;
  highBid: number;
  highBidderId: string | null;
  passedIds: string[];
  bids: AuctionBid[];
  deadline: number; // epoch ms
  startedAt: number;
}

export type TradeStatus = "pending" | "accepted" | "rejected" | "cancelled" | "countered" | "invalid";

export interface TradeOffer {
  id: string;
  fromId: string;
  toId: string;
  offerTiles: number[];
  requestTiles: number[];
  offerCash: number;
  requestCash: number;
  offerCards: string[];
  requestCards: string[];
  status: TradeStatus;
  parentId: string | null;
  createdAt: number;
  resolvedAt: number | null;
  note?: string;
}

export interface Debt {
  debtorId: string;
  creditorId: string | null; // null = banca
  amount: number;
  reason: string;
  isRent?: boolean;
}

export type Phase = "ROLL" | "BUY" | "AUCTION" | "DEBT" | "MANAGE" | "GAME_OVER";

export interface TurnState {
  number: number;
  playerId: string;
  phase: Phase;
  dice: [number, number] | null;
  doublesCount: number;
  extraRoll: boolean;
  hasRolled: boolean;
  pendingTile: number | null;
  deadline: number; // epoch ms, deadline for whoever must act now
  savedDeadline: number | null;
  startedAt: number;
}

export interface DrawnCard {
  deck: DeckKind;
  cardId: string;
  playerId: string;
  at: number;
}

export interface GameEvent {
  seq: number;
  version: number;
  at: number;
  type: string;
  playerId: string | null;
  message: string;
  data?: Record<string, unknown>;
}

export interface GameState {
  id: string;
  roomId: string;
  status: "active" | "finished";
  settings: GameSettings;
  players: PlayerState[];
  ownership: Record<number, OwnershipState>;
  decks: Record<DeckKind, DeckState>;
  turn: TurnState;
  debts: Debt[];
  auction: AuctionState | null;
  trades: TradeOffer[];
  lastCard: DrawnCard | null;
  startedAt: number;
  endsAt: number | null;
  finishedAt: number | null;
  winnerId: string | null;
  finishReason: "lastStanding" | "timeLimit" | null;
  version: number;
  eventSeq: number;
  log: GameEvent[]; // recent public log (bounded)
}

/** Public projection broadcast to every client (no hidden deck order). */
export interface PublicGameState extends Omit<GameState, "decks"> {
  decks: Record<DeckKind, { remaining: number }>;
  serverTime?: number;
}

export type Command =
  | { type: "ROLL" }
  | { type: "BUY" }
  | { type: "DECLINE_BUY" }
  | { type: "BID"; amount: number }
  | { type: "AUCTION_PASS" }
  | { type: "PAY_JAIL" }
  | { type: "USE_JAIL_CARD" }
  | { type: "BUILD"; tile: number }
  | { type: "SELL_BUILDING"; tile: number }
  | { type: "MORTGAGE"; tile: number }
  | { type: "UNMORTGAGE"; tile: number }
  | { type: "PAY_DEBT" }
  | { type: "DECLARE_BANKRUPTCY" }
  | { type: "RESIGN" }
  | { type: "END_TURN" }
  | {
      type: "PROPOSE_TRADE";
      toId: string;
      offerTiles: number[];
      requestTiles: number[];
      offerCash: number;
      requestCash: number;
      offerCards: string[];
      requestCards: string[];
      counterOf?: string | null;
    }
  | { type: "ACCEPT_TRADE"; tradeId: string }
  | { type: "REJECT_TRADE"; tradeId: string }
  | { type: "CANCEL_TRADE"; tradeId: string }
  | { type: "TIMEOUT" };

export type CommandType = Command["type"];
