"use client";

import type { Command, PublicGameState } from "@/lib/game/types";
import { getIdentity } from "./session";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public payload?: unknown,
  ) {
    super(message);
  }
}

async function rawFetch<T>(path: string, init: { method?: string; body?: unknown }): Promise<T> {
  const { token } = await getIdentity();
  // A request must never hang forever: it would block every later refresh.
  const res = await fetch(path, {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiClientError(data?.error?.message || `Errore ${res.status}`, data?.error?.code || "HTTP", res.status, data);
  }
  return data as T;
}

/** JSON API call with retries on network failures only. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await rawFetch<T>(path, init);
    } catch (e) {
      lastErr = e;
      if (e instanceof ApiClientError) throw e; // server answered: do not retry
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Connessione assente.");
}

export interface CommandResponse {
  ok: boolean;
  duplicate?: boolean;
  version: number;
  state?: PublicGameState;
}

/**
 * Sends a game command with a unique id. Network retries reuse the SAME id,
 * so the server processes it at most once (no double charges).
 */
export async function sendCommand(gameId: string, command: Command): Promise<CommandResponse> {
  const commandId = crypto.randomUUID();
  try {
    return await api<CommandResponse>(`/api/games/${gameId}/command`, { body: { commandId, command } }, 3);
  } catch (e) {
    if (e instanceof ApiClientError) {
      const payload = e.payload as { state?: PublicGameState } | undefined;
      (e as ApiClientError & { state?: PublicGameState }).state = payload?.state;
    }
    throw e;
  }
}
