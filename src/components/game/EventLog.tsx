"use client";

import { useGame } from "@/components/game/context";
import { PLAYER_COLORS } from "@/lib/client/ui-constants";

const ICON: Record<string, string> = {
  dice: "🎲",
  move: "➡️",
  buy: "🏠",
  rent: "💸",
  payment: "💳",
  income: "💰",
  card: "🃏",
  jail: "🚔",
  auctionStart: "🔨",
  auctionWon: "🏆",
  bid: "🔨",
  build: "🏗️",
  sellBuilding: "🏚️",
  mortgage: "📜",
  unmortgage: "📜",
  tradeAccepted: "🤝",
  tradeProposed: "📨",
  tradeCounter: "📨",
  bankrupt: "💀",
  turn: "⏭️",
  gameOver: "🏁",
  timeout: "⏰",
  debt: "⚠️",
};

export function EventLog() {
  const { game } = useGame();
  const colorOf = Object.fromEntries(game.players.map((p) => [p.id, PLAYER_COLORS[p.color].hex]));
  const items = [...game.log].reverse().filter((e) => e.type !== "move");
  return (
    <div className="space-y-1">
      {items.map((e) => (
        <div key={e.seq} className="flex gap-2 rounded-md px-1.5 py-1 text-[13px] leading-snug hover:bg-white/[0.03]">
          <span className="shrink-0">{ICON[e.type] ?? "•"}</span>
          <span className="min-w-0 flex-1">
            {e.playerId && <span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: colorOf[e.playerId] }} />}
            <span className={e.type === "turn" ? "font-semibold text-foreground" : "text-foreground/85"}>{e.message}</span>
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {new Date(e.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      ))}
    </div>
  );
}
