import type { District, DistrictKey, TileDef } from "./types";
import { BOARD_SIZE } from "./types";

// ---------------------------------------------------------------------------
// Empire City board — 48 tiles, 13 per side (corners shared)
//   26 properties (8 districts: six of 3, two of 4)
//    5 transport, 3 utilities, 4 events, 3 city fund, 3 taxes, 4 corners
// ---------------------------------------------------------------------------

export const DISTRICTS: Record<DistrictKey, District> = {
  borgo: { key: "borgo", name: "Borgo Vecchio", color: "#8d5a3b", houseCost: 50 },
  industriale: { key: "industriale", name: "Distretto Industriale", color: "#5fb4d9", houseCost: 60 },
  riverside: { key: "riverside", name: "Riverside", color: "#d9488f", houseCost: 100 },
  green: { key: "green", name: "Green Valley", color: "#f08a24", houseCost: 120 },
  centro: { key: "centro", name: "Centro Storico", color: "#e23b3b", houseCost: 150 },
  commerciale: { key: "commerciale", name: "Quartiere Commerciale", color: "#e8c21f", houseCost: 170 },
  skyline: { key: "skyline", name: "Skyline District", color: "#21a35a", houseCost: 200 },
  golden: { key: "golden", name: "Golden Heights", color: "#3355d6", houseCost: 220 },
};

export const DISTRICT_ORDER: DistrictKey[] = [
  "borgo",
  "industriale",
  "riverside",
  "green",
  "centro",
  "commerciale",
  "skyline",
  "golden",
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
  { index: 0, kind: "go", name: "Partenza", icon: "flag" },
  prop(1, "borgo", "Vicolo dei Tessitori", 70, [4, 20, 60, 180, 320, 450]),
  { index: 2, kind: "community", name: "Fondo Cittadino", icon: "landmark" },
  prop(3, "borgo", "Piazza del Pozzo", 70, [4, 20, 60, 180, 320, 450]),
  { index: 4, kind: "tax", name: "Imposta sul Reddito", taxAmount: 200, icon: "receipt" },
  prop(5, "borgo", "Via delle Botteghe", 90, [6, 30, 90, 270, 400, 550]),
  transport(6, "Stazione Centrale", "train"),
  prop(7, "industriale", "Via delle Officine", 120, [8, 40, 100, 300, 450, 600]),
  { index: 8, kind: "chance", name: "Evento Urbano", icon: "sparkles" },
  prop(9, "industriale", "Viale delle Fornaci", 120, [8, 40, 100, 300, 450, 600]),
  prop(10, "industriale", "Corso dell'Acciaio", 140, [10, 50, 150, 450, 625, 750]),
  utility(11, "Centrale Elettrica", "zap"),
  { index: 12, kind: "jail", name: "Prigione / Transito", icon: "lock" },
  // ---- Lato 2 (12–24) -----------------------------------------------------
  prop(13, "riverside", "Molo dei Pescatori", 160, [12, 60, 180, 500, 700, 900]),
  prop(14, "riverside", "Lungofiume Nord", 160, [12, 60, 180, 500, 700, 900]),
  { index: 15, kind: "community", name: "Fondo Cittadino", icon: "landmark" },
  prop(16, "riverside", "Ponte delle Chiatte", 180, [14, 70, 200, 550, 750, 950]),
  prop(17, "riverside", "Darsena Vecchia", 190, [16, 80, 220, 600, 800, 1000]),
  transport(18, "Porto Commerciale", "ship"),
  prop(19, "green", "Viale dei Tigli", 220, [18, 90, 250, 700, 875, 1050]),
  { index: 20, kind: "chance", name: "Evento Urbano", icon: "sparkles" },
  prop(21, "green", "Giardini dell'Orto", 220, [18, 90, 250, 700, 875, 1050]),
  utility(22, "Acquedotto Civico", "droplets"),
  prop(23, "green", "Parco delle Querce", 240, [20, 100, 300, 750, 925, 1100]),
  { index: 24, kind: "parking", name: "Parcheggio Libero", icon: "car" },
  // ---- Lato 3 (24–36) -----------------------------------------------------
  prop(25, "centro", "Via del Duomo", 270, [22, 110, 330, 800, 975, 1150]),
  { index: 26, kind: "chance", name: "Evento Urbano", icon: "sparkles" },
  prop(27, "centro", "Piazza dei Mercanti", 270, [22, 110, 330, 800, 975, 1150]),
  prop(28, "centro", "Loggia del Podestà", 290, [24, 120, 360, 850, 1025, 1200]),
  transport(29, "Aeroporto Internazionale", "plane"),
  prop(30, "commerciale", "Galleria Aurora", 320, [26, 130, 390, 900, 1100, 1275]),
  prop(31, "commerciale", "Corso della Moda", 320, [26, 130, 390, 900, 1100, 1275]),
  { index: 32, kind: "tax", name: "Tassa sul Lusso", taxAmount: 150, icon: "gem" },
  prop(33, "commerciale", "Viale degli Affari", 340, [28, 150, 450, 1000, 1200, 1400]),
  transport(34, "Terminal Logistico", "truck"),
  prop(35, "commerciale", "Piazza della Borsa", 350, [30, 160, 470, 1050, 1250, 1450]),
  { index: 36, kind: "goToJail", name: "Vai in Prigione", icon: "siren" },
  // ---- Lato 4 (36–47) -----------------------------------------------------
  prop(37, "skyline", "Torre Meridiana", 380, [35, 175, 500, 1100, 1300, 1500]),
  prop(38, "skyline", "Viale dei Cristalli", 380, [35, 175, 500, 1100, 1300, 1500]),
  { index: 39, kind: "community", name: "Fondo Cittadino", icon: "landmark" },
  prop(40, "skyline", "Piazza Orizzonte", 400, [40, 185, 550, 1200, 1400, 1600]),
  transport(41, "Stazione Alta Velocità", "train-front"),
  { index: 42, kind: "chance", name: "Evento Urbano", icon: "sparkles" },
  prop(43, "golden", "Collina degli Ulivi", 440, [45, 200, 600, 1350, 1600, 1850]),
  utility(44, "Rete in Fibra", "wifi"),
  prop(45, "golden", "Viale Belvedere", 460, [50, 220, 650, 1450, 1700, 1950]),
  { index: 46, kind: "tax", name: "Imposta Patrimoniale", taxAmount: 250, icon: "landmark" },
  prop(47, "golden", "Villa Panorama", 500, [60, 250, 750, 1600, 1900, 2200]),
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

/** CSS grid coordinates (1-based) on a 13×13 grid. Partenza is bottom-right. */
export function tileGridPosition(index: number): { row: number; col: number } {
  if (index <= 12) return { row: 13, col: 13 - index };
  if (index <= 24) return { row: 13 - (index - 12), col: 1 };
  if (index <= 36) return { row: 1, col: 1 + (index - 24) };
  return { row: 1 + (index - 36), col: 13 };
}
