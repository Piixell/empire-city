import { handler, roomCode } from "@/lib/server/http";
import { getRoomSnapshot } from "@/lib/server/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full snapshot for members, a minimal preview for everyone else. */
export const GET = handler<{ code: string }>(async ({ db, userId }, { code }) => {
  return getRoomSnapshot(db, roomCode(code), userId);
});
