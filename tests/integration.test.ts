// Backend integration tests: real SQL migrations + services on PGlite
// (Postgres compiled to WASM). Covers the scenarios required by the spec.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDatabase, type Database } from "@/lib/server/db";
import { applyGameCommand, lockGame, loadGameState } from "@/lib/server/game-service";
import {
  createRoom,
  getRoomSnapshot,
  joinRoom,
  leaveRoom,
  postChat,
  rematch,
  setReady,
  startGame,
  updateProfile,
  updateSettings,
} from "@/lib/server/rooms";
import { scriptedDiceRng, seededRng } from "@/lib/game/rng";
import type { Command, PlayerColor, PublicGameState } from "@/lib/game/types";
import { ApiError } from "@/lib/server/errors";

let db: Database;
const users = Array.from({ length: 6 }, () => randomUUID());
const COLORS: PlayerColor[] = ["red", "blue", "green", "yellow", "purple", "orange"];
let roomId = "";
let code = "";
let gameId = "";

async function game(): Promise<PublicGameState> {
  const rows = await db.query(`select public_state from game_sessions where id = $1::uuid`, [gameId]);
  return rows[0].public_state as PublicGameState;
}

async function cmd(userId: string, command: Command, opts: { rng?: ReturnType<typeof scriptedDiceRng>; commandId?: string; now?: number } = {}) {
  return applyGameCommand(db, { gameId, userId, commandId: opts.commandId ?? randomUUID(), command, rng: opts.rng, now: opts.now });
}

function userOf(s: PublicGameState, playerId: string) {
  return s.players.find((p) => p.id === playerId)!.userId;
}

async function expectApiError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).code).toBe(code);
    return;
  }
  throw new Error(`expected ApiError ${code}`);
}

beforeAll(async () => {
  db = await createPgliteDatabase();
});

describe("database schema", () => {
  it("seeds the three boards (40/48/64 tiles) and both decks", async () => {
    const tiles = await db.query(`select board, count(*)::int as n from board_tiles group by board order by board`);
    expect(tiles.map((t) => [t.board, t.n])).toEqual([["classic", 40], ["maxi", 64], ["standard", 48]]);
    const cards = await db.query(`select deck, count(*)::int as n from card_definitions group by deck order by deck`);
    expect(cards.map((c) => c.n).every((n) => n >= 20)).toBe(true);
  });

  it("enables RLS on every table and denies client writes", async () => {
    const rows = await db.query(
      `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity and relname <> '_local_migrations'`,
    );
    expect(rows).toEqual([]);
    const grants = await db.query(
      `select table_name, privilege_type from information_schema.role_table_grants
        where grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')`,
    );
    expect(grants).toEqual([]);
  });

  it("RLS hides rooms from non-members", async () => {
    const { roomId: rid } = await createRoom(db, users[0], { name: "Privata", maxPlayers: 2 });
    const visible = await db.tx(async (q) => {
      await q.query(`select set_config('request.jwt.claim.sub', $1, true)`, [users[1]]);
      await q.query(`grant usage on schema public to authenticated`);
      await q.query(`grant select on all tables in schema public to authenticated`);
      await q.query(`revoke all on game_room_secrets, game_decks, game_actions from authenticated`);
      await q.query(`set local role authenticated`);
      const r = await q.query(`select id from game_rooms where id = $1::uuid`, [rid]);
      let secretsDenied = false;
      await q.query(`savepoint probe`);
      try {
        await q.query(`select * from game_room_secrets`);
      } catch {
        secretsDenied = true;
        await q.query(`rollback to savepoint probe`);
      }
      return { count: r.length, secretsDenied };
    });
    expect(visible.count).toBe(0);
    expect(visible.secretsDenied).toBe(true);
    const asMember = await db.tx(async (q) => {
      await q.query(`select set_config('request.jwt.claim.sub', $1, true)`, [users[0]]);
      await q.query(`set local role authenticated`);
      return (await q.query(`select id from game_rooms where id = $1::uuid`, [rid])).length;
    });
    expect(asMember).toBe(1);
  });
});

describe("lobby (scenarios 1-3)", () => {
  it("1. six players join the same room concurrently", async () => {
    const created = await createRoom(db, users[0], { name: "Host", maxPlayers: 6, password: "segreta" });
    roomId = created.roomId;
    code = created.code;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    await expectApiError(joinRoom(db, users[1], code, { name: "Intruso", password: "sbagliata" }), "BAD_PASSWORD");
    await Promise.all(users.slice(1).map((u, i) => joinRoom(db, u, code, { name: `Amico ${i + 1}`, password: "segreta" })));
    const snap = await getRoomSnapshot(db, code, users[0]);
    expect(snap.member).toBe(true);
    if (!snap.member) return;
    expect(snap.players).toHaveLength(6);
    expect(new Set(snap.players.map((p) => p.color)).size).toBe(6);
    const outsider = await getRoomSnapshot(db, code, randomUUID());
    expect(outsider.member).toBe(false);
    if (!outsider.member) expect(outsider.canJoin).toBe(false);
    await expectApiError(joinRoom(db, randomUUID(), code, { name: "Settimo", password: "segreta" }), "ROOM_FULL");
  });

  it("2. players pick distinct names/colors; duplicates are refused", async () => {
    for (let i = 0; i < 6; i++) {
      await updateProfile(db, users[i], roomId, { name: `Player ${i + 1}`, token: "rocket" });
    }
    const snap = await getRoomSnapshot(db, code, users[0]);
    if (!snap.member) throw new Error("not member");
    const p2Color = snap.players.find((p) => p.userId === users[1])!.color;
    await expectApiError(updateProfile(db, users[0], roomId, { color: p2Color }), "COLOR_TAKEN");
    // Swap two colors through a free slot is impossible (all 6 taken) -> ensure distinct
    expect(new Set(snap.players.map((p) => p.color)).size).toBe(6);
    expect(COLORS.every((c) => snap.players.some((p) => p.color === c))).toBe(true);
  });

  it("only the host changes settings and they reset readiness", async () => {
    await expectApiError(updateSettings(db, users[1], roomId, { settings: { startingCash: 3000 } }), "FORBIDDEN");
    await setReady(db, users[1], roomId, true);
    await updateSettings(db, users[0], roomId, { settings: { startingCash: 2000, turnSeconds: 90 } });
    const snap = await getRoomSnapshot(db, code, users[0]);
    if (!snap.member) throw new Error();
    expect(snap.room.settings.turnSeconds).toBe(90);
    expect(snap.players.find((p) => p.userId === users[1])!.isReady).toBe(false);
  });

  it("every lobby change bumps the room revision (clients drop stale snapshots)", async () => {
    const rev = async () => {
      const s = await getRoomSnapshot(db, code, users[0]);
      if (!s.member) throw new Error();
      return s.room.revision;
    };
    const r0 = await rev();
    await setReady(db, users[2], roomId, true);
    const r1 = await rev();
    expect(r1).toBeGreaterThan(r0);
    await setReady(db, users[2], roomId, false);
    const r2 = await rev();
    expect(r2).toBeGreaterThan(r1);
    await updateProfile(db, users[2], roomId, { name: "Player 3" });
    expect(await rev()).toBeGreaterThan(r2);
  });

  it("chat is sanitized and rate limited", async () => {
    const m = await postChat(db, users[2], roomId, "ciao a tutti");
    expect(m.body).toBe("ciao a tutti");
    await expectApiError(postChat(db, randomUUID(), roomId, "spam"), "FORBIDDEN");
    for (let i = 0; i < 5; i++) await postChat(db, users[3], roomId, `msg ${i}`);
    await expectApiError(postChat(db, users[3], roomId, "troppo"), "RATE_LIMIT");
  });

  it("3. only the host can start, and only when everyone is ready", async () => {
    await expectApiError(startGame(db, users[1], roomId), "FORBIDDEN");
    await expectApiError(startGame(db, users[0], roomId), "NOT_READY");
    await Promise.all(users.map((u) => setReady(db, u, roomId, true)));
    const res = await startGame(db, users[0], roomId, seededRng(7));
    gameId = res.gameId;
    await expectApiError(startGame(db, users[0], roomId), "ALREADY_STARTED");
    await expectApiError(joinRoom(db, randomUUID(), code, { name: "Ritardatario", password: "segreta" }), "GAME_STARTED");
    await expectApiError(updateProfile(db, users[1], roomId, { name: "Nuovo" }), "LOCKED");
  });
});

describe("game (scenarios 4-13)", () => {
  it("4. every player receives the starting capital", async () => {
    const s = await game();
    expect(s.players).toHaveLength(6);
    expect(s.players.every((p) => p.balance === 2000)).toBe(true);
    const rows = await db.query(`select balance from game_players where game_id = $1::uuid`, [gameId]);
    expect(rows.every((r) => r.balance === 2000)).toBe(true);
    const owned = await db.query(`select count(*)::int as n from property_ownership where game_id = $1::uuid`, [gameId]);
    expect(owned[0].n).toBe(34);
    expect(JSON.stringify(s)).not.toContain("card_order");
  });

  it("5-6. a player rolls (state + version broadcast) and buys a property", async () => {
    const before = await game();
    const cur = userOf(before, before.turn.playerId);
    const other = before.players.find((p) => p.id !== before.turn.playerId)!.userId;
    const denied = await cmd(other, { type: "ROLL" });
    expect(denied.ok).toBe(false);
    expect(denied.error?.code).toBe("NOT_YOUR_TURN");

    const r = await cmd(cur, { type: "ROLL" }, { rng: scriptedDiceRng([1, 2]) });
    expect(r.ok).toBe(true);
    const s = await game();
    expect(s.version).toBe(before.version + 1);
    const me = s.players.find((p) => p.userId === cur)!;
    expect(me.position).toBe(3);
    expect(s.turn.phase).toBe("BUY");
    expect(s.log.some((e) => e.type === "move")).toBe(true);

    const b = await cmd(cur, { type: "BUY" });
    expect(b.ok).toBe(true);
    const own = await db.query(`select owner_player_id from property_ownership where game_id = $1::uuid and tile_idx = 3`, [gameId]);
    expect(own[0].owner_player_id).toBe(me.id);
    const bal = await db.query(`select balance from game_players where id = $1::uuid`, [me.id]);
    expect(bal[0].balance).toBe(1930);
    await cmd(cur, { type: "END_TURN" });
  });

  it("7. the next player pays rent", async () => {
    const s0 = await game();
    const payer = s0.players.find((p) => p.id === s0.turn.playerId)!;
    const ownerId = s0.ownership[3].ownerId!;
    const ownerBefore = s0.players.find((p) => p.id === ownerId)!.balance;
    const r = await cmd(payer.userId, { type: "ROLL" }, { rng: scriptedDiceRng([1, 2]) });
    expect(r.ok).toBe(true);
    const s = await game();
    expect(s.players.find((p) => p.id === payer.id)!.balance).toBe(payer.balance - 4);
    expect(s.players.find((p) => p.id === ownerId)!.balance).toBe(ownerBefore + 4);
    expect(s.log.some((e) => e.type === "rent")).toBe(true);
    await cmd(payer.userId, { type: "END_TURN" });
  });

  it("11. duplicate and simultaneous requests never duplicate money", async () => {
    const s0 = await game();
    const cur = s0.players.find((p) => p.id === s0.turn.playerId)!;
    const commandId = randomUUID();
    const rng = scriptedDiceRng([2, 3, 2, 3]);
    // Same command id sent twice concurrently -> processed once.
    const [a, b] = await Promise.all([
      cmd(cur.userId, { type: "ROLL" }, { commandId, rng }),
      cmd(cur.userId, { type: "ROLL" }, { commandId, rng }),
    ]);
    expect([a.duplicate, b.duplicate].filter(Boolean)).toHaveLength(1);
    const s1 = await game();
    expect(s1.version).toBe(s0.version + 1);
    expect(s1.players.find((p) => p.id === cur.id)!.position).toBe(5);
    // Two different simultaneous BUY requests: exactly one succeeds.
    if (s1.turn.phase === "BUY") {
      const [x, y] = await Promise.all([cmd(cur.userId, { type: "BUY" }), cmd(cur.userId, { type: "BUY" })]);
      expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
      const s2 = await game();
      expect(s2.players.find((p) => p.id === cur.id)!.balance).toBe(cur.balance - 90);
      const ownRows = await db.query(
        `select count(*)::int as n from property_ownership where game_id = $1::uuid and owner_player_id = $2::uuid`,
        [gameId, cur.id],
      );
      expect(ownRows[0].n).toBe(1);
    }
    const acts = await db.query(`select count(*)::int as n from game_actions where game_id = $1::uuid and command_id = $2::uuid`, [
      gameId,
      commandId,
    ]);
    expect(acts[0].n).toBe(1);
    const s3 = await game();
    await cmd(userOf(s3, s3.turn.playerId), { type: "END_TURN" });
  });

  it("9. an auction concludes correctly", async () => {
    const s0 = await game();
    const cur = s0.players.find((p) => p.id === s0.turn.playerId)!;
    // move 1+3 from 0 -> tile 4 is tax; use 3+4 = 7 -> tile 7 (unowned property)
    const r = await cmd(cur.userId, { type: "ROLL" }, { rng: scriptedDiceRng([3, 4]) });
    expect(r.ok).toBe(true);
    let s = await game();
    expect(s.turn.phase).toBe("BUY");
    await cmd(cur.userId, { type: "DECLINE_BUY" });
    s = await game();
    expect(s.turn.phase).toBe("AUCTION");
    const bidders = s.players.filter((p) => p.id !== cur.id);
    expect((await cmd(bidders[0].userId, { type: "BID", amount: 50 })).ok).toBe(true);
    expect((await cmd(bidders[1].userId, { type: "BID", amount: 80 })).ok).toBe(true);
    const low = await cmd(bidders[2].userId, { type: "BID", amount: 60 });
    expect(low.error?.code).toBe("BID_TOO_LOW");
    for (const p of s.players) {
      if (p.id === bidders[1].id) continue;
      await cmd(p.userId, { type: "AUCTION_PASS" });
    }
    s = await game();
    expect(s.auction).toBeNull();
    expect(s.ownership[7].ownerId).toBe(bidders[1].id);
    const auc = await db.query(`select status, final_price, winner_player_id from game_auctions where game_id = $1::uuid`, [gameId]);
    expect(auc[0]).toMatchObject({ status: "closed", final_price: 80, winner_player_id: bidders[1].id });
    const bids = await db.query(`select count(*)::int as n from auction_bids where auction_id = (select id from game_auctions where game_id = $1::uuid)`, [gameId]);
    expect(bids[0].n).toBe(2);
    await cmd(cur.userId, { type: "END_TURN" });
  });

  it("8. two players complete a trade atomically", async () => {
    const s0 = await game();
    const a = s0.players.find((p) => p.id === s0.ownership[3].ownerId)!;
    const b = s0.players.find((p) => p.id === s0.ownership[7].ownerId)!;
    const r = await cmd(a.userId, {
      type: "PROPOSE_TRADE",
      toId: b.id,
      offerTiles: [3],
      requestTiles: [7],
      offerCash: 25,
      requestCash: 0,
      offerCards: [],
      requestCards: [],
    });
    expect(r.ok).toBe(true);
    let s = await game();
    const trade = s.trades.find((t) => t.status === "pending")!;
    expect(trade).toBeDefined();
    const acc = await cmd(b.userId, { type: "ACCEPT_TRADE", tradeId: trade.id });
    expect(acc.ok).toBe(true);
    s = await game();
    expect(s.ownership[3].ownerId).toBe(b.id);
    expect(s.ownership[7].ownerId).toBe(a.id);
    expect(s.players.find((p) => p.id === a.id)!.balance).toBe(a.balance - 25);
    expect(s.players.find((p) => p.id === b.id)!.balance).toBe(b.balance + 25);
    const row = await db.query(`select status from trade_offers where id = $1::uuid`, [trade.id]);
    expect(row[0].status).toBe("accepted");
  });

  it("10. a player disconnects and rejoins with the same session", async () => {
    const res = await joinRoom(db, users[4], code, {});
    expect(res.rejoined).toBe(true);
    const snap = await getRoomSnapshot(db, code, users[4]);
    expect(snap.member).toBe(true);
    if (snap.member) {
      expect(snap.game?.id).toBe(gameId);
      expect(snap.game?.players.some((p) => p.userId === users[4])).toBe(true);
    }
  });

  it("timeouts are validated by the server and auto-play AFK turns", async () => {
    const s0 = await game();
    const early = await cmd(users[0], { type: "TIMEOUT" });
    expect(early.ok).toBe(false);
    expect(early.error?.code).toBe("NOT_EXPIRED");
    const late = await cmd(users[0], { type: "TIMEOUT" }, { now: s0.turn.deadline + 1000, rng: scriptedDiceRng([1, 3]) });
    expect(late.ok).toBe(true);
    const s1 = await game();
    expect(s1.version).toBeGreaterThan(s0.version);
    // Finish any auction the AFK turn may have started
    if (s1.turn.phase === "AUCTION") await cmd(users[0], { type: "TIMEOUT" }, { now: s1.auction!.deadline + 1000 });
    const s2 = await game();
    if (s2.turn.phase === "MANAGE") await cmd(users[0], { type: "TIMEOUT" }, { now: s2.turn.deadline + 1000 });
    const s3 = await game();
    expect(s3.turn.playerId).not.toBe(s0.turn.playerId);
  });

  it("12-13. bankruptcies eliminate players and the game ends with a winner", async () => {
    // Players resign one by one until one remains (resign = bankruptcy to the bank).
    let s = await game();
    const survivor = s.players[0];
    for (const p of s.players) {
      if (p.id === survivor.id) continue;
      s = await game();
      if (s.turn.phase === "AUCTION") await cmd(users[0], { type: "TIMEOUT" }, { now: s.auction!.deadline + 1000 });
      const r = await cmd(p.userId, { type: "RESIGN" });
      expect(r.ok).toBe(true);
    }
    s = await game();
    expect(s.status).toBe("finished");
    expect(s.winnerId).toBe(survivor.id);
    expect(s.players.filter((p) => p.status === "bankrupt")).toHaveLength(5);
    const room = await db.query(`select status from game_rooms where id = $1::uuid`, [roomId]);
    expect(room[0].status).toBe("finished");
    const ownedByLosers = await db.query(
      `select count(*)::int as n from property_ownership po join game_players gp on gp.id = po.owner_player_id
        where po.game_id = $1::uuid and gp.status = 'bankrupt'`,
      [gameId],
    );
    expect(ownedByLosers[0].n).toBe(0);
    // Round-trip: normalized tables reproduce the public snapshot.
    const reloaded = await db.tx(async (q) => {
      const l = await lockGame(q, gameId);
      return loadGameState(q, l!.row);
    });
    expect(reloaded.players.map((p) => p.balance)).toEqual(s.players.map((p) => p.balance));
    expect(reloaded.ownership).toEqual(s.ownership);
    const after = await cmd(users[0], { type: "ROLL" });
    expect(after.ok).toBe(false);
  });

  it("host can prepare a rematch with the same participants; host role transfers on leave", async () => {
    await expectApiError(rematch(db, users[1], roomId), "FORBIDDEN");
    await rematch(db, users[0], roomId);
    let snap = await getRoomSnapshot(db, code, users[1]);
    if (!snap.member) throw new Error();
    expect(snap.room.status).toBe("lobby");
    expect(snap.players).toHaveLength(6);
    await leaveRoom(db, users[0], roomId);
    snap = await getRoomSnapshot(db, code, users[1]);
    if (!snap.member) throw new Error();
    expect(snap.room.hostUserId).not.toBe(users[0]);
    expect(snap.players).toHaveLength(5);
  });
});

describe("board variants on the database", () => {
  it("runs a maxi game with 8 players end to end (board column + FKs on tiles > 47)", async () => {
    const people = Array.from({ length: 8 }, () => randomUUID());
    const { roomId: rid, code: c } = await createRoom(db, people[0], { name: "Maxi", maxPlayers: 6 });
    // 7th and 8th seat need the maxi board
    await updateSettings(db, people[0], rid, { settings: { board: "maxi", maxPlayers: 8 } });
    for (let i = 1; i < 8; i++) await joinRoom(db, people[i], c, { name: `M${i}` });
    const snap = await getRoomSnapshot(db, c, people[0]);
    if (!snap.member) throw new Error("not member");
    expect(snap.room.settings.board).toBe("maxi");
    expect(snap.players).toHaveLength(8);
    expect(new Set(snap.players.map((p) => p.color)).size).toBe(8);
    // back to standard is refused while 8 players are seated
    await expectApiError(updateSettings(db, people[0], rid, { settings: { board: "standard" } }), "TOO_MANY_PLAYERS");
    for (const u of people) await setReady(db, u, rid, true);
    const { gameId: gid } = await startGame(db, people[0], rid, seededRng(11));
    const sess = await db.query(`select board, settings->>'board' as sboard from game_sessions where id = $1::uuid`, [gid]);
    expect(sess[0]).toMatchObject({ board: "maxi", sboard: "maxi" });
    const own = await db.query(
      `select count(*)::int as n, min(board) as b from property_ownership where game_id = $1::uuid`,
      [gid],
    );
    expect(own[0]).toMatchObject({ n: 45, b: "maxi" });
    // buy a property beyond the standard board's last index
    const state = (await db.query(`select public_state from game_sessions where id = $1::uuid`, [gid]))[0].public_state as PublicGameState;
    const cur = state.players.find((p) => p.id === state.turn.playerId)!;
    await db.query(`update game_players set position = 47 where id = $1::uuid`, [cur.id]);
    const r = await applyGameCommand(db, { gameId: gid, userId: cur.userId, commandId: randomUUID(), command: { type: "ROLL" }, rng: scriptedDiceRng([1, 2]) });
    expect(r.ok).toBe(true);
    const after = (await db.query(`select public_state from game_sessions where id = $1::uuid`, [gid]))[0].public_state as PublicGameState;
    expect(after.players.find((p) => p.id === cur.id)!.position).toBe(50);
    if (after.turn.phase === "BUY") {
      const b = await applyGameCommand(db, { gameId: gid, userId: cur.userId, commandId: randomUUID(), command: { type: "BUY" } });
      expect(b.ok).toBe(true);
      const row = await db.query(`select owner_player_id, board from property_ownership where game_id = $1::uuid and tile_idx = 50`, [gid]);
      expect(row[0]).toMatchObject({ owner_player_id: cur.id, board: "maxi" });
    }
  });

  it("rooms created with more than 6 seats get the maxi board; classic rooms clamp to 4", async () => {
    const host = randomUUID();
    const big = await createRoom(db, host, { name: "Big", maxPlayers: 8 });
    const s1 = await getRoomSnapshot(db, big.code, host);
    if (!s1.member) throw new Error();
    expect([s1.room.settings.board, s1.room.maxPlayers]).toEqual(["maxi", 8]);
    await updateSettings(db, host, big.roomId, { settings: { board: "classic" } });
    const s2 = await getRoomSnapshot(db, big.code, host);
    if (!s2.member) throw new Error();
    expect([s2.room.settings.board, s2.room.maxPlayers]).toEqual(["classic", 4]);
  });
});

describe("seat limits per board (database constraint)", () => {
  it("refuses a classic room with more than 4 seats even when written directly", async () => {
    const host = randomUUID();
    const room = await createRoom(db, host, { name: "Classica", maxPlayers: 6 });
    await updateSettings(db, host, room.roomId, { settings: { board: "classic" } });
    const ok = await db.query(`select max_players, settings->>'board' as board from game_rooms where id = $1::uuid`, [room.roomId]);
    expect(ok[0]).toMatchObject({ max_players: 4, board: "classic" });
    let rejected = false;
    try {
      await db.query(`update game_rooms set max_players = 5 where id = $1::uuid`, [room.roomId]);
    } catch (e) {
      rejected = /game_rooms_board_seats/.test(String((e as Error).message));
    }
    expect(rejected).toBe(true);
    // maxi still allows 8
    await updateSettings(db, host, room.roomId, { settings: { board: "maxi", maxPlayers: 8 } });
    const maxi = await db.query(`select max_players from game_rooms where id = $1::uuid`, [room.roomId]);
    expect(maxi[0].max_players).toBe(8);
  });
});
