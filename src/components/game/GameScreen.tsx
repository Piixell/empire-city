"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, LogOut, MessageSquare, ScrollText, Swords, Users } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { ActionPanel } from "@/components/game/ActionPanel";
import { BoardViewport } from "@/components/game/Board";
import { GameProvider, useGame } from "@/components/game/context";
import {
  AuctionDialog,
  BuyDialog,
  DebtDialog,
  JailDialog,
  ManageDialog,
  PortfolioDialog,
  TradeDialog,
} from "@/components/game/dialogs";
import { EventLog, isChatEvent } from "@/components/game/EventLog";
import { PlayersPanel } from "@/components/game/PlayersPanel";
import { Results } from "@/components/game/Results";
import { AnimatedNumber } from "@/components/game/AnimatedNumber";
import { ConnectionBadge } from "@/components/lobby/Lobby";
import { Chat } from "@/components/room/Chat";
import { Button } from "@/components/ui/button";
import type { useRoom } from "@/hooks/useRoom";
import { api, ApiClientError } from "@/lib/client/api";
import { activeDeadline } from "@/lib/game/engine";
import { PLAYER_COLORS } from "@/lib/client/ui-constants";
import { cn } from "@/lib/utils";

type Room = ReturnType<typeof useRoom>;

export function GameScreen({ room, code }: { room: Room; code: string }) {
  return (
    <GameProvider room={room} code={code}>
      <GameLayout />
    </GameProvider>
  );
}

type Tab = "actions" | "players" | "log" | "chat";

function GameLayout() {
  const { game, me, room, code, send, now, myUserId } = useGame();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("actions");
  const [sideTab, setSideTab] = useState<"log" | "chat">("chat");
  const lastSeq = useRef<number>(Math.max(0, ...game.log.map((e) => e.seq)));
  const gameIdRef = useRef(game.id);
  const [unreadChat, setUnreadChat] = useState(0);
  const chatLen = useRef(room.chat.length);

  // Game events are NOT shown as pop-ups or toasts: they appear in the chat
  // (see chatEvents below). Only the tab title signals your turn while the
  // window is in the background.
  useEffect(() => {
    if (gameIdRef.current !== game.id) {
      gameIdRef.current = game.id;
      lastSeq.current = Math.max(0, ...game.log.map((e) => e.seq));
      return;
    }
    const fresh = game.log.filter((e) => e.seq > lastSeq.current);
    if (!fresh.length) return;
    lastSeq.current = Math.max(...fresh.map((e) => e.seq));
    const myTurnStarted = fresh.some((e) => e.type === "turn" && !!me && e.playerId === me.id);
    if (myTurnStarted && document.visibilityState !== "visible") document.title = "🎲 Tocca a te! — Empire City";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.version, game.id]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") document.title = "Empire City — Gioco da tavolo multiplayer";
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // --- server-validated timeouts: any connected client may trigger them ----
  const sentFor = useRef<string>("");
  useEffect(() => {
    if (game.status !== "active") return;
    const seat = Math.max(0, game.players.findIndex((p) => p.userId === myUserId));
    const id = setInterval(() => {
      const deadline = activeDeadline(game);
      const limitHit = game.endsAt != null && now() >= game.endsAt;
      // Stagger clients so they don't all fire at once; the server ignores extras.
      const grace = 900 + seat * 450;
      if (!limitHit && now() < deadline + grace) return;
      const key = `${game.version}:${deadline}`;
      if (sentFor.current === key) return;
      sentFor.current = key;
      void send({ type: "TIMEOUT" }, { silent: true });
    }, 400);
    return () => clearInterval(id);
  }, [game, myUserId, now, send]);

  // --- unread chat badge ------------------------------------------------------
  useEffect(() => {
    const added = room.chat.length - chatLen.current;
    chatLen.current = room.chat.length;
    const chatVisible = tab === "chat" || (typeof window !== "undefined" && window.innerWidth >= 1024 && sideTab === "chat");
    if (added > 0 && !chatVisible) setUnreadChat((n) => n + added);
    if (chatVisible) setUnreadChat(0);
  }, [room.chat.length, tab, sideTab]);

  async function leave() {
    const msg =
      me && me.status === "active" && game.status === "active"
        ? "Uscire dalla partita? Verrà considerato un ritiro: le tue proprietà torneranno alla Banca."
        : "Uscire dalla stanza?";
    if (!confirm(msg)) return;
    try {
      await api(`/api/rooms/${code}/leave`, { body: {} });
      router.push("/");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Operazione non riuscita.");
    }
  }

  const chatEvents = useMemo(() => game.log.filter(isChatEvent), [game.log]);
  const playerColors = useMemo(
    () => Object.fromEntries(game.players.map((p) => [p.id, PLAYER_COLORS[p.color].hex])),
    [game.players],
  );

  const chat = (
    <Chat
      code={code}
      messages={room.chat}
      events={chatEvents}
      playerColors={playerColors}
      myUserId={room.myUserId}
      enabled={room.snapshot?.room.settings.chatEnabled ?? true}
      onSent={room.appendChat}
      className="h-full"
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-3">
          <Logo size="sm" compact />
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${window.location.origin}/room/${code}`);
                toast.success("Link copiato");
              } catch {
                /* ignore */
              }
            }}
            className="hidden items-center gap-1 rounded-lg bg-white/5 px-2 py-1 font-mono text-sm font-bold tracking-widest sm:flex"
          >
            {code} <Copy className="size-3.5 text-muted-foreground" />
          </button>
          <ConnectionBadge state={room.connection} />
        </div>
        <div className="flex items-center gap-2">
          {me && (
            <div className="flex items-center gap-2 rounded-xl bg-black/30 px-3 py-1.5">
              <span className="size-2.5 rounded-full" style={{ background: PLAYER_COLORS[me.color].hex }} />
              <span className="hidden text-sm font-semibold sm:inline">{me.name}</span>
              <span className="font-display text-lg font-extrabold tabular-nums">
                <AnimatedNumber value={me.balance} />
              </span>
              <span className="text-xs text-muted-foreground">cr</span>
            </div>
          )}
          {me?.status === "bankrupt" && <span className="rounded-lg bg-red-500/15 px-2 py-1 text-xs font-bold text-red-300">Spettatore</span>}
          <Button variant="ghost" size="icon" onClick={leave} aria-label="Esci">
            <LogOut />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 max-lg:grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[1fr_350px] xl:grid-cols-[280px_1fr_370px]">
        <aside className="scroll-thin hidden min-h-0 overflow-y-auto border-r border-border/60 p-3 xl:block">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Giocatori</div>
          <PlayersPanel />
        </aside>

        <section className="relative min-h-0 p-2 sm:p-3 max-lg:h-[min(100vw,62dvh)] max-lg:shrink-0">
          <BoardViewport />
        </section>

        <aside className="flex min-h-0 flex-col border-l border-border/60">
          {/* mobile / tablet tabs */}
          <nav className="flex shrink-0 border-b border-border/60 xl:hidden">
            {(
              [
                ["actions", "Azioni", Swords],
                ["players", "Giocatori", Users],
                ["log", "Registro", ScrollText],
                ["chat", "Chat", MessageSquare],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition",
                  tab === key ? "border-b-2 border-primary text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" /> {label}
                {key === "chat" && unreadChat > 0 && <span className="absolute right-2 top-1.5 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{unreadChat}</span>}
              </button>
            ))}
          </nav>

          {/* desktop: actions always visible + log/chat tabs */}
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 max-xl:hidden">
            <ActionPanel />
          </div>
          <div className="flex h-[38%] min-h-[220px] shrink-0 flex-col border-t border-border/60 max-xl:hidden">
            <div className="flex shrink-0 gap-1 px-3 pt-2">
              {(["log", "chat"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setSideTab(k)}
                  className={cn("relative rounded-md px-3 py-1 text-xs font-semibold", sideTab === k ? "bg-white/10 text-foreground" : "text-muted-foreground")}
                >
                  {k === "log" ? "Cronologia" : "Chat"}
                  {k === "chat" && unreadChat > 0 && sideTab !== "chat" && <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{unreadChat}</span>}
                </button>
              ))}
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 pt-2">{sideTab === "log" ? <EventLog /> : chat}</div>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 xl:hidden">
            {tab === "actions" && <ActionPanel />}
            {tab === "players" && <PlayersPanel />}
            {tab === "log" && <EventLog />}
            {tab === "chat" && <div className="h-[50dvh]">{chat}</div>}
          </div>
        </aside>
      </div>

      <BuyDialog />
      <AuctionDialog />
      <JailDialog />
      <DebtDialog />
      <ManageDialog />
      <TradeDialog />
      <PortfolioDialog />
      <Results />
    </div>
  );
}
