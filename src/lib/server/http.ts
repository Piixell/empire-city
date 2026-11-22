import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { GameError } from "../game/engine";
import { requireUser } from "./auth";
import { getDb, type Database } from "./db";
import { ApiError } from "./errors";
import { ROOM_CODE_RE, normalizeRoomCode } from "./validation";

export interface HandlerCtx {
  db: Database;
  userId: string;
  req: Request;
}

type Params = Record<string, string>;

/** Wraps a route handler: auth, DB, JSON body parsing and uniform error mapping. */
export function handler<P extends Params = Params>(
  fn: (ctx: HandlerCtx, params: P) => Promise<unknown>,
) {
  return async (req: Request, routeCtx: { params: Promise<P> }) => {
    try {
      const { userId } = await requireUser(req);
      const db = await getDb();
      const params = (await routeCtx?.params) ?? ({} as P);
      const data = await fn({ db, userId, req }, params);
      return NextResponse.json(data ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError || e instanceof GameError) {
    return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const msg = e.issues[0]?.message || "Dati non validi.";
    return NextResponse.json({ error: { code: "VALIDATION", message: msg } }, { status: 400 });
  }
  console.error("[api] unexpected error", redact(e));
  return NextResponse.json({ error: { code: "INTERNAL", message: "Errore interno del server. Riprova." } }, { status: 500 });
}

/** Logs only name/code/message/stack, with any connection-string credentials masked. */
function redact(e: unknown): string {
  const err = e as { name?: string; code?: string; message?: string; stack?: string };
  const text = [err?.name, err?.code, err?.message, err?.stack?.split("\n").slice(1, 6).join("\n")]
    .filter(Boolean)
    .join(" | ");
  return (text || String(e)).replace(/(postgres(?:ql)?:\/\/[^:\s/]*:)[^\s'"]*@/gi, "$1***@");
}

export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown = {};
  const text = await req.text();
  if (text) {
    if (text.length > 20_000) throw new ApiError(413, "TOO_LARGE", "Richiesta troppo grande.");
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ApiError(400, "BAD_JSON", "JSON non valido.");
    }
  }
  return schema.parse(raw);
}

export function roomCode(raw: string): string {
  const code = normalizeRoomCode(decodeURIComponent(raw || ""));
  if (!ROOM_CODE_RE.test(code)) throw new ApiError(400, "BAD_CODE", "Codice stanza non valido (6 caratteri).");
  return code;
}
