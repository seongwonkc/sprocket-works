/**
 * Series and parallel, as a wiring sandbox.
 *
 * A ladder board: N lamps on rungs between a top and bottom rail, with tappable gaps in the rails and
 * diagonal cross-links between rungs. Wiring every rail gap gives parallel; wiring the crosses and the
 * return gives series. The player taps gaps and watches the lamps respond immediately.
 *
 * Nothing here checks for "the intended answer" — the solver in circuitSolver.ts evaluates whatever gets
 * built, and the goal is a target brightness vector. Any wiring that produces it is correct, including
 * ones we didn't anticipate.
 */

import { PAL } from '../../content/brand';
import { drawText, drawTextCentered } from '../../core/font';
import type { Input } from '../../core/input';
import type { Rng } from '../../core/rng';
import { play } from '../../core/audio';
import { hit, type Rect } from '../ui/widgets';
import { drawArtFit, hasArt } from '../../core/assets';
import { solve, type Netlist } from './circuitSolver';
import type { Generator, Outcome, Puzzle } from './types';

/** A gap in the board. Locked ones are part of the problem rather than part of the answer. */
interface Link {
  kind: 'top' | 'bot' | 'cross' | 'return';
  /** Rung index this link sits before/at. */
  i: number;
  on: boolean;
  /**
   * 'free'    — the player toggles it
   * 'soldered'— permanently closed
   * 'broken'  — permanently open
   *
   * Locks are why there are hundreds of instances rather than fourteen: the same target brightness
   * reached by a different route is a different problem. They also stop the obvious answer ("wire
   * every rail gap") from being the answer every time.
   */
  lock: 'free' | 'soldered' | 'broken';
}

interface Goal {
  /** Target brightness per lamp, 0..1. */
  target: number[];
  prompt: string;
  teach: string;
}

const TOL = 0.03;

/**
 * Board wiring, for N rungs:
 *   node T_i = i          (i = 0..N)   top rail
 *   node B_i = N + 1 + i  (i = 0..N)   bottom rail
 * Battery sits across T0 (+) and B0 (-). Lamp k (1..N) bridges T_k to B_k.
 */
function nodeT(i: number): number {
  return i;
}
function nodeB(n: number, i: number): number {
  return n + 1 + i;
}

function makeLinks(n: number): Link[] {
  const l: Link[] = [];
  for (let i = 0; i < n; i++) l.push({ kind: 'top', i, on: false, lock: 'free' });
  for (let i = 0; i < n; i++) l.push({ kind: 'bot', i, on: false, lock: 'free' });
  for (let i = 1; i < n; i++) l.push({ kind: 'cross', i, on: false, lock: 'free' });
  l.push({ kind: 'return', i: n, on: false, lock: 'free' });
  return l;
}

function netlistOf(n: number, links: Link[]): Netlist {
  const wires: [number, number][] = [];
  for (const l of links) {
    if (!l.on) continue;
    switch (l.kind) {
      case 'top': wires.push([nodeT(l.i), nodeT(l.i + 1)]); break;
      case 'bot': wires.push([nodeB(n, l.i), nodeB(n, l.i + 1)]); break;
      case 'cross': wires.push([nodeB(n, l.i), nodeT(l.i + 1)]); break;
      case 'return': wires.push([nodeB(n, n), nodeB(n, 0)]); break;
    }
  }
  const lamps: [number, number][] = [];
  for (let k = 1; k <= n; k++) lamps.push([nodeT(k), nodeB(n, k)]);
  return { nodeCount: 2 * (n + 1), wires, lamps, vplus: nodeT(0), vminus: nodeB(n, 0) };
}

function matches(got: number[], want: number[]): boolean {
  return got.length === want.length && got.every((g, i) => Math.abs(g - (want[i] as number)) <= TOL);
}

class CircuitPuzzle implements Puzzle {
  readonly domain = 'circuit' as const;
  readonly prompt: string;
  readonly teach: string;
  readonly hint =
    'Side by side across the battery, every lamp gets the full voltage. Sharing one path, they split it. Watch the lamps as you tap — they answer immediately.';
  attempts = 0;

  private state: Outcome = 'open';
  private readonly links: Link[];

  constructor(
    readonly instance: string,
    private readonly n: number,
    private readonly goal: Goal,
    locks: readonly Link['lock'][],
  ) {
    this.links = makeLinks(n);
    this.links.forEach((l, i) => {
      l.lock = locks[i] ?? 'free';
      if (l.lock === 'soldered') l.on = true;
    });
    this.prompt = goal.prompt;
    this.teach = goal.teach;
  }

  private solveNow() {
    return solve(netlistOf(this.n, this.links));
  }

  step(input: Input, _dt: number, area: Rect): void {
    if (this.state !== 'open') return;
    const p = input.pointer;
    if (!p.released) return;
    const L = this.layout(area);
    for (const link of this.links) {
      if (!hit(this.linkRect(link, L), p.x, p.y)) continue;
      if (link.lock !== 'free') {
        play('nope');
        return;
      }
      link.on = !link.on;
      play(link.on ? 'click' : 'nope');
      return;
    }
  }

  check(): void {
    if (this.state !== 'open') return;
    this.attempts++;
    const s = this.solveNow();
    if (!s.shorted && matches(s.brightness, this.goal.target)) {
      this.state = 'solved';
      play('ok');
    } else {
      this.state = 'failed';
      play('nope');
    }
  }

  canCheck(): boolean {
    return true;
  }

  outcome(): Outcome {
    return this.state;
  }

  // --- layout -------------------------------------------------------------------
  private layout(area: Rect) {
    const n = this.n;
    const padX = 46;
    const w = area.w - padX * 2;
    const step = w / n;
    const x0 = area.x + padX;
    const topY = area.y + 22;
    const botY = area.y + area.h - 34;
    return { n, x0, step, topY, botY, area };
  }

  private railX(L: ReturnType<typeof this.layout>, i: number): number {
    return Math.round(L.x0 + i * L.step);
  }

  private linkRect(l: Link, L: ReturnType<typeof this.layout>): Rect {
    const H = 12; // generous vertical target; the visual wire is 1px
    switch (l.kind) {
      case 'top': {
        const a = this.railX(L, l.i);
        return { x: a, y: L.topY - H / 2, w: Math.round(L.step), h: H };
      }
      case 'bot': {
        const a = this.railX(L, l.i);
        return { x: a, y: L.botY - H / 2, w: Math.round(L.step), h: H };
      }
      case 'cross': {
        const a = this.railX(L, l.i);
        const b = this.railX(L, l.i + 1);
        return { x: Math.min(a, b), y: L.topY + 6, w: Math.abs(b - a), h: L.botY - L.topY - 12 };
      }
      case 'return':
        return { x: L.x0 - 12, y: L.botY + 4, w: this.railX(L, L.n) - L.x0 + 24, h: 11 };
    }
  }

  // --- draw ---------------------------------------------------------------------
  draw(ctx: CanvasRenderingContext2D, area: Rect, input: Input): void {
    const L = this.layout(area);
    const s = this.solveNow();
    const p = input.pointer;

    // Cross links first, so rungs and rails draw over them.
    for (const l of this.links) {
      if (l.kind !== 'cross') continue;
      const r = this.linkRect(l, L);
      const over = l.lock === 'free' && hit(r, p.x, p.y);
      this.drawDiagonal(ctx, this.railX(L, l.i), L.botY, this.railX(L, l.i + 1), L.topY, l, over);
    }

    // Return wire, routed below the board.
    {
      const l = this.links.find((k) => k.kind === 'return') as Link;
      const r = this.linkRect(l, L);
      const over = l.lock === 'free' && hit(r, p.x, p.y);
      ctx.fillStyle = wireColour(l, over);
      const y = L.botY + 9;
      const xa = L.x0;
      const xb = this.railX(L, L.n);
      if (l.on) {
        ctx.fillRect(xa, y, xb - xa, 1);
        ctx.fillRect(xa, L.botY, 1, y - L.botY);
        ctx.fillRect(xb, L.botY, 1, y - L.botY);
      } else {
        for (let x = xa; x < xb; x += 4) ctx.fillRect(x, y, 2, 1);
      }
    }

    // Rails
    for (const l of this.links) {
      if (l.kind !== 'top' && l.kind !== 'bot') continue;
      const y = l.kind === 'top' ? L.topY : L.botY;
      const r = this.linkRect(l, L);
      const over = l.lock === 'free' && hit(r, p.x, p.y);
      this.drawGap(ctx, this.railX(L, l.i), this.railX(L, l.i + 1), y, l, over);
    }

    // Battery. The schematic symbol was correct and unreadable at a glance; a picture of a lantern
    // cell tells a nine-year-old what it is without a legend.
    {
      const mid = Math.round((L.topY + L.botY) / 2);
      const bx = L.x0 - 22;
      if (!drawArtFit(ctx, 'elec_battery', bx, mid, 30, 34)) {
        ctx.fillStyle = PAL.hot;
        ctx.fillRect(bx - 5, mid - 5, 11, 2);
        ctx.fillStyle = PAL.steel3;
        ctx.fillRect(bx - 3, mid + 1, 7, 2);
      }
      // Leads from the terminals up to the rails.
      ctx.fillStyle = PAL.hot;
      ctx.fillRect(bx, L.topY, 2, mid - 16 - L.topY);
      ctx.fillRect(bx, L.topY, L.x0 - bx, 2);
      ctx.fillStyle = PAL.steel3;
      ctx.fillRect(bx, mid + 16, 2, L.botY - mid - 16);
      ctx.fillRect(bx, L.botY, L.x0 - bx, 2);
      drawText(ctx, '6V', bx - 8, mid + 20, PAL.steel2);
    }

    // Rungs and lamps
    for (let k = 1; k <= L.n; k++) {
      const x = this.railX(L, k);
      ctx.fillStyle = PAL.steel2;
      ctx.fillRect(x, L.topY, 1, L.botY - L.topY);
      const b = s.brightness[k - 1] as number;
      this.drawLamp(ctx, x, (L.topY + L.botY) / 2, b);
      // Number every lamp: the prompt says "lamp 2 off" and there was no way to tell which one that was.
      // Numbered just under the top rail, clear of the bulb art.
      drawText(ctx, String(k), x - 2, L.topY + 5, PAL.steel3);
      // Target under each lamp, so "what am I aiming at" never leaves the screen.
      const want = this.goal.target[k - 1] as number;
      drawTextCentered(
        ctx,
        want <= 0 ? 'OFF' : `${Math.round(want * 100)}%`,
        x,
        L.botY + 16,
        Math.abs(b - want) <= TOL ? PAL.volt : PAL.steel2,
      );
    }

    if (s.shorted) {
      drawTextCentered(ctx, 'SHORT CIRCUIT', area.x + area.w / 2, area.y + 10, PAL.hot);
    }
  }

  private drawGap(
    ctx: CanvasRenderingContext2D,
    xa: number,
    xb: number,
    y: number,
    l: Link,
    over: boolean,
  ): void {
    ctx.fillStyle = wireColour(l, over);
    if (l.on) {
      ctx.fillRect(xa, y, xb - xa, 1);
      // Rivets mark a soldered joint as "not yours to change" without needing a legend.
      if (l.lock === 'soldered') {
        ctx.fillStyle = PAL.bone;
        ctx.fillRect(xa + 2, y - 1, 1, 3);
        ctx.fillRect(xb - 3, y - 1, 1, 3);
      }
    } else if (l.lock === 'broken') {
      // A visible cut: the wire is there and severed, which reads differently from an empty gap.
      ctx.fillRect(xa, y, 3, 1);
      ctx.fillRect(xb - 3, y, 3, 1);
      ctx.fillStyle = PAL.hot;
      const mx = Math.round((xa + xb) / 2);
      ctx.fillRect(mx - 1, y - 2, 1, 1);
      ctx.fillRect(mx + 1, y + 2, 1, 1);
    } else {
      for (let x = xa + 1; x < xb - 1; x += 3) ctx.fillRect(x, y, 1, 1);
    }
  }

  private drawDiagonal(
    ctx: CanvasRenderingContext2D,
    xa: number, ya: number, xb: number, yb: number,
    l: Link, over: boolean,
  ): void {
    const steps = Math.max(Math.abs(xb - xa), Math.abs(yb - ya));
    ctx.fillStyle = l.on ? (l.lock === 'soldered' ? PAL.brassLit : PAL.brass)
      : l.lock === 'broken' ? PAL.rust
      : over ? PAL.steel2 : PAL.shadow;
    for (let i = 0; i <= steps; i++) {
      // Closed wires draw solid; open ones dot, so state is legible without colour.
      if (!l.on && i % 3 !== 0) continue;
      if (l.lock === 'broken' && !l.on && i > steps * 0.25 && i < steps * 0.75) continue;
      const t = i / steps;
      ctx.fillRect(Math.round(xa + (xb - xa) * t), Math.round(ya + (yb - ya) * t), 1, 1);
    }
  }

  private drawLamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, b: number): void {
    const lit = Math.max(0, Math.min(1, b));

    // Glow behind the bulb, sized by brightness. At this resolution size reads far better than hue,
    // and it survives being looked at by someone who cannot tell amber from grey.
    if (lit > 0.02) {
      ctx.globalAlpha = 0.22 * lit;
      ctx.fillStyle = PAL.amber;
      const rr = Math.round(6 + lit * 12);
      ctx.fillRect(cx - rr, cy - rr, rr * 2 + 1, rr * 2 + 1);
      ctx.globalAlpha = 0.16 * lit;
      const r2 = Math.round(3 + lit * 6);
      ctx.fillRect(cx - r2, cy - r2, r2 * 2 + 1, r2 * 2 + 1);
      ctx.globalAlpha = 1;
    }

    const key = lit > 0.35 ? 'elec_bulb_on' : 'elec_bulb_off';
    if (hasArt(key)) {
      // Dim-but-lit bulbs use the lit art at reduced opacity, so partial brightness is visible as
      // partial brightness rather than snapping between two states.
      if (lit > 0.02 && lit <= 0.35) {
        drawArtFit(ctx, 'elec_bulb_off', cx, cy, 22, 30);
        ctx.globalAlpha = 0.35 + lit;
        drawArtFit(ctx, 'elec_bulb_on', cx, cy, 22, 30);
        ctx.globalAlpha = 1;
      } else {
        drawArtFit(ctx, key, cx, cy, 22, 30);
      }
      return;
    }

    ctx.fillStyle = lit > 0.02 ? mix(PAL.steel0, PAL.amber, lit) : PAL.steel0;
    ctx.fillRect(cx - 5, cy - 5, 11, 11);
    ctx.fillStyle = PAL.steel3;
    ctx.fillRect(cx - 5, cy - 5, 11, 1);
    ctx.fillRect(cx - 5, cy + 5, 11, 1);
    ctx.fillRect(cx - 5, cy - 5, 1, 11);
    ctx.fillRect(cx + 5, cy - 5, 1, 11);
  }
}

function wireColour(l: Link, over: boolean): string {
  if (l.lock === 'soldered') return PAL.brassLit;
  if (l.lock === 'broken') return PAL.rust;
  if (l.on) return PAL.brass;
  return over ? PAL.steel3 : PAL.steel1;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number): number =>
    Math.round((((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// --- generation -----------------------------------------------------------------

/** Brute-force every wiring of an N-rung board and keep the reachable brightness patterns. */
function reachable(n: number): Map<string, number[]> {
  const links = makeLinks(n);
  const out = new Map<string, number[]>();
  const total = 1 << links.length;
  for (let mask = 0; mask < total; mask++) {
    links.forEach((l, i) => (l.on = (mask & (1 << i)) !== 0));
    const s = solve(netlistOf(n, links));
    if (s.shorted) continue;
    const key = s.brightness.map((b) => b.toFixed(2)).join(',');
    if (!out.has(key)) out.set(key, s.brightness.map((b) => Number(b.toFixed(2))));
  }
  return out;
}

const CACHE = new Map<number, Map<string, number[]>>();
function reachableCached(n: number): Map<string, number[]> {
  let m = CACHE.get(n);
  if (!m) {
    m = reachable(n);
    CACHE.set(n, m);
  }
  return m;
}

function describe(target: number[]): { prompt: string; teach: string } {
  const on = target.filter((t) => t > 0.02);
  const allFull = on.length === target.length && target.every((t) => t > 0.97);
  const allEqual = on.length > 1 && on.every((t) => Math.abs(t - (on[0] as number)) < 0.02);

  if (allFull) {
    return {
      prompt: `Light all ${target.length} lamps at full brightness.`,
      teach: 'Wired side by side — in parallel — every lamp sees the whole supply voltage.',
    };
  }
  if (allEqual && on.length === target.length) {
    return {
      prompt: `Light all ${target.length} lamps equally, at ${Math.round((on[0] as number) * 100)}%.`,
      teach: 'Wired end to end — in series — the lamps share the voltage, so each one is dimmer.',
    };
  }
  const parts = target.map((t, i) =>
    t <= 0.02 ? `${i + 1} off` : t > 0.97 ? `${i + 1} full` : `${i + 1} at ${Math.round(t * 100)}%`,
  );
  return {
    prompt: `Lamp ${parts.join(', lamp ')}.`,
    teach: 'Branches in parallel each get the full voltage; lamps sharing a branch split it between them.',
  };
}

/** Can `target` still be reached with these locks in place? Brute-forces the free links only. */
function solvableWith(n: number, locks: Link['lock'][], target: number[]): boolean {
  const links = makeLinks(n);
  links.forEach((l, i) => (l.lock = locks[i] ?? 'free'));
  const free = links.map((l, i) => (l.lock === 'free' ? i : -1)).filter((i) => i >= 0);

  for (let mask = 0; mask < 1 << free.length; mask++) {
    links.forEach((l) => (l.on = l.lock === 'soldered'));
    free.forEach((li, k) => {
      (links[li] as Link).on = (mask & (1 << k)) !== 0;
    });
    const s = solve(netlistOf(n, links));
    if (!s.shorted && matches(s.brightness, target)) return true;
  }
  return false;
}

export const circuitGen: Generator = {
  domain: 'circuit',
  make(rng: Rng, tier: number): Puzzle {
    // n=2 only yields four distinct lit patterns, which a player exhausts in one warehouse. Three
    // rungs from the start, with the partial-brightness targets held back until the vocabulary lands.
    const n = tier < 5 ? 3 : 4;
    const all = [...reachableCached(n).values()];
    const lit = all.filter((t) => t.some((b) => b > 0.02));
    const pool = tier < 2 ? lit.filter((t) => t.every((b) => b <= 0.02 || b > 0.97)) : lit;
    const target = rng.pick(pool.length ? pool : lit);

    // Lock a few links. Verified solvable before it ships, and we keep the hardest arrangement we
    // found rather than the first, so higher tiers really are tighter.
    const linkCount = makeLinks(n).length;
    const wantLocks = Math.min(linkCount - 2, 1 + Math.floor(tier / 2));
    let locks: Link['lock'][] = new Array<Link['lock']>(linkCount).fill('free');

    for (let attempt = 0; attempt < 40 && wantLocks > 0; attempt++) {
      const cand: Link['lock'][] = new Array<Link['lock']>(linkCount).fill('free');
      for (const i of rng.sample([...Array(linkCount).keys()], wantLocks)) {
        cand[i] = rng.next() < 0.5 ? 'soldered' : 'broken';
      }
      if (solvableWith(n, cand, target)) {
        locks = cand;
        break;
      }
    }

    const lockKey = locks.map((l) => (l === 'soldered' ? 's' : l === 'broken' ? 'b' : '.')).join('');
    const { prompt, teach } = describe(target);
    const inst = `cir-${n}-${target.map((t) => t.toFixed(2)).join('/')}-${lockKey}`;
    return new CircuitPuzzle(inst, n, { target, prompt, teach }, locks);
  },
};

export { CircuitPuzzle };
