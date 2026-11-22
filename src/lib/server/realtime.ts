import { after } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, useSupabaseAuth } from "./env";

export interface SyncNudge {
  kind: "game" | "room";
  version?: number;
}

/**
 * Low-latency "something changed" signal for every client of a room.
 *
 * postgres_changes goes through logical replication and per-subscriber RLS
 * checks (seconds under load). A Realtime Broadcast sent straight to the
 * Realtime servers reaches clients in tens of milliseconds; they then fetch
 * the authoritative state from our API. The nudge carries NO game data, so a
 * forged nudge (the anon key is public) can only trigger an extra read.
 *
 * Sent with `after()` so it never delays the HTTP response.
 */
export function nudgeRoom(roomId: string | null | undefined, nudge: SyncNudge) {
  if (!roomId || !useSupabaseAuth()) return;
  after(async () => {
    try {
      await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ topic: `room:${roomId}`, event: "sync", payload: nudge }] }),
        signal: AbortSignal.timeout(2000),
      });
    } catch {
      // Best effort: postgres_changes and polling remain as fallbacks.
    }
  });
}
