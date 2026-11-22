"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, Home, RotateCcw, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useGame } from "@/components/game/context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api, ApiClientError } from "@/lib/client/api";
import { PLAYER_COLORS, TOKEN_ICONS, cr } from "@/lib/client/ui-constants";
import { computeStandings } from "@/lib/game/rules";
import type { RoomSnapshot } from "@/lib/server/rooms";

function duration(ms: number) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function Results() {
  const { game, room, code, myUserId } = useGame();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  if (game.status !== "finished") return null;
  const standings = computeStandings(game);
  const winner = game.players.find((p) => p.id === game.winnerId);
  const ws = standings.find((s) => s.playerId === game.winnerId);
  const isHost = room.snapshot?.room.hostUserId === myUserId;
  const WIcon = winner ? TOKEN_ICONS[winner.token].icon : Trophy;

  async function rematch() {
    setBusy(true);
    try {
      const snap = await api<RoomSnapshot>(`/api/rooms/${code}/rematch`, { body: {} });
      room.applySnapshot(snap);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Operazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-primary px-5 py-2 font-bold text-primary-foreground shadow-xl">
          <Trophy className="mr-1 inline size-4" /> Risultati finali
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogTitle className="sr-only">Risultati finali</DialogTitle>
          <div className="text-center">
            <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 12 }}>
              <Trophy className="mx-auto size-14 text-primary drop-shadow-[0_0_20px_rgba(245,184,61,0.6)]" />
            </motion.div>
            <div className="mt-2 text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">
              {game.finishReason === "timeLimit" ? "Tempo scaduto · vince il patrimonio più alto" : "Ultimo magnate rimasto"}
            </div>
            {winner && (
              <div className="mt-3 flex items-center justify-center gap-3">
                <div className="flex size-14 items-center justify-center rounded-full border-4 border-white" style={{ background: PLAYER_COLORS[winner.color].hex }}>
                  <WIcon className="size-7 text-white" />
                </div>
                <div className="text-left">
                  <div className="font-display text-3xl font-extrabold" style={{ color: PLAYER_COLORS[winner.color].hex }}>
                    {winner.avatar} {winner.name}
                  </div>
                  {ws && (
                    <div className="text-sm text-muted-foreground">
                      Patrimonio {cr(ws.netWorth)} cr · Liquidità {cr(ws.cash)} cr · Proprietà {cr(ws.propertyValue)} cr
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="mt-2 flex items-center justify-center gap-1 text-sm text-muted-foreground">
              <Clock className="size-4" /> Durata: {duration((game.finishedAt ?? Date.now()) - game.startedAt)} · {game.turn.number} turni
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">#</th>
                  <th className="text-left">Giocatore</th>
                  <th className="text-right">Patrimonio</th>
                  <th className="text-right">Liquidità</th>
                  <th className="text-right">Proprietà</th>
                  <th className="text-right">Acquisti</th>
                  <th className="text-right">Edifici</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => {
                  const p = game.players.find((x) => x.id === s.playerId)!;
                  return (
                    <tr key={s.playerId} className="border-t border-border/60">
                      <td className="py-2 font-bold">{s.rank}</td>
                      <td>
                        <span className="font-semibold" style={{ color: PLAYER_COLORS[p.color].hex }}>
                          {p.avatar} {p.name}
                        </span>
                        {s.status === "bankrupt" && <span className="ml-1 text-[10px] text-red-300">bancarotta</span>}
                      </td>
                      <td className="text-right tabular-nums">{cr(s.netWorth)}</td>
                      <td className="text-right tabular-nums">{cr(s.cash)}</td>
                      <td className="text-right tabular-nums">
                        {s.propertiesOwned} ({cr(s.propertyValue)})
                      </td>
                      <td className="text-right tabular-nums">{p.stats.propertiesBought}</td>
                      <td className="text-right tabular-nums">{p.stats.buildingsBuilt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {isHost ? (
              <Button onClick={rematch} disabled={busy}>
                <RotateCcw /> Nuova partita con gli stessi giocatori
              </Button>
            ) : (
              <span className="self-center text-sm text-muted-foreground">L&apos;host può avviare una nuova partita.</span>
            )}
            <Button variant="secondary" asChild>
              <Link href="/">
                <Home /> Home
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Guarda la plancia
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
