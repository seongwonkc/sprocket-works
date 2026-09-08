/**
 * Torque balance.
 *
 * A beam on a fulcrum with pegs at integer distances. Some weights are pinned; the player drags the
 * rest from a tray. Balanced when Σ(w·d) left equals Σ(w·d) right.
 *
 * The beam tilts live in proportion to the net torque, so the answer is *visible* before you commit —
 * this is a manipulable, not a quiz. Getting it wrong should feel like the beam telling you, not like
 * a red X.
 */

import { PAL } from '../../content/brand';
import { drawText, drawTextCentered } from '../../core/font';
import type { Input } from '../../core/input';
import type { Rng } from '../../core/rng';
import { play } from '../../core/audio';
import { hit, panel, type Rect } from '../ui/widgets';
import type { Generator, Outcome, Puzzle } from './types';

/** Weights are sized by mass so a 10 kg block visibly outweighs a 2 kg one before you do the sum. */
function weightSize(kg: number): number {
  return kg >= 8 ? 26 : kg >= 4 ? 22 : 18;
}

/** Peg distances from the fulcrum, in arbitrary units. Index 0 is the far left. */
const PEGS = [-4, -3, -2, -1, 1, 2, 3, 4] as const;

interface Weight {
  kg: number;
  /** Peg index, or null while in the tray. */
  peg: number | null;
  /** Pinned weights can't be moved. */
  fixed: boolean;
  /** Tray slot, used for layout when peg is null. */
  slot: number;
}

class BalancePuzzle implements Puzzle {
  readonly domain = 'balance' as const;
  readonly prompt: string;
  readonly teach =
    'A lever balances when weight times distance matches on both sides. Twice as far needs half as much.';
  readonly hint =
    'Multiply each weight by its distance from the middle. Make the two sides add up to the same number.';
  attempts = 0;

  private outcomeState: Outcome = 'open';
  private dragging = -1;
  private dragX = 0;
  private dragY = 0;
  /** Smoothed tilt, radians. Purely cosmetic. */
  private tilt = 0;

  constructor(
    readonly instance: string,
    private readonly weights: Weight[],
  ) {
    const loose = weights.filter((w) => !w.fixed).length;
    this.prompt = `Hang ${
      loose === 1 ? 'the weight' : loose === 2 ? 'both weights' : `all ${loose} weights`
    } so the beam balances.`;
  }

  private torque(): number {
    let t = 0;
    for (const w of this.weights) {
      if (w.peg === null) continue;
      t += w.kg * (PEGS[w.peg] as number);
    }
    return t;
  }

  private allPlaced(): boolean {
    return this.weights.every((w) => w.peg !== null);
  }

  step(input: Input, dt: number, area: Rect): void {
    if (this.outcomeState !== 'open') return;

    const L = this.layout(area);
    const p = input.pointer;

    if (p.pressed) {
      // Topmost first: a weight on a peg sits above the tray in z-order.
      for (let i = this.weights.length - 1; i >= 0; i--) {
        const w = this.weights[i] as Weight;
        if (w.fixed) continue;
        const r = this.weightRect(w, L);
        if (hit(r, p.x, p.y)) {
          this.dragging = i;
          this.dragX = p.x;
          this.dragY = p.y;
          play('click');
          break;
        }
      }
    }

    if (this.dragging >= 0) {
      this.dragX = p.x;
      this.dragY = p.y;
      if (p.released) {
        const w = this.weights[this.dragging] as Weight;
        w.peg = this.nearestPeg(p.x, p.y, L);
        this.dragging = -1;
        play(w.peg === null ? 'nope' : 'pickup');
      }
    }

    // Ease toward the true tilt. Capped so a wildly unbalanced beam doesn't leave the panel.
    const target = Math.max(-0.34, Math.min(0.34, this.torque() * 0.012));
    this.tilt += (target - this.tilt) * Math.min(1, dt * 8);
  }

  /** Called by the host when the player commits. */
  check(): void {
    if (this.outcomeState !== 'open') return;
    this.attempts++;
    if (!this.allPlaced()) {
      play('nope');
      return;
    }
    if (Math.abs(this.torque()) < 1e-6) {
      this.outcomeState = 'solved';
      play('ok');
    } else {
      this.outcomeState = 'failed';
      play('nope');
    }
  }

  canCheck(): boolean {
    return this.allPlaced();
  }

  outcome(): Outcome {
    return this.outcomeState;
  }

  // --- layout -------------------------------------------------------------------
  private layout(area: Rect) {
    const cx = area.x + area.w / 2;
    const beamY = area.y + Math.round(area.h * 0.42);
    // Peg spacing derived from available width so the beam always fits the panel.
    const step = Math.min(38, Math.floor((area.w - 40) / 9));
    const trayY = area.y + area.h - 34;
    return { cx, beamY, step, trayY, area };
  }

  private pegPos(L: ReturnType<typeof this.layout>, pegIdx: number): { x: number; y: number } {
    const d = PEGS[pegIdx] as number;
    const x = L.cx + d * L.step;
    // Points on the beam ride the tilt.
    return { x, y: L.beamY + Math.sin(this.tilt) * (x - L.cx) };
  }

  private weightRect(w: Weight, L: ReturnType<typeof this.layout>): Rect {
    const size = weightSize(w.kg);
    if (w.peg === null) {
      const x = L.area.x + 16 + w.slot * (size + 12);
      return { x, y: L.trayY, w: size, h: size };
    }
    const p = this.pegPos(L, w.peg);
    return { x: Math.round(p.x - size / 2), y: Math.round(p.y + 7), w: size, h: size };
  }

  private nearestPeg(x: number, y: number, L: ReturnType<typeof this.layout>): number | null {
    // Dropped low = back to the tray.
    if (y > L.beamY + 46) return null;
    let best = -1;
    let bestD = Math.max(14, L.step * 0.6);
    for (let i = 0; i < PEGS.length; i++) {
      if (this.weights.some((w) => w.peg === i)) continue; // one weight per peg
      const p = this.pegPos(L, i);
      const d = Math.abs(p.x - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best < 0 ? null : best;
  }

  // --- draw ---------------------------------------------------------------------
  draw(ctx: CanvasRenderingContext2D, area: Rect, _input: Input): void {
    const L = this.layout(area);

    // Fulcrum
    ctx.fillStyle = PAL.steel2;
    for (let i = 0; i < 26; i++) {
      ctx.fillRect(L.cx - i / 2 - 1, L.beamY + 5 + i, i + 2, 1);
    }
    ctx.fillStyle = PAL.steel1;
    ctx.fillRect(L.cx - 16, L.beamY + 30, 32, 3);

    // Beam, drawn as a run of 1px columns following the tilt.
    const half = 4.6 * L.step;
    ctx.fillStyle = PAL.brass;
    for (let dx = -half; dx <= half; dx++) {
      const y = L.beamY + Math.sin(this.tilt) * dx;
      ctx.fillRect(Math.round(L.cx + dx), Math.round(y), 1, 6);
    }

    // Pegs + distance labels
    for (let i = 0; i < PEGS.length; i++) {
      const p = this.pegPos(L, i);
      const taken = this.weights.some((w) => w.peg === i);
      ctx.fillStyle = taken ? PAL.brassLit : PAL.steel2;
      ctx.fillRect(Math.round(p.x), Math.round(p.y) + 6, 1, 7);
      // Distance labels ride the beam. Pinned to a flat line they drifted away from their own pegs
      // as soon as it tilted, which is exactly when the player is reading them.
      const d = Math.abs(PEGS[i] as number);
      drawTextCentered(ctx, String(d), p.x + 0.5, p.y - 14, PAL.steel3);
    }

    // Tray rail
    ctx.fillStyle = PAL.shadow;
    ctx.fillRect(area.x + 6, L.trayY + 26, area.w - 12, 1);
    drawText(ctx, 'TRAY', area.x + 6, L.trayY + 29, PAL.steel2);

    for (let i = 0; i < this.weights.length; i++) {
      if (i === this.dragging) continue;
      this.drawWeight(ctx, this.weights[i] as Weight, this.weightRect(this.weights[i] as Weight, L));
    }
    if (this.dragging >= 0) {
      const w = this.weights[this.dragging] as Weight;
      const size = weightSize(w.kg);
      this.drawWeight(ctx, w, { x: this.dragX - size / 2, y: this.dragY - size / 2, w: size, h: size });
    }

    // Live torque readout. Showing the number is the tutoring: it names the quantity the beam is obeying.
    const t = this.torque();
    const label = t === 0 ? 'BALANCED' : t < 0 ? `LEFT HEAVY ${-t}` : `RIGHT HEAVY ${t}`;
    drawTextCentered(ctx, label, area.x + area.w / 2, area.y + 2, t === 0 ? PAL.volt : PAL.steel3);
  }

  private drawWeight(ctx: CanvasRenderingContext2D, w: Weight, r: Rect): void {
    panel(ctx, r, w.fixed ? PAL.steel1 : PAL.rust, w.fixed ? PAL.steel3 : PAL.hot);
    drawTextCentered(ctx, String(w.kg), r.x + r.w / 2, r.y + (r.h - 7) / 2, PAL.white);
  }
}

export const balanceGen: Generator = {
  domain: 'balance',
  make(rng: Rng, tier: number): Puzzle {
    // Difficulty: how many weights the player must place, and whether the pinned side is a clean multiple.
    const loose = tier < 2 ? 1 : tier < 5 ? 2 : 3;
    const fixedCount = tier < 4 ? 1 : 2;

    // Build a guaranteed-solvable instance by choosing the answer first and hiding it.
    for (let tries = 0; tries < 200; tries++) {
      const weights: Weight[] = [];
      const usedPegs = new Set<number>();
      const takePeg = (side: -1 | 1): number | null => {
        const opts = PEGS.map((d, i) => ({ d, i }))
          .filter((o) => Math.sign(o.d) === side && !usedPegs.has(o.i));
        if (opts.length === 0) return null;
        const c = rng.pick(opts);
        usedPegs.add(c.i);
        return c.i;
      };

      let torque = 0;
      let ok = true;
      for (let i = 0; i < fixedCount; i++) {
        const peg = takePeg(-1);
        if (peg === null) { ok = false; break; }
        const kg = rng.int(1, 6);
        weights.push({ kg, peg, fixed: true, slot: -1 });
        torque += kg * (PEGS[peg] as number);
      }
      if (!ok) continue;

      // Place the loose weights on the right so they cancel the fixed torque exactly.
      let remaining = -torque; // must be produced by the right side
      const placed: { kg: number; peg: number }[] = [];
      for (let i = 0; i < loose && ok; i++) {
        const last = i === loose - 1;
        const peg = takePeg(1);
        if (peg === null) { ok = false; break; }
        const d = PEGS[peg] as number;
        if (last) {
          if (remaining <= 0 || remaining % d !== 0) { ok = false; break; }
          const kg = remaining / d;
          if (kg < 1 || kg > 12) { ok = false; break; }
          placed.push({ kg, peg });
          remaining = 0;
        } else {
          const kg = rng.int(1, Math.max(1, Math.floor((remaining - 1) / d)));
          if (kg < 1) { ok = false; break; }
          placed.push({ kg, peg });
          remaining -= kg * d;
        }
      }
      if (!ok || remaining !== 0) continue;

      // Hide the solution: the player gets the weights, not the pegs.
      placed.forEach((p, i) => weights.push({ kg: p.kg, peg: null, fixed: false, slot: i }));

      return new BalancePuzzle(`bal-${weights.map((w) => `${w.kg}@${w.peg ?? 'x'}`).join('.')}`, weights);
    }

    // Fallback: a trivially solvable instance rather than throwing mid-game.
    return new BalancePuzzle('bal-fallback', [
      { kg: 4, peg: 3, fixed: true, slot: -1 }, // -1 unit
      { kg: 4, peg: null, fixed: false, slot: 0 },
    ]);
  },
};

export { BalancePuzzle };
