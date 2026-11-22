"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { useRoom } from "@/hooks/useRoom";
import { ApiClientError, sendCommand } from "@/lib/client/api";
import type { Command, CommandType, PlayerState, PublicGameState } from "@/lib/game/types";

type Room = ReturnType<typeof useRoom>;

export interface GameCtx {
  room: Room;
  code: string;
  game: PublicGameState;
  me: PlayerState | undefined;
  myUserId: string | null;
  isMyTurn: boolean;
  isSpectator: boolean;
  busy: CommandType | null;
  send: (cmd: Command, opts?: { silent?: boolean }) => Promise<boolean>;
  now: () => number;
  selectedTile: number | null;
  setSelectedTile: (t: number | null) => void;
  openDialog: (d: DialogKind | null, arg?: unknown) => void;
  dialog: { kind: DialogKind; arg?: unknown } | null;
}

export type DialogKind = "manage" | "trade" | "portfolio";

const Ctx = createContext<GameCtx | null>(null);

export function useGame(): GameCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGame outside provider");
  return c;
}

export function GameProvider({ room, code, children }: { room: Room; code: string; children: React.ReactNode }) {
  const game = room.game!;
  const myUserId = room.myUserId;
  const me = game.players.find((p) => p.userId === myUserId);
  const [busy, setBusy] = useState<CommandType | null>(null);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{ kind: DialogKind; arg?: unknown } | null>(null);
  const offsetRef = useRef(room.clockOffset);
  offsetRef.current = room.clockOffset;
  const gameIdRef = useRef(game.id);
  gameIdRef.current = game.id;
  const { applyGame, refresh } = room;

  const send = useCallback(
    async (cmd: Command, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setBusy(cmd.type);
      try {
        const res = await sendCommand(gameIdRef.current, cmd);
        if (res.state) applyGame(res.state);
        return true;
      } catch (e) {
        const err = e as ApiClientError & { state?: PublicGameState };
        if (err?.state) applyGame(err.state);
        if (!opts?.silent) toast.error(err instanceof ApiClientError ? err.message : "Connessione assente: riprova.");
        if (!(err instanceof ApiClientError)) void refresh();
        return false;
      } finally {
        if (!opts?.silent) setBusy(null);
      }
    },
    [applyGame, refresh],
  );

  const now = useCallback(() => Date.now() + offsetRef.current, []);

  const value = useMemo<GameCtx>(
    () => ({
      room,
      code,
      game,
      me,
      myUserId,
      isMyTurn: !!me && me.status === "active" && game.turn.playerId === me.id && game.status === "active",
      isSpectator: !me || me.status !== "active",
      busy,
      send,
      now,
      selectedTile,
      setSelectedTile,
      dialog,
      openDialog: (kind, arg) => setDialog(kind ? { kind, arg } : null),
    }),
    [room, code, game, me, myUserId, busy, send, now, selectedTile, dialog],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
