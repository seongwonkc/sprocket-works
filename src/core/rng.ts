/**
 * Seeded PRNG (mulberry32). Puzzle generators and rival builds are seeded so a given save produces the
 * same warehouse every time it's reloaded, and so a bad generated instance can be reproduced from its
 * seed alone when someone reports it.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  float(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick from empty array');
    return arr[Math.floor(this.next() * arr.length)] as T;
  }

  /** Fisher-Yates, returns a new array. */
  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  }

  /** n distinct members. Throws if n > arr.length. */
  sample<T>(arr: readonly T[], n: number): T[] {
    if (n > arr.length) throw new Error(`sample ${n} from ${arr.length}`);
    return this.shuffle(arr).slice(0, n);
  }
}

/** Non-reproducible seed, for "new game" only. */
export function freshSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
