import { describe, expect, it } from "vitest";
import { BOARD, DISTRICTS, OWNABLE_TILES, districtTiles, unmortgageCost } from "@/lib/game/board";
import { CARDS, cardsOfDeck } from "@/lib/game/cards";
import { GameError, applyCommand, toPublicState } from "@/lib/game/engine";
import { scriptedDiceRng, seededRng } from "@/lib/game/rng";
import { computeRent, computeStandings, netWorth } from "@/lib/game/rules";
import { JAIL_INDEX } from "@/lib/game/types";
import { Harness, newGame } from "./helpers";

function expectGameError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    expect((e as GameError).code).toBe(code);
    return;
  }
  throw new Error(`Expected GameError ${code}`);
}

describe("board & decks", () => {
  it("has the required composition of 48 tiles", () => {
    expect(BOARD).toHaveLength(48);
    const count = (k: string) => BOARD.filter((t) => t.kind === k).length;
    expect(count("property")).toBe(26);
    expect(count("transport")).toBe(5);
    expect(count("utility")).toBe(3);
    expect(count("chance")).toBe(4);
    expect(count("community")).toBe(3);
    expect(count("tax")).toBe(3);
    expect(count("go") + count("jail") + count("parking") + count("goToJail")).toBe(4);
    BOARD.forEach((t, i) => expect(t.index).toBe(i));
    expect([0, 12, 24, 36].map((i) => BOARD[i].kind)).toEqual(["go", "jail", "parking", "goToJail"]);
  });

  it("has 8 districts: six of 3 and two of 4, with progressive prices", () => {
    const sizes = Object.keys(DISTRICTS).map((d) => districtTiles(d as never).length).sort();
    expect(sizes).toEqual([3, 3, 3, 3, 3, 3, 4, 4]);
    const props = BOARD.filter((t) => t.kind === "property");
    for (let i = 1; i < props.length; i++) expect(props[i].price!).toBeGreaterThanOrEqual(props[i - 1].price!);
    for (const p of props) {
      expect(p.rent).toHaveLength(6);
      for (let k = 1; k < 6; k++) expect(p.rent![k]).toBeGreaterThan(p.rent![k - 1]);
    }
  });

  it("has at least 20 cards per deck with unique ids", () => {
    expect(cardsOfDeck("chance").length).toBeGreaterThanOrEqual(20);
    expect(cardsOfDeck("community").length).toBeGreaterThanOrEqual(20);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
  });
});

describe("game setup", () => {
  it("gives every player the starting capital and hides deck order publicly", () => {
    const s = newGame(6);
    expect(s.players).toHaveLength(6);
    for (const p of s.players) {
      expect(p.balance).toBe(2000);
      expect(p.position).toBe(0);
    }
    expect(Object.keys(s.ownership)).toHaveLength(OWNABLE_TILES.length);
    expect(s.turn.phase).toBe("ROLL");
    const pub = toPublicState(s);
    expect(JSON.stringify(pub)).not.toContain('"order"');
    expect(pub.decks.chance.remaining).toBe(cardsOfDeck("chance").length);
  });
});

describe("turns, dice, buying and rent", () => {
  it("rolls, moves, buys, ends turn and charges rent to the next player", () => {
    const h = new Harness(newGame(2), scriptedDiceRng([1, 2, 1, 2]));
    h.run("u1", { type: "ROLL" });
    expect(h.p("p1").position).toBe(3);
    expect(h.s.turn.phase).toBe("BUY");
    expect(h.s.turn.pendingTile).toBe(3);
    h.run("u1", { type: "BUY" });
    expect(h.s.ownership[3].ownerId).toBe("p1");
    expect(h.p("p1").balance).toBe(2000 - 70);
    expect(h.s.turn.phase).toBe("MANAGE");
    h.run("u1", { type: "END_TURN" });
    expect(h.s.turn.playerId).toBe("p2");
    h.run("u2", { type: "ROLL" });
    expect(h.p("p2").position).toBe(3);
    expect(h.p("p2").balance).toBe(2000 - 4);
    expect(h.p("p1").balance).toBe(2000 - 70 + 4);
    expect(h.s.turn.phase).toBe("MANAGE");
    expect(h.p("p2").stats.rentPaid).toBe(4);
  });

  it("rejects out-of-turn and duplicate actions", () => {
    const h = new Harness(newGame(2), scriptedDiceRng([1, 2]));
    expectGameError(() => h.run("u2", { type: "ROLL" }), "NOT_YOUR_TURN");
    expectGameError(() => h.run("u1", { type: "END_TURN" }), "BAD_PHASE");
    h.run("u1", { type: "ROLL" });
    expectGameError(() => h.run("u1", { type: "ROLL" }), "BAD_PHASE");
    expectGameError(() => h.run("stranger", { type: "ROLL" }), "NOT_A_PLAYER");
  });

  it("pays the GO bonus when passing Partenza", () => {
    const g = newGame(2);
    g.players[0].position = 46;
    const h = new Harness(g, scriptedDiceRng([1, 2]));
    h.run("u1", { type: "ROLL" });
    expect(h.p("p1").position).toBe(1);
    expect(h.p("p1").balance).toBe(2250);
  });

  it("grants an extra roll on doubles and jails on three doubles", () => {
    const h = new Harness(newGame(2), scriptedDiceRng([2, 2, 3, 3, 1, 1]));
    h.run("u1", { type: "ROLL" }); // 4 -> tax 200
    expect(h.p("p1").balance).toBe(1800);
    expect(h.s.turn.phase).toBe("ROLL");
    h.run("u1", { type: "ROLL" }); // 6 -> transport, unowned
    expect(h.s.turn.phase).toBe("BUY");
    h.run("u1", { type: "DECLINE_BUY" });
    expect(h.s.turn.phase).toBe("AUCTION");
    h.run("u1", { type: "AUCTION_PASS" });
    h.run("u2", { type: "AUCTION_PASS" });
    expect(h.s.auction).toBeNull();
    expect(h.s.turn.phase).toBe("ROLL");
    h.run("u1", { type: "ROLL" }); // third double -> jail
    expect(h.p("p1").inJail).toBe(true);
    expect(h.p("p1").position).toBe(JAIL_INDEX);
    expect(h.s.turn.phase).toBe("MANAGE");
  });

  it("handles jail: failed attempts, then forced fine", () => {
    const g = newGame(2);
    g.players[0].inJail = true;
    g.players[0].position = JAIL_INDEX;
    const h = new Harness(g, scriptedDiceRng([1, 2, 1, 3, 1, 2, 1, 3, 2, 3]));
    for (let attempt = 1; attempt <= 2; attempt++) {
      h.run("u1", { type: "ROLL" });
      expect(h.p("p1").inJail).toBe(true);
      expect(h.p("p1").jailTurns).toBe(attempt);
      h.run("u1", { type: "END_TURN" });
      h.run("u2", { type: "ROLL" });
      if (h.s.turn.phase === "BUY") h.run("u2", { type: "DECLINE_BUY" });
      while (h.s.turn.phase === "AUCTION") h.run(h.s.auction!.passedIds.includes("p1") ? "u2" : "u1", { type: "AUCTION_PASS" });
      h.run("u2", { type: "END_TURN" });
    }
    h.run("u1", { type: "ROLL" }); // 2+3: third failure -> pay 60 and move 5
    expect(h.p("p1").inJail).toBe(false);
    expect(h.p("p1").position).toBe(JAIL_INDEX + 5);
    expect(h.p("p1").balance).toBe(2000 - 60);
  });

  it("lets a jailed player pay the fine and then roll", () => {
    const g = newGame(2);
    g.players[0].inJail = true;
    g.players[0].position = JAIL_INDEX;
    const h = new Harness(g, scriptedDiceRng([3, 4]));
    h.run("u1", { type: "PAY_JAIL" });
    expect(h.p("p1").inJail).toBe(false);
    expect(h.s.turn.phase).toBe("ROLL");
    h.run("u1", { type: "ROLL" });
    expect(h.p("p1").position).toBe(JAIL_INDEX + 7);
  });
});

describe("auctions", () => {
  it("assigns the property to the highest bidder and validates bids", () => {
    const h = new Harness(newGame(3), scriptedDiceRng([1, 2]));
    h.run("u1", { type: "ROLL" });
    h.run("u1", { type: "DECLINE_BUY" });
    expect(h.s.turn.phase).toBe("AUCTION");
    expectGameError(() => h.run("u2", { type: "BID", amount: 5 }), "BID_TOO_LOW");
    expectGameError(() => h.run("u2", { type: "BID", amount: 999999 }), "INSUFFICIENT_FUNDS");
    h.run("u2", { type: "BID", amount: 20 });
    h.run("u3", { type: "BID", amount: 40 });
    expectGameError(() => h.run("u3", { type: "BID", amount: 50 }), "ALREADY_HIGHEST");
    h.run("u1", { type: "AUCTION_PASS" });
    h.run("u2", { type: "AUCTION_PASS" });
    expect(h.s.auction).toBeNull();
    expect(h.s.ownership[3].ownerId).toBe("p3");
    expect(h.p("p3").balance).toBe(1960);
    expect(h.s.turn.phase).toBe("MANAGE");
    expect(h.s.turn.playerId).toBe("p1");
  });

  it("closes on timeout and leaves the tile to the bank when nobody bids", () => {
    const h = new Harness(newGame(2), scriptedDiceRng([1, 2]));
    h.run("u1", { type: "ROLL" });
    h.run("u1", { type: "DECLINE_BUY" });
    expectGameError(() => h.run(null, { type: "TIMEOUT" }), "NOT_EXPIRED");
    h.run(null, { type: "TIMEOUT" }, 25_000);
    expect(h.s.auction).toBeNull();
    expect(h.s.ownership[3].ownerId).toBeNull();
    expect(h.s.turn.phase).toBe("MANAGE");
  });

  it("skips auctions when disabled", () => {
    const h = new Harness(newGame(2, { auctionsEnabled: false }), scriptedDiceRng([1, 2]));
    h.run("u1", { type: "ROLL" });
    h.run("u1", { type: "DECLINE_BUY" });
    expect(h.s.auction).toBeNull();
    expect(h.s.turn.phase).toBe("MANAGE");
  });
});

describe("buildings and mortgages", () => {
  function withBassofondo() {
    const g = newGame(2);
    for (const i of districtTiles("bassofondo")) g.ownership[i].ownerId = "p1";
    return g;
  }

  it("doubles base rent for a full district and enforces even building", () => {
    const g = withBassofondo();
    expect(computeRent(g, 1, { diceTotal: 7 })).toBe(8);
    const h = new Harness(g, scriptedDiceRng([]));
    h.run("u1", { type: "BUILD", tile: 1 });
    expect(h.s.ownership[1].houses).toBe(1);
    expect(h.p("p1").balance).toBe(1950);
    expectGameError(() => h.run("u1", { type: "BUILD", tile: 1 }), "CANNOT_BUILD");
    h.run("u1", { type: "BUILD", tile: 3 });
    h.run("u1", { type: "BUILD", tile: 5 });
    h.run("u1", { type: "BUILD", tile: 1 });
    expect(computeRent(h.s, 1, { diceTotal: 7 })).toBe(60);
    expectGameError(() => h.run("u1", { type: "SELL_BUILDING", tile: 3 }), "CANNOT_SELL");
    h.run("u1", { type: "SELL_BUILDING", tile: 1 });
    expect(h.s.ownership[1].houses).toBe(1);
    expect(h.p("p1").balance).toBe(2000 - 4 * 50 + 25);
    expectGameError(() => h.run("u1", { type: "MORTGAGE", tile: 3 }), "CANNOT_MORTGAGE");
    expect(h.p("p1").stats.buildingsBuilt).toBe(4);
  });

  it("builds up to a tower (5) and not beyond", () => {
    const g = withBassofondo();
    const h = new Harness(g, scriptedDiceRng([]));
    for (let r = 0; r < 5; r++) for (const t of [1, 3, 5]) h.run("u1", { type: "BUILD", tile: t });
    expect(h.s.ownership[5].houses).toBe(5);
    expect(computeRent(h.s, 5, { diceTotal: 7 })).toBe(550);
    expectGameError(() => h.run("u1", { type: "BUILD", tile: 5 }), "CANNOT_BUILD");
  });

  it("mortgaged properties charge no rent and cost interest to redeem", () => {
    const g = newGame(2);
    g.ownership[3].ownerId = "p2";
    const h = new Harness(g, scriptedDiceRng([1, 2]));
    h.s.turn.playerId = "p2";
    h.run("u2", { type: "MORTGAGE", tile: 3 });
    expect(h.p("p2").balance).toBe(2035);
    h.run("u2", { type: "UNMORTGAGE", tile: 3 });
    expect(h.p("p2").balance).toBe(2035 - unmortgageCost(3));
    expect(unmortgageCost(3)).toBe(39);
    h.run("u2", { type: "MORTGAGE", tile: 3 });
    h.s.turn.playerId = "p1";
    h.run("u1", { type: "ROLL" });
    expect(h.p("p1").balance).toBe(2000);
  });
});

describe("trades", () => {
  it("executes a trade atomically and invalidates conflicting offers", () => {
    const g = newGame(3);
    g.ownership[1].ownerId = "p1";
    g.ownership[3].ownerId = "p2";
    g.ownership[5].ownerId = "p3";
    const h = new Harness(g, seededRng(3));
    h.run("u1", {
      type: "PROPOSE_TRADE",
      toId: "p2",
      offerTiles: [1],
      requestTiles: [3],
      offerCash: 100,
      requestCash: 0,
      offerCards: [],
      requestCards: [],
    });
    const t1 = h.s.trades[0];
    expectGameError(
      () =>
        h.run("u1", {
          type: "PROPOSE_TRADE",
          toId: "p3",
          offerTiles: [1],
          requestTiles: [5],
          offerCash: 0,
          requestCash: 0,
          offerCards: [],
          requestCards: [],
        }),
      "TILE_COMMITTED",
    );
    h.run("u3", {
      type: "PROPOSE_TRADE",
      toId: "p2",
      offerTiles: [5],
      requestTiles: [3],
      offerCash: 0,
      requestCash: 0,
      offerCards: [],
      requestCards: [],
    });
    expectGameError(() => h.run("u3", { type: "ACCEPT_TRADE", tradeId: t1.id }), "FORBIDDEN");
    h.run("u2", { type: "ACCEPT_TRADE", tradeId: t1.id });
    expect(h.s.ownership[1].ownerId).toBe("p2");
    expect(h.s.ownership[3].ownerId).toBe("p1");
    expect(h.p("p1").balance).toBe(1900);
    expect(h.p("p2").balance).toBe(2100);
    const t2 = h.s.trades.find((t) => t.fromId === "p3")!;
    expect(t2.status).toBe("invalid");
  });

  it("supports counter offers", () => {
    const g = newGame(2);
    g.ownership[1].ownerId = "p1";
    const h = new Harness(g, seededRng(3));
    h.run("u2", {
      type: "PROPOSE_TRADE",
      toId: "p1",
      offerTiles: [],
      requestTiles: [1],
      offerCash: 50,
      requestCash: 0,
      offerCards: [],
      requestCards: [],
    });
    const first = h.s.trades[0];
    h.run("u1", {
      type: "PROPOSE_TRADE",
      toId: "p2",
      offerTiles: [1],
      requestTiles: [],
      offerCash: 0,
      requestCash: 150,
      offerCards: [],
      requestCards: [],
      counterOf: first.id,
    });
    expect(h.s.trades.find((t) => t.id === first.id)!.status).toBe("countered");
    const counter = h.s.trades.find((t) => t.parentId === first.id)!;
    h.run("u2", { type: "ACCEPT_TRADE", tradeId: counter.id });
    expect(h.s.ownership[1].ownerId).toBe("p2");
    expect(h.p("p1").balance).toBe(2150);
  });

  it("refuses trading properties of districts with buildings", () => {
    const g = newGame(2);
    for (const i of districtTiles("bassofondo")) g.ownership[i].ownerId = "p1";
    g.ownership[1].houses = 1;
    const h = new Harness(g, seededRng(3));
    expectGameError(
      () =>
        h.run("u1", {
          type: "PROPOSE_TRADE",
          toId: "p2",
          offerTiles: [3],
          requestTiles: [],
          offerCash: 0,
          requestCash: 10,
          offerCards: [],
          requestCards: [],
        }),
      "INVALID_TRADE",
    );
  });
});

describe("debts, bankruptcy and victory", () => {
  it("forces raising funds, then bankruptcy transfers assets to the creditor and ends the game", () => {
    const g = newGame(2);
    for (const i of districtTiles("argentea")) g.ownership[i].ownerId = "p2";
    g.ownership[47].houses = 5;
    g.ownership[43].houses = 4;
    g.ownership[45].houses = 4;
    g.ownership[1].ownerId = "p1";
    g.players[0].balance = 100;
    g.players[0].position = 44; // utility, unowned
    const h = new Harness(g, scriptedDiceRng([1, 2]));
    h.run("u1", { type: "ROLL" }); // 44 + 3 = 47 -> tower rent 2200
    expect(h.s.turn.phase).toBe("DEBT");
    expect(h.s.debts[0]).toMatchObject({ debtorId: "p1", creditorId: "p2", amount: 2200 });
    expectGameError(() => h.run("u1", { type: "PAY_DEBT" }), "INSUFFICIENT_FUNDS");
    expectGameError(() => h.run("u2", { type: "PAY_DEBT" }), "NO_DEBT");
    h.run("u1", { type: "MORTGAGE", tile: 1 });
    expect(h.p("p1").balance).toBe(135);
    h.run("u1", { type: "DECLARE_BANKRUPTCY" });
    expect(h.p("p1").status).toBe("bankrupt");
    expect(h.s.ownership[1].ownerId).toBe("p2");
    expect(h.s.ownership[1].mortgaged).toBe(true);
    expect(h.s.status).toBe("finished");
    expect(h.s.winnerId).toBe("p2");
    expect(h.s.turn.phase).toBe("GAME_OVER");
    const st = computeStandings(h.s);
    expect(st[0].playerId).toBe("p2");
    expect(st[1].playerId).toBe("p1");
    expectGameError(() => h.run("u2", { type: "ROLL" }), "GAME_OVER");
  });

  it("returns a bankrupt player's properties to the bank and continues with the others", () => {
    const g = newGame(3);
    g.ownership[1].ownerId = "p1";
    g.players[0].balance = 10;
    g.players[0].position = 2; // roll 2 -> 4 = tax 200
    const h = new Harness(g, scriptedDiceRng([1, 1]));
    h.run("u1", { type: "ROLL" });
    expect(h.s.turn.phase).toBe("DEBT");
    h.run(null, { type: "TIMEOUT" }, 200_000); // auto-liquidate then bankrupt
    expect(h.p("p1").status).toBe("bankrupt");
    expect(h.s.ownership[1].ownerId).toBeNull();
    expect(h.s.ownership[1].mortgaged).toBe(false);
    expect(h.s.status).toBe("active");
    expect(h.s.turn.playerId).toBe("p2");
    expect(h.s.turn.phase).toBe("ROLL");
  });

  it("debtor can pay after mortgaging", () => {
    const g = newGame(2);
    g.ownership[10].ownerId = "p1";
    g.players[0].balance = 150;
    g.players[0].position = 2;
    const h = new Harness(g, scriptedDiceRng([1, 1]));
    h.run("u1", { type: "ROLL" }); // tax 200, has 150
    expect(h.s.turn.phase).toBe("DEBT");
    h.run("u1", { type: "MORTGAGE", tile: 10 }); // +70
    h.run("u1", { type: "PAY_DEBT" });
    expect(h.p("p1").balance).toBe(20);
    expect(h.s.turn.phase).toBe("ROLL"); // doubles -> roll again
  });

  it("finishes by net worth when the time limit expires", () => {
    const g = newGame(2, { maxDurationMinutes: 1 });
    g.players[1].balance = 5000;
    const h = new Harness(g, scriptedDiceRng([]));
    h.run(null, { type: "TIMEOUT" }, 61_000);
    expect(h.s.status).toBe("finished");
    expect(h.s.finishReason).toBe("timeLimit");
    expect(h.s.winnerId).toBe("p2");
    expect(netWorth(h.s, "p2")).toBe(5000);
  });

  it("resign gives properties back to the bank", () => {
    const g = newGame(3);
    g.ownership[3].ownerId = "p2";
    const h = new Harness(g, seededRng(1));
    h.run("u2", { type: "RESIGN" });
    expect(h.p("p2").status).toBe("bankrupt");
    expect(h.s.ownership[3].ownerId).toBeNull();
    expect(h.s.status).toBe("active");
  });
});

describe("timeouts", () => {
  it("auto-plays an AFK player's whole turn", () => {
    const h = new Harness(newGame(2), scriptedDiceRng([1, 2]));
    h.run(null, { type: "TIMEOUT" }, 121_000);
    // rolled to tile 3, declined -> auction started (needs everyone) -> stop
    expect(h.p("p1").position).toBe(3);
    expect(h.s.turn.phase).toBe("AUCTION");
    h.run(null, { type: "TIMEOUT" }, 21_000);
    expect(h.s.turn.phase).toBe("MANAGE");
    h.run(null, { type: "TIMEOUT" }, 31_000);
    expect(h.s.turn.playerId).toBe("p2");
    expect(h.s.turn.phase).toBe("ROLL");
  });
});

describe("cards", () => {
  function drawSpecific(cardId: string, deck: "chance" | "community", startPos: number, dice: [number, number]) {
    const g = newGame(3);
    const d = g.decks[deck];
    d.order = [cardId, ...d.order.filter((x) => x !== cardId)];
    d.index = 0;
    g.players[0].position = startPos;
    const h = new Harness(g, scriptedDiceRng(dice));
    h.run("u1", { type: "ROLL" });
    return h;
  }

  it("collect-from-each takes money from every other player", () => {
    const h = drawSpecific("co09", "community", 0, [1, 1]); // tile 2 community
    expect(h.s.lastCard?.cardId).toBe("co09");
    expect(h.p("p1").balance).toBe(2100);
    expect(h.p("p2").balance).toBe(1950);
    expect(h.p("p3").balance).toBe(1950);
  });

  it("go-to-jail card jails the player and cancels the extra roll", () => {
    const h = drawSpecific("co06", "community", 0, [1, 1]);
    expect(h.p("p1").inJail).toBe(true);
    expect(h.s.turn.phase).toBe("MANAGE");
  });

  it("jail-free card is kept, removed from the deck and usable", () => {
    const h = drawSpecific("ch11", "chance", 5, [1, 2]); // tile 8 chance
    expect(h.p("p1").jailCards).toEqual(["ch11"]);
    expect(h.s.decks.chance.order).not.toContain("ch11");
    h.run("u1", { type: "END_TURN" });
    h.p("p2"); // p2 turn: skip
    h.s.players[0].inJail = true;
    h.s.players[0].position = JAIL_INDEX;
    h.s.turn.playerId = "p1";
    h.s.turn.phase = "ROLL";
    h.s.turn.hasRolled = false;
    h.run("u1", { type: "USE_JAIL_CARD" });
    expect(h.p("p1").inJail).toBe(false);
    expect(h.s.decks.chance.order).toContain("ch11");
  });

  it("move-to-nearest-transport charges double rent", () => {
    const g = newGame(2);
    g.ownership[18].ownerId = "p2";
    const d = g.decks.chance;
    d.order = ["ch05", ...d.order.filter((x) => x !== "ch05")];
    g.players[0].position = 5;
    const h = new Harness(g, scriptedDiceRng([1, 2]));
    h.run("u1", { type: "ROLL" }); // 8 -> nearest transport = 18
    expect(h.p("p1").position).toBe(18);
    expect(h.p("p2").balance).toBe(2060);
  });

  it("advance-to-Partenza pays the bonus", () => {
    const h = drawSpecific("ch01", "chance", 5, [1, 2]);
    expect(h.p("p1").position).toBe(0);
    expect(h.p("p1").balance).toBe(2250);
  });
});

describe("simulation", () => {
  it("random 6-player games never produce negative balances or broken invariants", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rng = seededRng(seed);
      const h = new Harness(newGame(6, { maxDurationMinutes: 0 }), rng);
      for (let step = 0; step < 2500 && h.s.status === "active"; step++) {
        const s = h.s;
        const cur = s.players.find((p) => p.id === s.turn.playerId)!;
        try {
          switch (s.turn.phase) {
            case "ROLL":
              if (cur.inJail && cur.balance > 500 && rng.int(2) === 0) h.run(cur.userId, { type: "PAY_JAIL" });
              else h.run(cur.userId, { type: "ROLL" });
              break;
            case "BUY":
              if (cur.balance > 600) h.run(cur.userId, { type: "BUY" });
              else h.run(cur.userId, { type: "DECLINE_BUY" });
              break;
            case "AUCTION": {
              const a = s.auction!;
              const bidder = s.players.find((p) => p.status === "active" && !a.passedIds.includes(p.id) && p.id !== a.highBidderId);
              if (!bidder) {
                h.run(null, { type: "TIMEOUT" }, 30_000);
              } else if (rng.int(3) === 0 && bidder.balance > a.highBid + 50) {
                h.run(bidder.userId, { type: "BID", amount: a.highBid + 10 + (a.highBid === 0 ? 0 : 0) });
              } else h.run(bidder.userId, { type: "AUCTION_PASS" });
              break;
            }
            case "DEBT": {
              const debtor = s.players.find((p) => p.id === s.debts[0].debtorId)!;
              if (rng.int(4) === 0) h.run(debtor.userId, { type: "DECLARE_BANKRUPTCY" });
              else h.run(null, { type: "TIMEOUT" }, 200_000);
              break;
            }
            case "MANAGE": {
              const mine = Object.values(s.ownership).filter((o) => o.ownerId === cur.id);
              const pick = mine[rng.int(mine.length || 1)];
              if (pick && rng.int(3) === 0) {
                try {
                  h.run(cur.userId, { type: "BUILD", tile: pick.tile });
                } catch {
                  /* not buildable */
                }
              }
              h.run(cur.userId, { type: "END_TURN" });
              break;
            }
          }
        } catch (e) {
          if (!(e instanceof GameError)) throw e;
        }
        for (const p of h.s.players) {
          expect(p.balance).toBeGreaterThanOrEqual(0);
          expect(p.position).toBeGreaterThanOrEqual(0);
          expect(p.position).toBeLessThan(48);
          if (p.status === "bankrupt") expect(Object.values(h.s.ownership).some((o) => o.ownerId === p.id)).toBe(false);
        }
        for (const o of Object.values(h.s.ownership)) {
          expect(o.houses).toBeGreaterThanOrEqual(0);
          expect(o.houses).toBeLessThanOrEqual(5);
          if (o.mortgaged) expect(o.houses).toBe(0);
          if (!o.ownerId) expect(o.houses).toBe(0);
        }
        const totalCards =
          h.s.decks.chance.order.length + h.s.decks.community.order.length + h.s.players.reduce((n, p) => n + p.jailCards.length, 0);
        expect(totalCards).toBe(CARDS.length);
      }
    }
  });
});
