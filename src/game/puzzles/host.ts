/**
 * The frame around any puzzle: prompt, working area, Check button, and the result card.
 *
 * The host owns the *reward shape*, which is a design decision and not a UI one.
 *
 * Both halves of that shape were originally wrong here, and running the 1993 game settled it. A failed
 * puzzle used to jam the crate for 25 seconds and hand the part to the rival. The original does nothing
 * at all: "Click on the Go Back button if you want to stop working on a puzzle before you have solved it.
 * The door will stay closed." It also puts a Hint button on every puzzle. So: no penalty, retry freely,
 * hints on request. Getting it right still wins the part; getting it wrong costs only the time.
 */

import { PAL } from '../../content/brand';
import { drawText, drawTextCentered, wrapText } from '../../core/font';
import type { Input } from '../../core/input';
import { Rng } from '../../core/rng';
import { emit } from '../../core/telemetry';
import { button, panel, scrim, type Rect } from '../ui/widgets';
import { balanceGen } from './balance';
import { circuitGen } from './circuit';
import { energyGen } from './energy';
import { forceGen } from './force';
import { gearsGen } from './gears';
import { machinesGen } from './machines';
import { magnetsGen } from './magnets';
import { DOMAIN_LABEL, type Domain, type Generator, type Puzzle } from './types';

const GENS: Record<Domain, Generator> = {
  balance: balanceGen,
  circuit: circuitGen,
  machines: machinesGen,
  gears: gearsGen,
  energy: energyGen,
  magnets: magnetsGen,
  force: forceGen,
};

export const DOMAINS = Object.keys(GENS) as Domain[];

export function makePuzzle(domain: Domain, rng: Rng, tier: number): Puzzle {
  return GENS[domain].make(rng, tier);
}

export type HostResult = 'running' | 'won' | 'lost' | 'retry';

export class PuzzleHost {
  private readonly opened = performance.now();
  private result: HostResult = 'running';
  /** Set once the player dismisses the result card. */
  private dismissed = false;
  /** Hint revealed this attempt. Logged in `attempts`-adjacent telemetry, never penalised. */
  private hintShown = false;
  private hintEverShown = false;

  constructor(
    private readonly puzzle: Puzzle,
    private readonly tier: number,
    /** Part id on offer. Shown up front — you should know what you're playing for. */
    readonly prize: string,
    private readonly prizeName: string,
  ) {
    emit({ k: 'puzzle.open', domain: puzzle.domain, tier, instance: puzzle.instance });
  }

  /** 'running' until the player dismisses the card, then the final outcome. */
  status(): HostResult {
    return this.dismissed ? this.result : 'running';
  }

  step(input: Input, dt: number, vw: number, vh: number): void {
    // Puzzles keep stepping after resolution — gears finish their spin, the beam settles.
    this.puzzle.step(input, dt, this.workArea(vw, vh));
  }

  draw(ctx: CanvasRenderingContext2D, input: Input, vw: number, vh: number): void {
    scrim(ctx, vw, vh);

    const frame = this.frame(vw, vh);
    panel(ctx, frame, PAL.steel0, PAL.brass);

    // Header: domain, difficulty, and what's at stake.
    // Title bar, drawn as a bar rather than floating text so the panel reads as an instrument.
    ctx.fillStyle = PAL.shadow;
    ctx.fillRect(frame.x + 1, frame.y + 1, frame.w - 2, 15);
    drawText(ctx, DOMAIN_LABEL[this.puzzle.domain].toUpperCase(), frame.x + 6, frame.y + 5, PAL.brassLit);
    const stake = `WIN: ${this.prizeName}`;
    drawText(ctx, stake, frame.x + frame.w - 6 - stake.length * 6 + 1, frame.y + 5, PAL.amber);
    ctx.fillStyle = PAL.brass;
    ctx.fillRect(frame.x + 1, frame.y + 16, frame.w - 2, 1);

    // Prompt
    const promptLines = wrapText(this.puzzle.prompt, frame.w - 14);
    for (const [i, line] of promptLines.entries()) {
      drawText(ctx, line, frame.x + 7, frame.y + 21 + i * 9, PAL.bone);
    }

    const area = this.workArea(vw, vh);
    this.puzzle.draw(ctx, area, input);

    const outcome = this.puzzle.outcome();
    const by = frame.y + frame.h - 18;

    if (outcome === 'open') {
      const hasHint = !!this.puzzle.hint;
      if (button(ctx, input, { x: frame.x + frame.w / 2 - 32, y: by, w: 64, h: 14 },
        { label: 'CHECK', disabled: !this.puzzle.canCheck() })) {
        this.puzzle.check();
        if (this.puzzle.outcome() !== 'open') this.finish();
      }
      if (hasHint && button(ctx, input, { x: frame.x + 6, y: by, w: 46, h: 14 },
        { label: this.hintShown ? 'HIDE' : 'HINT' })) {
        this.hintShown = !this.hintShown;
        if (this.hintShown) this.hintEverShown = true;
      }
      // Leaving mid-puzzle is free, exactly as in the original.
      if (button(ctx, input, { x: frame.x + frame.w - 58, y: by, w: 52, h: 14 }, { label: 'GO BACK' })) {
        this.result = 'lost';
        this.dismissed = true;
      }
      if (this.hintShown && this.puzzle.hint) this.drawHint(ctx, frame, this.puzzle.hint);
    } else if (!this.dismissed) {
      this.drawResult(ctx, input, vw, vh);
    }
  }

  /** Hint sits over the working area rather than in a modal — you need it while looking at the puzzle. */
  private drawHint(ctx: CanvasRenderingContext2D, frame: Rect, hint: string): void {
    const lines = wrapText(hint, frame.w - 14);
    const h = lines.length * 8 + 8;
    const r: Rect = { x: frame.x + 4, y: frame.y + frame.h - 22 - h, w: frame.w - 8, h };
    panel(ctx, r, PAL.shadow, PAL.spark);
    for (const [i, l] of lines.entries()) drawText(ctx, l, r.x + 4, r.y + 4 + i * 8, PAL.spark);
  }

  private finish(): void {
    const solved = this.puzzle.outcome() === 'solved';
    this.result = solved ? 'won' : 'lost';
    emit({
      k: 'puzzle.close',
      domain: this.puzzle.domain,
      tier: this.tier,
      instance: this.puzzle.instance,
      solved,
      ms: Math.round(performance.now() - this.opened),
      attempts: this.puzzle.attempts,
      // Recorded, never penalised. Whether a hint was needed is the interesting signal, not a demerit.
      usedHint: this.hintEverShown,
    });
  }

  private drawResult(ctx: CanvasRenderingContext2D, input: Input, vw: number, vh: number): void {
    const won = this.result === 'won';
    const w = Math.min(300, vw - 40);
    const lines = wrapText(this.puzzle.teach, w - 10);
    const h = 34 + lines.length * 8 + 18;
    const r: Rect = { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };

    scrim(ctx, vw, vh, 0.55);
    panel(ctx, r, PAL.shadow, won ? PAL.volt : PAL.rust);

    drawTextCentered(ctx, won ? 'CRATE OPEN' : 'NOT YET', r.x + r.w / 2, r.y + 5, won ? PAL.volt : PAL.amber);
    drawTextCentered(
      ctx,
      won ? `+ ${this.prizeName}` : 'THE CRATE STAYS SHUT',
      r.x + r.w / 2,
      r.y + 15,
      won ? PAL.amber : PAL.steel3,
    );

    ctx.fillStyle = PAL.steel1;
    ctx.fillRect(r.x + 4, r.y + 26, r.w - 8, 1);
    for (const [i, line] of lines.entries()) {
      drawText(ctx, line, r.x + 5, r.y + 31 + i * 8, PAL.bone);
    }

    if (won) {
      if (button(ctx, input, { x: r.x + r.w / 2 - 24, y: r.y + r.h - 16, w: 48, h: 13 },
        { label: 'OK', accent: PAL.volt })) {
        this.dismissed = true;
      }
    } else {
      // Retry is the primary action and costs nothing. The crate is still there.
      if (button(ctx, input, { x: r.x + 6, y: r.y + r.h - 16, w: (r.w - 18) / 2, h: 13 },
        { label: 'TRY AGAIN', accent: PAL.brass })) {
        this.result = 'retry';
        this.dismissed = true;
      }
      if (button(ctx, input, { x: r.x + r.w / 2 + 3, y: r.y + r.h - 16, w: (r.w - 18) / 2, h: 13 },
        { label: 'LEAVE IT' })) {
        this.dismissed = true;
      }
    }
  }

  private frame(vw: number, vh: number): Rect {
    // The old 300x196 cap was sized for a 320x180 backbuffer. At 480x300 the puzzle can have a proper
    // stage — which is the whole point, since these are the parts worth spending time in.
    const w = Math.min(432, vw - 24);
    const h = Math.min(272, vh - 20);
    return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };
  }

  /** The rectangle handed to the puzzle. Everything outside it belongs to the host. */
  private workArea(vw: number, vh: number): Rect {
    const f = this.frame(vw, vh);
    const promptH = wrapText(this.puzzle.prompt, f.w - 14).length * 9;
    const top = f.y + 21 + promptH + 4;
    return { x: f.x + 4, y: top, w: f.w - 8, h: f.y + f.h - 22 - top };
  }
}
