/**
 * On-screen controls, mounted only when a coarse pointer has been seen.
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 * 1. The pad reads *raw* touches, not the shared pointer, because the shared pointer is single-touch.
 *    Holding right while jumping is table stakes for a platformer and needs genuine multi-touch.
 * 2. Buttons sit inside the letterboxed canvas, not over the page, so they scale with the art and can
 *    never drift off a notched display.
 */

import { PAL } from '../../content/brand';
import type { Viewport } from '../../core/canvas';
import type { Screen } from '../../core/canvas';
import { drawTextCentered } from '../../core/font';
import type { Action, Input } from '../../core/input';
import { hit, type Rect } from './widgets';

interface Pad {
  action: Action;
  label: string;
  rect: (v: Viewport) => Rect;
}

const SZ = 26;
const M = 4;

const PADS: Pad[] = [
  { action: 'left', label: '<', rect: (v) => ({ x: M, y: v.h - SZ - M, w: SZ, h: SZ }) },
  { action: 'right', label: '>', rect: (v) => ({ x: M + SZ + 2, y: v.h - SZ - M, w: SZ, h: SZ }) },
  { action: 'throw', label: 'THRW', rect: (v) => ({ x: v.w - SZ * 2 - M - 2, y: v.h - SZ - M, w: SZ, h: SZ }) },
  { action: 'jump', label: 'JUMP', rect: (v) => ({ x: v.w - SZ - M, y: v.h - SZ - M, w: SZ, h: SZ }) },
  { action: 'use', label: 'USE', rect: (v) => ({ x: v.w - SZ - M, y: v.h - SZ * 2 - M - 2, w: SZ, h: SZ }) },
];

export class TouchPad {
  /** Live touches in logical coords, by pointerId. */
  private readonly touches = new Map<number, { x: number; y: number }>();
  private readonly tmp = { x: 0, y: 0 };
  /** Set each frame so draw() can light the pressed key. */
  private readonly lit = new Set<Action>();

  constructor(private readonly screen: Screen, private readonly input: Input) {
    const c = screen.canvas;
    c.addEventListener('pointerdown', this.onDown, { passive: false });
    c.addEventListener('pointermove', this.onMove, { passive: false });
    addEventListener('pointerup', this.onUp);
    addEventListener('pointercancel', this.onUp);
  }

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') return;
    this.screen.toLogical(e.clientX, e.clientY, this.tmp);
    this.touches.set(e.pointerId, { x: this.tmp.x, y: this.tmp.y });
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.touches.has(e.pointerId)) return;
    this.screen.toLogical(e.clientX, e.clientY, this.tmp);
    // Sliding from left to right without lifting should work — it's how kids actually hold a phone.
    this.touches.set(e.pointerId, { x: this.tmp.x, y: this.tmp.y });
  };

  private onUp = (e: PointerEvent): void => {
    this.touches.delete(e.pointerId);
  };

  /** Call before Input.sample(). Writes into input.touch, which sample() folds into held/pressed. */
  update(view: Viewport, active: boolean): void {
    this.input.clearTouch();
    this.lit.clear();
    if (!active || !this.input.coarse) return;

    for (const p of PADS) {
      const r = p.rect(view);
      for (const t of this.touches.values()) {
        if (hit(r, t.x, t.y)) {
          this.input.touch[p.action] = true;
          this.lit.add(p.action);
          break;
        }
      }
    }
  }

  /** True if (x,y) is over any pad — scenes use this to ignore taps that were meant for the controls. */
  covers(view: Viewport, x: number, y: number): boolean {
    if (!this.input.coarse) return false;
    return PADS.some((p) => hit(p.rect(view), x, y));
  }

  draw(g: CanvasRenderingContext2D, view: Viewport, active: boolean): void {
    if (!active || !this.input.coarse) return;
    for (const p of PADS) {
      const r = p.rect(view);
      const on = this.lit.has(p.action);
      g.globalAlpha = on ? 0.55 : 0.28;
      g.fillStyle = on ? PAL.brassLit : PAL.steel2;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.globalAlpha = on ? 1 : 0.6;
      g.fillStyle = PAL.ink;
      g.fillRect(r.x, r.y, r.w, 1);
      g.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      g.fillRect(r.x, r.y, 1, r.h);
      g.fillRect(r.x + r.w - 1, r.y, 1, r.h);
      drawTextCentered(g, p.label, r.x + r.w / 2, r.y + (r.h - 7) / 2, on ? PAL.ink : PAL.bone);
      g.globalAlpha = 1;
    }
  }
}
