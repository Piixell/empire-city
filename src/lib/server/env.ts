export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
export const DATABASE_URL = process.env.DATABASE_URL || "";

/**
 * Local mode (embedded PGlite + per-tab dev identities + polling) is allowed
 * only outside production, or when explicitly forced for local `next start`.
 */
export function localModeAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.EMPIRE_ALLOW_LOCAL === "1";
}

export function useSupabaseAuth(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}
