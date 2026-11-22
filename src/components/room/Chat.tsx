"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareOff, Send } from "lucide-react";
import { toast } from "sonner";
import { EVENT_ICON } from "@/components/game/EventLog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiClientError } from "@/lib/client/api";
import { PLAYER_COLORS } from "@/lib/client/ui-constants";
import type { GameEvent, PlayerColor } from "@/lib/game/types";
import type { ChatMessageView } from "@/lib/server/rooms";
import { cn } from "@/lib/utils";

type Item =
  | { kind: "msg"; key: string; at: number; msg: ChatMessageView }
  | { kind: "event"; key: string; at: number; event: GameEvent };

export function Chat({
  code,
  messages,
  events = [],
  playerColors = {},
  myUserId,
  enabled,
  onSent,
  className,
}: {
  code: string;
  messages: ChatMessageView[];
  /** Game events shown inline (rent, cards, purchases…) instead of pop-ups. */
  events?: GameEvent[];
  /** game player id → color hex, used for event accents. */
  playerColors?: Record<string, string>;
  myUserId: string | null;
  enabled: boolean;
  onSent: (m: ChatMessageView) => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [
      ...messages.map((m): Item => ({ kind: "msg", key: `m${m.id}`, at: Date.parse(m.createdAt) || 0, msg: m })),
      ...events.map((e): Item => ({ kind: "event", key: `e${e.seq}`, at: e.at, event: e })),
    ];
    return list.sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === "event" ? -1 : 1));
  }, [messages, events]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await api<{ message: ChatMessageView }>(`/api/rooms/${code}/chat`, { body: { body } });
      onSent(res.message);
      setText("");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Messaggio non inviato.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div ref={listRef} className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nessun messaggio. Rompi il ghiaccio!</p>}
        {items.map((it) => {
          if (it.kind === "event") {
            const e = it.event;
            const accent = e.playerId ? playerColors[e.playerId] : undefined;
            return (
              <div
                key={it.key}
                className="flex gap-1.5 rounded-md border-l-2 bg-white/[0.04] px-2 py-1 text-[12px] leading-snug text-foreground/80"
                style={{ borderLeftColor: accent ?? "rgba(148,163,184,0.5)" }}
              >
                <span className="shrink-0">{EVENT_ICON[e.type] ?? "•"}</span>
                <span className="min-w-0 break-words">{e.message}</span>
              </div>
            );
          }
          const m = it.msg;
          return m.system ? (
            <div key={it.key} className="text-center text-[11px] italic text-muted-foreground">
              {m.body}
            </div>
          ) : (
            <div key={it.key} className={cn("text-sm leading-snug", m.userId === myUserId && "rounded-md bg-white/[0.03]")}>
              <span className="font-bold" style={{ color: PLAYER_COLORS[(m.color as PlayerColor) ?? "blue"]?.hex ?? "#93a0bd" }}>
                {m.name}
              </span>
              <span className="text-muted-foreground">: </span>
              <span className="break-words text-foreground/90">{m.body}</span>
            </div>
          );
        })}
      </div>
      {enabled ? (
        <div className="mt-2 flex gap-2">
          <Input
            value={text}
            maxLength={300}
            placeholder="Scrivi un messaggio…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            className="h-9"
          />
          <Button size="icon" onClick={send} disabled={busy || !text.trim()} aria-label="Invia">
            <Send />
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
          <MessageSquareOff className="size-4" /> Chat disattivata dall&apos;host
        </div>
      )}
    </div>
  );
}
