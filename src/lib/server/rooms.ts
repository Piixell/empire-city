// ---------------------------------------------------------------------------
// Rooms & lobby service. Every mutation runs in a transaction that locks the
// game_rooms row (SELECT ... FOR UPDATE), so concurrent joins / color picks /
// starts are serialized and validated against fresh data.
// ---------------------------------------------------------------------------
import { randomBytes, randomInt, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createInitialState, type Rng } from "../game/engine";
import { DEFAULT_SETTINGS, type GameSettings, type PlayerColor, type PublicGameState, type TokenModel } from "../game/types";
import type { Database, Queryer, Row } from "./db";
import { ApiError, conflict, forbidden, notFound } from "./errors";
import { applyGameCommand, cryptoRng, insertNewGame } from "./game-service";
import { COLORS, TOKENS, settingsSchema } from "./validation";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const SYSTEM_USER = "00000000-0000-0000-0000-000000000000";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface RoomPlayerView {
  id: string;
  userId: string;
  name: string;
  color: PlayerColor;
  token: TokenModel;
  avatar: string;
  isReady: boolean;
  isHost: boolean;
  joinedAt: string;
}

export interface ChatMessageView {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  body: string;
  createdAt: string;
  system: boolean;
}

export interface RoomView {
  id: string;
  code: string;
  status: "lobby" | "playing" | "finished" | "closed";
  hostUserId: string;
  maxPlayers: number;
  hasPassword: boolean;
  settings: GameSettings;
  currentGameId: string | null;
  createdAt: string;
}

export interface RoomSnapshot {
  member: true;
  room: RoomView;
  players: RoomPlayerView[];
  me: RoomPlayerView;
  chat: ChatMessageView[];
  game: PublicGameState | null;
  serverTime: number;
}

export interface RoomPreview {
  member: false;
  code: string;
  status: RoomView["status"];
  hasPassword: boolean;
  playerCount: number;
  maxPlayers: number;
  canJoin: boolean;
  reason?: string;
}

// ------------------------------ helpers ------------------------------------

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, saltHex, keyHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(pw, Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(keyHex, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

export function generateRoomCode(rng: (max: number) => number = randomInt): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[rng(CODE_ALPHABET.length)];
  return s;
}

/** jsonb values written as a JSON *string* (driver double-encoding) are parsed back. */
function jsonObject(v: unknown): Record<string, unknown> {
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function roomView(r: Row): RoomView {
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    hostUserId: r.host_user_id,
    maxPlayers: r.max_players,
    hasPassword: r.has_password,
    settings: { ...DEFAULT_SETTINGS, ...jsonObject(r.settings), maxPlayers: r.max_players },
    currentGameId: r.current_game_id,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function playerView(p: Row, hostUserId: string): RoomPlayerView {
  return {
    id: p.id,
    userId: p.user_id,
    name: p.display_name,
    color: p.color,
    token: p.token,
    avatar: p.avatar,
    isReady: p.is_ready,
    isHost: p.user_id === hostUserId,
    joinedAt: new Date(p.joined_at).toISOString(),
  };
}

async function lockRoomById(q: Queryer, roomId: string): Promise<Row> {
  const rows = await q.query(`select * from public.game_rooms where id = $1::uuid for update`, [roomId]);
  if (!rows[0]) throw notFound("Stanza non trovata.");
  return rows[0];
}

async function lockRoomByCode(q: Queryer, code: string): Promise<Row> {
  const rows = await q.query(`select * from public.game_rooms where code = $1 for update`, [code]);
  if (!rows[0] || rows[0].status === "closed") throw notFound("Nessuna stanza con questo codice.");
  return rows[0];
}

async function activePlayers(q: Queryer, roomId: string): Promise<Row[]> {
  return q.query(
    `select * from public.room_players where room_id = $1::uuid and status = 'active' order by joined_at, id`,
    [roomId],
  );
}

async function requireMember(q: Queryer, roomId: string, userId: string): Promise<Row> {
  const rows = await q.query(
    `select * from public.room_players where room_id = $1::uuid and user_id = $2::uuid and status = 'active'`,
    [roomId, userId],
  );
  if (!rows[0]) throw forbidden("Non fai parte di questa stanza.");
  return rows[0];
}

async function systemMessage(q: Queryer, roomId: string, body: string) {
  await q.query(
    `insert into public.chat_messages (room_id, user_id, display_name, body) values ($1::uuid, $2::uuid, 'Sistema', $3)`,
    [roomId, SYSTEM_USER, body.slice(0, 300)],
  );
}

function firstFree<T extends string>(all: readonly T[], taken: Set<string>): T | null {
  return all.find((c) => !taken.has(c)) ?? null;
}

async function touchRoom(q: Queryer, roomId: string) {
  await q.query(`update public.game_rooms set updated_at = now() where id = $1::uuid`, [roomId]);
}

// ------------------------------ snapshot -----------------------------------

export async function getRoomSnapshot(q: Queryer, code: string, userId: string): Promise<RoomSnapshot | RoomPreview> {
  // Round trip 1: room + server clock + current game state.
  const rooms = await q.query(
    `select r.*, (extract(epoch from clock_timestamp()) * 1000)::float8 as now_ms,
            (select gs.public_state from public.game_sessions gs where gs.id = r.current_game_id) as game_state
       from public.game_rooms r where r.code = $1`,
    [code],
  );
  const r = rooms[0];
  if (!r || r.status === "closed") throw notFound("Nessuna stanza con questo codice.");
  // Round trip 2: players and chat in parallel.
  const [players, chat] = await Promise.all([
    activePlayers(q, r.id),
    q.query(
      `select id::text as id, user_id, display_name, color, body, created_at from public.chat_messages
        where room_id = $1::uuid order by created_at desc, id desc limit 60`,
      [r.id],
    ),
  ]);
  const meRow = players.find((p) => p.user_id === userId);
  if (!meRow) {
    const known = await q.query(`select status from public.room_players where room_id = $1::uuid and user_id = $2::uuid`, [r.id, userId]);
    const wasMember = !!known[0];
    let canJoin = true;
    let reason: string | undefined;
    if (r.status !== "lobby" && !wasMember) {
      canJoin = false;
      reason = "La partita è già iniziata.";
    } else if (players.length >= r.max_players) {
      canJoin = false;
      reason = "La stanza è piena.";
    }
    return {
      member: false,
      code: r.code,
      status: r.status,
      hasPassword: r.has_password && !wasMember,
      playerCount: players.length,
      maxPlayers: r.max_players,
      canJoin,
      reason,
    };
  }
  const game = (r.game_state as PublicGameState | null) ?? null;
  const view = roomView(r);
  return {
    member: true,
    room: view,
    players: players.map((p) => playerView(p, r.host_user_id)),
    me: playerView(meRow, r.host_user_id),
    chat: chat.reverse().map(chatView),
    game,
    serverTime: Number(r.now_ms),
  };
}

export function chatView(m: Row): ChatMessageView {
  return {
    id: String(m.id),
    userId: m.user_id,
    name: m.display_name,
    color: m.color ?? null,
    body: m.body,
    createdAt: new Date(m.created_at).toISOString(),
    system: m.user_id === SYSTEM_USER,
  };
}

// ------------------------------ mutations ----------------------------------

export async function createRoom(
  db: Database,
  userId: string,
  input: { name: string; maxPlayers: number; password?: string | null },
): Promise<{ code: string; roomId: string }> {
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode();
    try {
      return await db.tx(async (q) => {
        const settings: GameSettings = { ...DEFAULT_SETTINGS, maxPlayers: input.maxPlayers };
        const rows = await q.query(
          `insert into public.game_rooms (code, host_user_id, max_players, has_password, settings)
           values ($1, $2::uuid, $3::int, $4::boolean, $5::jsonb) returning id`,
          [code, userId, input.maxPlayers, !!passwordHash, JSON.stringify(settings)],
        );
        const roomId = rows[0].id as string;
        if (passwordHash) {
          await q.query(`insert into public.game_room_secrets (room_id, password_hash) values ($1::uuid, $2)`, [roomId, passwordHash]);
        }
        await q.query(
          `insert into public.room_players (room_id, user_id, display_name, color, token, avatar)
           values ($1::uuid, $2::uuid, $3, 'red', 'car', '🙂')`,
          [roomId, userId, input.name],
        );
        await systemMessage(q, roomId, `${input.name} ha creato la stanza.`);
        return { code, roomId };
      });
    } catch (e) {
      const msg = String((e as Error)?.message ?? "");
      if (/game_rooms_code_key|unique/i.test(msg) && attempt < 7) continue;
      throw e;
    }
  }
  throw new ApiError(500, "CODE_GENERATION_FAILED", "Impossibile generare un codice stanza.");
}

export async function joinRoom(
  db: Database,
  userId: string,
  code: string,
  input: { name?: string; password?: string | null },
): Promise<{ roomId: string; rejoined: boolean }> {
  return db.tx(async (q) => {
    const r = await lockRoomByCode(q, code);
    const existing = (
      await q.query(`select * from public.room_players where room_id = $1::uuid and user_id = $2::uuid`, [r.id, userId])
    )[0];
    if (existing?.status === "active") return { roomId: r.id, rejoined: true };

    if (r.status !== "lobby") {
      if (!existing) throw conflict("GAME_STARTED", "La partita è già iniziata: non è possibile unirsi come nuovo giocatore.");
    }
    if (r.has_password && !existing) {
      const secret = (await q.query(`select password_hash from public.game_room_secrets where room_id = $1::uuid`, [r.id]))[0];
      if (!input.password || !secret || !(await verifyPassword(input.password, secret.password_hash))) {
        throw new ApiError(403, "BAD_PASSWORD", "Password della stanza non corretta.");
      }
    }
    const players = await activePlayers(q, r.id);
    if (players.length >= r.max_players) throw conflict("ROOM_FULL", "La stanza è piena.");

    const takenColors = new Set(players.map((p) => p.color as string));
    const takenTokens = new Set(players.map((p) => p.token as string));
    const name = input.name || existing?.display_name || `Giocatore ${players.length + 1}`;
    let color: string | null = existing && !takenColors.has(existing.color) ? existing.color : firstFree(COLORS, takenColors);
    if (!color) throw conflict("ROOM_FULL", "Nessun colore disponibile.");
    // In a running game a returning player keeps the color recorded in game_players.
    if (r.status !== "lobby" && existing) color = existing.color;
    const token = existing?.token ?? firstFree(TOKENS, takenTokens) ?? "car";

    if (existing) {
      await q.query(
        `update public.room_players set status = 'active', is_ready = false, display_name = $2, color = $3, updated_at = now()
          where id = $1::uuid`,
        [existing.id, name, color],
      );
    } else {
      await q.query(
        `insert into public.room_players (room_id, user_id, display_name, color, token, avatar)
         values ($1::uuid, $2::uuid, $3, $4, $5, '🙂')`,
        [r.id, userId, name, color, token],
      );
    }
    await systemMessage(q, r.id, existing ? `${name} rientra nella stanza.` : `${name} entra nella stanza.`);
    await touchRoom(q, r.id);
    return { roomId: r.id, rejoined: !!existing };
  });
}

export async function updateProfile(
  db: Database,
  userId: string,
  roomId: string,
  input: { name?: string; color?: PlayerColor; token?: TokenModel; avatar?: string },
) {
  return db.tx(async (q) => {
    const r = await lockRoomById(q, roomId);
    const me = await requireMember(q, roomId, userId);
    if (r.status !== "lobby") throw conflict("LOCKED", "La personalizzazione è bloccata dopo l'avvio della partita.");
    if (input.color && input.color !== me.color) {
      const taken = await q.query(
        `select 1 from public.room_players where room_id = $1::uuid and color = $2 and status = 'active' and id <> $3::uuid`,
        [roomId, input.color, me.id],
      );
      if (taken[0]) throw conflict("COLOR_TAKEN", "Colore già scelto da un altro giocatore.");
    }
    await q.query(
      `update public.room_players set display_name = coalesce($2, display_name), color = coalesce($3, color),
          token = coalesce($4, token), avatar = coalesce($5, avatar), updated_at = now()
        where id = $1::uuid`,
      [me.id, input.name ?? null, input.color ?? null, input.token ?? null, input.avatar ?? null],
    );
    await touchRoom(q, roomId);
  });
}

export async function setReady(db: Database, userId: string, roomId: string, ready: boolean) {
  return db.tx(async (q) => {
    const r = await lockRoomById(q, roomId);
    const me = await requireMember(q, roomId, userId);
    if (r.status !== "lobby") throw conflict("LOCKED", "La partita è già iniziata.");
    await q.query(`update public.room_players set is_ready = $2::boolean, updated_at = now() where id = $1::uuid`, [me.id, ready]);
    await touchRoom(q, roomId);
  });
}

export async function updateSettings(
  db: Database,
  userId: string,
  roomId: string,
  input: { settings?: Partial<GameSettings>; password?: string | null },
) {
  const passwordHash = typeof input.password === "string" && input.password.length > 0 ? await hashPassword(input.password) : null;
  return db.tx(async (q) => {
    const r = await lockRoomById(q, roomId);
    if (r.host_user_id !== userId) throw forbidden("Solo l'host può modificare le impostazioni.");
    if (r.status !== "lobby") throw conflict("LOCKED", "Le impostazioni sono bloccate dopo l'avvio.");
    const merged = settingsSchema.parse({ ...DEFAULT_SETTINGS, ...jsonObject(r.settings), maxPlayers: r.max_players, ...(input.settings ?? {}) });
    const players = await activePlayers(q, roomId);
    if (merged.maxPlayers < players.length) {
      throw conflict("TOO_MANY_PLAYERS", `Ci sono già ${players.length} giocatori nella stanza.`);
    }
    if (input.password !== undefined) {
      if (passwordHash) {
        await q.query(
          `insert into public.game_room_secrets (room_id, password_hash) values ($1::uuid, $2)
           on conflict (room_id) do update set password_hash = excluded.password_hash`,
          [roomId, passwordHash],
        );
      } else {
        await q.query(`delete from public.game_room_secrets where room_id = $1::uuid`, [roomId]);
      }
    }
    await q.query(
      `update public.game_rooms set settings = $2::jsonb, max_players = $3::int,
          has_password = case when $4::boolean is null then has_password else $4::boolean end, updated_at = now()
        where id = $1::uuid`,
      [roomId, JSON.stringify(merged), merged.maxPlayers, input.password === undefined ? null : !!passwordHash],
    );
    // Any settings change resets readiness so everyone re-confirms.
    await q.query(`update public.room_players set is_ready = false where room_id = $1::uuid and user_id <> $2::uuid`, [roomId, userId]);
  });
}

export async function startGame(db: Database, userId: string, roomId: string, rng: Rng = cryptoRng): Promise<{ gameId: string }> {
  return db.tx(async (q) => {
    const r = await lockRoomById(q, roomId);
    if (r.host_user_id !== userId) throw forbidden("Solo l'host può avviare la partita.");
    if (r.status !== "lobby") throw conflict("ALREADY_STARTED", "La partita è già stata avviata.");
    const players = await activePlayers(q, roomId);
    if (players.length < 2) throw conflict("NOT_ENOUGH_PLAYERS", "Servono almeno 2 giocatori.");
    const notReady = players.filter((p) => !p.is_ready);
    if (notReady.length) {
      throw conflict("NOT_READY", `In attesa di: ${notReady.map((p) => p.display_name).join(", ")}.`);
    }
    if (new Set(players.map((p) => p.color)).size !== players.length) throw conflict("COLOR_CLASH", "Due giocatori hanno lo stesso colore.");
    const settings = settingsSchema.parse({ ...DEFAULT_SETTINGS, ...jsonObject(r.settings), maxPlayers: r.max_players });
    const nowRow = await q.query(`select (extract(epoch from clock_timestamp()) * 1000)::float8 as now_ms`);
    const now = Number(nowRow[0].now_ms);
    const gameId = randomUUID();
    const state = createInitialState({
      gameId,
      roomId,
      settings,
      now,
      rng,
      players: players.map((p) => ({
        id: randomUUID(),
        userId: p.user_id,
        roomPlayerId: p.id,
        name: p.display_name,
        color: p.color,
        token: p.token,
        avatar: p.avatar,
      })),
    });
    await insertNewGame(q, state);
    await q.query(
      `update public.game_rooms set status = 'playing', current_game_id = $2::uuid, updated_at = now() where id = $1::uuid`,
      [roomId, gameId],
    );
    await systemMessage(q, roomId, "La partita è iniziata. Buona fortuna!");
    return { gameId };
  });
}

export async function leaveRoom(db: Database, userId: string, roomId: string) {
  // In a running game, leaving = resigning (properties back to the bank).
  const pre = await db.query(`select status, current_game_id from public.game_rooms where id = $1::uuid`, [roomId]);
  if (!pre[0]) throw notFound("Stanza non trovata.");
  if (pre[0].status === "playing" && pre[0].current_game_id) {
    const gp = await db.query(
      `select status from public.game_players where game_id = $1::uuid and user_id = $2::uuid`,
      [pre[0].current_game_id, userId],
    );
    if (gp[0]?.status === "active") {
      const res = await applyGameCommand(db, {
        gameId: pre[0].current_game_id,
        userId,
        commandId: randomUUID(),
        command: { type: "RESIGN" },
      });
      if (!res.ok && res.error) throw new ApiError(res.error.status, res.error.code, res.error.message);
    }
  }
  return db.tx(async (q) => {
    const r = await lockRoomById(q, roomId);
    const me = await requireMember(q, roomId, userId);
    await q.query(`update public.room_players set status = 'left', is_ready = false, updated_at = now() where id = $1::uuid`, [me.id]);
    await systemMessage(q, roomId, `${me.display_name} ha lasciato la stanza.`);
    const remaining = await activePlayers(q, roomId);
    if (!remaining.length) {
      await q.query(`update public.game_rooms set status = 'closed', updated_at = now() where id = $1::uuid`, [roomId]);
      return;
    }
    if (r.host_user_id === userId) {
      const heir = remaining[0];
      await q.query(`update public.game_rooms set host_user_id = $2::uuid, updated_at = now() where id = $1::uuid`, [roomId, heir.user_id]);
      await systemMessage(q, roomId, `${heir.display_name} è il nuovo host.`);
    } else {
      await touchRoom(q, roomId);
    }
  });
}

export async function rematch(db: Database, userId: string, roomId: string) {
  return db.tx(async (q) => {
    const r = await lockRoomById(q, roomId);
    if (r.host_user_id !== userId) throw forbidden("Solo l'host può preparare una nuova partita.");
    if (r.status !== "finished") throw conflict("NOT_FINISHED", "La partita non è ancora terminata.");
    await q.query(`update public.room_players set is_ready = false where room_id = $1::uuid`, [roomId]);
    await q.query(
      `update public.game_rooms set status = 'lobby', current_game_id = null, updated_at = now() where id = $1::uuid`,
      [roomId],
    );
    await systemMessage(q, roomId, "L'host ha preparato una nuova partita con gli stessi partecipanti.");
  });
}

export async function postChat(db: Database, userId: string, roomId: string, body: string): Promise<ChatMessageView> {
  return db.tx(async (q) => {
    const rooms = await q.query(`select settings from public.game_rooms where id = $1::uuid`, [roomId]);
    if (!rooms[0]) throw notFound("Stanza non trovata.");
    const me = await requireMember(q, roomId, userId);
    if (jsonObject(rooms[0].settings).chatEnabled === false) throw forbidden("La chat è disattivata in questa stanza.");
    const recent = await q.query(
      `select count(*)::int as n from public.chat_messages where room_id = $1::uuid and user_id = $2::uuid
         and created_at > now() - interval '10 seconds'`,
      [roomId, userId],
    );
    if (recent[0].n >= 5) throw new ApiError(429, "RATE_LIMIT", "Stai scrivendo troppo velocemente.");
    const rows = await q.query(
      `insert into public.chat_messages (room_id, user_id, room_player_id, display_name, color, body)
       values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
       returning id::text as id, user_id, display_name, color, body, created_at`,
      [roomId, userId, me.id, me.display_name, me.color, body],
    );
    return chatView(rows[0]);
  });
}

export async function roomIdByCode(q: Queryer, code: string): Promise<string> {
  const rows = await q.query(`select id from public.game_rooms where code = $1`, [code]);
  if (!rows[0]) throw notFound("Nessuna stanza con questo codice.");
  return rows[0].id;
}
