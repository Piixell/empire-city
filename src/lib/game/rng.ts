import type { Rng } from "./engine";

/** Deterministic PRNG (mulberry32) — used in tests and simulations. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let counter = 0;
  return {
    int: (max) => Math.floor(next() * max),
    uuid: () => {
      counter++;
      const hex = (n: number) => Math.floor(next() * 16 ** n).toString(16).padStart(n, "0");
      return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${counter.toString(16).padStart(4, "0")}${hex(8)}`;
    },
  };
}

/**
 * RNG whose `int(6)` calls return scripted dice values (1..6) first, then fall
 * back to a seeded generator. Handy for forcing dice in tests.
 */
export function scriptedDiceRng(dice: number[], seed = 1): Rng & { push: (...d: number[]) => void } {
  const queue = [...dice];
  const base = seededRng(seed);
  return {
    int: (max) => {
      if (max === 6 && queue.length) return queue.shift()! - 1;
      return base.int(max);
    },
    uuid: base.uuid,
    push: (...d: number[]) => queue.push(...d),
  };
}
