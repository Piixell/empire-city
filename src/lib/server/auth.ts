import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./errors";
import { SUPABASE_ANON_KEY, SUPABASE_URL, localModeAllowed, useSupabaseAuth } from "./env";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let client: SupabaseClient | null = null;
const cache = new Map<string, { userId: string; exp: number }>();

function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/**
 * Verifies the caller identity from `Authorization: Bearer <token>`.
 *  - Supabase mode: the token is a Supabase Auth JWT (anonymous sign-in) and
 *    is validated against Supabase Auth.
 *  - Local mode (dev only): `dev:<uuid>` identities generated per browser tab.
 */
export async function requireUser(req: Request): Promise<{ userId: string }> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Sessione mancante: ricarica la pagina.");

  if (useSupabaseAuth()) {
    const now = Date.now();
    const hit = cache.get(token);
    if (hit && hit.exp > now) return { userId: hit.userId };
    const { data, error } = await supabase().auth.getUser(token);
    if (error || !data.user) throw new ApiError(401, "UNAUTHENTICATED", "Sessione non valida o scaduta.");
    cache.set(token, { userId: data.user.id, exp: now + 60_000 });
    if (cache.size > 5000) cache.clear();
    return { userId: data.user.id };
  }

  if (localModeAllowed() && token.startsWith("dev:")) {
    const id = token.slice(4);
    if (UUID_RE.test(id)) return { userId: id.toLowerCase() };
  }
  throw new ApiError(401, "UNAUTHENTICATED", "Autenticazione non configurata.");
}
