/**
 * Force and energy on a ramp — predict, then watch.
 *
 * A ball is released from a chosen height on a curved ramp, leaves the lip horizontally, and flies. The
 * player picks the release height; Check runs the real integration and the ball either lands in the
 * bucket or doesn't.
 *
 * The physics is honest and the whole point: mgh converts to ½mv², so v = √(2gh) at the lip, and the
 * flight is a plain parabola. Mass cancels completely, which is the counter-intuitive bit worth teaching
 * — the generator therefore varies the ball's mass between instances and it never once changes the answer.
 */

import { PAL } from '../../content/brand';
import { drawText, drawTextCentered } from '../../core/font';
import type { Input } from '../../core/input';
import type { Rng } from '../../core/rng';
import { play } from '../../core/audio';
import { button, type Rect } from '../ui/widgets';
import { drawArtFit, hasArt } from '../../core/assets';
import type { Generator, Outcome, Puzzle } from './types';

const G = 9.81;

/** Metres of horizontal flight from a lip `dropM` above the floor, released from height `hM`. */
function rangeOf(hM: number, dropM: number): number {
  const v = Math.sqrt(2 * G * Math.max(0, hM));
  const t = Math.sqrt((2 * Math.max(0, dropM)) / G);
  return v * t;
}

class ForcePuzzle implements Puzzle {
  readonly domain = 'force' as const;
  readonly prompt: string;
  readonly teach =
    'Height turns into speed: drop from four times as high and you leave the ramp only twice as fast. The ball\'s weight makes no difference at all.';
  readonly hint =
    'Try the extremes first. Too short means not enough height; overshooting means too much. The mass is a red herring.';
  attempts = 0;

  private state: Outcome = 'open';
  private choice: number;
  /** Flight animation clock, seconds. Runs only after Check. */
  private t = -1;

  constructor(
    readonly instance: string,
    /** Selectable release heights, metres. */
    private readonly options: number[],
    private readonly answer: number,
    /** Lip height above the floor, metres. */
    private readonly dropM: number,
    /** Bucket centre distance from the lip, metres, and its width. */
    private readonly targetM: number,
    private readonly tolM: number,
    private readonly massKg: number,
  ) {
    this.choice = 0;
    // One line at 280px: two lines cost 8px of an already short drawing area.
    this.prompt = `Land the ${massKg} kg ball in the bucket.`;
  }

  step(_input: Input, dt: number, _area: Rect): void {
    if (this.t >= 0) this.t += dt;
  }

  check(): void {
    if (this.state !== 'open') return;
    this.attempts++;
    const h = this.options[this.choice] as number;
    const ok = Math.abs(rangeOf(h, this.dropM) - this.targetM) <= this.tolM;
    this.state = ok ? 'solved' : 'failed';
    this.t = 0;
    play(ok ? 'ok' : 'nope');
  }

  canCheck(): boolean {
    return true;
  }

  outcome(): Outcome {
    return this.state;
  }

  draw(ctx: CanvasRenderingContext2D, area: Rect, input: Input): void {
    const h = this.options[this.choice] as number;
    const maxH = Math.max(...this.options);

    // World -> screen. Everything scales off the tallest option and the furthest the ball can go, so
    // the whole apparatus is always on screen whatever the generator picked.
    // Options live in a column on the right. Along the bottom they stole 30px of height from an
    // apparatus that is already about as tall as it is wide, so the rig scaled down to a third of the
    // panel it was sitting in.
    const colW = 78;
    const stageW = area.w - colW - 8;
    const floorY = area.y + area.h - 26;
    const drawH = floorY - area.y - 12;

    const maxRange = rangeOf(maxH, this.dropM);
    const worldW = maxRange * 1.12 + 0.6;
    const worldH = maxH + this.dropM + 0.3;
    // A horizontally-launched projectile can never travel further than (release + drop) — max range is
    // 2*sqrt(h*d), which is at most h+d — so the apparatus is always about as tall as it is wide and can
    // never fill a wide, short panel. Scale to fit, then centre it rather than leaving it jammed left.
    const s = Math.min((stageW - 34) / worldW, drawH / worldH);
    const usedW = worldW * s;
    const lipX = area.x + Math.round(Math.max(24, (stageW - usedW) / 2 + 14));
    const sx = (m: number): number => lipX + m * s;
    const sy = (m: number): number => floorY - m * s;

    // Floor
    ctx.fillStyle = PAL.steel1;
    ctx.fillRect(area.x + 2, floorY, stageW, 2);

    // Ramp. Painted where the art exists, plotted as a curve where it doesn't — the plotted version
    // is geometrically exact, which matters because the curve *is* the height being chosen.
    const top = this.dropM + h;
    const rampH = Math.max(10, (top - this.dropM) * s + 12);
    const rampW = Math.max(14, rampH * 0.85);
    if (hasArt('force_ramp') && rampH >= 34) {
      drawArtFit(ctx, 'force_ramp', lipX - rampW / 2 + 2, sy(this.dropM) - rampH / 2 + 2, rampW, rampH);
    } else {
      ctx.fillStyle = PAL.brass;
      for (let i = 0; i <= 26; i++) {
        const f = i / 26;
        const rx = lipX - Math.round((1 - f) * 14);
        const ry = sy(this.dropM + h * (1 - f) * (1 - f));
        ctx.fillRect(rx, Math.round(ry), 2, 2);
      }
    }
    // Lip post
    ctx.fillStyle = PAL.steel2;
    ctx.fillRect(lipX, sy(this.dropM), 1, Math.max(0, floorY - sy(this.dropM)));

    // Release marker + height label
    ctx.fillStyle = PAL.amber;
    ctx.fillRect(lipX - 17, Math.round(sy(top)) - 1, 6, 2);
    drawText(ctx, `${h.toFixed(1)}M`, lipX - 34, Math.round(sy(top)) - 3, PAL.amber);

    // Bucket
    const bx = sx(this.targetM);
    const halfW = Math.max(5, Math.round(this.tolM * s));
    if (!drawArtFit(ctx, 'force_bucket', bx, floorY - halfW, halfW * 2 + 6, halfW * 2 + 6)) {
      ctx.fillStyle = PAL.volt;
      ctx.fillRect(bx - halfW, floorY - 10, 1, 10);
      ctx.fillRect(bx + halfW, floorY - 10, 1, 10);
      ctx.fillRect(bx - halfW, floorY - 1, halfW * 2, 1);
    }
    drawTextCentered(ctx, `${this.targetM.toFixed(1)}M`, bx, floorY + 5, PAL.steel3);

    // Ball: parked at the release point until Check, then flying.
    let ballX = lipX - 14;
    let ballY = sy(top);
    if (this.t >= 0) {
      const v = Math.sqrt(2 * G * h);
      // Slow the replay down; at true speed the flight is over in a third of a second.
      const tt = this.t * 0.45;
      const flightT = Math.sqrt((2 * this.dropM) / G);
      const ct = Math.min(tt, flightT);
      ballX = sx(v * ct);
      ballY = sy(this.dropM - 0.5 * G * ct * ct);
    }
    ctx.fillStyle = PAL.hot;
    const br = 3;
    ctx.fillRect(Math.round(ballX) - br, Math.round(ballY) - br, br * 2, br * 2);
    ctx.fillStyle = PAL.bone;
    ctx.fillRect(Math.round(ballX) - br + 1, Math.round(ballY) - br + 1, 2, 2);
    // The mass is stated plainly and is deliberately irrelevant. Hiding it would remove the lesson;
    // stating it invites the player to notice it never changes anything.
    drawText(ctx, `${this.massKg}KG`, Math.round(ballX) - 20, Math.round(ballY) + 4, PAL.steel2);

    // Faint arc of where the current choice would go — shown only before committing, and only as a
    // path, never as a verdict.
    if (this.state === 'open') {
      ctx.fillStyle = PAL.steel1;
      const v = Math.sqrt(2 * G * h);
      const flightT = Math.sqrt((2 * this.dropM) / G);
      for (let i = 0; i <= 20; i++) {
        const ct = (i / 20) * flightT;
        ctx.fillRect(Math.round(sx(v * ct)), Math.round(sy(this.dropM - 0.5 * G * ct * ct)), 1, 1);
      }
    }

    // Controls: a vertical column beside the stage.
    const cx0 = area.x + stageW + 6;
    if (this.state === 'open') {
      drawText(ctx, 'RELEASE AT', cx0, area.y + 2, PAL.steel3);
      const bh = 15;
      const gap = Math.min(6, Math.max(2, Math.floor((area.h - 30 - this.options.length * bh) / this.options.length)));
      for (let i = 0; i < this.options.length; i++) {
        const r: Rect = { x: cx0, y: area.y + 12 + i * (bh + gap), w: colW - 2, h: bh };
        if (button(ctx, input, r, { label: `${(this.options[i] as number).toFixed(1)}M`, on: i === this.choice })) {
          this.choice = i;
        }
      }
    } else {
      const got = rangeOf(h, this.dropM);
      const ok = this.state === 'solved';
      drawText(ctx, ok ? 'IN THE' : 'MISSED', cx0, area.y + 2, ok ? PAL.volt : PAL.hot);
      if (ok) drawText(ctx, 'BUCKET', cx0, area.y + 12, PAL.volt);
      drawText(ctx, 'LANDED', cx0, area.y + 28, PAL.steel3);
      drawText(ctx, `${got.toFixed(2)}M`, cx0, area.y + 38, PAL.bone);
      if (!ok) {
        drawText(ctx, 'NEEDED', cx0, area.y + 54, PAL.steel3);
        drawText(ctx, `${this.answer.toFixed(1)}M`, cx0, area.y + 64, PAL.volt);
      }
    }
  }
}

export const forceGen: Generator = {
  domain: 'force',
  make(rng: Rng, tier: number): Puzzle {
    const drop = rng.pick([0.8, 1.0, 1.25, 1.5]);
    const count = tier < 2 ? 3 : tier < 5 ? 4 : 5;

    // Choose the answer first, derive the target from it, then build distractors around it. Generating
    // a target and hoping an option hits it would produce unsolvable instances.
    const answer = rng.pick([0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2]);
    const target = rangeOf(answer, drop);

    const opts = new Set<number>([answer]);
    // Distractors must be far enough out to actually miss the bucket.
    const tol = 0.09 + (tier < 3 ? 0.05 : 0);
    let guard = 0;
    while (opts.size < count && guard++ < 200) {
      const cand = Math.round(rng.float(0.1, 1.4) * 10) / 10;
      if (Math.abs(rangeOf(cand, drop) - target) > tol * 1.6) opts.add(cand);
    }
    const options = [...opts].sort((a, b) => a - b);
    const massKg = rng.int(1, 9); // deliberately irrelevant

    return new ForcePuzzle(
      `for-${drop}-${answer}-${options.join('.')}-${massKg}`,
      options, answer, drop, target, tol, massKg,
    );
  },
};

export { ForcePuzzle, rangeOf };
