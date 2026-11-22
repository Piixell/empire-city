"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftRight, Banknote, Building2, Dices, Gavel, Hammer, HandCoins, Landmark, Lock, Skull, Ticket, Unlock } from "lucide-react";
import { useGame } from "@/components/game/context";
import { PropertyCard } from "@/components/game/PropertyCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Hint } from "@/components/ui/misc";
import { useNow } from "@/hooks/useNow";
import { DISTRICTS, JAIL_FINE, OWNABLE_TILES, tileAt, unmortgageCost } from "@/lib/game/board";
import { getCard } from "@/lib/game/cards";
import { canBuildReason, canMortgageReason, canSellBuildingReason, minNextBid, validateTrade } from "@/lib/game/engine";
import { liquidationValue, ownedTiles, tileIsFreeOfBuildings } from "@/lib/game/rules";
import { PLAYER_COLORS, cr } from "@/lib/client/ui-constants";
import type { GameState, PlayerState, PublicGameState, TradeOffer } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const asState = (g: PublicGameState) => g as unknown as GameState;

// ---------------------------------------------------------------- Buy -----
export function BuyDialog() {
  const { game, me, isMyTurn, send, busy, openDialog } = useGame();
  const pending = game.turn.pendingTile;
  const shouldOpen = isMyTurn && game.turn.phase === "BUY" && pending != null;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!shouldOpen) {
      setOpen(false);
      return;
    }
    // let the token finish walking before showing the purchase window
    const id = setTimeout(() => setOpen(true), 1300);
    return () => clearTimeout(id);
  }, [shouldOpen, pending]);
  if (!shouldOpen || pending == null || !me) return null;
  const t = tileAt(pending);
  const price = t.price ?? 0;
  const canAfford = me.balance >= price;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Acquisto immobiliare</DialogTitle>
          <DialogDescription>Sei arrivato su una proprietà libera. Vuoi acquistarla?</DialogDescription>
        </DialogHeader>
        <PropertyCard index={pending} game={game} />
        <div className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Il tuo saldo</span>
          <span className={cn("font-bold", canAfford ? "text-foreground" : "text-red-400")}>{cr(me.balance)} cr</span>
        </div>
        <DialogFooter className="grid grid-cols-2">
          <Button variant="secondary" disabled={!!busy} onClick={() => send({ type: "DECLINE_BUY" })}>
            <Gavel /> {game.settings.auctionsEnabled ? "Rinuncia (asta)" : "Rinuncia"}
          </Button>
          <Hint label={!canAfford ? "Fondi insufficienti: ipoteca o vendi edifici per raccogliere liquidità." : undefined}>
            <Button className="w-full" disabled={!canAfford || !!busy} onClick={() => send({ type: "BUY" })}>
              <Banknote /> Acquista {cr(price)} cr
            </Button>
          </Hint>
        </DialogFooter>
        {!canAfford && (
          <Button variant="outline" onClick={() => openDialog("manage")}>
            <Landmark /> Gestisci proprietà per raccogliere fondi
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------- Auction ----
export function AuctionDialog() {
  const { game, me, send, busy, now } = useGame();
  const a = game.auction;
  const [open, setOpen] = useState(true);
  const [custom, setCustom] = useState("");
  const t = useNow(now, 200);
  useEffect(() => {
    if (a) setOpen(true);
  }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a) return null;
  const tile = tileAt(a.tile);
  const min = minNextBid(a.highBid);
  const high = game.players.find((p) => p.id === a.highBidderId);
  const remaining = Math.max(0, a.deadline - t);
  const canBid = !!me && me.status === "active" && !a.passedIds.includes(me.id) && a.highBidderId !== me.id;
  const bid = (amount: number) => send({ type: "BID", amount });
  const reason = !me || me.status !== "active" ? "Sei spettatore." : a.passedIds.includes(me.id) ? "Ti sei ritirato." : a.highBidderId === me.id ? "Sei il miglior offerente." : undefined;
  const quick = [min, min + 20, min + 50, min + 100].filter((v, i, arr) => arr.indexOf(v) === i);

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-full bg-primary px-4 py-2 font-bold text-primary-foreground shadow-xl lg:bottom-6">
          <Gavel className="mr-1 inline size-4" /> Asta in corso · {Math.ceil(remaining / 1000)}s
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="size-5 text-primary" /> Asta: {tile.name}
            </DialogTitle>
            <DialogDescription>Rilanci in tempo reale. Ogni offerta prolunga il timer di qualche secondo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[1fr_1.1fr]">
            <PropertyCard index={a.tile} game={game} compact />
            <div className="flex flex-col gap-3">
              <div className="rounded-xl bg-black/30 p-3 text-center">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Offerta attuale</div>
                <motion.div key={a.highBid} initial={{ scale: 1.3, color: "#fde68a" }} animate={{ scale: 1, color: "#e8ecf6" }} className="font-display text-4xl font-extrabold">
                  {cr(a.highBid)} cr
                </motion.div>
                <div className="mt-1 text-sm" style={{ color: high ? PLAYER_COLORS[high.color].hex : undefined }}>
                  {high ? `di ${high.name}` : "Nessuna offerta"}
                </div>
                <div className="mx-auto mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div className={cn("h-full rounded-full transition-[width] duration-200", remaining < 5000 ? "bg-red-500" : "bg-primary")} style={{ width: `${Math.min(100, (remaining / 20000) * 100)}%` }} />
                </div>
                <div className={cn("mt-1 font-mono text-sm font-bold", remaining < 5000 && "text-red-400")}>{Math.ceil(remaining / 1000)}s</div>
              </div>
              <Hint label={reason}>
                <div className="grid w-full grid-cols-2 gap-2">
                  {quick.map((v) => (
                    <Button key={v} variant="secondary" disabled={!canBid || !!busy || (me?.balance ?? 0) < v} onClick={() => bid(v)}>
                      {cr(v)} cr
                    </Button>
                  ))}
                </div>
              </Hint>
              <div className="flex gap-2">
                <Input type="number" inputMode="numeric" min={min} placeholder={`Min ${min}`} value={custom} onChange={(e) => setCustom(e.target.value)} disabled={!canBid} />
                <Button disabled={!canBid || !!busy || !custom || Number(custom) < min} onClick={() => bid(Math.floor(Number(custom)))}>
                  Offri
                </Button>
              </div>
              <Button variant="outline" disabled={!canBid || !!busy} onClick={() => send({ type: "AUCTION_PASS" })}>
                Mi ritiro
              </Button>
              {me && <div className="text-center text-xs text-muted-foreground">Il tuo saldo: {cr(me.balance)} cr</div>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {game.players
              .filter((p) => p.status === "active")
              .map((p) => (
                <span
                  key={p.id}
                  className={cn("rounded-full px-2 py-0.5 font-semibold", a.passedIds.includes(p.id) ? "bg-white/5 text-muted-foreground line-through" : "text-white")}
                  style={!a.passedIds.includes(p.id) ? { background: PLAYER_COLORS[p.color].hex + "55" } : undefined}
                >
                  {p.name}
                </span>
              ))}
          </div>
          {a.bids.length > 0 && (
            <div className="max-h-24 space-y-0.5 overflow-y-auto text-xs text-muted-foreground scroll-thin">
              {[...a.bids].reverse().map((b) => {
                const p = game.players.find((x) => x.id === b.playerId);
                return (
                  <div key={b.amount}>
                    <span style={{ color: p ? PLAYER_COLORS[p.color].hex : undefined }}>{p?.name}</span> offre {cr(b.amount)} cr
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------- Jail ----
export function JailDialog() {
  const { game, me, isMyTurn, send, busy } = useGame();
  const should = isMyTurn && !!me?.inJail && game.turn.phase === "ROLL" && !game.turn.hasRolled;
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(should), [should, game.turn.number]);
  if (!should || !me) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-5" /> Sei nelle Segrete del Re
          </DialogTitle>
          <DialogDescription>Tentativo {me.jailTurns + 1} di 3. Al terzo tentativo fallito pagherai la cauzione automaticamente.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button disabled={!!busy} onClick={() => send({ type: "ROLL" })}>
            <Dices /> Tenta il doppio
          </Button>
          <Hint label={me.balance < JAIL_FINE ? "Fondi insufficienti" : undefined}>
            <Button className="w-full" variant="secondary" disabled={!!busy || me.balance < JAIL_FINE} onClick={() => send({ type: "PAY_JAIL" })}>
              <Unlock /> Paga la cauzione ({JAIL_FINE} cr)
            </Button>
          </Hint>
          <Hint label={me.jailCards.length === 0 ? "Non possiedi carte di uscita" : undefined}>
            <Button className="w-full" variant="accent" disabled={!!busy || me.jailCards.length === 0} onClick={() => send({ type: "USE_JAIL_CARD" })}>
              <Ticket /> Usa pergamena d&apos;evasione ({me.jailCards.length})
            </Button>
          </Hint>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Debt ----
export function DebtDialog() {
  const { game, me, send, busy, openDialog } = useGame();
  const d = game.debts[0];
  const mine = !!me && game.turn.phase === "DEBT" && d?.debtorId === me.id;
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setOpen(mine);
    setConfirm(false);
  }, [mine, d?.amount, d?.reason]);
  if (!mine || !me || !d) return null;
  const creditor = game.players.find((p) => p.id === d.creditorId);
  const liq = liquidationValue(game, me.id);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-300">
            <HandCoins className="size-5" /> Pagamento dovuto
          </DialogTitle>
          <DialogDescription>
            Devi {cr(d.amount)} cr a {creditor ? creditor.name : "la Banca"} ({d.reason}).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="Liquidità" value={`${cr(me.balance)} cr`} bad={me.balance < d.amount} />
          <Stat label="Mancano" value={`${cr(Math.max(0, d.amount - me.balance))} cr`} bad={me.balance < d.amount} />
          <Stat label="Raccoglibile (vendite + ipoteche)" value={`${cr(liq)} cr`} />
          <Stat label="Esito se vendi tutto" value={liq >= d.amount ? "Solvibile" : "Insolvente"} bad={liq < d.amount} />
        </div>
        <p className="text-xs text-muted-foreground">
          Prima di dichiarare bancarotta puoi vendere edifici, ipotecare proprietà o proporre scambi agli altri giocatori.
        </p>
        <div className="grid gap-2">
          <Button disabled={!!busy || me.balance < d.amount} onClick={() => send({ type: "PAY_DEBT" })}>
            <Banknote /> Paga {cr(d.amount)} cr
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => openDialog("manage")}>
              <Building2 /> Vendi / Ipoteca
            </Button>
            <Button variant="secondary" onClick={() => openDialog("trade")}>
              <ArrowLeftRight /> Proponi scambio
            </Button>
          </div>
          {!confirm ? (
            <Button variant="outline" className="text-red-300" onClick={() => setConfirm(true)}>
              <Skull /> Dichiara bancarotta
            </Button>
          ) : (
            <Button variant="destructive" disabled={!!busy} onClick={() => send({ type: "DECLARE_BANKRUPTCY" })}>
              <Skull /> Confermo: dichiaro bancarotta
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-lg bg-black/25 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-bold", bad && "text-red-400")}>{value}</div>
    </div>
  );
}

// -------------------------------------------------------------- Manage ----
export function ManageDialog() {
  const { game, me, isMyTurn, send, busy, dialog, openDialog } = useGame();
  const open = dialog?.kind === "manage";
  if (!me) return null;
  const phase = game.turn.phase;
  const iAmDebtor = phase === "DEBT" && game.debts[0]?.debtorId === me.id;
  const turnReason = !isMyTurn ? "Solo durante il tuo turno." : null;
  const buildPhaseReason = turnReason ?? (["ROLL", "MANAGE"].includes(phase) ? null : "Non in questa fase.");
  const sellPhaseReason = iAmDebtor ? null : turnReason ?? (["ROLL", "MANAGE", "BUY"].includes(phase) ? null : "Non in questa fase.");
  const s = asState(game);
  const mine = ownedTiles(game, me.id).sort((a, b) => a.tile - b.tile);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && openDialog(null)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-primary" /> Gestisci proprietà
          </DialogTitle>
          <DialogDescription>
            Saldo: <strong className="text-foreground">{cr(me.balance)} cr</strong>. Costruzione uniforme: costruisci e vendi bilanciando la regione.
          </DialogDescription>
        </DialogHeader>
        {mine.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Non possiedi ancora proprietà.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {mine.map((o) => {
              const t = tileAt(o.tile);
              const color = t.district ? DISTRICTS[t.district].color : t.kind === "transport" ? "#475569" : "#0f766e";
              const build = buildPhaseReason ?? canBuildReason(s, me, o.tile);
              const sell = sellPhaseReason ?? canSellBuildingReason(s, me, o.tile);
              const mort = sellPhaseReason ?? canMortgageReason(s, me, o.tile);
              const unm = buildPhaseReason ?? (!o.mortgaged ? "Non ipotecata." : me.balance < unmortgageCost(o.tile) ? "Fondi insufficienti." : null);
              return (
                <div key={o.tile} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="h-8 w-1.5 rounded-full" style={{ background: color }} />
                  <div className="min-w-40 flex-1">
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.mortgaged ? "Ipotecata" : o.houses === 5 ? "Fortezza" : o.houses > 0 ? `${o.houses} torrett${o.houses === 1 ? "a" : "e"}` : t.kind === "property" ? "Nessun edificio" : t.kind === "transport" ? "Trasporto" : "Fonte arcana"}
                    </div>
                  </div>
                  {t.kind === "property" && (
                    <>
                      <Hint label={build ?? undefined}>
                        <Button size="sm" variant="success" disabled={!!build || !!busy} onClick={() => send({ type: "BUILD", tile: o.tile })}>
                          <Hammer /> {o.houses === 4 ? "Fortezza" : "Torretta"} −{t.houseCost}
                        </Button>
                      </Hint>
                      <Hint label={sell ?? undefined}>
                        <Button size="sm" variant="secondary" disabled={!!sell || !!busy} onClick={() => send({ type: "SELL_BUILDING", tile: o.tile })}>
                          Vendi +{Math.floor((t.houseCost ?? 0) / 2)}
                        </Button>
                      </Hint>
                    </>
                  )}
                  {o.mortgaged ? (
                    <Hint label={unm ?? undefined}>
                      <Button size="sm" variant="accent" disabled={!!unm || !!busy} onClick={() => send({ type: "UNMORTGAGE", tile: o.tile })}>
                        Riscatta −{unmortgageCost(o.tile)}
                      </Button>
                    </Hint>
                  ) : (
                    <Hint label={mort ?? undefined}>
                      <Button size="sm" variant="outline" disabled={!!mort || !!busy} onClick={() => send({ type: "MORTGAGE", tile: o.tile })}>
                        Ipoteca +{t.mortgage}
                      </Button>
                    </Hint>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------- Trade ----
export function TradeDialog() {
  const { game, me, send, busy, dialog, openDialog } = useGame();
  const open = dialog?.kind === "trade";
  const counter = open ? (dialog?.arg as TradeOffer | undefined) : undefined;
  const others = game.players.filter((p) => p.status === "active" && p.id !== me?.id);
  const [toId, setToId] = useState<string>("");
  const [offerTiles, setOfferTiles] = useState<number[]>([]);
  const [requestTiles, setRequestTiles] = useState<number[]>([]);
  const [offerCash, setOfferCash] = useState(0);
  const [requestCash, setRequestCash] = useState(0);
  const [offerCards, setOfferCards] = useState<string[]>([]);
  const [requestCards, setRequestCards] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (counter) {
      // A counter-offer starts from the received offer, mirrored.
      setToId(counter.fromId);
      setOfferTiles(counter.requestTiles);
      setRequestTiles(counter.offerTiles);
      setOfferCash(counter.requestCash);
      setRequestCash(counter.offerCash);
      setOfferCards(counter.requestCards);
      setRequestCards(counter.offerCards);
    } else {
      setToId((cur) => (cur && others.some((o) => o.id === cur) ? cur : others[0]?.id ?? ""));
      setOfferTiles([]);
      setRequestTiles([]);
      setOfferCash(0);
      setRequestCash(0);
      setOfferCards([]);
      setRequestCards([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, counter?.id]);

  const target = game.players.find((p) => p.id === toId);
  const error = useMemo(() => {
    if (!me || !target) return "Scegli un giocatore.";
    return validateTrade(asState(game), { fromId: me.id, toId: target.id, offerTiles, requestTiles, offerCash, requestCash, offerCards, requestCards });
  }, [game, me, target, offerTiles, requestTiles, offerCash, requestCash, offerCards, requestCards]);

  if (!me) return null;
  const toggle = (arr: number[], set: (v: number[]) => void, i: number) => set(arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i]);
  const toggleCard = (arr: string[], set: (v: string[]) => void, c: string) => set(arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c]);

  async function submit() {
    if (!target || error) return;
    const ok = await send({ type: "PROPOSE_TRADE", toId: target.id, offerTiles, requestTiles, offerCash, requestCash, offerCards, requestCards, counterOf: counter?.id ?? null });
    if (ok) openDialog(null);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && openDialog(null)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="size-5 text-primary" /> {counter ? "Controfferta" : "Proponi scambio"}
          </DialogTitle>
          <DialogDescription>Le proprietà di regioni con torrette o fortezze non sono scambiabili. Le proprietà ipotecate passano con l&apos;ipoteca.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Label>Destinatario</Label>
          {others.map((p) => (
            <button
              key={p.id}
              disabled={!!counter}
              onClick={() => {
                setToId(p.id);
                setRequestTiles([]);
                setRequestCards([]);
              }}
              className={cn("rounded-full border px-3 py-1 text-sm font-semibold transition disabled:cursor-not-allowed", toId === p.id ? "text-white" : "border-border text-muted-foreground hover:bg-white/5")}
              style={toId === p.id ? { background: PLAYER_COLORS[p.color].hex, borderColor: PLAYER_COLORS[p.color].hex } : undefined}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TradeSide
            title="Tu offri"
            player={me}
            game={game}
            tiles={offerTiles}
            onToggle={(i) => toggle(offerTiles, setOfferTiles, i)}
            cash={offerCash}
            onCash={setOfferCash}
            cards={offerCards}
            onCard={(c) => toggleCard(offerCards, setOfferCards, c)}
          />
          {target ? (
            <TradeSide
              title={`Chiedi a ${target.name}`}
              player={target}
              game={game}
              tiles={requestTiles}
              onToggle={(i) => toggle(requestTiles, setRequestTiles, i)}
              cash={requestCash}
              onCash={setRequestCash}
              cards={requestCards}
              onCard={(c) => toggleCard(requestCards, setRequestCards, c)}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">Nessun altro giocatore attivo.</div>
          )}
        </div>
        <DialogFooter className="items-center">
          {error && <span className="mr-auto text-xs text-amber-300">{error}</span>}
          <Button variant="outline" onClick={() => openDialog(null)}>
            Annulla
          </Button>
          <Button disabled={!!error || !!busy} onClick={submit}>
            <ArrowLeftRight /> Invia proposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TradeSide({
  title,
  player,
  game,
  tiles,
  onToggle,
  cash,
  onCash,
  cards,
  onCard,
}: {
  title: string;
  player: PlayerState;
  game: PublicGameState;
  tiles: number[];
  onToggle: (i: number) => void;
  cash: number;
  onCash: (n: number) => void;
  cards: string[];
  onCard: (c: string) => void;
}) {
  const owned = OWNABLE_TILES.filter((i) => game.ownership[i]?.ownerId === player.id);
  return (
    <div className="rounded-xl border border-border bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold" style={{ color: PLAYER_COLORS[player.color].hex }}>
          {title}
        </span>
        <span className="text-xs text-muted-foreground">saldo {cr(player.balance)} cr</span>
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto pr-1 scroll-thin">
        {owned.length === 0 && <div className="py-3 text-center text-xs text-muted-foreground">Nessuna proprietà</div>}
        {owned.map((i) => {
          const t = tileAt(i);
          const free = tileIsFreeOfBuildings(game, i);
          const color = t.district ? DISTRICTS[t.district].color : "#475569";
          return (
            <label key={i} className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-white/5", !free && "cursor-not-allowed opacity-40")}>
              <input type="checkbox" className="size-4 accent-[#f5b83d]" checked={tiles.includes(i)} disabled={!free} onChange={() => onToggle(i)} />
              <span className="size-3 rounded-sm" style={{ background: color }} />
              <span className="flex-1 truncate">{t.name}</span>
              {game.ownership[i].mortgaged && <span className="text-[10px] text-amber-300">IPOTECA</span>}
              <span className="text-xs text-muted-foreground">{t.price}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Label className="whitespace-nowrap">Crediti</Label>
        <Input type="number" min={0} max={player.balance} value={cash} onChange={(e) => onCash(Math.max(0, Math.floor(Number(e.target.value) || 0)))} className="h-9" />
      </div>
      {player.jailCards.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {player.jailCards.map((c) => (
            <button key={c} onClick={() => onCard(c)} className={cn("rounded-md border px-2 py-1 text-xs", cards.includes(c) ? "border-primary bg-primary/15 text-primary" : "border-border")}>
              🎟️ {getCard(c).title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TradeSummary({ trade, game }: { trade: TradeOffer; game: PublicGameState }) {
  const from = game.players.find((p) => p.id === trade.fromId);
  const to = game.players.find((p) => p.id === trade.toId);
  const items = (tiles: number[], cash: number, cards: string[]) => {
    const parts = [...tiles.map((i) => tileAt(i).name), ...(cash ? [`${cr(cash)} cr`] : []), ...cards.map(() => "📜 pergamena d'evasione")];
    return parts.length ? parts.join(", ") : "nulla";
  };
  return (
    <div className="text-xs leading-relaxed">
      <span className="font-bold" style={{ color: from ? PLAYER_COLORS[from.color].hex : undefined }}>
        {from?.name}
      </span>{" "}
      offre <span className="text-foreground">{items(trade.offerTiles, trade.offerCash, trade.offerCards)}</span> e chiede a{" "}
      <span className="font-bold" style={{ color: to ? PLAYER_COLORS[to.color].hex : undefined }}>
        {to?.name}
      </span>{" "}
      <span className="text-foreground">{items(trade.requestTiles, trade.requestCash, trade.requestCards)}</span>
    </div>
  );
}

// ----------------------------------------------------------- Portfolio ----
export function PortfolioDialog() {
  const { game, dialog, openDialog, setSelectedTile } = useGame();
  const open = dialog?.kind === "portfolio";
  const p = open ? game.players.find((x) => x.id === dialog?.arg) : undefined;
  return (
    <Dialog open={open && !!p} onOpenChange={(o) => !o && openDialog(null)}>
      <DialogContent className="max-w-xl">
        {p && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="text-2xl">{p.avatar}</span>
                <span style={{ color: PLAYER_COLORS[p.color].hex }}>{p.name}</span>
              </DialogTitle>
              <DialogDescription>
                Liquidità {cr(p.balance)} cr · {ownedTiles(game, p.id).length} proprietà · {p.stats.buildingsBuilt} edifici costruiti
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              {ownedTiles(game, p.id)
                .sort((a, b) => a.tile - b.tile)
                .map((o) => {
                  const t = tileAt(o.tile);
                  const color = t.district ? DISTRICTS[t.district].color : "#475569";
                  return (
                    <button
                      key={o.tile}
                      onClick={() => {
                        setSelectedTile(o.tile);
                        openDialog(null);
                      }}
                      className="flex items-center gap-2 rounded-lg border border-border bg-black/20 px-2 py-1.5 text-left text-sm hover:bg-white/5"
                    >
                      <span className="h-6 w-1.5 rounded-full" style={{ background: color }} />
                      <span className="flex-1 truncate">{t.name}</span>
                      {o.houses > 0 && <span className="text-xs text-green-400">{o.houses === 5 ? "🏰" : "🗼".repeat(o.houses)}</span>}
                      {o.mortgaged && <span className="text-[10px] font-bold text-amber-300">IPOTECA</span>}
                    </button>
                  );
                })}
              {ownedTiles(game, p.id).length === 0 && <p className="col-span-2 py-6 text-center text-muted-foreground">Nessuna proprietà.</p>}
            </div>
            {p.jailCards.length > 0 && <div className="text-sm text-sky-300">📜 Pergamene d&apos;evasione: {p.jailCards.length}</div>}
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
              <span>Acquisti: {p.stats.propertiesBought}</span>
              <span>Edifici: {p.stats.buildingsBuilt}</span>
              <span>Affitti pagati: {cr(p.stats.rentPaid)}</span>
              <span>Affitti incassati: {cr(p.stats.rentReceived)}</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------- Spotlight ----
export interface SpotlightItem {
  id: number;
  kind: "card" | "rent" | "jail" | "bankrupt" | "info";
  title: string;
  text: string;
  color?: string;
  deck?: "chance" | "community";
}

export function Spotlight({ item, onDone }: { item: SpotlightItem | null; onDone: () => void }) {
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(onDone, item.kind === "card" ? 4200 : 3000);
    return () => clearTimeout(t);
  }, [item, onDone]);
  return (
    <AnimatePresence>
      {item && (
        <motion.div
          key={item.id}
          className="fixed inset-0 z-[45] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDone}
        >
          <div className="absolute inset-0 bg-black/30" />
          <motion.div
            initial={{ rotateY: 90, scale: 0.7 }}
            animate={{ rotateY: 0, scale: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 20 }}
            className={cn(
              "relative w-full max-w-sm overflow-hidden rounded-2xl p-6 text-center shadow-2xl",
              item.kind === "card"
                ? item.deck === "chance"
                  ? "bg-gradient-to-b from-[#f1e9ff] to-[#cdb6fa] text-[#3b0f8c]"
                  : "bg-gradient-to-b from-[#fff4d6] to-[#fde6a6] text-[#5a3a05]"
                : "glass text-foreground",
            )}
            style={item.color ? { boxShadow: `0 0 0 3px ${item.color}, 0 30px 60px -20px rgba(0,0,0,0.7)` } : undefined}
          >
            <div className="text-xs font-bold uppercase tracking-[0.3em] opacity-70">
              {item.kind === "card" ? (item.deck === "chance" ? "Destino Arcano" : "Tesoro della Gilda") : item.kind === "rent" ? "Affitto" : item.kind === "jail" ? "Segrete del Re" : item.kind === "bankrupt" ? "Bancarotta" : "Avviso"}
            </div>
            <div className="mt-2 font-display text-2xl font-extrabold">{item.title}</div>
            <p className="mt-3 text-sm leading-relaxed opacity-90">{item.text}</p>
            <div className="mt-4 text-[11px] opacity-60">tocca per chiudere</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
