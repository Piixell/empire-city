"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { PublicGameState } from "@/lib/game/types";
import type { ChatMessageView, RoomPreview, RoomSnapshot } from "@/lib/server/rooms";
import { api, ApiClientError } from "@/lib/client/api";
import { getIdentity, getSupabase, isLocalMode } from "@/lib/client/session";

export type ConnectionState = "connecting" | "live" | "polling" | "offline";

export interface RoomState {
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  snapshot: RoomSnapshot | null;
  preview: RoomPreview | null;
  game: PublicGameState | null;
  chat: ChatMessageView[];
  online: Set<string>;
  clockOffset: number; // serverNow - Date.now()
  connection: ConnectionState;
  myUserId: string | null;
}

const SYSTEM_USER = "00000000-0000-0000-0000-000000000000";

/**
 * Room synchronization:
 *  1. load a full snapshot from the server (authoritative)
 *  2. subscribe to Supabase Realtime postgres_changes for the room
 *     (game_sessions rows carry the full public game state + version)
 *  3. on (re)subscribe, focus, or network recovery -> re-fetch the snapshot
 *  4. safety-net polling (fast in local mode or when Realtime is down)
 * Game states are applied only if their version is newer, so out-of-order
 * deliveries can never roll the UI back.
 */
export function useRoom(code: string) {
  const [state, setState] = useState<RoomState>({
    loading: true,
    error: null,
    errorCode: null,
    snapshot: null,
    preview: null,
    game: null,
    chat: [],
    online: new Set(),
    clockOffset: 0,
    connection: "connecting",
    myUserId: null,
  });
  const gameRef = useRef<PublicGameState | null>(null);
  const snapSig = useRef<string>("");
  const roomRevRef = useRef<number>(-1);
  const roomIdRef = useRef<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  const queued = useRef(false);

  const applyGame = useCallback((g: PublicGameState | null | undefined) => {
    if (!g) return;
    const cur = gameRef.current;
    if (cur && cur.id === g.id && g.version <= cur.version) return;
    gameRef.current = g;
    setState((s) => ({
      ...s,
      game: g,
      clockOffset: typeof g.serverTime === "number" ? g.serverTime - Date.now() : s.clockOffset,
    }));
  }, []);

  const applySnapshot = useCallback(
    (snap: RoomSnapshot | RoomPreview) => {
      if (!snap.member) {
        setState((s) => ({ ...s, loading: false, preview: snap, snapshot: null, error: null, errorCode: null }));
        return;
      }
      // Out-of-order responses (a slow GET finishing after a newer mutation
      // response) must never roll the room back: compare the room revision.
      if (roomIdRef.current === snap.room.id && snap.room.revision < roomRevRef.current) return;
      roomIdRef.current = snap.room.id;
      roomRevRef.current = snap.room.revision;
      if (!snap.game) {
        gameRef.current = null;
      }
      const sig = JSON.stringify([snap.room, snap.players, snap.me]);
      const sigUnchanged = snapSig.current === sig;
      snapSig.current = sig;
      setState((s) => {
        const sameRoom = s.snapshot?.room.id === snap.room.id;
        const unchanged = sameRoom && sigUnchanged && !!snap.game === !!s.game && !!s.snapshot;
        const chat = mergeChat(sameRoom ? s.chat : [], snap.chat);
        const chatSame = chat.length === s.chat.length && chat[chat.length - 1]?.id === s.chat[s.chat.length - 1]?.id;
        if (unchanged && chatSame && s.loading === false && !s.error && !s.preview) {
          // nothing visible changed: keep references stable (avoids re-rendering the board)
          return Math.abs(s.clockOffset - (snap.serverTime - Date.now())) > 250
            ? { ...s, clockOffset: snap.serverTime - Date.now() }
            : s;
        }
        return {
          ...s,
          loading: false,
          error: null,
          errorCode: null,
          preview: null,
          snapshot: unchanged ? s.snapshot : snap,
          chat: chatSame ? s.chat : chat,
          game: snap.game ? s.game : null,
          clockOffset: snap.serverTime - Date.now(),
        };
      });
      if (snap.game) {
        const cur = gameRef.current;
        if (!cur || cur.id !== snap.game.id || snap.game.version > cur.version) {
          gameRef.current = snap.game;
          setState((s) => ({ ...s, game: snap.game }));
        }
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (inflight.current) {
      queued.current = true;
      return;
    }
    inflight.current = true;
    try {
      const snap = await api<RoomSnapshot | RoomPreview>(`/api/rooms/${code}`, { method: "GET" }, 1);
      applySnapshot(snap);
    } catch (e) {
      const err = e as ApiClientError;
      if (err instanceof ApiClientError) {
        setState((s) => ({ ...s, loading: false, error: err.message, errorCode: err.code }));
      } else {
        setState((s) => ({ ...s, loading: false, connection: "offline" }));
      }
    } finally {
      inflight.current = false;
      if (queued.current) {
        queued.current = false;
        void refresh();
      }
    }
  }, [code, applySnapshot]);

  const scheduleRefresh = useCallback(
    (delay = 120) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void refresh(), delay);
    },
    [refresh],
  );

  // identity + initial load
  useEffect(() => {
    let alive = true;
    getIdentity()
      .then((id) => {
        if (!alive) return;
        setState((s) => ({ ...s, myUserId: id.userId }));
        void refresh();
      })
      .catch((e) => setState((s) => ({ ...s, loading: false, error: String(e?.message || e), errorCode: "AUTH" })));
    return () => {
      alive = false;
    };
  }, [refresh]);

  const roomId = state.snapshot?.room.id ?? null;
  const myUserId = state.myUserId;
  const myName = state.snapshot?.me.name ?? "";

  // realtime subscription
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !roomId || !myUserId) {
      if (isLocalMode && roomId) setState((s) => ({ ...s, connection: "polling" }));
      return;
    }
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    (async () => {
      const { token } = await getIdentity();
      sb.realtime.setAuth(token);
      if (cancelled) return;
      channel = sb.channel(`room:${roomId}`, { config: { presence: { key: myUserId } } });
      channel
        // Fast path: the server broadcasts a data-less "sync" nudge right after
        // every committed write; we fetch the authoritative state immediately.
        .on("broadcast", { event: "sync" }, (msg) => {
          const nudge = (msg.payload ?? {}) as { kind?: string; version?: number };
          const cur = gameRef.current;
          if (nudge.kind === "game" && cur && typeof nudge.version === "number" && nudge.version <= cur.version) return;
          scheduleRefresh(0);
        })
        // Slower but authoritative change feed, kept as a fallback.
        .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` }, () =>
          scheduleRefresh(),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` }, () =>
          scheduleRefresh(),
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
          (payload) => {
            const m = payload.new as Record<string, unknown>;
            const msg: ChatMessageView = {
              id: String(m.id),
              userId: String(m.user_id),
              name: String(m.display_name),
              color: (m.color as string) ?? null,
              body: String(m.body),
              createdAt: String(m.created_at),
              system: m.user_id === SYSTEM_USER,
            };
            setState((s) => ({ ...s, chat: mergeChat(s.chat, [msg]) }));
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "game_sessions", filter: `room_id=eq.${roomId}` },
          (payload) => {
            const row = payload.new as { public_state?: PublicGameState; version?: number } | undefined;
            if (row?.public_state && typeof row.public_state === "object") applyGame(row.public_state);
            else scheduleRefresh();
          },
        )
        .on("presence", { event: "sync" }, () => {
          const ps = channel!.presenceState();
          setState((s) => ({ ...s, online: new Set(Object.keys(ps)) }));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            setState((s) => ({ ...s, connection: "live" }));
            await channel!.track({ userId: myUserId, name: myName, at: Date.now() });
            void refresh(); // catch up on anything missed while (re)connecting
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setState((s) => ({ ...s, connection: "polling" }));
          }
        });
    })();
    return () => {
      cancelled = true;
      if (channel) void sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myUserId]);

  // keep presence payload (name) fresh
  useEffect(() => {
    /* name changes are reflected via room_players refresh; presence key is the user id */
  }, [myName]);

  // safety-net polling + focus/online recovery
  useEffect(() => {
    if (!roomId && !state.preview) return;
    const inLobby = state.snapshot?.room.status === "lobby";
    const interval = isLocalMode ? 1200 : state.connection !== "live" ? 3000 : inLobby ? 5000 : 10000;
    const id = setInterval(() => {
      if (document.visibilityState === "visible" || isLocalMode) void refresh();
    }, interval);
    const onWake = () => void refresh();
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [roomId, state.preview, state.connection, state.snapshot?.room.status, refresh]);

  const appendChat = useCallback((m: ChatMessageView) => setState((s) => ({ ...s, chat: mergeChat(s.chat, [m]) })), []);

  return { ...state, refresh, applySnapshot, applyGame, appendChat };
}

function mergeChat(prev: ChatMessageView[], add: ChatMessageView[]): ChatMessageView[] {
  const map = new Map(prev.map((m) => [m.id, m]));
  for (const m of add) map.set(m.id, m);
  return [...map.values()]
    .sort((a, b) => (a.createdAt === b.createdAt ? Number(a.id) - Number(b.id) : a.createdAt < b.createdAt ? -1 : 1))
    .slice(-150);
}
