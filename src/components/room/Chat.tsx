"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquareOff, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiClientError } from "@/lib/client/api";
import { PLAYER_COLORS } from "@/lib/client/ui-constants";
import type { PlayerColor } from "@/lib/game/types";
import type { ChatMessageView } from "@/lib/server/rooms";
import { cn } from "@/lib/utils";

export function Chat({
  code,
  messages,
  myUserId,
  enabled,
  onSent,
  className,
}: {
  code: string;
  messages: ChatMessageView[];
  myUserId: string | null;
  enabled: boolean;
  onSent: (m: ChatMessageView) => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

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
        {messages.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nessun messaggio. Rompi il ghiaccio!</p>}
        {messages.map((m) =>
          m.system ? (
            <div key={m.id} className="text-center text-[11px] italic text-muted-foreground">
              {m.body}
            </div>
          ) : (
            <div key={m.id} className={cn("text-sm leading-snug", m.userId === myUserId && "rounded-md bg-white/[0.03]")}>
              <span className="font-bold" style={{ color: PLAYER_COLORS[(m.color as PlayerColor) ?? "blue"]?.hex ?? "#93a0bd" }}>
                {m.name}
              </span>
              <span className="text-muted-foreground">: </span>
              <span className="break-words text-foreground/90">{m.body}</span>
            </div>
          ),
        )}
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
