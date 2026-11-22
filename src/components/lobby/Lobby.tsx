"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Copy, Crown, Link2, LogOut, Play, Settings2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { Chat } from "@/components/room/Chat";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge, Card, Hint, Spinner, Switch } from "@/components/ui/misc";
import type { useRoom } from "@/hooks/useRoom";
import { api, ApiClientError } from "@/lib/client/api";
import { isLocalMode, saveName } from "@/lib/client/session";
import { AVATAR_OPTIONS, COLOR_ORDER, PLAYER_COLORS, TOKEN_ICONS, TOKEN_ORDER } from "@/lib/client/ui-constants";
import type { GameSettings } from "@/lib/game/types";
import type { RoomPlayerView, RoomSnapshot } from "@/lib/server/rooms";
import { cn } from "@/lib/utils";

type Room = ReturnType<typeof useRoom>;

export function Lobby({ room, code }: { room: Room; code: string }) {
  const router = useRouter();
  const snap = room.snapshot!;
  const me = snap.me;
  const isHost = snap.room.hostUserId === me.userId;
  const [busy, setBusy] = useState<string | null>(null);

  async function mutate(action: string, body?: unknown, label = action) {
    setBusy(label);
    try {
      const res = await api<RoomSnapshot>(`/api/rooms/${code}/${action}`, { body: body ?? {} });
      room.applySnapshot(res);
      return true;
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Operazione non riuscita.");
      void room.refresh();
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function leave() {
    setBusy("leave");
    try {
      await api(`/api/rooms/${code}/leave`, { body: {} });
      router.push("/");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Impossibile uscire.");
      setBusy(null);
    }
  }

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${code}` : `/room/${code}`;
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copiato!`);
    } catch {
      toast.error("Copia non riuscita: seleziona e copia manualmente.");
    }
  };

  const allReady = snap.players.every((p) => p.isReady);
  const canStart = isHost && snap.players.length >= 2 && allReady;
  const startReason =
    snap.players.length < 2
      ? "Servono almeno 2 giocatori."
      : !allReady
        ? `In attesa di: ${snap.players.filter((p) => !p.isReady).map((p) => p.name).join(", ")}`
        : undefined;

  const isOnline = (p: RoomPlayerView) => isLocalMode || room.online.has(p.userId) || p.userId === me.userId;

  return (
    <main className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-4 px-3 py-4 sm:px-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Logo size="sm" />
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionBadge state={room.connection} />
          <button
            onClick={() => copy(code, "Codice")}
            className="glass flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-lg font-bold tracking-[0.3em] transition hover:brightness-125"
            title="Copia codice"
          >
            {code} <Copy className="size-4 text-muted-foreground" />
          </button>
          <Button variant="secondary" onClick={() => copy(inviteUrl, "Link d'invito")}>
            <Link2 /> Copia invito
          </Button>
          <Button variant="outline" onClick={leave} disabled={busy === "leave"}>
            <LogOut /> Esci
          </Button>
        </div>
      </header>

      <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">Giocatori</h2>
              <span className="text-sm text-muted-foreground">
                {snap.players.length}/{snap.room.maxPlayers} posti · {snap.room.maxPlayers - snap.players.length} liberi
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: snap.room.maxPlayers }).map((_, i) => {
                const p = snap.players[i];
                if (!p)
                  return (
                    <div key={`empty-${i}`} className="flex h-28 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                      Posto libero
                    </div>
                  );
                const c = PLAYER_COLORS[p.color];
                const Icon = TOKEN_ICONS[p.token].icon;
                return (
                  <motion.div
                    layout
                    key={p.id}
                    className={cn("relative rounded-xl border p-3", p.userId === me.userId ? "border-primary/60" : "border-border")}
                    style={{ background: `linear-gradient(160deg, ${c.soft}, rgba(10,15,28,0.6))` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="flex size-12 items-center justify-center rounded-full text-2xl" style={{ background: "rgba(0,0,0,0.35)" }}>
                          {p.avatar}
                        </div>
                        <div
                          className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border-2 border-[#0f1626]"
                          style={{ background: c.hex }}
                        >
                          <Icon className="size-3.5 text-white" />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 truncate font-bold">
                          {p.isHost && <Crown className="size-4 shrink-0 text-primary" />}
                          <span className="truncate">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={cn("size-2 rounded-full", isOnline(p) ? "bg-green-400" : "bg-zinc-500")} />
                          {isOnline(p) ? "online" : "disconnesso"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      {p.isReady ? (
                        <Badge className="border-green-500/40 bg-green-500/15 text-green-300">
                          <Check className="size-3" /> Pronto
                        </Badge>
                      ) : (
                        <Badge className="text-muted-foreground">Non pronto</Badge>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <ProfileCard me={me} players={snap.players} busy={busy} mutate={mutate} />
            <SettingsCard snap={snap} isHost={isHost} busy={busy} mutate={mutate} />
          </div>

          <Card className="flex flex-col items-center gap-3 p-4 sm:flex-row sm:justify-between">
            <Button
              size="lg"
              variant={me.isReady ? "secondary" : "success"}
              onClick={() => mutate("ready", { ready: !me.isReady }, "ready")}
              disabled={busy === "ready"}
              className="w-full sm:w-auto"
            >
              {busy === "ready" ? <Spinner /> : <Check />} {me.isReady ? "Non sono pronto" : "Sono pronto!"}
            </Button>
            {isHost ? (
              <Hint label={!canStart ? startReason : undefined}>
                <Button size="xl" onClick={() => mutate("start", {}, "start")} disabled={!canStart || busy === "start"} className="w-full sm:w-auto">
                  {busy === "start" ? <Spinner /> : <Play />} Avvia partita
                </Button>
              </Hint>
            ) : (
              <p className="text-sm text-muted-foreground">
                Solo l&apos;host può avviare la partita {startReason ? `· ${startReason}` : "· tutti pronti!"}
              </p>
            )}
          </Card>
        </div>

        <Card className="flex h-[70dvh] flex-col p-4 lg:h-auto">
          <h2 className="mb-2 font-display text-lg font-bold">Chat della stanza</h2>
          <Chat
            code={code}
            messages={room.chat}
            myUserId={room.myUserId}
            enabled={snap.room.settings.chatEnabled}
            onSent={room.appendChat}
            className="flex-1"
          />
        </Card>
      </div>
    </main>
  );
}

export function ConnectionBadge({ state }: { state: Room["connection"] }) {
  if (state === "live")
    return (
      <Badge className="border-green-500/40 text-green-300">
        <Wifi className="size-3" /> Live
      </Badge>
    );
  if (state === "polling")
    return (
      <Badge className="border-amber-500/40 text-amber-300">
        <Wifi className="size-3" /> {isLocalMode ? "Locale" : "Sync"}
      </Badge>
    );
  if (state === "offline")
    return (
      <Badge className="border-red-500/40 text-red-300">
        <WifiOff className="size-3" /> Offline
      </Badge>
    );
  return (
    <Badge className="text-muted-foreground">
      <Spinner className="size-3" /> Connessione
    </Badge>
  );
}

function ProfileCard({
  me,
  players,
  busy,
  mutate,
}: {
  me: RoomPlayerView;
  players: RoomPlayerView[];
  busy: string | null;
  mutate: (a: string, b?: unknown, l?: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(me.name);
  useEffect(() => setName(me.name), [me.name]);
  const taken = new Set(players.filter((p) => p.userId !== me.userId).map((p) => p.color));

  const saveNameNow = async () => {
    const n = name.trim().slice(0, 20);
    if (!n || n === me.name) return;
    if (await mutate("profile", { name: n }, "name")) saveName(n);
  };

  return (
    <Card className="p-4">
      <h2 className="mb-3 font-display text-lg font-bold">La tua pedina</h2>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Nome visualizzato</Label>
          <div className="flex gap-2">
            <Input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} onBlur={saveNameNow} onKeyDown={(e) => e.key === "Enter" && saveNameNow()} />
            <Button variant="secondary" onClick={saveNameNow} disabled={busy === "name" || name.trim() === me.name}>
              Salva
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Colore</Label>
          <div className="flex flex-wrap gap-2">
            {COLOR_ORDER.map((c) => {
              const t = taken.has(c);
              const sel = me.color === c;
              return (
                <Hint key={c} label={t ? `${PLAYER_COLORS[c].label}: già scelto` : PLAYER_COLORS[c].label}>
                  <button
                    type="button"
                    disabled={t || busy === "color"}
                    onClick={() => !sel && mutate("profile", { color: c }, "color")}
                    className={cn(
                      "relative size-10 rounded-full border-2 transition",
                      sel ? "scale-110 border-white" : "border-transparent hover:scale-105",
                      t && "cursor-not-allowed opacity-25",
                    )}
                    style={{ background: PLAYER_COLORS[c].hex }}
                    aria-label={PLAYER_COLORS[c].label}
                  >
                    {sel && <Check className="absolute inset-0 m-auto size-5 text-white" />}
                  </button>
                </Hint>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Pedina</Label>
          <div className="grid grid-cols-5 gap-2">
            {TOKEN_ORDER.map((t) => {
              const Icon = TOKEN_ICONS[t].icon;
              const sel = me.token === t;
              return (
                <Hint key={t} label={TOKEN_ICONS[t].label}>
                  <button
                    type="button"
                    onClick={() => !sel && mutate("profile", { token: t }, "token")}
                    className={cn(
                      "flex h-11 w-full items-center justify-center rounded-lg border transition",
                      sel ? "border-primary bg-primary/15" : "border-border hover:bg-white/5",
                    )}
                    aria-label={TOKEN_ICONS[t].label}
                  >
                    <Icon className="size-5" style={{ color: sel ? PLAYER_COLORS[me.color].hex : undefined }} />
                  </button>
                </Hint>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Avatar</Label>
          <div className="flex flex-wrap gap-1.5">
            {AVATAR_OPTIONS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => me.avatar !== a && mutate("profile", { avatar: a }, "avatar")}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg border text-lg transition",
                  me.avatar === a ? "border-primary bg-primary/15" : "border-transparent hover:bg-white/5",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

function SettingSelect({
  value,
  options,
  onChange,
  suffix,
  disabled,
}: {
  value: number;
  options: number[];
  onChange: (n: number) => void;
  suffix?: string;
  disabled: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-9 rounded-lg border border-border bg-[#0b1222] px-2 text-sm font-semibold disabled:opacity-60"
    >
      {[...new Set([...options, value])]
        .sort((a, b) => a - b)
        .map((o) => (
          <option key={o} value={o}>
            {o === 0 && suffix === " min" ? "Nessun limite" : `${o.toLocaleString("it-IT")}${suffix ?? ""}`}
          </option>
        ))}
    </select>
  );
}

function SettingsCard({
  snap,
  isHost,
  busy,
  mutate,
}: {
  snap: RoomSnapshot;
  isHost: boolean;
  busy: string | null;
  mutate: (a: string, b?: unknown, l?: string) => Promise<boolean>;
}) {
  const s = snap.room.settings;
  const [pw, setPw] = useState("");
  const set = (patch: Partial<GameSettings>) => mutate("settings", { settings: patch }, "settings");
  const disabled = !isHost || busy === "settings";
  const Select = (props: { value: number; options: number[]; onChange: (n: number) => void; suffix?: string }) => (
    <SettingSelect {...props} disabled={disabled} />
  );

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Settings2 className="size-5 text-primary" /> Impostazioni
        </h2>
        {!isHost && <Badge className="text-muted-foreground">Solo host</Badge>}
      </div>
      <div className="divide-y divide-border/60">
        <Row label="Giocatori massimi">
          <Select value={snap.room.maxPlayers} options={[2, 3, 4, 5, 6]} onChange={(n) => set({ maxPlayers: n })} />
        </Row>
        <Row label="Capitale iniziale">
          <Select value={s.startingCash} options={[1000, 1500, 2000, 2500, 3000, 5000]} onChange={(n) => set({ startingCash: n })} suffix=" cr" />
        </Row>
        <Row label="Bonus Partenza">
          <Select value={s.goBonus} options={[100, 150, 200, 250, 300, 400]} onChange={(n) => set({ goBonus: n })} suffix=" cr" />
        </Row>
        <Row label="Durata turno">
          <Select value={s.turnSeconds} options={[45, 60, 90, 120, 180, 300]} onChange={(n) => set({ turnSeconds: n })} suffix=" s" />
        </Row>
        <Row label="Durata massima partita">
          <Select value={s.maxDurationMinutes} options={[0, 30, 45, 60, 90, 120, 180]} onChange={(n) => set({ maxDurationMinutes: n })} suffix=" min" />
        </Row>
        <Row label="Aste">
          <Switch checked={s.auctionsEnabled} disabled={disabled} onCheckedChange={(v) => set({ auctionsEnabled: v })} />
        </Row>
        <Row label="Chat">
          <Switch checked={s.chatEnabled} disabled={disabled} onCheckedChange={(v) => set({ chatEnabled: v })} />
        </Row>
        <Row label={snap.room.hasPassword ? "Password: attiva" : "Password: nessuna"}>
          {isHost ? (
            <div className="flex gap-1.5">
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Nuova" className="h-9 w-28" maxLength={64} />
              <Button size="sm" variant="secondary" disabled={pw.length < 3 || busy === "settings"} onClick={async () => (await mutate("settings", { password: pw }, "settings")) && setPw("")}>
                Imposta
              </Button>
              {snap.room.hasPassword && (
                <Button size="sm" variant="outline" disabled={busy === "settings"} onClick={() => mutate("settings", { password: null }, "settings")}>
                  Rimuovi
                </Button>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">{snap.room.hasPassword ? "🔒" : "—"}</span>
          )}
        </Row>
      </div>
      {s.maxDurationMinutes > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Allo scadere del tempo vince il giocatore con il patrimonio netto più alto (liquidità + valore proprietà ed edifici).
        </p>
      )}
    </Card>
  );
}
