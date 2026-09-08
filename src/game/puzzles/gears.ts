/**
 * Gear trains — predict, then observe.
 *
 * The player commits to a direction and a turn count *before* the train is allowed to spin. Pressing
 * Check animates it. This ordering is the whole point: a gear train that spins on demand teaches
 * nothing, because you can just watch it. Predicting first turns it into an experiment.
 *
 * Physics: meshed gears reverse direction at every mesh, and in a simple train only the first and last
 * tooth counts matter — the idlers in between cancel out. That second fact is the one worth learning and
 * the generator deliberately includes idlers to test it.
 */

import { PAL } from '../../content/brand';
import { drawText, drawTextCentered } from '../../core/font';
import type { Input } from '../../core/input';
import type { Rng } from '../../core/rng';
import { play } from '../../core/audio';
import { button, type Rect } from '../ui/widgets';
import type { Generator, Outcome, Puzzle } from './types';

interface Gear {
  teeth: number;
  /** Drawn radius, px. Proportional to teeth so the ratio is visible, not just stated. */
  r: number;
}

class GearPuzzle implements Puzzle {
  readonly domain = 'gears' as const;
  readonly prompt: string;
  readonly teach: string;
  readonly hint: string;
  attempts = 0;

  private state: Outcome = 'open';
  /** Player's answer. */
  private guessCw: boolean;
  private guessTurns: number;
  /** Animation phase, radians on the driver. Only advances after Check. */
  private phase = 0;
  private spinning = false;
  /**
   * The controls have to start somewhere, and for some trains that starting pair happens to BE the
   * answer — you could win by pressing Check without looking. Require one deliberate input first.
   */
  private touched = false;

  constructor(
    readonly instance: string,
    private readonly gears: Gear[],
    private readonly driverTurns: number,
    private readonly driverCw: boolean,
  ) {
    const dir = driverCw ? 'clockwise' : 'counter-clockwise';
    this.prompt = `Gear A turns ${dir} ${driverTurns} time${driverTurns === 1 ? '' : 's'}. What does the last gear do?`;
    this.teach =
      'Every mesh reverses the direction. The gears in the middle change nothing about the speed — only the first and last tooth counts matter.';
    this.hint =
      'Count the meshes: an odd number flips the direction, an even number keeps it. For the turns, compare the teeth on gear A with the teeth on the last gear, and ignore everything between them.';
    this.guessCw = driverCw;
    this.guessTurns = 1;
  }

  private answerCw(): boolean {
    // One reversal per mesh; n gears means n-1 meshes.
    const flips = this.gears.length - 1;
    return flips % 2 === 0 ? this.driverCw : !this.driverCw;
  }

  private answerTurns(): number {
    const first = this.gears[0] as Gear;
    const last = this.gears[this.gears.length - 1] as Gear;
    return (this.driverTurns * first.teeth) / last.teeth;
  }

  step(_input: Input, dt: number, _area: Rect): void {
    if (this.spinning) this.phase += dt * 2.2;
  }

  check(): void {
    if (this.state !== 'open') return;
    this.attempts++;
    const ok =
      this.guessCw === this.answerCw() && Math.abs(this.guessTurns - this.answerTurns()) < 1e-6;
    this.state = ok ? 'solved' : 'failed';
    this.spinning = true;
    play(ok ? 'ok' : 'nope');
  }

  canCheck(): boolean {
    return this.touched;
  }

  outcome(): Outcome {
    return this.state;
  }

  draw(ctx: CanvasRenderingContext2D, area: Rect, input: Input): void {
    // Backplate: gears floating on the panel background read as clip art; bolted to a plate they read
    // as a mechanism.
    const plate: Rect = { x: area.x, y: area.y, w: area.w, h: area.h - 46 };
    ctx.fillStyle = PAL.shadow;
    ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
    ctx.fillStyle = PAL.steel1;
    ctx.fillRect(plate.x, plate.y, plate.w, 1);
    ctx.fillRect(plate.x, plate.y + plate.h - 1, plate.w, 1);
    ctx.fillStyle = PAL.steel0;
    for (const bx of [plate.x + 5, plate.x + plate.w - 8]) {
      for (const by of [plate.y + 5, plate.y + plate.h - 9]) ctx.fillRect(bx, by, 3, 3);
    }

    const n = this.gears.length;
    const totalR = this.gears.reduce((s, g) => s + g.r, 0);
    // Centres sit tangent to each other; scale to fit the panel if the train is wide.
    const span = totalR * 2 - (this.gears[0] as Gear).r - (this.gears[n - 1] as Gear).r;
    // Fit to whichever axis is tighter. The old version only checked width, so a 4-gear train with a
    // big driver ran off the bottom of the panel.
    const needW = span + (this.gears[0] as Gear).r + (this.gears[n - 1] as Gear).r;
    const maxR = Math.max(...this.gears.map((g) => g.r));
    const stageH = area.h - 58;
    const fit = Math.min(1.15, (area.w - 30) / Math.max(1, needW), stageH / Math.max(1, maxR * 2 + 22));
    const cy = area.y + 12 + stageH / 2;

    // Train width, so it can be centred rather than pinned to the left with dead space beside it.
    let trainW = 0;
    for (let i = 0; i < n - 1; i++) {
      trainW += ((this.gears[i] as Gear).r + (this.gears[i + 1] as Gear).r) * fit;
    }
    trainW += ((this.gears[0] as Gear).r + (this.gears[n - 1] as Gear).r) * fit;

    let cx = area.x + Math.max(12, (area.w - trainW) / 2) + (this.gears[0] as Gear).r * fit;
    const centres: number[] = [];
    for (let i = 0; i < n; i++) {
      centres.push(cx);
      const g = this.gears[i] as Gear;
      const next = this.gears[i + 1];
      if (next) cx += (g.r + next.r) * fit;
    }

    for (let i = 0; i < n; i++) {
      const g = this.gears[i] as Gear;
      // Angular speed scales inversely with teeth; direction alternates.
      const dir = (i % 2 === 0 ? 1 : -1) * (this.driverCw ? 1 : -1);
      const ang = this.phase * ((this.gears[0] as Gear).teeth / g.teeth) * dir;
      this.drawGear(ctx, centres[i] as number, cy, g.r * fit, g.teeth, ang, i === 0 || i === n - 1);
      const label = i === 0 ? 'A' : i === n - 1 ? 'LAST' : String.fromCharCode(65 + i);
      drawTextCentered(ctx, label, centres[i] as number, cy - g.r * fit - 12, i === 0 || i === n - 1 ? PAL.amber : PAL.steel2);
      // Meshed gears sit tangent, so their tooth counts collide when written on one line. Alternate.
      const labelY = cy + g.r * fit + 5 + (i % 2 === 0 ? 0 : 10);
      drawTextCentered(ctx, `${g.teeth}T`, centres[i] as number, labelY, PAL.steel3);
    }

    // --- answer controls --------------------------------------------------------
    const rowY = area.y + area.h - 32;
    const half = Math.floor((area.w - 12) / 2);

    if (this.state === 'open') {
      if (button(ctx, input, { x: area.x + 4, y: rowY, w: half - 2, h: 15 }, {
        label: this.guessCw ? 'CLOCKWISE' : 'COUNTER-CW',
      })) {
        this.guessCw = !this.guessCw;
        this.touched = true;
      }
      const sx = area.x + 8 + half;
      if (button(ctx, input, { x: sx, y: rowY, w: 17, h: 15 }, { label: '-', disabled: this.guessTurns <= 0.5 })) {
        this.guessTurns = Math.max(0.5, this.guessTurns - 0.5);
        this.touched = true;
      }
      if (button(ctx, input, { x: sx + half - 19, y: rowY, w: 17, h: 15 }, { label: '+', disabled: this.guessTurns >= 12 })) {
        this.guessTurns = Math.min(12, this.guessTurns + 0.5);
        this.touched = true;
      }
      drawTextCentered(
        ctx,
        `${fmt(this.guessTurns)} ${this.guessTurns === 1 ? 'TURN' : 'TURNS'}`,
        sx + half / 2 - 1, rowY + 4, PAL.bone,
      );
    } else {
      const ok = this.state === 'solved';
      const yours = `${this.guessCw ? 'CW' : 'CCW'} ${fmt(this.guessTurns)}`;
      const truth = `${this.answerCw() ? 'CW' : 'CCW'} ${fmt(this.answerTurns())}`;
      drawText(ctx, `YOU SAID  ${yours}`, area.x + 4, rowY, ok ? PAL.volt : PAL.hot);
      drawText(ctx, `ACTUAL    ${truth}`, area.x + 4, rowY + 9, PAL.volt);
    }

    drawTextCentered(
      ctx,
      this.state === 'open' && !this.touched ? 'SET YOUR PREDICTION' : 'LAST GEAR:',
      area.x + area.w / 2, rowY - 11, PAL.steel2,
    );
  }

  private drawGear(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, r: number, teeth: number, ang: number, highlight: boolean,
  ): void {
    const body = highlight ? PAL.brass : PAL.steel1;
    const tooth = highlight ? PAL.brassLit : PAL.steel2;

    // Filled disc by scanlines — no arcs, so it stays on the pixel grid.
    ctx.fillStyle = body;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), Math.round(half * 2), 1);
    }

    // Teeth as radial pips. Capped at 16 drawn pips: past that they alias into a ring anyway.
    const pips = Math.min(teeth, 28);
    ctx.fillStyle = tooth;
    for (let i = 0; i < pips; i++) {
      const a = ang + (i / pips) * Math.PI * 2;
      const tw = Math.max(2, Math.round(r * 0.13));
      ctx.fillRect(Math.round(cx + Math.cos(a) * (r + tw * 0.4)) - tw / 2, Math.round(cy + Math.sin(a) * (r + tw * 0.4)) - tw / 2, tw, tw);
    }

    // Hub + a spoke, so rotation is legible even when the pips blur.
    ctx.fillStyle = PAL.shadow;
    const hub = Math.max(3, Math.round(r * 0.2));
    ctx.fillRect(Math.round(cx - hub / 2), Math.round(cy - hub / 2), hub, hub);
    ctx.fillStyle = tooth;
    for (let t = 2; t < r - 1; t++) {
      ctx.fillRect(Math.round(cx + Math.cos(ang) * t), Math.round(cy + Math.sin(ang) * t), 2, 2);
    }
  }
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export const gearsGen: Generator = {
  domain: 'gears',
  make(rng: Rng, tier: number): Puzzle {
    const count = tier < 2 ? 2 : tier < 5 ? 3 : rng.int(3, 4);

    // Choose first/last so the ratio lands on a half-turn. Anything else is arithmetic homework,
    // not a gear lesson.
    const CLEAN: [number, number, number][] = [
      // [driverTeeth, lastTeeth, driverTurns]
      [24, 12, 1], [24, 12, 2], [12, 24, 2], [12, 24, 4],
      [36, 12, 1], [12, 36, 3], [16, 8, 1], [8, 16, 2],
      [30, 10, 1], [10, 30, 3], [20, 10, 3], [10, 20, 5],
      [24, 8, 1], [8, 24, 3], [16, 24, 3], [24, 16, 2],
    ];
    const [dt, lt, turns] = rng.pick(CLEAN);

    // Radius scales with tooth count so the ratio is visible in the silhouette, not just in the label.
    const rOf = (t: number): number => Math.max(13, Math.round(9 + t * 0.95));
    const gears: Gear[] = [{ teeth: dt, r: rOf(dt) }];
    for (let i = 1; i < count - 1; i++) {
      // Idlers exist to be irrelevant. Their tooth counts are noise, on purpose.
      const t = rng.pick([8, 10, 12, 14, 18, 20]);
      gears.push({ teeth: t, r: rOf(t) });
    }
    gears.push({ teeth: lt, r: rOf(lt) });

    const cw = rng.next() < 0.5;
    return new GearPuzzle(`gea-${gears.map((g) => g.teeth).join('-')}x${turns}${cw ? 'c' : 'w'}`, gears, turns, cw);
  },
};

export { GearPuzzle };
