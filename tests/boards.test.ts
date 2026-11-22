import { describe, expect, it } from "vitest";
import { BOARDS, BOARD_IDS, boardOf, districtTiles, tileGridPosition } from "@/lib/game/board";
import { CARDS } from "@/lib/game/cards";
import { GameError } from "@/lib/game/engine";
import { scriptedDiceRng, seededRng } from "@/lib/game/rng";
import type { BoardId } from "@/lib/game/types";
import { Harness, newGame } from "./helpers";

const count = (id: BoardId, kind: string) => BOARDS[id].tiles.filter((t) => t.kind === kind).length;

describe("board variants", () => {
  it.each([
    // id, size, properties, transports, utilities, chance, community, taxes, regions, maxPlayers
    ["classic", 40, 22, 4, 2, 3, 3, 2, 8, 4],
    ["standard", 48, 26, 5, 3, 4, 3, 3, 8, 6],
    ["maxi", 64, 36, 6, 3, 6, 5, 4, 10, 8],
  ] as const)("%s has the expected composition", (id, size, props, tr, ut, ch, co, tax, regions, maxPlayers) => {
    const b = BOARDS[id];
    expect(b.tiles).toHaveLength(size);
    expect(b.perSide).toBe(size / 4);
    expect(count(id, "property")).toBe(props);
    expect(count(id, "transport")).toBe(tr);
    expect(count(id, "utility")).toBe(ut);
    expect(count(id, "chance")).toBe(ch);
    expect(count(id, "community")).toBe(co);
    expect(count(id, "tax")).toBe(tax);
    expect(b.districts).toHaveLength(regions);
    expect(b.maxPlayers).toBe(maxPlayers);
    expect([0, 1, 2, 3].map((k) => b.tiles[k * b.perSide].kind)).toEqual(["go", "jail", "parking", "goToJail"]);
    expect(b.jailIndex).toBe(b.perSide);
    b.tiles.forEach((t, i) => expect(t.index).toBe(i));
    // every region has 2–5 tiles and the rent table grows with buildings
    for (const d of b.districts) {
      const n = districtTiles(id, d).length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
    for (const t of b.tiles.filter((x) => x.kind === "property")) {
      expect(t.rent).toHaveLength(6);
      for (let k = 1; k < 6; k++) expect(t.rent![k]).toBeGreaterThan(t.rent![k - 1]);
    }
    // transport/utility tables sized to the number of tiles of that kind
    expect(b.tiles.find((t) => t.kind === "transport")!.rent).toHaveLength(tr);
    expect(b.tiles.find((t) => t.kind === "utility")!.multipliers).toHaveLength(ut);
    // tile names are unique within a board
    const names = b.tiles.filter((t) => t.kind === "property" || t.kind === "transport" || t.kind === "utility").map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every board resolves all card anchors to tiles with the right name", () => {
    const expected: Record<string, string> = {
      "palazzo-reale": "Palazzo Reale d'Argento",
      "tempio-vento": "Tempio del Vento",
      oasi: "Oasi Nascosta",
      carovana: "Carovana delle Dune",
      bastione: "Bastione del Generale",
    };
    for (const id of BOARD_IDS) {
      const b = BOARDS[id];
      expect(b.anchors.start).toBe(0);
      expect(b.anchors.jail).toBe(b.jailIndex);
      for (const [key, name] of Object.entries(expected)) expect(b.tiles[b.anchors[key]].name).toBe(name);
      for (const c of CARDS) if (c.effect.type === "moveTo") expect(b.anchors[c.effect.to]).toBeTypeOf("number");
    }
  });

  it("keeps the standard board identical to the original 48-tile layout", () => {
    const b = BOARDS.standard;
    expect([b.tiles[1].name, b.tiles[1].price]).toEqual(["Vicolo delle Esalazioni", 70]);
    expect([b.tiles[12].kind, b.tiles[24].kind, b.tiles[36].kind]).toEqual(["jail", "parking", "goToJail"]);
    expect([b.tiles[47].name, b.tiles[47].price, b.tiles[47].rent]).toEqual(["Palazzo Reale d'Argento", 500, [60, 250, 750, 1600, 1900, 2200]]);
    expect(b.tiles[6].rent).toEqual([30, 60, 120, 240, 400]);
    expect(b.ownable).toHaveLength(34);
  });

  it("maps every tile to a distinct perimeter cell of the grid", () => {
    for (const id of BOARD_IDS) {
      const b = BOARDS[id];
      const cells = new Set(b.tiles.map((t) => JSON.stringify(tileGridPosition(t.index, b.perSide))));
      expect(cells.size).toBe(b.size);
      for (const t of b.tiles) {
        const { row, col } = tileGridPosition(t.index, b.perSide);
        const d = b.perSide + 1;
        expect(row === 1 || row === d || col === 1 || col === d).toBe(true);
      }
    }
  });

  it("legacy games without a board setting use the standard board", () => {
    expect(boardOf({ settings: {} }).id).toBe("standard");
    expect(boardOf(undefined).id).toBe("standard");
  });
});

describe("games on each board", () => {
  it("maxi accepts 8 players; standard refuses more than 6, classic more than 4", () => {
    const g = newGame(8, { board: "maxi", maxPlayers: 8 });
    expect(g.players).toHaveLength(8);
    expect(Object.keys(g.ownership)).toHaveLength(BOARDS.maxi.ownable.length);
    expect(newGame(4, { board: "classic", maxPlayers: 4 }).players).toHaveLength(4);
    for (const [board, n] of [["standard", 7], ["classic", 5]] as const) {
      try {
        newGame(n, { board, maxPlayers: 8 });
        throw new Error("expected failure");
      } catch (e) {
        expect(e).toBeInstanceOf(GameError);
        expect((e as GameError).code).toBe("TOO_MANY_PLAYERS");
      }
    }
  });

  it("classic: three doubles send you to the dungeon on tile 10; passing start wraps at 40", () => {
    const h = new Harness(newGame(2, { board: "classic" }), scriptedDiceRng([5, 5, 5, 5, 5, 5]));
    h.run("u1", { type: "ROLL" }); // 0 → 10 (dungeon, just visiting)
    expect(h.p("p1").position).toBe(10);
    h.run("u1", { type: "ROLL" }); // 10 → 20 (camp)
    expect(h.p("p1").position).toBe(20);
    h.run("u1", { type: "ROLL" }); // third double → dungeon
    expect(h.p("p1").inJail).toBe(true);
    expect(h.p("p1").position).toBe(10);

    const g = newGame(2, { board: "classic" });
    g.players[0].position = 38;
    const w = new Harness(g, scriptedDiceRng([2, 3]));
    w.run("u1", { type: "ROLL" });
    expect(w.p("p1").position).toBe(3);
    expect(w.p("p1").balance).toBeGreaterThanOrEqual(2000 + 250 - 500);
  });

  it("maxi: cards move to the anchor tile of the maxi board", () => {
    const g = newGame(3, { board: "maxi", maxPlayers: 8 });
    const chance = BOARDS.maxi.tiles.find((t) => t.kind === "chance")!.index;
    g.decks.chance.order = ["ch02", ...g.decks.chance.order.filter((x) => x !== "ch02")];
    g.decks.chance.index = 0;
    g.players[0].position = chance - 3;
    const h = new Harness(g, scriptedDiceRng([1, 2]));
    h.run("u1", { type: "ROLL" });
    expect(h.p("p1").position).toBe(BOARDS.maxi.anchors["palazzo-reale"]);
    expect(h.p("p1").position).toBe(63);
  });

  it.each(["classic", "maxi"] as const)("random %s games keep every invariant", (board) => {
    const players = BOARDS[board].maxPlayers; // maxi 8, classic 4
    const size = BOARDS[board].size;
    for (let seed = 1; seed <= 4; seed++) {
      const rng = seededRng(seed * 7);
      const h = new Harness(newGame(players, { board, maxPlayers: players }), rng);
      for (let step = 0; step < 1500 && h.s.status === "active"; step++) {
        const s = h.s;
        const cur = s.players.find((p) => p.id === s.turn.playerId)!;
        try {
          if (s.turn.phase === "ROLL") h.run(cur.userId, { type: "ROLL" });
          else if (s.turn.phase === "BUY") h.run(cur.userId, { type: cur.balance > 500 ? "BUY" : "DECLINE_BUY" });
          else if (s.turn.phase === "AUCTION") h.run(null, { type: "TIMEOUT" }, 30_000);
          else if (s.turn.phase === "DEBT") h.run(null, { type: "TIMEOUT" }, 200_000);
          else if (s.turn.phase === "MANAGE") {
            const mine = Object.values(s.ownership).filter((o) => o.ownerId === cur.id);
            const pick = mine[rng.int(mine.length || 1)];
            if (pick) {
              try {
                h.run(cur.userId, { type: "BUILD", tile: pick.tile });
              } catch {
                /* not buildable */
              }
            }
            h.run(cur.userId, { type: "END_TURN" });
          }
        } catch (e) {
          if (!(e instanceof GameError)) throw e;
        }
        for (const p of h.s.players) {
          expect(p.balance).toBeGreaterThanOrEqual(0);
          expect(p.position).toBeGreaterThanOrEqual(0);
          expect(p.position).toBeLessThan(size);
        }
        for (const o of Object.values(h.s.ownership)) {
          expect(o.houses).toBeLessThanOrEqual(5);
          if (o.mortgaged) expect(o.houses).toBe(0);
        }
        const cards =
          h.s.decks.chance.order.length + h.s.decks.community.order.length + h.s.players.reduce((n, p) => n + p.jailCards.length, 0);
        expect(cards).toBe(CARDS.length);
      }
    }
  });
});
