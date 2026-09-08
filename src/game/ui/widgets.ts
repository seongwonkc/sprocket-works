/**
 * Immediate-mode widgets. No retained tree, no layout engine — every scene draws and hit-tests in the
 * same pass, which at this size is less code than any alternative and keeps hit regions honest
 * (a button you can see is exactly a button you can press).
 *
 * Touch targets: `button` enforces a minimum 11 logical px height. At the smallest integer scale a
 * phone will use, that is a ~44 device-px target — the accessibility floor.
 */

import { PAL } from '../../content/brand';
import { drawText, drawTextCentered, textWidth } from '../../core/font';
import type { Input } from '../../core/input';
import { play } from '../../core/audio';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_TOUCH = 11;

export function hit(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

export function panel(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  fill: string = PAL.steel0,
  border: string = PAL.steel2,
): void {
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(r.x + 1, r.y + 1, r.w, r.h); // drop shadow
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = border;
  ctx.fillRect(r.x, r.y, r.w, 1);
  ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  ctx.fillRect(r.x, r.y, 1, r.h);
  ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
}

export interface ButtonOpts {
  label: string;
  /** Dimmed and unclickable. */
  disabled?: boolean;
  /** Drawn as active/selected. */
  on?: boolean;
  accent?: string;
}

/** Draws the button and returns true on the frame it was released inside. */
export function button(
  ctx: CanvasRenderingContext2D,
  input: Input,
  r: Rect,
  o: ButtonOpts,
): boolean {
  const h = Math.max(r.h, MIN_TOUCH);
  const box = { ...r, h };
  const over = hit(box, input.pointer.x, input.pointer.y);
  const pressing = over && input.pointer.down;
  const accent = o.accent ?? PAL.brass;

  const fill = o.disabled ? PAL.steel0 : pressing ? accent : o.on ? PAL.steel1 : PAL.steel0;
  const border = o.disabled ? PAL.steel1 : o.on || pressing ? PAL.brassLit : PAL.steel2;
  panel(ctx, box, fill, border);

  const fg = o.disabled ? PAL.steel2 : pressing ? PAL.ink : o.on ? PAL.amber : PAL.bone;
  drawTextCentered(ctx, o.label, box.x + box.w / 2, box.y + (h - 7) / 2, fg);

  if (!o.disabled && over && input.pointer.released) {
    play('click');
    return true;
  }
  return false;
}

/** A labelled horizontal bar. `frac` is clamped to [0,1]. */
export function bar(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  frac: number,
  color: string,
  bg: string = PAL.shadow,
): void {
  ctx.fillStyle = bg;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const f = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, Math.round(r.w * f), r.h);
}

/** Section heading with a rule that fills the remaining width. */
export function heading(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  w: number,
  color: string = PAL.brassLit,
): void {
  drawText(ctx, s, x, y, color);
  const tw = textWidth(s) + 3;
  if (w > tw) {
    ctx.fillStyle = PAL.steel1;
    ctx.fillRect(x + tw, y + 3, w - tw, 1);
  }
}

/** Full-screen dim, for modals over a live scene. */
export function scrim(ctx: CanvasRenderingContext2D, w: number, h: number, alpha = 0.72): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}
