import type { District, DistrictKey, TileDef } from "./types";
import { BOARD_SIZE } from "./types";

// ---------------------------------------------------------------------------
// Empire City — board of the original fantasy world of Valoria.
// 48 tiles, 13 per side (corners shared):
//   26 properties (8 regions: six of 3, two of 4)
//    5 portals/vessels (transport), 3 arcane sources (utilities),
//    4 "Destino Arcano", 3 "Tesoro della Gilda", 3 tributes (taxes), 4 corners
// All names are original.
// ---------------------------------------------------------------------------

export const DISTRICTS: Record<DistrictKey, District> = {
  bassofondo: { key: "bassofondo", name: "Bassofondo Velenoso", color: "#7cb82f", houseCost: 50, icon: "flask" },
  approdo: { key: "approdo", name: "Approdo dei Corsari", color: "#159a9c", houseCost: 60, icon: "anchor" },
  sahrem: { key: "sahrem", name: "Dune di Sahrem", color: "#d9a441", houseCost: 100, icon: "sun" },
  frontiera: { key: "frontiera", name: "Gelida Frontiera", color: "#63b9ea", houseCost: 120, icon: "snowflake" },
  kaori: { key: "kaori", name: "Isole di Kaori", color: "#e0559a", houseCost: 150, icon: "feather" },
  ferro: { key: "ferro", name: "Imperium di Ferro", color: "#b8322a", houseCost: 170, icon: "swords" },
  aurelia: { key: "aurelia", name: "Aurelia dei Congegni", color: "#e5871c", houseCost: 200, icon: "cog" },
  argentea: { key: "argentea", name: "Argentea", color: "#3a5bd9", houseCost: 220, icon: "shield" },
};

export const DISTRICT_ORDER: DistrictKey[] = [
  "bassofondo",
  "approdo",
  "sahrem",
  "frontiera",
  "kaori",
  "ferro",
  "aurelia",
  "argentea",
];

export const TRANSPORT_PRICE = 220;
export const TRANSPORT_RENT = [30, 60, 120, 240, 400];
export const UTILITY_PRICE = 170;
export const UTILITY_MULTIPLIERS = [5, 12, 20];
export const JAIL_FINE = 60;
export const UNMORTGAGE_INTEREST = 0.1;

function prop(
  index: number,
  district: DistrictKey,
  name: string,
  price: number,
  rent: [number, number, number, number, number, number],
): TileDef {
  return {
    index,
    kind: "property",
    name,
    district,
    price,
    rent,
    houseCost: DISTRICTS[district].houseCost,
    mortgage: price / 2,
  };
}

function transport(index: number, name: string, icon: string): TileDef {
  return {
    index,
    kind: "transport",
    name,
    price: TRANSPORT_PRICE,
    rent: TRANSPORT_RENT,
    mortgage: TRANSPORT_PRICE / 2,
    icon,
  };
}

function utility(index: number, name: string, icon: string): TileDef {
  return {
    index,
    kind: "utility",
    name,
    price: UTILITY_PRICE,
    multipliers: UTILITY_MULTIPLIERS,
    mortgage: UTILITY_PRICE / 2,
    icon,
  };
}

export const BOARD: TileDef[] = [
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

if (BOARD.length !== BOARD_SIZE) {
  throw new Error(`Board must have ${BOARD_SIZE} tiles, found ${BOARD.length}`);
}

export const OWNABLE_KINDS = new Set(["property", "transport", "utility"]);

export function tileAt(index: number): TileDef {
  const t = BOARD[index];
  if (!t) throw new Error(`Invalid tile ${index}`);
  return t;
}

export function isOwnable(index: number): boolean {
  const t = BOARD[index];
  return !!t && OWNABLE_KINDS.has(t.kind);
}

export const OWNABLE_TILES: number[] = BOARD.filter((t) => OWNABLE_KINDS.has(t.kind)).map((t) => t.index);

export function districtTiles(key: DistrictKey): number[] {
  return BOARD.filter((t) => t.district === key).map((t) => t.index);
}

export function unmortgageCost(index: number): number {
  const t = tileAt(index);
  return Math.round((t.mortgage ?? 0) * (1 + UNMORTGAGE_INTEREST));
}

export function tilesOfKind(kind: TileDef["kind"]): number[] {
  return BOARD.filter((t) => t.kind === kind).map((t) => t.index);
}

/** Side of the board (0 = bottom, 1 = left, 2 = top, 3 = right) for layout. */
export function tileSide(index: number): 0 | 1 | 2 | 3 {
  if (index < 12) return 0;
  if (index < 24) return 1;
  if (index < 36) return 2;
  return 3;
}

export function isCorner(index: number): boolean {
  return index % 12 === 0;
}

/** CSS grid coordinates (1-based) on a 13×13 grid. The start tile (Fontana della Rinascita) is bottom-right. */
export function tileGridPosition(index: number): { row: number; col: number } {
  if (index <= 12) return { row: 13, col: 13 - index };
  if (index <= 24) return { row: 13 - (index - 12), col: 1 };
  if (index <= 36) return { row: 1, col: 1 + (index - 24) };
  return { row: 1 + (index - 36), col: 13 };
}
