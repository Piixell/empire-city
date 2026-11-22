"use client";

import { Lock } from "lucide-react";
import { DISTRICTS, TRANSPORT_RENT, UTILITY_MULTIPLIERS, tileAt, unmortgageCost } from "@/lib/game/board";
import { computeRent } from "@/lib/game/rules";
import { PLAYER_COLORS, cr } from "@/lib/client/ui-constants";
import type { PublicGameState } from "@/lib/game/types";
import { TILE_ICONS } from "@/components/game/Tile";
import { cn } from "@/lib/utils";

/** Detailed "title deed" card for any tile. */
export function PropertyCard({ index, game, compact }: { index: number; game: PublicGameState; compact?: boolean }) {
  const t = tileAt(index);
  const own = game.ownership[index];
  const owner = own?.ownerId ? game.players.find((p) => p.id === own.ownerId) : undefined;
  const district = t.district ? DISTRICTS[t.district] : null;
  const Icon = t.icon ? TILE_ICONS[t.icon] : undefined;
  const currentRent = own?.ownerId ? computeRent(game, index, { diceTotal: 7 }) : 0;

  const header = (
    <div
      className="rounded-t-xl px-3 py-2 text-center"
      style={{ background: district ? district.color : t.kind === "transport" ? "#334155" : t.kind === "utility" ? "#0f766e" : "#1e293b" }}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-white/80">
        {district ? district.name : t.kind === "transport" ? "Trasporti" : t.kind === "utility" ? "Servizi pubblici" : "Casella speciale"}
      </div>
      <div className="flex items-center justify-center gap-2 font-display text-lg font-extrabold text-white drop-shadow">
        {Icon && !district && <Icon className="size-5" />}
        {t.name}
      </div>
    </div>
  );

  const ownerLine = (
    <div className="flex items-center justify-between border-t border-black/10 pt-2 text-xs">
      <span className="text-[#2b2417]/70">Proprietario</span>
      {owner ? (
        <span className="flex items-center gap-1 font-bold" style={{ color: PLAYER_COLORS[owner.color].hex }}>
          <span className="size-2.5 rounded-full" style={{ background: PLAYER_COLORS[owner.color].hex }} />
          {owner.name}
          {own?.mortgaged && (
            <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-[#5b4422] px-1 text-[10px] text-[#fff3d6]">
              <Lock className="size-2.5" /> IPOTECATA
            </span>
          )}
        </span>
      ) : (
        <span className="font-semibold text-[#2b2417]">Banca (in vendita)</span>
      )}
    </div>
  );

  let body: React.ReactNode = null;
  if (t.kind === "property" && t.rent) {
    const rows: [string, number][] = [
      ["Affitto base", t.rent[0]],
      ["Con quartiere completo", t.rent[0] * 2],
      ["Con 1 casa", t.rent[1]],
      ["Con 2 case", t.rent[2]],
      ["Con 3 case", t.rent[3]],
      ["Con 4 case", t.rent[4]],
      ["Con torre", t.rent[5]],
    ];
    body = (
      <>
        <table className="w-full text-xs">
          <tbody>
            {rows.map(([label, v], i) => {
              const active = own?.ownerId && ((i === 0 && own.houses === 0) || (i >= 2 && own.houses === i - 1));
              return (
                <tr key={label} className={cn(active && "font-bold text-[#a8650a]")}>
                  <td className="py-0.5 text-[#2b2417]/80">{label}</td>
                  <td className="py-0.5 text-right font-semibold tabular-nums">{cr(v)} cr</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!compact && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-black/10 pt-2 text-xs">
            <span className="text-[#2b2417]/70">Costo edificio</span>
            <span className="text-right font-semibold">{cr(t.houseCost!)} cr</span>
            <span className="text-[#2b2417]/70">Valore ipoteca</span>
            <span className="text-right font-semibold">{cr(t.mortgage!)} cr</span>
            <span className="text-[#2b2417]/70">Riscatto (+10%)</span>
            <span className="text-right font-semibold">{cr(unmortgageCost(index))} cr</span>
          </div>
        )}
      </>
    );
  } else if (t.kind === "transport") {
    body = (
      <table className="w-full text-xs">
        <tbody>
          {TRANSPORT_RENT.map((v, i) => (
            <tr key={i}>
              <td className="py-0.5 text-[#2b2417]/80">{i + 1} trasport{i ? "i" : "o"} posseduti</td>
              <td className="py-0.5 text-right font-semibold">{cr(v)} cr</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (t.kind === "utility") {
    body = (
      <div className="space-y-1 text-xs text-[#2b2417]/85">
        {UTILITY_MULTIPLIERS.map((m, i) => (
          <div key={i} className="flex justify-between">
            <span>
              {i + 1} serviz{i ? "i" : "io"} posseduti
            </span>
            <span className="font-semibold">{m}× il lancio dei dadi</span>
          </div>
        ))}
      </div>
    );
  } else {
    const text: Record<string, string> = {
      go: `Ogni volta che passi o ti fermi qui ricevi ${game.settings.goBonus} crediti.`,
      jail: "Se sei solo in transito non succede nulla. In prigione puoi pagare 60 cr, usare una carta o tentare il doppio (max 3 tentativi).",
      parking: "Una pausa gratuita: qui non succede nulla.",
      goToJail: "Vai direttamente in prigione senza passare dalla Partenza.",
      chance: "Pesca una carta Evento Urbano.",
      community: "Pesca una carta Fondo Cittadino.",
      tax: `Paga ${t.taxAmount} crediti alla Banca.`,
    };
    body = <p className="text-sm text-[#2b2417]/85">{text[t.kind]}</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl bg-[#fbf7ee] text-[#2b2417] shadow-xl ring-1 ring-black/10">
      {header}
      <div className="space-y-2 p-3">
        {t.price && (
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider text-[#2b2417]/60">Prezzo</span>
            <span className="font-display text-xl font-extrabold">{cr(t.price)} cr</span>
          </div>
        )}
        {body}
        {t.price && ownerLine}
        {own?.ownerId && !own.mortgaged && t.kind !== "utility" && (
          <div className="flex justify-between text-xs">
            <span className="text-[#2b2417]/70">Affitto attuale</span>
            <span className="font-bold text-[#a8650a]">{cr(currentRent)} cr</span>
          </div>
        )}
      </div>
    </div>
  );
}
