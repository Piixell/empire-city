import { applyCommand, createInitialState, type Rng } from "@/lib/game/engine";
import { seededRng } from "@/lib/game/rng";
import { DEFAULT_SETTINGS, type Command, type GameSettings, type GameState, type PlayerColor } from "@/lib/game/types";

const COLORS: PlayerColor[] = ["red", "blue", "green", "yellow", "purple", "orange"];

export function newGame(n = 2, settings: Partial<GameSettings> = {}, now = 1_000_000): GameState {
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    userId: `u${i + 1}`,
    roomPlayerId: `rp${i + 1}`,
    name: `Giocatore ${i + 1}`,
    color: COLORS[i],
    token: "car" as const,
    avatar: "🙂",
  }));
  const s = createInitialState({
    gameId: "g1",
    roomId: "r1",
    settings: { ...DEFAULT_SETTINGS, ...settings },
    players,
    now,
    rng: seededRng(42),
  });
  // Normalize seat order so p1 plays first, p2 second, ...
  s.players.sort((a, b) => a.id.localeCompare(b.id));
  s.players.forEach((p, i) => (p.seat = i));
  s.turn.playerId = s.players[0].id;
  return s;
}

export class Harness {
  now: number;
  constructor(
    public s: GameState,
    public rng: Rng & { push?: (...d: number[]) => void },
  ) {
    this.now = s.startedAt;
  }
  run(userId: string | null, cmd: Command, advanceMs = 1000) {
    this.now += advanceMs;
    const r = applyCommand(this.s, userId, cmd, { now: this.now, rng: this.rng });
    this.s = r.state;
    return r;
  }
  p(id: string) {
    return this.s.players.find((x) => x.id === id)!;
  }
  get current() {
    return this.s.players.find((x) => x.id === this.s.turn.playerId)!;
  }
}
