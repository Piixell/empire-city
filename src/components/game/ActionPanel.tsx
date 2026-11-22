"use client";

import { ArrowLeftRight, Banknote, Building2, Check, Dices, Flag, Gavel, Lock, Skull, Ticket, Unlock, X } from "lucide-react";
import { useGame } from "@/components/game/context";
import { Dice } from "@/components/game/Dice";
import { PropertyCard } from "@/components/game/PropertyCard";
import { TradeSummary } from "@/components/game/dialogs";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/misc";
import { useNow } from "@/hooks/useNow";
import { JAIL_FINE, tileAt } from "@/lib/game/board";
import { activeDeadline, phaseLabel } from "@/lib/game/engine";
import { PLAYER_COLORS, cr } from "@/lib/client/ui-constants";
import { cn } from "@/lib/utils";

export function ActionPanel() {
  const { game, me, isMyTurn, isSpectator, busy, send, openDialog, selectedTile, setSelectedTile, now } = useGame();
  const t = useNow(now, 500);
  const phase = game.turn.phase;
  const cur = game.players.find((p) => p.id === game.turn.playerId);
  const debt = game.debts[0];
  const iAmDebtor = !!me && phase === "DEBT" && debt?.debtorId === me.id;
  const remaining = Math.max(0, activeDeadline(game) - t);
  const lastDice = [...game.log].reverse().find((e) => e.type === "dice");
  const finished = game.status !== "active";

  const notTurnReason = finished
    ? "Partita terminata."
    : isSpectator
      ? "Sei in modalità spettatore."
      : !isMyTurn
        ? `È il turno di ${cur?.name ?? "un altro giocatore"}.`
        : null;
  const rollReason =
    notTurnReason ??
    (phase === "BUY"
      ? "Decidi prima se acquistare la proprietà."
      : phase === "AUCTION"
        ? "Asta in corso."
        : phase === "DEBT"
          ? "C'è un pagamento in sospeso."
          : phase === "MANAGE"
            ? "Hai già lanciato: termina il turno."
            : null);
  const endReason =
    notTurnReason ??
    (phase === "ROLL"
      ? game.turn.extraRoll
        ? "Hai fatto un doppio: lancia di nuovo."
        : "Devi prima lanciare i dadi."
      : phase === "BUY"
        ? "Acquista la proprietà o rinuncia."
        : phase === "AUCTION"
          ? "Attendi la fine dell'asta."
          : phase === "DEBT"
            ? "Salda prima il pagamento in sospeso."
            : null);
  const tradeReason = finished ? "Partita terminata." : isSpectator ? "Sei spettatore." : phase === "AUCTION" ? "Non durante un'asta." : null;

  const incoming = game.trades.filter((x) => x.status === "pending" && x.toId === me?.id);
  const outgoing = game.trades.filter((x) => x.status === "pending" && x.fromId === me?.id);
  const others = game.trades.filter((x) => x.status === "pending" && x.toId !== me?.id && x.fromId !== me?.id);

  return (
    <div className="space-y-3">
      {/* Status */}
      <div className="rounded-xl border border-border bg-black/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {finished ? "Partita terminata" : `Turno ${game.turn.number} · ${phaseLabel(phase)}`}
            </div>
            {cur && !finished && (
              <div className="truncate font-display text-lg font-bold" style={{ color: PLAYER_COLORS[cur.color].hex }}>
                {isMyTurn ? "Tocca a te!" : cur.name}
              </div>
            )}
          </div>
          {!finished && (
            <div className={cn("rounded-lg bg-black/30 px-2.5 py-1 font-mono text-lg font-bold tabular-nums", remaining < 15000 && "text-red-400")}>
              {Math.floor(remaining / 60000)}:{String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Dice dice={game.turn.dice} rollKey={lastDice?.seq ?? 0} size={34} />
          {game.turn.dice && (
            <div className="text-right">
              <div className="font-display text-2xl font-extrabold">{game.turn.dice[0] + game.turn.dice[1]}</div>
              {game.turn.dice[0] === game.turn.dice[1] && <div className="text-xs font-bold text-primary">DOPPIO</div>}
            </div>
          )}
        </div>
      </div>

      {/* Contextual decisions */}
      {isMyTurn && phase === "BUY" && game.turn.pendingTile != null && me && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-3">
          <div className="text-sm">
            <strong>{tileAt(game.turn.pendingTile).name}</strong> è in vendita a <strong>{cr(tileAt(game.turn.pendingTile).price ?? 0)} cr</strong>.
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button size="sm" disabled={!!busy || me.balance < (tileAt(game.turn.pendingTile).price ?? 0)} onClick={() => send({ type: "BUY" })}>
              <Banknote /> Acquista
            </Button>
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => send({ type: "DECLINE_BUY" })}>
              <Gavel /> {game.settings.auctionsEnabled ? "Asta" : "Rinuncia"}
            </Button>
          </div>
        </div>
      )}
      {isMyTurn && phase === "ROLL" && me?.inJail && !game.turn.hasRolled && (
        <div className="rounded-xl border border-zinc-500/40 bg-zinc-500/10 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="size-4" /> Sei in prigione (tentativo {me.jailTurns + 1}/3)
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button size="sm" variant="secondary" disabled={!!busy || me.balance < JAIL_FINE} onClick={() => send({ type: "PAY_JAIL" })}>
              <Unlock /> Paga {JAIL_FINE}
            </Button>
            <Button size="sm" variant="accent" disabled={!!busy || me.jailCards.length === 0} onClick={() => send({ type: "USE_JAIL_CARD" })}>
              <Ticket /> Usa carta
            </Button>
          </div>
        </div>
      )}
      {phase === "DEBT" && debt && (
        <div className={cn("rounded-xl border p-3 text-sm", iAmDebtor ? "border-red-500/50 bg-red-500/10" : "border-border bg-black/20")}>
          {iAmDebtor ? (
            <>
              <div className="font-semibold text-red-300">
                Devi {cr(debt.amount)} cr a {game.players.find((p) => p.id === debt.creditorId)?.name ?? "la Banca"}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button size="sm" disabled={!!busy || (me?.balance ?? 0) < debt.amount} onClick={() => send({ type: "PAY_DEBT" })}>
                  <Check /> Paga
                </Button>
                <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => confirm("Dichiarare bancarotta? Non si torna indietro.") && send({ type: "DECLARE_BANKRUPTCY" })}>
                  <Skull /> Bancarotta
                </Button>
              </div>
            </>
          ) : (
            <div className="text-muted-foreground">
              In attesa che {game.players.find((p) => p.id === debt.debtorId)?.name} saldi un pagamento di {cr(debt.amount)} cr…
            </div>
          )}
        </div>
      )}
      {phase === "AUCTION" && game.auction && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
          <Gavel className="mr-1 inline size-4 text-primary" /> Asta per <strong>{tileAt(game.auction.tile).name}</strong>: offerta {cr(game.auction.highBid)} cr
        </div>
      )}

      {/* Main buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Hint label={rollReason ?? undefined}>
          <Button size="lg" className={cn("w-full", !rollReason && "pulse-ring")} disabled={!!rollReason || !!busy} onClick={() => send({ type: "ROLL" })}>
            <Dices /> {me?.inJail && isMyTurn ? "Tenta doppio" : "Lancia i dadi"}
          </Button>
        </Hint>
        <Hint label={endReason ?? undefined}>
          <Button size="lg" variant="secondary" className="w-full" disabled={!!endReason || !!busy} onClick={() => send({ type: "END_TURN" })}>
            <Flag /> Termina turno
          </Button>
        </Hint>
        <Hint label={isSpectator ? "Sei spettatore." : undefined}>
          <Button variant="outline" className="w-full" disabled={isSpectator} onClick={() => openDialog("manage")}>
            <Building2 /> Gestisci proprietà
          </Button>
        </Hint>
        <Hint label={tradeReason ?? undefined}>
          <Button variant="outline" className="w-full" disabled={!!tradeReason} onClick={() => openDialog("trade")}>
            <ArrowLeftRight /> Proponi scambio
          </Button>
        </Hint>
      </div>

      {/* Trades */}
      {(incoming.length > 0 || outgoing.length > 0 || others.length > 0) && (
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Trattative</div>
          {incoming.map((tr) => (
            <div key={tr.id} className="rounded-xl border border-primary/50 bg-primary/10 p-2.5">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">Proposta per te</div>
              <TradeSummary trade={tr} game={game} />
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <Button size="sm" variant="success" disabled={!!busy || phase === "AUCTION"} onClick={() => send({ type: "ACCEPT_TRADE", tradeId: tr.id })}>
                  Accetta
                </Button>
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => openDialog("trade", tr)}>
                  Contro
                </Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => send({ type: "REJECT_TRADE", tradeId: tr.id })}>
                  Rifiuta
                </Button>
              </div>
            </div>
          ))}
          {outgoing.map((tr) => (
            <div key={tr.id} className="rounded-xl border border-border bg-black/20 p-2.5">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">In attesa di risposta</div>
              <TradeSummary trade={tr} game={game} />
              <Button size="sm" variant="ghost" className="mt-1" disabled={!!busy} onClick={() => send({ type: "CANCEL_TRADE", tradeId: tr.id })}>
                <X /> Ritira
              </Button>
            </div>
          ))}
          {others.map((tr) => (
            <div key={tr.id} className="rounded-xl border border-border/60 bg-black/10 p-2.5 opacity-80">
              <TradeSummary trade={tr} game={game} />
            </div>
          ))}
        </div>
      )}

      {/* Selected tile */}
      {selectedTile != null && (
        <div className="relative">
          <button
            onClick={() => setSelectedTile(null)}
            className="absolute right-2 top-2 z-10 rounded-md bg-black/40 p-1 text-white hover:bg-black/60"
            aria-label="Chiudi scheda"
          >
            <X className="size-3.5" />
          </button>
          <PropertyCard index={selectedTile} game={game} />
        </div>
      )}
    </div>
  );
}
