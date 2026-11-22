"use client";

import { memo } from "react";
import {
  ArrowLeft,
  CircleParking,
  Droplets,
  Flag,
  Gem,
  Landmark,
  Lock,
  Plane,
  Receipt,
  Ship,
  Siren,
  Sparkles,
  TrainFront,
  TramFront,
  Truck,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { DISTRICTS, isCorner, tileGridPosition, tileSide } from "@/lib/game/board";
import type { OwnershipState, TileDef } from "@/lib/game/types";
import { PLAYER_COLORS } from "@/lib/client/ui-constants";
import type { PlayerColor } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export const TILE_ICONS: Record<string, LucideIcon> = {
  flag: Flag,
  landmark: Landmark,
  receipt: Receipt,
  train: TramFront,
  "train-front": TrainFront,
  ship: Ship,
  plane: Plane,
  truck: Truck,
  zap: Zap,
  droplets: Droplets,
  wifi: Wifi,
  sparkles: Sparkles,
  lock: Lock,
  car: CircleParking,
  siren: Siren,
  gem: Gem,
};

interface Props {
  tile: TileDef;
  own?: OwnershipState;
  ownerColor?: PlayerColor;
  selected: boolean;
  highlight: boolean;
  goBonus: number;
  onSelect: (i: number) => void;
}

function Houses({ n, vertical }: { n: number; vertical: boolean }) {
  if (n <= 0) return null;
  if (n === 5) {
    return (
      <div className="flex items-center justify-center">
        <div
          className="rounded-[0.3cqmin] bg-gradient-to-b from-[#ff6b6b] to-[#c81e1e] shadow-[0_0.2cqmin_0.4cqmin_rgba(0,0,0,0.4)]"
          style={vertical ? { width: "2.4cqmin", height: "1.6cqmin" } : { width: "1.6cqmin", height: "2.4cqmin" }}
          title="Torre"
        />
      </div>
    );
  }
  return (
    <div className={cn("flex items-center justify-center gap-[0.35cqmin]", vertical && "flex-col")}>
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className="rounded-[0.2cqmin] bg-gradient-to-b from-[#5ee08a] to-[#15803d] shadow-[0_0.15cqmin_0.3cqmin_rgba(0,0,0,0.4)]"
          style={{ width: "1.15cqmin", height: "1.15cqmin" }}
        />
      ))}
    </div>
  );
}

function TileImpl({ tile, own, ownerColor, selected, highlight, goBonus, onSelect }: Props) {
  const { row, col } = tileGridPosition(tile.index);
  const side = tileSide(tile.index);
  const corner = isCorner(tile.index);
  const horizontalTile = side === 1 || side === 3; // left/right tiles are wide & short
  const district = tile.district ? DISTRICTS[tile.district] : null;
  const Icon = tile.icon ? TILE_ICONS[tile.icon] : undefined;
  const owner = ownerColor ? PLAYER_COLORS[ownerColor].hex : null;

  // Layout direction: band on the inner edge, owner strip on the outer edge.
  const dir =
    side === 0 ? "flex-col" : side === 2 ? "flex-col-reverse" : side === 1 ? "flex-row-reverse" : "flex-row";

  const STRIP = "1.25cqmin";
  const ownerStripStyle: React.CSSProperties | undefined = owner
    ? side === 0
      ? { bottom: 0, left: 0, right: 0, height: STRIP }
      : side === 2
        ? { top: 0, left: 0, right: 0, height: STRIP }
        : side === 1
          ? { left: 0, top: 0, bottom: 0, width: STRIP }
          : { right: 0, top: 0, bottom: 0, width: STRIP }
    : undefined;

  const common = cn(
    "tile flex cursor-pointer select-none",
    selected && "z-10 outline-[0.35cqmin] outline-[#f5b83d]",
    highlight && "ring-[0.4cqmin] ring-inset ring-[#f5b83d]/80",
  );

  if (corner) {
    const label =
      tile.kind === "go"
        ? "PARTENZA"
        : tile.kind === "jail"
          ? "PRIGIONE"
          : tile.kind === "parking"
            ? "PARCHEGGIO LIBERO"
            : "VAI IN PRIGIONE";
    const bg =
      tile.kind === "go"
        ? "bg-gradient-to-br from-[#fff3cf] to-[#f6d98a]"
        : tile.kind === "goToJail"
          ? "bg-gradient-to-br from-[#ffe1e1] to-[#f5a3a3]"
          : tile.kind === "jail"
            ? "bg-gradient-to-br from-[#e7ecf5] to-[#b9c4d8]"
            : "bg-gradient-to-br from-[#dff7e7] to-[#a8e2bd]";
    return (
      <button
        type="button"
        className={cn(common, bg, "flex-col items-center justify-center gap-[0.4cqmin] p-[0.6cqmin] text-center")}
        style={{ gridRow: row, gridColumn: col }}
        onClick={() => onSelect(tile.index)}
        aria-label={tile.name}
      >
        {tile.kind === "go" ? (
          <ArrowLeft style={{ width: "4cqmin", height: "4cqmin" }} className="text-[#a8650a]" strokeWidth={3} />
        ) : (
          Icon && <Icon style={{ width: "3.6cqmin", height: "3.6cqmin" }} className="text-board-ink/80" />
        )}
        <div className="font-display font-extrabold leading-none" style={{ fontSize: "1.3cqmin" }}>
          {label}
        </div>
        {tile.kind === "go" && (
          <div className="font-bold text-[#8a5208]" style={{ fontSize: "1.1cqmin" }}>
            +{goBonus} cr
          </div>
        )}
        {tile.kind === "jail" && (
          <div className="font-semibold text-board-ink/70" style={{ fontSize: "0.9cqmin" }}>
            / Transito
          </div>
        )}
      </button>
    );
  }

  const special = tile.kind === "chance" || tile.kind === "community";
  const bg =
    tile.kind === "chance"
      ? "bg-gradient-to-b from-[#fff4d6] to-[#fde6a6]"
      : tile.kind === "community"
        ? "bg-gradient-to-b from-[#ddf6f4] to-[#b6e9e3]"
        : tile.kind === "tax"
          ? "bg-gradient-to-b from-[#f7efe9] to-[#ecdccf]"
          : "";

  return (
    <button
      type="button"
      className={cn(common, dir, bg)}
      style={{ gridRow: row, gridColumn: col }}
      onClick={() => onSelect(tile.index)}
      aria-label={tile.name}
      title={tile.name}
    >
      {district && (
        <div
          className={cn("flex shrink-0 items-center justify-center", horizontalTile ? "h-full w-[26%]" : "h-[24%] w-full")}
          style={{ background: `linear-gradient(${horizontalTile ? "90deg" : "180deg"}, ${district.color}, ${district.color}dd)` }}
        >
          <Houses n={own?.houses ?? 0} vertical={horizontalTile} />
        </div>
      )}
      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-between overflow-hidden text-center",
          horizontalTile ? "px-[0.5cqmin] py-[0.35cqmin]" : "px-[0.3cqmin] py-[0.45cqmin]",
        )}
      >
        <div className="tile-name line-clamp-3 w-full break-words">{special ? (tile.kind === "chance" ? "Evento" : "Fondo Città") : tile.name}</div>
        {Icon && (special || tile.kind !== "property") && (
          <Icon
            className={cn(
              tile.kind === "chance" ? "text-[#c98a17]" : tile.kind === "community" ? "text-[#0f8f84]" : "text-board-ink/75",
            )}
            style={{ width: special ? "2.8cqmin" : "2.2cqmin", height: special ? "2.8cqmin" : "2.2cqmin" }}
          />
        )}
        <div className="tile-sub text-board-ink/80">
          {tile.kind === "tax" ? `${tile.taxAmount} cr` : tile.price && !own?.ownerId ? `${tile.price} cr` : ""}
        </div>
      </div>
      {own?.mortgaged && (
        <div className="mortgaged-stripes pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded bg-[#5b4422] px-[0.4cqmin] font-bold text-[#fff3d6]" style={{ fontSize: "0.8cqmin" }}>
            IPOTECA
          </span>
        </div>
      )}
      {owner && (
        <>
          <div className="pointer-events-none absolute inset-0" style={{ background: `${owner}1f` }} />
          <div
            className="pointer-events-none absolute shadow-[0_0_0.6cqmin_rgba(0,0,0,0.25)]"
            style={{ ...ownerStripStyle, background: `linear-gradient(90deg, ${owner}, ${owner}cc)` }}
          />
        </>
      )}
    </button>
  );
}

export const Tile = memo(TileImpl);
