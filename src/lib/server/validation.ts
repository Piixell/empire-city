import { z } from "zod";
import { BOARD_IDS, MAX_BOARD_SIZE } from "../game/board";
import { MAX_PLAYERS } from "../game/types";

export const COLORS = ["red", "blue", "green", "yellow", "purple", "orange", "pink", "teal"] as const;
export const boardIdSchema = z.enum(BOARD_IDS as ["classic", "standard", "maxi"]);
export const TOKENS = ["car", "ship", "plane", "rocket", "crown", "gem", "dog", "cat", "train", "bike"] as const;
export const AVATARS = ["🙂", "😎", "🤠", "🧐", "🦊", "🐼", "🐯", "🦁", "🐸", "🐙", "👑", "🚀", "🎩", "💼", "🏙️", "🌆"] as const;

const INVISIBLE_RANGES: [number, number][] = [
  [0x00, 0x08], [0x0b, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff],
];
const INVISIBLE_RE = new RegExp(
  "[" + INVISIBLE_RANGES.map(([a, b]) => `\\u${a.toString(16).padStart(4, "0")}-\\u${b.toString(16).padStart(4, "0")}`).join("") + "]",
  "g",
);

/** Strip control chars / zero-width chars, collapse whitespace, trim. */
export function sanitizeText(input: string, max: number): string {
  return input
    .normalize("NFC")
    .replace(INVISIBLE_RE, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export const displayName = z
  .string()
  .transform((s) => sanitizeText(s, 20))
  .refine((s) => s.length >= 1, "Il nome non può essere vuoto (max 20 caratteri).");

export const settingsSchema = z.object({
  maxPlayers: z.number().int().min(2).max(MAX_PLAYERS),
  startingCash: z.number().int().min(500).max(20000),
  goBonus: z.number().int().min(0).max(2000),
  turnSeconds: z.number().int().min(30).max(600),
  auctionsEnabled: z.boolean(),
  chatEnabled: z.boolean(),
  maxDurationMinutes: z.number().int().min(0).max(600),
  board: boardIdSchema,
});

export const createRoomSchema = z.object({
  name: displayName,
  maxPlayers: z.number().int().min(2).max(MAX_PLAYERS).default(6),
  board: boardIdSchema.optional(),
  password: z.string().max(64).optional().nullable(),
});

export const joinRoomSchema = z.object({
  name: displayName.optional(),
  password: z.string().max(64).optional().nullable(),
});

export const profileSchema = z
  .object({
    name: displayName.optional(),
    color: z.enum(COLORS).optional(),
    token: z.enum(TOKENS).optional(),
    avatar: z.enum(AVATARS).optional(),
  })
  .strict();

export const readySchema = z.object({ ready: z.boolean() });

export const updateSettingsSchema = z.object({
  settings: settingsSchema.partial().optional(),
  password: z.string().max(64).nullable().optional(),
});

export const chatSchema = z.object({
  body: z.string().transform((s) => sanitizeText(s, 300)).refine((s) => s.length > 0, "Messaggio vuoto."),
});

const tile = z.number().int().min(0).max(MAX_BOARD_SIZE - 1);
const money = z.number().int().min(0).max(1_000_000);
const cardIds = z.array(z.string().max(8)).max(4);

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ROLL") }),
  z.object({ type: z.literal("BUY") }),
  z.object({ type: z.literal("DECLINE_BUY") }),
  z.object({ type: z.literal("BID"), amount: money }),
  z.object({ type: z.literal("AUCTION_PASS") }),
  z.object({ type: z.literal("PAY_JAIL") }),
  z.object({ type: z.literal("USE_JAIL_CARD") }),
  z.object({ type: z.literal("BUILD"), tile }),
  z.object({ type: z.literal("SELL_BUILDING"), tile }),
  z.object({ type: z.literal("MORTGAGE"), tile }),
  z.object({ type: z.literal("UNMORTGAGE"), tile }),
  z.object({ type: z.literal("PAY_DEBT") }),
  z.object({ type: z.literal("DECLARE_BANKRUPTCY") }),
  z.object({ type: z.literal("RESIGN") }),
  z.object({ type: z.literal("END_TURN") }),
  z.object({
    type: z.literal("PROPOSE_TRADE"),
    toId: z.uuid(),
    offerTiles: z.array(tile).max(34),
    requestTiles: z.array(tile).max(34),
    offerCash: money,
    requestCash: money,
    offerCards: cardIds,
    requestCards: cardIds,
    counterOf: z.uuid().nullable().optional(),
  }),
  z.object({ type: z.literal("ACCEPT_TRADE"), tradeId: z.uuid() }),
  z.object({ type: z.literal("REJECT_TRADE"), tradeId: z.uuid() }),
  z.object({ type: z.literal("CANCEL_TRADE"), tradeId: z.uuid() }),
  z.object({ type: z.literal("TIMEOUT") }),
]);

export const commandEnvelopeSchema = z.object({
  commandId: z.uuid(),
  command: commandSchema,
});

export const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;
export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}
