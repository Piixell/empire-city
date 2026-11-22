import type { BoardId, District, DistrictKey, TileDef } from "./types";

// ---------------------------------------------------------------------------
// Empire City — boards of the original fantasy world of Valoria.
// Three variants (all names are original):
//   classic   40 tiles (10 per side), 22 properties, 2–6 players
//   standard  48 tiles (12 per side), 26 properties, 2–6 players  [default]
//   maxi      64 tiles (16 per side), 36 properties, 2–8 players
// Corners are always: start, dungeon (jail), camp (free), "Catturato!".
// Every board contains the "anchor" tiles that cards can move players to.
// ---------------------------------------------------------------------------

export const DISTRICTS: Record<DistrictKey, District> = {
  bassofondo: { key: "bassofondo", name: "Bassofondo Velenoso", color: "#7cb82f", houseCost: 50, icon: "flask" },
  approdo: { key: "approdo", name: "Approdo dei Corsari", color: "#159a9c", houseCost: 60, icon: "anchor" },
  paludi: { key: "paludi", name: "Paludi di Morvath", color: "#7a5230", houseCost: 80, icon: "moon" },
  sahrem: { key: "sahrem", name: "Dune di Sahrem", color: "#d9a441", houseCost: 100, icon: "sun" },
  frontiera: { key: "frontiera", name: "Gelida Frontiera", color: "#63b9ea", houseCost: 120, icon: "snowflake" },
  kaori: { key: "kaori", name: "Isole di Kaori", color: "#e0559a", houseCost: 150, icon: "feather" },
  picchi: { key: "picchi", name: "Picchi Celesti", color: "#9b59d0", houseCost: 160, icon: "mountain" },
  ferro: { key: "ferro", name: "Imperium di Ferro", color: "#b8322a", houseCost: 170, icon: "swords" },
  aurelia: { key: "aurelia", name: "Aurelia dei Congegni", color: "#e5871c", houseCost: 200, icon: "cog" },
  argentea: { key: "argentea", name: "Argentea", color: "#3a5bd9", houseCost: 220, icon: "shield" },
};

export const TRANSPORT_PRICE = 220;
export const TRANSPORT_RENT_TABLE = [30, 60, 120, 240, 400, 600];
export const UTILITY_PRICE = 170;
export const UTILITY_MULTIPLIER_TABLE = [5, 12, 20];
export const JAIL_FINE = 60;
export const UNMORTGAGE_INTEREST = 0.1;
export const MAX_BOARD_SIZE = 64;

/** Tiles that cards may target by key (present on every board). */
const ANCHOR_BY_NAME: Record<string, string> = {
  "Palazzo Reale d'Argento": "palazzo-reale",
  "Tempio del Vento": "tempio-vento",
  "Oasi Nascosta": "oasi",
  "Carovana delle Dune": "carovana",
  "Bastione del Generale": "bastione",
};

function prop(
  index: number,
  district: DistrictKey,
  name: string,
  price: number,
  rent: number[],
  houseCost = DISTRICTS[district].houseCost,
): TileDef {
  return { index, kind: "property", name, district, price, rent, houseCost, mortgage: price / 2 };
}

function transport(index: number, name: string, icon: string): TileDef {
  // rent table is set per board once the number of transports is known
  return { index, kind: "transport", name, price: TRANSPORT_PRICE, rent: [], mortgage: TRANSPORT_PRICE / 2, icon };
}

function utility(index: number, name: string, icon: string): TileDef {
  return { index, kind: "utility", name, price: UTILITY_PRICE, multipliers: [], mortgage: UTILITY_PRICE / 2, icon };
}

// ------------------------------- standard 48 -------------------------------
// Unchanged layout/prices: games created before board variants keep working.

const STANDARD_TILES: TileDef[] = [
  // ---- Lato 1 (0–12) ------------------------------------------------------
  { index: 0, kind: "go", name: "Fontana della Rinascita", icon: "flag" },
  prop(1, "bassofondo", "Vicolo delle Esalazioni", 70, [4, 20, 60, 180, 320, 450]),
  { index: 2, kind: "community", name: "Tesoro della Gilda", icon: "coins" },
  prop(3, "bassofondo", "Mercato Nero", 70, [4, 20, 60, 180, 320, 450]),
  { index: 4, kind: "tax", name: "Tributo al Re", taxAmount: 200, icon: "crown" },
  prop(5, "bassofondo", "Laboratorio Clandestino", 90, [6, 30, 90, 270, 400, 550]),
  transport(6, "Portale del Sottosuolo", "orbit"),
  prop(7, "approdo", "Molo dei Ramponi", 120, [8, 40, 100, 300, 450, 600]),
  { index: 8, kind: "chance", name: "Destino Arcano", icon: "sparkles" },
  prop(9, "approdo", "Taverna del Kraken", 120, [8, 40, 100, 300, 450, 600]),
  prop(10, "approdo", "Arena dei Cacciatori", 140, [10, 50, 150, 450, 625, 750]),
  utility(11, "Fonte di Mana", "droplets"),
  { index: 12, kind: "jail", name: "Segrete del Re", icon: "lock" },
  // ---- Lato 2 (12–24) -----------------------------------------------------
  prop(13, "sahrem", "Oasi Nascosta", 160, [12, 60, 180, 500, 700, 900]),
  prop(14, "sahrem", "Bazar delle Sabbie", 160, [12, 60, 180, 500, 700, 900]),
  { index: 15, kind: "community", name: "Tesoro della Gilda", icon: "coins" },
  prop(16, "sahrem", "Tomba dei Re Solari", 180, [14, 70, 200, 550, 750, 950]),
  prop(17, "sahrem", "Colosso Sepolto", 190, [16, 80, 220, 600, 800, 1000]),
  transport(18, "Vascello dei Corsari", "ship"),
  prop(19, "frontiera", "Villaggio dei Lupi Bianchi", 220, [18, 90, 250, 700, 875, 1050]),
  { index: 20, kind: "chance", name: "Destino Arcano", icon: "sparkles" },
  prop(21, "frontiera", "Rocca del Disgelo", 220, [18, 90, 250, 700, 875, 1050]),
  utility(22, "Forgia Arcana", "anvil"),
  prop(23, "frontiera", "Altare di Ghiaccio Antico", 240, [20, 100, 300, 750, 925, 1100]),
  { index: 24, kind: "parking", name: "Accampamento", icon: "tent" },
  // ---- Lato 3 (24–36) -----------------------------------------------------
  prop(25, "kaori", "Tempio del Vento", 270, [22, 110, 330, 800, 975, 1150]),
  { index: 26, kind: "chance", name: "Destino Arcano", icon: "sparkles" },
  prop(27, "kaori", "Giardino dei Ciliegi", 270, [22, 110, 330, 800, 975, 1150]),
  prop(28, "kaori", "Monastero delle Lame", 290, [24, 120, 360, 850, 1025, 1200]),
  transport(29, "Carovana delle Dune", "footprints"),
  prop(30, "ferro", "Caserma della Legione", 320, [26, 130, 390, 900, 1100, 1275]),
  prop(31, "ferro", "Arena dei Gladiatori", 320, [26, 130, 390, 900, 1100, 1275]),
  { index: 32, kind: "tax", name: "Riscatto del Drago", taxAmount: 150, icon: "flame" },
  prop(33, "ferro", "Forgia dell'Impero", 340, [28, 150, 450, 1000, 1200, 1400]),
  transport(34, "Dirigibile di Aurelia", "wind"),
  prop(35, "ferro", "Bastione del Generale", 350, [30, 160, 470, 1050, 1250, 1450]),
  { index: 36, kind: "goToJail", name: "Catturato!", icon: "siren" },
  // ---- Lato 4 (36–47) -----------------------------------------------------
  prop(37, "aurelia", "Accademia degli Inventori", 380, [35, 175, 500, 1100, 1300, 1500]),
  prop(38, "aurelia", "Quartiere degli Ingranaggi", 380, [35, 175, 500, 1100, 1300, 1500]),
  { index: 39, kind: "community", name: "Tesoro della Gilda", icon: "coins" },
  prop(40, "aurelia", "Ponte dei Dirigibili", 400, [40, 185, 550, 1200, 1400, 1600]),
  transport(41, "Portale Ancestrale", "orbit"),
  { index: 42, kind: "chance", name: "Destino Arcano", icon: "sparkles" },
  prop(43, "argentea", "Piazza dei Paladini", 440, [45, 200, 600, 1350, 1600, 1850]),
  utility(44, "Pozzo delle Rune", "gem"),
  prop(45, "argentea", "Cattedrale della Luce", 460, [50, 220, 650, 1450, 1700, 1950]),
  { index: 46, kind: "tax", name: "Decima della Gilda", taxAmount: 250, icon: "hand-coins" },
  prop(47, "argentea", "Palazzo Reale d'Argento", 500, [60, 250, 750, 1600, 1900, 2200]),
];

const STANDARD_BY_NAME: Record<string, TileDef> = Object.fromEntries(STANDARD_TILES.map((t) => [t.name, t]));

// ------------------------------- builder -----------------------------------
// Slot codes: G start · J dungeon · K camp · Z "Catturato!" · P property ·
//             T transport · U utility · C Destino Arcano · F Tesoro della Gilda · X tribute

type PropSpec = { district: DistrictKey; name: string; price: number; rent: number[]; houseCost?: number };

function buildTiles(
  slots: string,
  props: PropSpec[],
  transports: [name: string, icon: string][],
  utilities: [name: string, icon: string][],
  taxes: [name: string, amount: number, icon: string][],
): TileDef[] {
  const codes = slots.trim().split(/\s+/);
  const queue = { P: [...props], T: [...transports], U: [...utilities], X: [...taxes] };
  const tiles = codes.map((code, index): TileDef => {
    switch (code) {
      case "G":
        return { index, kind: "go", name: "Fontana della Rinascita", icon: "flag" };
      case "J":
        return { index, kind: "jail", name: "Segrete del Re", icon: "lock" };
      case "K":
        return { index, kind: "parking", name: "Accampamento", icon: "tent" };
      case "Z":
        return { index, kind: "goToJail", name: "Catturato!", icon: "siren" };
      case "C":
        return { index, kind: "chance", name: "Destino Arcano", icon: "sparkles" };
      case "F":
        return { index, kind: "community", name: "Tesoro della Gilda", icon: "coins" };
      case "P": {
        const p = queue.P.shift();
        if (!p) throw new Error("Board spec: not enough properties");
        return prop(index, p.district, p.name, p.price, p.rent, p.houseCost);
      }
      case "T": {
        const t = queue.T.shift();
        if (!t) throw new Error("Board spec: not enough transports");
        return transport(index, t[0], t[1]);
      }
      case "U": {
        const u = queue.U.shift();
        if (!u) throw new Error("Board spec: not enough utilities");
        return utility(index, u[0], u[1]);
      }
      case "X": {
        const x = queue.X.shift();
        if (!x) throw new Error("Board spec: not enough taxes");
        return { index, kind: "tax", name: x[0], taxAmount: x[1], icon: x[2] };
      }
      default:
        throw new Error(`Board spec: unknown slot ${code}`);
    }
  });
  if (queue.P.length || queue.T.length || queue.U.length || queue.X.length) throw new Error("Board spec: unused items");
  return tiles;
}

/** Reuse the standard board's price/rent for a named property. */
function std(district: DistrictKey, name: string): PropSpec {
  const t = STANDARD_BY_NAME[name];
  if (!t || t.kind !== "property") throw new Error(`Unknown standard property ${name}`);
  return { district, name, price: t.price!, rent: t.rent! };
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/** Progressive rent table derived from the price (maxi board). */
function rentFor(price: number): number[] {
  const t = Math.min(1, Math.max(0, (price - 60) / 460));
  const base = Math.max(2, Math.round(price * (0.05 + 0.07 * t)));
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const mults = [lerp(5, 4.2), lerp(15, 12.5), lerp(45, 27), lerp(80, 32), lerp(112, 37)];
  const rent = [base, ...mults.map((m) => round5(base * m))];
  for (let i = 1; i < rent.length; i++) rent[i] = Math.max(rent[i], rent[i - 1] + 5);
  return rent;
}

// ------------------------------- classic 40 --------------------------------

const CLASSIC_TILES = buildTiles(
  `G P F P X T P C P P
   J P U P P T P F P P
   K P C P P T P P U P
   Z P P F P T C P X P`,
  [
    std("bassofondo", "Vicolo delle Esalazioni"),
    std("bassofondo", "Laboratorio Clandestino"),
    std("approdo", "Molo dei Ramponi"),
    std("approdo", "Taverna del Kraken"),
    std("approdo", "Arena dei Cacciatori"),
    std("sahrem", "Oasi Nascosta"),
    std("sahrem", "Bazar delle Sabbie"),
    std("sahrem", "Colosso Sepolto"),
    std("frontiera", "Villaggio dei Lupi Bianchi"),
    std("frontiera", "Rocca del Disgelo"),
    std("frontiera", "Altare di Ghiaccio Antico"),
    std("kaori", "Tempio del Vento"),
    std("kaori", "Giardino dei Ciliegi"),
    std("kaori", "Monastero delle Lame"),
    std("ferro", "Caserma della Legione"),
    std("ferro", "Arena dei Gladiatori"),
    std("ferro", "Bastione del Generale"),
    std("aurelia", "Accademia degli Inventori"),
    std("aurelia", "Quartiere degli Ingranaggi"),
    std("aurelia", "Ponte dei Dirigibili"),
    std("argentea", "Cattedrale della Luce"),
    std("argentea", "Palazzo Reale d'Argento"),
  ],
  [
    ["Portale del Sottosuolo", "orbit"],
    ["Vascello dei Corsari", "ship"],
    ["Carovana delle Dune", "footprints"],
    ["Portale Ancestrale", "orbit"],
  ],
  [
    ["Fonte di Mana", "droplets"],
    ["Forgia Arcana", "anvil"],
  ],
  [
    ["Tributo al Re", 200, "crown"],
    ["Decima della Gilda", 150, "hand-coins"],
  ],
);

// -------------------------------- maxi 64 ----------------------------------

const MAXI_REGIONS: [DistrictKey, number, string[]][] = [
  ["bassofondo", 50, ["Vicolo delle Esalazioni", "Mercato Nero", "Laboratorio Clandestino"]],
  ["approdo", 60, ["Molo dei Ramponi", "Taverna del Kraken", "Faro dei Naufraghi", "Arena dei Cacciatori"]],
  ["paludi", 80, ["Capanna della Strega", "Pontile delle Lucciole", "Radura dei Funghi Giganti"]],
  ["sahrem", 100, ["Oasi Nascosta", "Bazar delle Sabbie", "Tomba dei Re Solari", "Colosso Sepolto"]],
  ["frontiera", 120, ["Villaggio dei Lupi Bianchi", "Rocca del Disgelo", "Passo delle Valanghe", "Altare di Ghiaccio Antico"]],
  ["kaori", 150, ["Tempio del Vento", "Giardino dei Ciliegi", "Ponte delle Lanterne", "Monastero delle Lame"]],
  ["picchi", 160, ["Osservatorio delle Stelle", "Scala dei Mille Gradini", "Santuario delle Nuvole"]],
  ["ferro", 170, ["Caserma della Legione", "Arena dei Gladiatori", "Forgia dell'Impero", "Bastione del Generale"]],
  ["aurelia", 200, ["Accademia degli Inventori", "Quartiere degli Ingranaggi", "Fiera dei Prodigi", "Ponte dei Dirigibili"]],
  ["argentea", 220, ["Piazza dei Paladini", "Cattedrale della Luce", "Palazzo Reale d'Argento"]],
];

function maxiProps(): PropSpec[] {
  const flat = MAXI_REGIONS.flatMap(([district, houseCost, names]) => names.map((name) => ({ district, houseCost, name })));
  return flat.map((p, k) => {
    // 60 → 520 credits along the board; the last tile of each region costs a bit more
    const regionNames = MAXI_REGIONS.find((r) => r[0] === p.district)![2];
    const isLast = regionNames[regionNames.length - 1] === p.name;
    const price = Math.round((60 + (460 * k) / (flat.length - 1)) / 10) * 10 + (isLast ? 10 : 0);
    return { district: p.district, name: p.name, price, rent: rentFor(price), houseCost: p.houseCost };
  });
}

const MAXI_TILES = buildTiles(
  `G P F P X P T P C P P U P P F P
   J P P F P P T P C P P X P P T P
   K P C P P T P P U P P F P C P P
   Z P P C P T P X U P C P T F X P`,
  maxiProps(),
  [
    ["Portale del Sottosuolo", "orbit"],
    ["Vascello dei Corsari", "ship"],
    ["Carovana delle Dune", "footprints"],
    ["Grifoni Postali", "bird"],
    ["Dirigibile di Aurelia", "wind"],
    ["Portale Ancestrale", "orbit"],
  ],
  [
    ["Fonte di Mana", "droplets"],
    ["Forgia Arcana", "anvil"],
    ["Pozzo delle Rune", "gem"],
  ],
  [
    ["Tributo al Re", 200, "crown"],
    ["Riscatto del Drago", 150, "flame"],
    ["Pedaggio del Ponte Levatoio", 100, "castle"],
    ["Decima della Gilda", 250, "hand-coins"],
  ],
);

// ------------------------------- registry ----------------------------------

export const OWNABLE_KINDS = new Set(["property", "transport", "utility"]);

export interface BoardDef {
  id: BoardId;
  label: string;
  description: string;
  size: number;
  /** Tiles per side, counting one corner (size / 4). */
  perSide: number;
  maxPlayers: number;
  tiles: TileDef[];
  ownable: number[];
  jailIndex: number;
  goToJailIndex: number;
  districts: DistrictKey[];
  byDistrict: Partial<Record<DistrictKey, number[]>>;
  anchors: Record<string, number>;
}

function finalize(id: BoardId, label: string, description: string, maxPlayers: number, tiles: TileDef[]): BoardDef {
  const size = tiles.length;
  if (size % 4 !== 0) throw new Error(`Board ${id}: size must be a multiple of 4`);
  const perSide = size / 4;
  const corners = [0, perSide, perSide * 2, perSide * 3].map((i) => tiles[i]?.kind);
  if (corners.join() !== "go,jail,parking,goToJail") throw new Error(`Board ${id}: wrong corners ${corners.join()}`);
  tiles.forEach((t, i) => {
    if (t.index !== i) throw new Error(`Board ${id}: tile ${i} has index ${t.index}`);
  });
  const transports = tiles.filter((t) => t.kind === "transport");
  const utilities = tiles.filter((t) => t.kind === "utility");
  if (transports.length > TRANSPORT_RENT_TABLE.length || utilities.length > UTILITY_MULTIPLIER_TABLE.length) {
    throw new Error(`Board ${id}: too many transports/utilities`);
  }
  const finalTiles = tiles.map((t): TileDef => {
    const anchor = ANCHOR_BY_NAME[t.name];
    const withKey = anchor ? { ...t, key: anchor } : t;
    if (t.kind === "transport") return { ...withKey, rent: TRANSPORT_RENT_TABLE.slice(0, transports.length) };
    if (t.kind === "utility") return { ...withKey, multipliers: UTILITY_MULTIPLIER_TABLE.slice(0, utilities.length) };
    return withKey;
  });
  const byDistrict: Partial<Record<DistrictKey, number[]>> = {};
  for (const t of finalTiles) if (t.district) (byDistrict[t.district] ??= []).push(t.index);
  const anchors: Record<string, number> = { start: 0, jail: perSide };
  for (const t of finalTiles) if (t.key) anchors[t.key] = t.index;
  for (const key of Object.values(ANCHOR_BY_NAME)) {
    if (anchors[key] == null) throw new Error(`Board ${id}: missing anchor ${key}`);
  }
  return {
    id,
    label,
    description,
    size,
    perSide,
    maxPlayers,
    tiles: finalTiles,
    ownable: finalTiles.filter((t) => OWNABLE_KINDS.has(t.kind)).map((t) => t.index),
    jailIndex: perSide,
    goToJailIndex: perSide * 3,
    districts: Object.keys(byDistrict) as DistrictKey[],
    byDistrict,
    anchors,
  };
}

export const BOARDS: Record<BoardId, BoardDef> = {
  classic: finalize("classic", "Classica · 40 caselle", "La disposizione tradizionale: 22 proprietà in 8 regioni.", 6, CLASSIC_TILES),
  standard: finalize("standard", "Standard · 48 caselle", "La plancia maxi originale: 26 proprietà in 8 regioni.", 6, STANDARD_TILES),
  maxi: finalize("maxi", "Maxi · 64 caselle", "Fino a 8 giocatori: 36 proprietà in 10 regioni.", 8, MAXI_TILES),
};

export const BOARD_IDS: BoardId[] = ["classic", "standard", "maxi"];
export const DEFAULT_BOARD: BoardId = "standard";

export type BoardRef = BoardId | BoardDef | { settings?: { board?: BoardId | null } | null } | null | undefined;

/** Resolves the board of a game/state/settings; legacy games default to "standard". */
export function boardOf(ref: BoardRef): BoardDef {
  if (!ref) return BOARDS[DEFAULT_BOARD];
  if (typeof ref === "string") return BOARDS[ref] ?? BOARDS[DEFAULT_BOARD];
  if ("tiles" in ref) return ref;
  const id = ref.settings?.board;
  return (id && BOARDS[id]) || BOARDS[DEFAULT_BOARD];
}

export function tileAt(ref: BoardRef, index: number): TileDef {
  const t = boardOf(ref).tiles[index];
  if (!t) throw new Error(`Invalid tile ${index}`);
  return t;
}

export function isOwnable(ref: BoardRef, index: number): boolean {
  const t = boardOf(ref).tiles[index];
  return !!t && OWNABLE_KINDS.has(t.kind);
}

export function districtTiles(ref: BoardRef, key: DistrictKey): number[] {
  return boardOf(ref).byDistrict[key] ?? [];
}

export function unmortgageCost(ref: BoardRef, index: number): number {
  const t = tileAt(ref, index);
  return Math.round((t.mortgage ?? 0) * (1 + UNMORTGAGE_INTEREST));
}

/** Side of the board (0 = bottom, 1 = left, 2 = top, 3 = right) for layout. */
export function tileSide(index: number, perSide: number): 0 | 1 | 2 | 3 {
  return Math.min(3, Math.floor(index / perSide)) as 0 | 1 | 2 | 3;
}

export function isCorner(index: number, perSide: number): boolean {
  return index % perSide === 0;
}

/**
 * CSS grid coordinates (1-based) on a (perSide+1)×(perSide+1) grid.
 * The start tile is bottom-right; play proceeds clockwise.
 */
export function tileGridPosition(index: number, perSide: number): { row: number; col: number } {
  const d = perSide + 1;
  if (index <= perSide) return { row: d, col: d - index };
  if (index <= perSide * 2) return { row: d - (index - perSide), col: 1 };
  if (index <= perSide * 3) return { row: 1, col: 1 + (index - perSide * 2) };
  return { row: 1 + (index - perSide * 3), col: d };
}
