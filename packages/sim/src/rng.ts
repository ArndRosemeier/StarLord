/**
 * Deterministic PRNG (mulberry32). Its whole state is one uint32 stored in the
 * game state, so saving, replaying and lockstep multiplayer all reproduce the
 * same rolls.
 */
export interface RngState {
  s: number;
}

export function seedRng(seed: number | string): RngState {
  let h = 2166136261 >>> 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return { s: h };
}

export class Rng {
  constructor(private readonly state: RngState) {}

  /** Float in [0, 1). */
  next(): number {
    this.state.s = (this.state.s + 0x6d2b79f5) >>> 0;
    let t = this.state.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick from empty list");
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Picks a key from a weight table; weights need not sum to 1. */
  weighted<K extends string>(table: Readonly<Partial<Record<K, number>>>): K {
    const entries = Object.entries(table) as [K, number][];
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.next() * total;
    for (const [key, w] of entries) {
      roll -= w;
      if (roll < 0) return key;
    }
    return entries[entries.length - 1]![0];
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}
