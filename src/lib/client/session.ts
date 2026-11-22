"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
// Legacy "anon" key or the new "publishable" key (name used by the Vercel integration).
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

/** Local mode: no Supabase configured (dev only) — PGlite + polling + per-tab identity. */
export const isLocalMode = !URL || !KEY;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (isLocalMode) return null;
  if (!client) {
    client = createClient(URL, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "empire-city-auth" },
      realtime: { params: { eventsPerSecond: 30 } },
    });
  }
  return client;
}

export interface Identity {
  userId: string;
  token: string;
}

let pending: Promise<Identity> | null = null;

function devIdentity(): Identity {
  // One identity per browser TAB (sessionStorage) so several players can be
  // simulated from a single browser; it survives page reloads.
  const KEY_ID = "empire-city-dev-user";
  let id = "";
  try {
    id = sessionStorage.getItem(KEY_ID) || "";
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(KEY_ID, id);
    }
  } catch {
    id = crypto.randomUUID();
  }
  return { userId: id, token: `dev:${id}` };
}

/**
 * Returns the current identity, signing in anonymously on first use.
 * The anonymous Supabase session is persisted in localStorage, so a player
 * who refreshes or comes back later keeps the same identity (and seat).
 */
export async function getIdentity(): Promise<Identity> {
  if (isLocalMode) return devIdentity();
  const sb = getSupabase()!;
  const { data } = await sb.auth.getSession();
  if (data.session) return { userId: data.session.user.id, token: data.session.access_token };
  if (!pending) {
    pending = (async () => {
      const { data: signed, error } = await sb.auth.signInAnonymously();
      if (error || !signed.session) throw new Error(error?.message || "Accesso anonimo non riuscito.");
      return { userId: signed.session.user.id, token: signed.session.access_token };
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}

const NAME_KEY = "empire-city-name";
export function loadSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}
export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
