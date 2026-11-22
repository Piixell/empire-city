import { handler, readBody, roomCode } from "@/lib/server/http";
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
  switch (params.action) {
    case "join": {
      const body = await readBody(req, joinRoomSchema);
      await joinRoom(db, userId, code, body);
      return getRoomSnapshot(db, code, userId);
    }
    case "profile": {
      const body = await readBody(req, profileSchema);
      await updateProfile(db, userId, await roomIdByCode(db, code), body);
      return getRoomSnapshot(db, code, userId);
    }
    case "ready": {
      const body = await readBody(req, readySchema);
      await setReady(db, userId, await roomIdByCode(db, code), body.ready);
      return getRoomSnapshot(db, code, userId);
    }
    case "settings": {
      const body = await readBody(req, updateSettingsSchema);
      await updateSettings(db, userId, await roomIdByCode(db, code), body);
      return getRoomSnapshot(db, code, userId);
    }
    case "start": {
      await startGame(db, userId, await roomIdByCode(db, code));
      return getRoomSnapshot(db, code, userId);
    }
    case "rematch": {
      await rematch(db, userId, await roomIdByCode(db, code));
      return getRoomSnapshot(db, code, userId);
    }
    case "leave": {
      await leaveRoom(db, userId, await roomIdByCode(db, code));
      return { ok: true };
    }
    case "chat": {
      const body = await readBody(req, chatSchema);
      return { message: await postChat(db, userId, await roomIdByCode(db, code), body.body) };
    }
    default:
      throw new ApiError(404, "UNKNOWN_ACTION", "Azione sconosciuta.");
  }
});
