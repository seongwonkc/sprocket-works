/**
 * Small resistive-network solver: union-find for ideal wires, then nodal analysis for the lamps.
 *
 * Ideal wires merge nodes rather than being modelled as 0 Ω resistors — a 0 Ω branch makes the
 * conductance matrix singular, and a "very small" resistance makes it ill-conditioned. Merging is both
 * exact and faster.
 *
 * This exists so the circuit puzzle can be a genuine sandbox. Anything the player wires up gets solved,
 * including the configurations we never thought of, including dead shorts. A puzzle that only recognises
 * the intended answer teaches the puzzle; one that solves the physics teaches the physics.
 */

export const SUPPLY_V = 6;
export const LAMP_R = 12;

export interface Netlist {
  nodeCount: number;
  /** Ideal-wire connections, as node index pairs. */
  wires: [number, number][];
  /** Lamps, as node index pairs. Order defines the reported brightness order. */
  lamps: [number, number][];
  /** Positive terminal. */
  vplus: number;
  /** Negative terminal, defines 0 V. */
  vminus: number;
}

export interface Solution {
  /** Per lamp, dissipated power as a fraction of what it would get across the full supply. 0..1+. */
  brightness: number[];
  /** True when the terminals are wired directly together. Every lamp reads 0. */
  shorted: boolean;
}

class DSU {
  private p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.p[x] !== x) {
      this.p[x] = this.p[this.p[x] as number] as number;
      x = this.p[x] as number;
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p[ra] = rb;
  }
}

export function solve(net: Netlist): Solution {
  const dsu = new DSU(net.nodeCount);
  for (const [a, b] of net.wires) dsu.union(a, b);

  const gnd = dsu.find(net.vminus);
  const src = dsu.find(net.vplus);
  if (gnd === src) {
    return { brightness: net.lamps.map(() => 0), shorted: true };
  }

  // Index the merged nodes that are actually unknown.
  const idx = new Map<number, number>();
  for (let i = 0; i < net.nodeCount; i++) {
    const r = dsu.find(i);
    if (r === gnd || r === src) continue;
    if (!idx.has(r)) idx.set(r, idx.size);
  }
  const n = idx.size;

  // G·v = I, with the two known-voltage nodes folded into I.
  const G: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const I = new Array<number>(n).fill(0);
  const g = 1 / LAMP_R;

  for (const [a0, b0] of net.lamps) {
    const a = dsu.find(a0);
    const b = dsu.find(b0);
    if (a === b) continue; // lamp shorted out by a wire across it
    const ia = idx.get(a);
    const ib = idx.get(b);
    const va = a === src ? SUPPLY_V : a === gnd ? 0 : null;
    const vb = b === src ? SUPPLY_V : b === gnd ? 0 : null;

    if (ia !== undefined && ib !== undefined) {
      G[ia]![ia]! += g;
      G[ib]![ib]! += g;
      G[ia]![ib]! -= g;
      G[ib]![ia]! -= g;
    } else if (ia !== undefined && vb !== null) {
      G[ia]![ia]! += g;
      I[ia]! += g * vb;
    } else if (ib !== undefined && va !== null) {
      G[ib]![ib]! += g;
      I[ib]! += g * va;
    }
    // Both terminals known: contributes no equation, current is determined directly below.
  }

  // Leakage to ground. Floating sub-networks otherwise give an all-zero row and a singular matrix.
  // 1e-12 S against a lamp's 83 mS keeps the answer exact to ~1e-11 while still sitting comfortably
  // above the 1e-14 pivot threshold below, so a genuinely floating node is still resolved rather than
  // left undefined.
  for (let i = 0; i < n; i++) G[i]![i]! += 1e-12;

  const v = gauss(G, I);
  const nodeV = (raw: number): number => {
    const r = dsu.find(raw);
    if (r === src) return SUPPLY_V;
    if (r === gnd) return 0;
    const i = idx.get(r);
    return i === undefined ? 0 : (v[i] as number);
  };

  const full = (SUPPLY_V * SUPPLY_V) / LAMP_R;
  const brightness = net.lamps.map(([a, b]) => {
    if (dsu.find(a) === dsu.find(b)) return 0;
    const dv = nodeV(a) - nodeV(b);
    return (dv * dv) / LAMP_R / full;
  });

  return { brightness, shorted: false };
}

/** Gaussian elimination with partial pivoting. n is at most ~8 here. */
function gauss(A: number[][], b: number[]): number[] {
  const n = b.length;
  if (n === 0) return [];
  const M = A.map((row, i) => [...row, b[i] as number]);

  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(M[r]![c] as number) > Math.abs(M[piv]![c] as number)) piv = r;
    }
    if (Math.abs(M[piv]![c] as number) < 1e-14) continue; // degenerate column, leave v = 0
    [M[c], M[piv]] = [M[piv] as number[], M[c] as number[]];

    const d = M[c]![c] as number;
    for (let j = c; j <= n; j++) M[c]![j]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c] as number;
      if (f === 0) continue;
      for (let j = c; j <= n; j++) M[r]![j]! -= f * (M[c]![j] as number);
    }
  }
  return Array.from({ length: n }, (_, i) => M[i]![n] as number);
}
