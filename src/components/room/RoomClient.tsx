"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DoorOpen, Lock, LogIn } from "lucide-react";
import { toast } from "sonner";
import { CitySkyline, Logo } from "@/components/brand";
import { GameScreen } from "@/components/game/GameScreen";
import { Lobby } from "@/components/lobby/Lobby";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, Spinner, TooltipProvider } from "@/components/ui/misc";
import { useRoom } from "@/hooks/useRoom";
import { api, ApiClientError } from "@/lib/client/api";
import { loadSavedName, saveName } from "@/lib/client/session";
import type { RoomSnapshot } from "@/lib/server/rooms";

export default function RoomClient({ code }: { code: string }) {
  const room = useRoom(code);

  if (room.loading) {
    return (
      <FullScreen>
        <Spinner className="size-8 text-primary" />
        <p className="mt-4 text-muted-foreground">Connessione alla stanza {code}…</p>
      </FullScreen>
    );
  }

  if (room.error && !room.snapshot) {
    return (
      <FullScreen>
        <Card className="max-w-md p-6 text-center">
          <h1 className="font-display text-2xl font-bold">Stanza non disponibile</h1>
          <p className="mt-2 text-muted-foreground">{room.error}</p>
          <Button asChild className="mt-5">
            <Link href="/">Torna alla home</Link>
          </Button>
        </Card>
      </FullScreen>
    );
  }

  if (room.preview) {
    return <JoinGate code={code} preview={room.preview} onJoined={room.applySnapshot} />;
  }

  const snap = room.snapshot!;
  return (
    <TooltipProvider>
      {snap.room.status === "lobby" || !room.game ? <Lobby room={room} code={code} /> : <GameScreen room={room} code={code} />}
    </TooltipProvider>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4">
      <CitySkyline className="absolute inset-x-0 bottom-0 h-[40vh] w-full opacity-60" />
      <div className="relative flex flex-col items-center">{children}</div>
    </main>
  );
}

function JoinGate({
  code,
  preview,
  onJoined,
}: {
  code: string;
  preview: NonNullable<ReturnType<typeof useRoom>["preview"]>;
  onJoined: (s: RoomSnapshot) => void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(loadSavedName()), []);

  async function join() {
    const n = name.trim().slice(0, 20);
    if (!n) return toast.error("Scegli un nome.");
    setBusy(true);
    saveName(n);
    try {
      const snap = await api<RoomSnapshot>(`/api/rooms/${code}/join`, { body: { name: n, password: password || null } });
      onJoined(snap);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Impossibile entrare nella stanza.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FullScreen>
      <Logo className="mb-6" />
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">Stanza {code}</h1>
          <span className="rounded-full bg-white/5 px-3 py-1 text-sm font-semibold">
            {preview.playerCount}/{preview.maxPlayers}
          </span>
        </div>
        {!preview.canJoin ? (
          <>
            <p className="mt-3 text-muted-foreground">{preview.reason}</p>
            <Button asChild variant="secondary" className="mt-5 w-full">
              <Link href="/">
                <DoorOpen /> Torna alla home
              </Link>
            </Button>
          </>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="jn">Il tuo nome</Label>
              <Input id="jn" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && join()} />
            </div>
            {preview.hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="jp" className="flex items-center gap-1">
                  <Lock className="size-3" /> Password della stanza
                </Label>
                <Input id="jp" type="password" value={password} maxLength={64} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && join()} />
              </div>
            )}
            <Button size="lg" className="w-full" onClick={join} disabled={busy}>
              {busy ? <Spinner /> : <LogIn />} Entra nella stanza
            </Button>
          </div>
        )}
      </Card>
    </FullScreen>
  );
}
