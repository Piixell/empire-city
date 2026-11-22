import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/errors";
import { applyGameCommand } from "@/lib/server/game-service";
import { handler, readBody } from "@/lib/server/http";
import { nudgeRoom } from "@/lib/server/realtime";
import { commandEnvelopeSchema } from "@/lib/server/validation";
import type { Command } from "@/lib/game/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/games/:gameId/command  { commandId: uuid, command: {...} }
 * Idempotent: replaying the same commandId returns the original outcome.
 */
export const POST = handler<{ gameId: string }>(async ({ db, userId, req }, { gameId }) => {
  if (!UUID_RE.test(gameId)) throw new ApiError(400, "BAD_GAME", "Partita non valida.");
  const { commandId, command } = await readBody(req, commandEnvelopeSchema);
  const result = await applyGameCommand(db, { gameId, userId, commandId, command: command as Command });
  if (!result.ok && result.error) {
    return NextResponse.json(
      { error: { code: result.error.code, message: result.error.message }, state: result.state, version: result.version },
      { status: result.error.status },
    );
  }
  if (!result.duplicate) nudgeRoom(result.state?.roomId, { kind: "game", version: result.version });
  return { ok: true, duplicate: !!result.duplicate, version: result.version, state: result.state, events: result.events };
});
