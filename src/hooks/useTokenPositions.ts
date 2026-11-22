"use client";

import { useEffect, useRef, useState } from "react";
import { BOARD_SIZE, type GameEvent, type PublicGameState } from "@/lib/game/types";

const STEP_MS = 105;
const JUMP_MS = 320;

type Step = { pos: number; ms: number };

/**
 * Display-only token positions. When the authoritative state changes, tokens
 * walk tile-by-tile along the path described by the new "move"/"jail" events.
 * If events were missed (reconnect), tokens snap to the official position.
 * The animation never affects game logic: the server position is the truth.
 */
export function useTokenPositions(game: PublicGameState): Record<string, number> {
  const [display, setDisplay] = useState<Record<string, number>>(() =>
    Object.fromEntries(game.players.map((p) => [p.id, p.position])),
  );
  const displayRef = useRef(display);
  displayRef.current = display;
  const queues = useRef<Record<string, Step[]>>({});
  const lastSeq = useRef<number>(Math.max(0, ...game.log.map((e) => e.seq)));
  const gameId = useRef(game.id);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (gameId.current !== game.id) {
      gameId.current = game.id;
      queues.current = {};
      lastSeq.current = Math.max(0, ...game.log.map((e) => e.seq));
      setDisplay(Object.fromEntries(game.players.map((p) => [p.id, p.position])));
      return;
    }
    const fresh = game.log.filter((e) => e.seq > lastSeq.current);
    const minSeqInLog = game.log.length ? game.log[0].seq : 0;
    const gap = fresh.length > 0 && minSeqInLog > lastSeq.current + 1;
    if (fresh.length) lastSeq.current = Math.max(...fresh.map((e) => e.seq));

    for (const p of game.players) {
      const target = p.position;
      const q = queues.current[p.id] ?? [];
      const tail = q.length ? q[q.length - 1].pos : displayRef.current[p.id] ?? target;
      if (gap) {
        queues.current[p.id] = [{ pos: target, ms: JUMP_MS }];
        continue;
      }
      const evs = fresh.filter((e) => e.playerId === p.id && (e.type === "move" || e.type === "jail"));
      const steps = buildPath(tail, evs);
      const end = steps.length ? steps[steps.length - 1].pos : tail;
      if (end !== target) steps.push({ pos: target, ms: JUMP_MS });
      if (steps.length) queues.current[p.id] = [...q, ...steps];
    }
    pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, game.version]);

  function pump() {
    if (timer.current) return;
    const tick = () => {
      timer.current = null;
      let next: Record<string, number> | null = null;
      let wait = STEP_MS;
      for (const [pid, q] of Object.entries(queues.current)) {
        const step = q.shift();
        if (!step) continue;
        next = next ?? { ...displayRef.current };
        next[pid] = step.pos;
        wait = Math.max(wait, step.ms);
      }
      if (next) {
        displayRef.current = next;
        setDisplay(next);
        timer.current = setTimeout(tick, wait);
      }
    };
    timer.current = setTimeout(tick, 60);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null; // StrictMode re-mounts: allow the pump to restart
    },
    [],
  );

  return display;
}

function buildPath(start: number, events: GameEvent[]): Step[] {
  const out: Step[] = [];
  let cur = start;
  for (const e of events) {
    const d = (e.data ?? {}) as { from?: number; to?: number; steps?: number; mode?: string };
    if (e.type === "jail" || d.mode === "jump") {
      if (typeof d.to === "number") {
        out.push({ pos: d.to, ms: JUMP_MS });
        cur = d.to;
      }
      continue;
    }
    if (typeof d.from === "number" && d.from !== cur) {
      out.push({ pos: d.from, ms: JUMP_MS });
      cur = d.from;
    }
    const steps = d.steps ?? 0;
    const dir = steps >= 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(steps); i++) {
      cur = (((cur + dir) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
      out.push({ pos: cur, ms: STEP_MS });
    }
  }
  return out;
}
