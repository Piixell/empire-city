import { DISTRICTS, boardOf, districtTiles, tileAt } from "./board";
import type { DistrictKey, GameState, OwnershipState, PlayerState } from "./types";

export const AUCTION_START_MS = 20_000;
export const AUCTION_EXTEND_MS = 8_000;
export const AUCTION_MIN_FIRST_BID = 10;
export const AUCTION_MIN_INCREMENT = 5;
export const RESUME_GRACE_MS = 30_000;
export const MAX_PENDING_TRADES_PER_PLAYER = 3;
export const LOG_LIMIT = 80;
export const TRADE_HISTORY_LIMIT = 15;

export function formatCr(n: number): string {
  return `${Math.round(n).toLocaleString("it-IT")} cr`;
}

export function activePlayers(s: Pick<GameState, "players">): PlayerState[] {
  return s.players.filter((p) => p.status === "active");
}

export function playersBySeat(s: Pick<GameState, "players">): PlayerState[] {
  return [...s.players].sort((a, b) => a.seat - b.seat);
}

export function findPlayer(s: Pick<GameState, "players">, id: string | null | undefined): PlayerState | undefined {
  if (!id) return undefined;
  return s.players.find((p) => p.id === id);
}

export function ownedTiles(s: Pick<GameState, "ownership" | "settings">, playerId: string): OwnershipState[] {
  return Object.values(s.ownership).filter((o) => o.ownerId === playerId);
}

export function ownsDistrict(s: Pick<GameState, "ownership" | "settings">, playerId: string, d: DistrictKey): boolean {
  return districtTiles(s, d).every((i) => s.ownership[i]?.ownerId === playerId);
}

export function districtHasBuildings(s: Pick<GameState, "ownership" | "settings">, d: DistrictKey): boolean {
  return districtTiles(s, d).some((i) => (s.ownership[i]?.houses ?? 0) > 0);
}

export function districtHasMortgage(s: Pick<GameState, "ownership" | "settings">, d: DistrictKey): boolean {
  return districtTiles(s, d).some((i) => s.ownership[i]?.mortgaged);
}

/** A tile can change hands (trade) / be mortgaged only if its district has no buildings. */
export function tileIsFreeOfBuildings(s: Pick<GameState, "ownership" | "settings">, tile: number): boolean {
  const t = tileAt(s, tile);
  if (t.kind !== "property" || !t.district) return true;
  return !districtHasBuildings(s, t.district);
}

export function countOwnedOfKind(s: Pick<GameState, "ownership" | "settings">, playerId: string, kind: "transport" | "utility"): number {
  return boardOf(s).tiles.filter((t) => t.kind === kind && s.ownership[t.index]?.ownerId === playerId).length;
}

export interface RentOptions {
  diceTotal: number;
  transportMultiplier?: number;
  utilityFixedMultiplier?: number;
}

export function computeRent(s: Pick<GameState, "ownership" | "settings">, tile: number, opts: RentOptions): number {
  const t = tileAt(s, tile);
  const o = s.ownership[tile];
  if (!o || !o.ownerId || o.mortgaged) return 0;
  if (t.kind === "property") {
    const rent = t.rent!;
    if (o.houses > 0) return rent[o.houses];
    return ownsDistrict(s, o.ownerId, t.district!) ? rent[0] * 2 : rent[0];
  }
  if (t.kind === "transport") {
    const n = countOwnedOfKind(s, o.ownerId, "transport");
    return (t.rent ?? [])[Math.max(0, n - 1)] * (opts.transportMultiplier ?? 1);
  }
  if (t.kind === "utility") {
    if (opts.utilityFixedMultiplier) return opts.diceTotal * opts.utilityFixedMultiplier;
    const n = countOwnedOfKind(s, o.ownerId, "utility");
    return opts.diceTotal * (t.multipliers ?? [])[Math.max(0, n - 1)];
  }
  return 0;
}

export function buildingValue(s: Pick<GameState, "settings">, tile: number, houses: number): number {
  const t = tileAt(s, tile);
  return houses * (t.houseCost ?? 0);
}

export function propertyValue(s: Pick<GameState, "ownership" | "settings">, playerId: string): number {
  let v = 0;
  for (const o of ownedTiles(s, playerId)) {
    const t = tileAt(s, o.tile);
    v += o.mortgaged ? (t.price ?? 0) - (t.mortgage ?? 0) : t.price ?? 0;
    v += buildingValue(s, o.tile, o.houses);
  }
  return v;
}

export function netWorth(s: Pick<GameState, "ownership" | "players" | "settings">, playerId: string): number {
  const p = findPlayer(s, playerId);
  if (!p || p.status !== "active") return 0;
  return p.balance + propertyValue(s, playerId);
}

/** Cash a player could raise by selling all buildings and mortgaging everything. */
export function liquidationValue(s: Pick<GameState, "ownership" | "players" | "settings">, playerId: string): number {
  const p = findPlayer(s, playerId);
  if (!p) return 0;
  let v = p.balance;
  for (const o of ownedTiles(s, playerId)) {
    const t = tileAt(s, o.tile);
    v += o.houses * Math.floor((t.houseCost ?? 0) / 2);
    if (!o.mortgaged) v += t.mortgage ?? 0;
  }
  return v;
}

export function buildingsCount(s: Pick<GameState, "ownership" | "settings">, playerId: string): { houses: number; towers: number } {
  let houses = 0;
  let towers = 0;
  for (const o of ownedTiles(s, playerId)) {
    if (o.houses === 5) towers++;
    else houses += o.houses;
  }
  return { houses, towers };
}

export interface Standing {
  playerId: string;
  rank: number;
  netWorth: number;
  cash: number;
  propertyValue: number;
  propertiesOwned: number;
  buildings: number;
  status: PlayerState["status"];
}

export function computeStandings(s: Pick<GameState, "ownership" | "players" | "winnerId" | "settings">): Standing[] {
  const active = activePlayers(s)
    .map((p) => ({ p, nw: netWorth(s, p.id) }))
    .sort((a, b) => {
      if (s.winnerId === a.p.id) return -1;
      if (s.winnerId === b.p.id) return 1;
      return b.nw - a.nw;
    });
  const bankrupt = s.players
    .filter((p) => p.status === "bankrupt")
    .sort((a, b) => (b.eliminatedOrder ?? 0) - (a.eliminatedOrder ?? 0));
  const rows: Standing[] = [];
  let rank = 1;
  for (const { p, nw } of active) {
    const b = buildingsCount(s, p.id);
    rows.push({
      playerId: p.id,
      rank: rank++,
      netWorth: nw,
      cash: p.balance,
      propertyValue: propertyValue(s, p.id),
      propertiesOwned: ownedTiles(s, p.id).length,
      buildings: b.houses + b.towers,
      status: p.status,
    });
  }
  for (const p of bankrupt) {
    rows.push({
      playerId: p.id,
      rank: rank++,
      netWorth: 0,
      cash: 0,
      propertyValue: 0,
      propertiesOwned: 0,
      buildings: 0,
      status: p.status,
    });
  }
  return rows;
}

/** Next tile index of a kind strictly after `from`, moving forward. */
export function nearestForward(s: Pick<GameState, "settings">, from: number, kind: "transport" | "utility"): number {
  const tiles = boardOf(s).tiles;
  for (let step = 1; step <= tiles.length; step++) {
    const idx = (from + step) % tiles.length;
    if (tiles[idx].kind === kind) return idx;
  }
  return from;
}

export function districtName(d: DistrictKey): string {
  return DISTRICTS[d].name;
}

