"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Building2, Coins, Handshake, KeyRound, Lock, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { CitySkyline, Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, Spinner } from "@/components/ui/misc";
import { api, ApiClientError } from "@/lib/client/api";
import { isLocalMode, loadSavedName, saveName } from "@/lib/client/session";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  useEffect(() => {
    setName(loadSavedName());
  }, []);

  const cleanName = name.trim().slice(0, 20);

  async function create() {
    if (!cleanName) return toast.error("Scegli un nome (max 20 caratteri).");
    if (usePassword && password.length < 3) return toast.error("La password deve avere almeno 3 caratteri.");
    setBusy("create");
    saveName(cleanName);
    try {
      const res = await api<{ code: string }>("/api/rooms", {
        body: { name: cleanName, maxPlayers, password: usePassword ? password : null },
      });
      router.push(`/room/${res.code}`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Impossibile creare la stanza. Controlla la connessione.");
      setBusy(null);
    }
  }

  function join() {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(c)) return toast.error("Il codice stanza ha 6 caratteri.");
    if (cleanName) saveName(cleanName);
    setBusy("join");
    router.push(`/room/${c}`);
  }

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <CitySkyline className="absolute inset-x-0 bottom-0 h-[55vh] w-full opacity-90" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-24 size-[620px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,184,61,0.18),transparent_60%)]" />

      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-4 py-8 sm:px-6">
        <header className="flex items-center justify-between">
          <Logo size="sm" />
          {isLocalMode && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
              Modalità locale (sviluppo)
            </span>
          )}
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.1fr_1fr]">
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Logo size="lg" />
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Il gioco da tavolo immobiliare per <strong className="text-foreground">fino a 8 amici online</strong>. Conquista le regioni di Valoria,
              erigi torrette e fortezze, tratta senza pietà e manda in bancarotta gli avversari su plance da 40, 48 o 64 caselle.
            </p>
            <div className="mt-8 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: Users, t: "Fino a 8", d: "giocatori in tempo reale" },
                { icon: Building2, t: "3 plance", d: "40 · 48 · 64 caselle" },
                { icon: Coins, t: "Aste live", d: "con timer" },
                { icon: Handshake, t: "Scambi", d: "e controfferte" },
              ].map(({ icon: Icon, t, d }) => (
                <div key={t} className="glass rounded-xl p-3">
                  <Icon className="size-5 text-primary" />
                  <div className="mt-2 text-sm font-bold">{t}</div>
                  <div className="text-xs text-muted-foreground">{d}</div>
                </div>
              ))}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full"
          >
            <Card className="p-5 sm:p-6">
              <div className="space-y-2">
                <Label htmlFor="name">Il tuo nome</Label>
                <Input
                  id="name"
                  placeholder="Es. Magnate Marco"
                  value={name}
                  maxLength={20}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="nickname"
                />
              </div>

              <div className="mt-6 rounded-xl border border-border bg-black/20 p-4">
                <div className="flex items-center gap-2 font-display text-lg font-bold">
                  <Plus className="size-5 text-primary" /> Crea partita
                </div>
                <div className="mt-3">
                  <Label>Giocatori massimi</Label>
                  <div className="mt-2 grid grid-cols-7 gap-1.5">
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setMaxPlayers(n)}
                        className={cn(
                          "h-10 rounded-lg border text-sm font-bold transition",
                          maxPlayers === n ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-white/5",
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {maxPlayers > 6
                      ? "Con 7–8 giocatori si usa la plancia Maxi da 64 caselle."
                      : "Plancia Standard da 48 caselle: puoi cambiarla nella lobby (Classica 40 per 2–4 giocatori, Standard 48, Maxi 64)."}
                  </p>
                </div>
                <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} className="size-4 accent-[#f5b83d]" />
                  <Lock className="size-4 text-muted-foreground" /> Proteggi con password
                </label>
                {usePassword && (
                  <Input
                    className="mt-2"
                    type="password"
                    placeholder="Password della stanza"
                    value={password}
                    maxLength={64}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
                <Button size="lg" className="mt-4 w-full" onClick={create} disabled={busy !== null}>
                  {busy === "create" ? <Spinner /> : <Plus />} Crea partita
                </Button>
              </div>

              <div className="mt-4 rounded-xl border border-border bg-black/20 p-4">
                <div className="flex items-center gap-2 font-display text-lg font-bold">
                  <KeyRound className="size-5 text-accent" /> Unisciti a una partita
                </div>
                <div className="mt-3 flex gap-2">
                  <Input
                    placeholder="CODICE"
                    value={code}
                    maxLength={6}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && join()}
                    className="text-center font-mono text-lg font-bold tracking-[0.4em] uppercase"
                  />
                  <Button variant="accent" size="lg" onClick={join} disabled={busy !== null}>
                    {busy === "join" ? <Spinner /> : <ArrowRight />} Entra
                  </Button>
                </div>
              </div>
            </Card>
          </motion.section>
        </div>
        <footer className="relative pb-2 text-center text-xs text-muted-foreground/70">
          Empire City è un gioco originale ispirato ai classici giochi di compravendita immobiliare.
        </footer>
      </div>
    </main>
  );
}
