import { handler, readBody } from "@/lib/server/http";
import { createRoom } from "@/lib/server/rooms";
import { createRoomSchema } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async ({ db, userId, req }) => {
  const body = await readBody(req, createRoomSchema);
  return createRoom(db, userId, body);
});
