import { handler, readBody, roomCode } from "@/lib/server/http";
import { nudgeRoom } from "@/lib/server/realtime";
import { ApiError } from "@/lib/server/errors";
import {
  getRoomSnapshot,
  joinRoom,
  leaveRoom,
  postChat,
  rematch,
  roomIdByCode,
  setReady,
  startGame,
  updateProfile,
  updateSettings,
} from "@/lib/server/rooms";
import { chatSchema, joinRoomSchema, profileSchema, readySchema, updateSettingsSchema } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/rooms/:code/:action
 *   join | profile | ready | settings | start | leave | rematch | chat
 * Every mutation returns the caller's fresh room snapshot (except chat/leave).
 */
export const POST = handler<{ code: string; action: string }>(async ({ db, userId, req }, params) => {
  const code = roomCode(params.code);
  // Every successful mutation nudges the room's clients via Realtime Broadcast.
  const done = <T,>(roomId: string, result: T): T => {
    nudgeRoom(roomId, { kind: "room" });
    return result;
  };
  switch (params.action) {
    case "join": {
      const body = await readBody(req, joinRoomSchema);
      const { roomId } = await joinRoom(db, userId, code, body);
      return done(roomId, await getRoomSnapshot(db, code, userId));
    }
    case "profile": {
      const body = await readBody(req, profileSchema);
      const roomId = await roomIdByCode(db, code);
      await updateProfile(db, userId, roomId, body);
      return done(roomId, await getRoomSnapshot(db, code, userId));
    }
    case "ready": {
      const body = await readBody(req, readySchema);
      const roomId = await roomIdByCode(db, code);
      await setReady(db, userId, roomId, body.ready);
      return done(roomId, await getRoomSnapshot(db, code, userId));
    }
    case "settings": {
      const body = await readBody(req, updateSettingsSchema);
      const roomId = await roomIdByCode(db, code);
      await updateSettings(db, userId, roomId, body);
      return done(roomId, await getRoomSnapshot(db, code, userId));
    }
    case "start": {
      const roomId = await roomIdByCode(db, code);
      await startGame(db, userId, roomId);
      return done(roomId, await getRoomSnapshot(db, code, userId));
    }
    case "rematch": {
      const roomId = await roomIdByCode(db, code);
      await rematch(db, userId, roomId);
      return done(roomId, await getRoomSnapshot(db, code, userId));
    }
    case "leave": {
      const roomId = await roomIdByCode(db, code);
      await leaveRoom(db, userId, roomId);
      return done(roomId, { ok: true });
    }
    case "chat": {
      const body = await readBody(req, chatSchema);
      const roomId = await roomIdByCode(db, code);
      return done(roomId, { message: await postChat(db, userId, roomId, body.body) });
    }
    default:
      throw new ApiError(404, "UNKNOWN_ACTION", "Azione sconosciuta.");
  }
});
