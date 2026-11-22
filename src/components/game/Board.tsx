"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gavel, Maximize2, Minus, Plus, Timer } from "lucide-react";
import { LogoMark } from "@/components/brand";
import { useGame } from "@/components/game/context";
import { Dice } from "@/components/game/Dice";
import { Tile } from "@/components/game/Tile";
import { useNow } from "@/hooks/useNow";
import { useTokenPositions } from "@/hooks/useTokenPositions";
import { boardOf, tileAt, tileGridPosition, tileSide, type BoardDef } from "@/lib/game/board";
import { DECK_NAMES } from "@/lib/game/cards";
import { activeDeadline, phaseLabel } from "@/lib/game/engine";
import { PLAYER_COLORS, TOKEN_ICONS, cr } from "@/lib/client/ui-constants";
import type { PlayerState } from "@/lib/game/types";
import { cn } from "@/lib/utils";

/** Corner cells are CORNER units wide; edge cells 1 unit. Grid = (perSide+1)². */
const CORNER = 1.55;

/** Board geometry derived from tiles per side (10 / 12 / 16). */
export function boardGeometry(board: BoardDef) {
  const perSide = board.perSide;
  const cells = perSide + 1;
  const units = CORNER * 2 + (perSide - 1);
  // Scale relative to the original 13×13 board; text never shrinks below 86%.
  const ratio = 13 / cells;
  return { perSide, cells, units, scale: Math.max(0.86, ratio), tokenPct: 3.1 * ratio };
}

function axisCenter(i: number, cells: number, units: number): number {
  const start = i === 1 ? 0 : i === cells ? CORNER + (cells - 2) : CORNER + (i - 2);
  const width = i === 1 || i === cells ? CORNER : 1;
  return ((start + width / 2) / units) * 100;
}

export function tileCenter(index: number, board: BoardDef): { x: number; y: number } {
  const g = boardGeometry(board);
  const { row, col } = tileGridPosition(index, g.perSide);
  return { x: axisCenter(col, g.cells, g.units), y: axisCenter(row, g.cells, g.units) };
}

function formationOffset(index: number, k: number, n: number, board: BoardDef): { dx: number; dy: number } {
  if (n <= 1) return { dx: 0, dy: 0 };
  const { perSide, tokenPct: TOKEN_PCT } = boardGeometry(board);
  const side = tileSide(index, perSide);
  const tall = (side === 0 || side === 2) && index % perSide !== 0;
  const cols = tall ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const c = k % cols;
  const r = Math.floor(k / cols);
  const usedCols = Math.min(cols, n - r * cols);
  const gap = TOKEN_PCT * 1.02;
  return { dx: (c - (usedCols - 1) / 2) * gap, dy: (r - (rows - 1) / 2) * gap };
}

/** Responsive square board with zoom & pan (mostly for phones/tablets). */
export function BoardViewport() {
  const { game } = useGame();
  const bigBoard = boardOf(game).perSide > 12;
  const outer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize(Math.max(280, Math.floor(Math.min(r.width, r.height || r.width))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (scale === 1) setPan({ x: 0, y: 0 });
  }, [scale]);

  const clampPan = (x: number, y: number) => {
    const max = (size * (scale - 1)) / 2;
    return { x: Math.max(-max, Math.min(max, x)), y: Math.max(-max, Math.min(max, y)) };
  };

  return (
    <div ref={outer} className="relative flex h-full min-h-[300px] w-full items-center justify-center overflow-hidden">
      <div
        className="relative touch-none"
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          if (scale === 1) return;
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPan(clampPan(drag.current.px + e.clientX - drag.current.x, drag.current.py + e.clientY - drag.current.y));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          setScale((s) => Math.max(1, Math.min(2.5, s - e.deltaY * 0.002)));
        }}
      >
        <div
          className="absolute inset-0 origin-center transition-transform duration-150"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        >
          {size > 0 && <Board size={size} />}
        </div>
      </div>
      <div className={cn("absolute bottom-2 right-2 z-20 flex flex-col gap-1", !bigBoard && "xl:hidden")}>
        <ZoomBtn onClick={() => setScale((s) => Math.min(2.5, s + 0.35))} label="Zoom avanti">
          <Plus className="size-4" />
        </ZoomBtn>
        <ZoomBtn onClick={() => setScale((s) => Math.max(1, s - 0.35))} label="Zoom indietro">
          <Minus className="size-4" />
        </ZoomBtn>
        <ZoomBtn onClick={() => setScale(1)} label="Adatta">
          <Maximize2 className="size-4" />
        </ZoomBtn>
      </div>
    </div>
  );
}

function ZoomBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} className="glass flex size-9 items-center justify-center rounded-lg hover:brightness-125">
      {children}
    </button>
  );
}

function Board({ size }: { size: number }) {
  const { game, selectedTile, setSelectedTile } = useGame();
  const colorOf = useMemo(() => Object.fromEntries(game.players.map((p) => [p.id, p.color])), [game.players]);
  const pending = game.turn.pendingTile ?? game.auction?.tile ?? null;
  const board = boardOf(game);
  const g = boardGeometry(board);
  const track = `${CORNER}fr repeat(${g.perSide - 1}, 1fr) ${CORNER}fr`;
  return (
    <div
      className="board-frame relative h-full w-full rounded-[1.2cqmin]"
      style={{ width: size, height: size, ["--tf" as string]: g.scale }}
    >
      <div className="board-grid overflow-hidden rounded-[1cqmin]" style={{ gridTemplateColumns: track, gridTemplateRows: track }}>
        {board.tiles.map((t) => {
          const own = game.ownership[t.index];
          return (
            <Tile
              key={t.index}
              tile={t}
              own={own}
              ownerColor={own?.ownerId ? colorOf[own.ownerId] : undefined}
              selected={selectedTile === t.index}
              highlight={pending === t.index}
              goBonus={game.settings.goBonus}
              perSide={g.perSide}
              onSelect={setSelectedTile}
            />
          );
        })}
        <div className="relative overflow-hidden" style={{ gridRow: `2 / ${g.cells}`, gridColumn: `2 / ${g.cells}` }}>
          <BoardCenter size={size} />
        </div>
      </div>
      <TokensLayer />
    </div>
  );
}

function TokensLayer() {
  const { game } = useGame();
  const display = useTokenPositions(game);
  const board = boardOf(game);
  const { tokenPct: TOKEN_PCT } = boardGeometry(board);
  const players = game.players.filter((p) => p.status === "active");
  const byTile = new Map<number, PlayerState[]>();
  for (const p of players) {
    const pos = display[p.id] ?? p.position;
    byTile.set(pos, [...(byTile.get(pos) ?? []), p]);
  }
  return (
    <div className="pointer-events-none absolute inset-0">
      {players.map((p) => {
        const pos = display[p.id] ?? p.position;
        const group = byTile.get(pos)!;
        const k = group.findIndex((x) => x.id === p.id);
        const c = tileCenter(pos, board);
        const off = formationOffset(pos, k, group.length, board);
        const Icon = TOKEN_ICONS[p.token].icon;
        const active = game.turn.playerId === p.id && game.status === "active";
        return (
          <motion.div
            key={p.id}
            className="absolute"
            style={{ width: `${TOKEN_PCT}%`, height: `${TOKEN_PCT}%`, translateX: "-50%", translateY: "-50%", zIndex: active ? 30 : 20 }}
            initial={false}
            animate={{ left: `${c.x + off.dx}%`, top: `${c.y + off.dy}%` }}
            transition={{ type: "tween", duration: 0.1, ease: "easeOut" }}
          >
            <motion.div
              key={`${pos}`}
              initial={{ y: "-35%" }}
              animate={{ y: "0%" }}
              transition={{ duration: 0.14 }}
              className={cn("relative flex h-full w-full items-center justify-center rounded-full border-[0.25cqmin] border-white", active && "pulse-ring")}
              style={{
                background: `radial-gradient(circle at 35% 30%, ${PLAYER_COLORS[p.color].hex}, ${PLAYER_COLORS[p.color].hex}cc 60%, #00000055)`,
                boxShadow: "0 0.5cqmin 1cqmin rgba(0,0,0,0.5)",
              }}
              title={p.name}
            >
              <Icon className="text-white" style={{ width: "62%", height: "62%" }} strokeWidth={2.4} />
              {p.inJail && <div className="absolute -right-[20%] -top-[20%] rounded-full bg-zinc-800 px-[0.3cqmin] text-white" style={{ fontSize: "0.9cqmin" }}>🔒</div>}
            </motion.div>
            {group.length <= 2 && (
              <div
                className="absolute left-1/2 top-[105%] -translate-x-1/2 whitespace-nowrap rounded-full px-[0.5cqmin] font-bold text-white shadow"
                style={{ fontSize: "0.85cqmin", background: PLAYER_COLORS[p.color].hex }}
              >
                {p.name}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function BoardCenter({ size }: { size: number }) {
  const { game, now } = useGame();
  const t = useNow(now, 250);
  const cur = game.players.find((p) => p.id === game.turn.playerId);
  const deadline = activeDeadline(game);
  const total = game.turn.phase === "AUCTION" ? 20_000 : game.settings.turnSeconds * 1000;
  const remaining = Math.max(0, deadline - t);
  const pct = Math.max(0, Math.min(1, remaining / total));
  const lastDice = [...game.log].reverse().find((e) => e.type === "dice");
  const recent = game.log.slice(-4).reverse();
  const CurIcon = cur ? TOKEN_ICONS[cur.token].icon : null;

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-[1.6cqmin] p-[3cqmin]"
      style={{
        background:
          "radial-gradient(circle at 50% 40%, #fffaf0 0%, #f3ecdb 55%, #e9dfc6 100%)",
      }}
    >
      {/* decorative street grid */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden>
        <defs>
          <pattern id="streets" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M0 20 H40 M20 0 V40" stroke="#2b2417" strokeWidth="6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#streets)" />
      </svg>

      <div className="relative flex items-center gap-[1.2cqmin]">
        <LogoMark className="size-[6.5cqmin]" />
        <div className="font-display font-extrabold leading-none tracking-tight text-[#2b2417]" style={{ fontSize: "5.2cqmin" }}>
          EMPIRE <span className="text-[#c98a17]">CITY</span>
        </div>
      </div>

      {game.status === "active" && cur && (
        <div
          className="relative flex items-center gap-[1.2cqmin] rounded-[1.4cqmin] border bg-white/80 px-[1.8cqmin] py-[1cqmin] shadow-lg"
          style={{ borderColor: PLAYER_COLORS[cur.color].hex }}
        >
          <div className="flex items-center justify-center rounded-full" style={{ width: "4.4cqmin", height: "4.4cqmin", background: PLAYER_COLORS[cur.color].hex }}>
            {CurIcon && <CurIcon className="text-white" style={{ width: "60%", height: "60%" }} />}
          </div>
          <div className="leading-tight text-[#2b2417]">
            <div className="font-semibold uppercase tracking-wider text-[#2b2417]/60" style={{ fontSize: "1.2cqmin" }}>
              Turno {game.turn.number} · {phaseLabel(game.turn.phase)}
            </div>
            <div className="font-display font-bold" style={{ fontSize: "2.5cqmin" }}>
              {cur.name}
            </div>
          </div>
          <div className="ml-[1cqmin] flex flex-col items-center text-[#2b2417]">
            <Timer style={{ width: "2cqmin", height: "2cqmin" }} className={cn(remaining < 15000 && "text-red-600")} />
            <div className={cn("font-mono font-bold tabular-nums", remaining < 15000 && "text-red-600")} style={{ fontSize: "1.8cqmin" }}>
              {Math.ceil(remaining / 1000)}s
            </div>
          </div>
          <div className="absolute inset-x-[1.4cqmin] bottom-[0.4cqmin] h-[0.35cqmin] overflow-hidden rounded-full bg-black/10">
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct * 100}%`, background: PLAYER_COLORS[cur.color].hex }} />
          </div>
        </div>
      )}

      <Dice dice={game.turn.dice} rollKey={lastDice?.seq ?? 0} size={Math.round(size * 0.06)} />

      <AnimatePresence>
        {game.auction && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative flex items-center gap-[1cqmin] rounded-[1cqmin] bg-[#2b2417] px-[1.6cqmin] py-[0.8cqmin] font-bold text-[#ffe7a8]"
            style={{ fontSize: "1.6cqmin" }}
          >
            <Gavel style={{ width: "2cqmin", height: "2cqmin" }} /> Asta: {tileAt(game, game.auction.tile).name} — {cr(game.auction.highBid)} cr
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative w-[80%] space-y-[0.4cqmin]">
        {recent.map((e, i) => (
          <motion.div
            key={e.seq}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1 - i * 0.22, y: 0 }}
            className={cn("truncate text-center text-[#2b2417]", i === 0 ? "font-semibold" : "")}
            style={{ fontSize: i === 0 ? "1.6cqmin" : "1.3cqmin" }}
          >
            {e.message}
          </motion.div>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-[3cqmin] left-[3cqmin] rotate-[-8deg] rounded-[1cqmin] border-[0.3cqmin] border-[#7c3aed] bg-[#f1e9ff] px-[1.4cqmin] py-[1cqmin] text-center shadow-md">
        <div className="font-display font-extrabold text-[#5b21b6]" style={{ fontSize: "1.5cqmin" }}>
          {DECK_NAMES.chance}
        </div>
        <div className="text-[#5b21b6]/80" style={{ fontSize: "1.1cqmin" }}>
          {game.decks.chance.remaining} carte
        </div>
      </div>
      <div className="pointer-events-none absolute right-[3cqmin] top-[3cqmin] rotate-[8deg] rounded-[1cqmin] border-[0.3cqmin] border-[#c98a17] bg-[#fff4d6] px-[1.4cqmin] py-[1cqmin] text-center shadow-md">
        <div className="font-display font-extrabold text-[#a8650a]" style={{ fontSize: "1.5cqmin" }}>
          {DECK_NAMES.community}
        </div>
        <div className="text-[#a8650a]/80" style={{ fontSize: "1.1cqmin" }}>
          {game.decks.community.remaining} carte
        </div>
      </div>
    </div>
  );
}
