"use client";

import { motion } from "framer-motion";
import { Crown, Lock, Skull, WifiOff } from "lucide-react";
import { useGame } from "@/components/game/context";
import { isLocalMode } from "@/lib/client/session";
import { PLAYER_COLORS, TOKEN_ICONS, cr } from "@/lib/client/ui-constants";
import { netWorth, ownedTiles } from "@/lib/game/rules";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/game/AnimatedNumber";

export function PlayersPanel() {
  const { game, room, openDialog, myUserId } = useGame();
  const players = [...game.players].sort((a, b) => a.seat - b.seat);
  const hostId = room.snapshot?.room.hostUserId;
  return (
    <div className="space-y-2">
      {players.map((p) => {
        const active = game.turn.playerId === p.id && game.status === "active";
        const c = PLAYER_COLORS[p.color];
        const Icon = TOKEN_ICONS[p.token].icon;
        const online = isLocalMode || room.online.has(p.userId) || p.userId === myUserId;
        const bankrupt = p.status === "bankrupt";
        const count = ownedTiles(game, p.id).length;
        return (
          <motion.button
            layout
            key={p.id}
            onClick={() => openDialog("portfolio", p.id)}
            className={cn(
              "relative w-full overflow-hidden rounded-xl border p-2.5 text-left transition hover:brightness-125",
              active ? "border-transparent" : "border-border",
              bankrupt && "opacity-50 grayscale",
            )}
            style={{
              background: active ? `linear-gradient(135deg, ${c.soft}, rgba(15,22,38,0.95))` : "rgba(15,22,38,0.7)",
              boxShadow: active ? `0 0 0 2px ${c.hex}, 0 0 24px -6px ${c.hex}` : undefined,
            }}
          >
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="flex size-10 items-center justify-center rounded-full bg-black/30 text-xl">{p.avatar}</div>
                <div className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-[#0f1626]" style={{ background: c.hex }}>
                  <Icon className="size-3 text-white" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 truncate text-sm font-bold">
                  {p.userId === hostId && <Crown className="size-3.5 shrink-0 text-primary" />}
                  <span className="truncate" style={{ color: c.hex }}>
                    {p.name}
                  </span>
                  {p.userId === myUserId && <span className="text-[10px] font-semibold text-muted-foreground">(tu)</span>}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{count} propr.</span>
                  {!bankrupt && <span>· patr. {cr(netWorth(game, p.id))}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-base font-extrabold tabular-nums text-foreground">
                  <AnimatedNumber value={p.balance} />
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">crediti</div>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {active && <Tag className="bg-primary/20 text-primary">In turno</Tag>}
              {p.inJail && (
                <Tag className="bg-zinc-500/25 text-zinc-200">
                  <Lock className="size-3" /> Prigione
                </Tag>
              )}
              {bankrupt && (
                <Tag className="bg-red-500/20 text-red-300">
                  <Skull className="size-3" /> Bancarotta
                </Tag>
              )}
              {!online && !bankrupt && (
                <Tag className="bg-amber-500/15 text-amber-300">
                  <WifiOff className="size-3" /> Disconnesso
                </Tag>
              )}
              {p.jailCards.length > 0 && <Tag className="bg-sky-500/15 text-sky-300">🎟️ {p.jailCards.length}</Tag>}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

function Tag({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", className)}>{children}</span>;
}
