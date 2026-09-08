/**
 * The Works — the campus hub.
 *
 * The 1993 original opens on an isometric technology park with one building per vehicle category, and
 * the tube network between them is how you change discipline. Dropping straight into a warehouse, as
 * this build did, loses the frame the whole game hangs off: you are breaking into someone's research
 * centre, one wing at a time.
 *
 * Only the automotive wing is built, so the other two are drawn locked rather than hidden. A visible
 * locked door tells the player the game is bigger than the part they're in; an absent one tells them
 * nothing. The labels say what's behind them and when.
 */

import { BRAND, PAL } from '../../content/brand';
import type { Viewport } from '../../core/canvas';
import { drawCoverBg } from '../../core/assets';
import { drawText, drawTextCentered, wrapText } from '../../core/font';
import { RANKS } from '../../core/save';
import { trackAt } from '../../content/tracks';
import type { Ctx, Scene, SceneName } from '../scene';
import { hit, panel, type Rect } from '../ui/widgets';

interface Wing {
  key: string;
  name: string;
  blurb: string;
  /** Fractional position within the backdrop, so the hotspots track the art at any scale. */
  fx: number;
  fy: number;
  open: boolean;
}

// Positions are matched to the buildings in hub_bg.png: the low left block, the tall centre one with
// the aircraft parked on its roof, and the right block wearing solar panels.
const WINGS: Wing[] = [
  {
    key: 'auto', name: 'Motor Wing',
    blurb: 'Wheels, weight and wind. Five races.',
    fx: 0.16, fy: 0.50, open: true,
  },
  {
    key: 'air', name: 'Aircraft Wing',
    blurb: 'Lift, drag and thrust. Not built yet.',
    fx: 0.52, fy: 0.28, open: false,
  },
  {
    key: 'alt', name: 'Alt-Energy Wing',
    blurb: 'Pedals, springs and sunlight. Not built yet.',
    fx: 0.79, fy: 0.56, open: false,
  },
];

export class HubScene implements Scene {
  private goTo: SceneName | null = null;
  private hovered: Wing | null = null;
  private t = 0;

  constructor(private readonly ctx: Ctx) {}

  next(): SceneName | null {
    return this.goTo;
  }

  step(dt: number, _view: Viewport): void {
    this.t += dt;
    if (this.ctx.input.pressed.back) this.goTo = 'title';
    // Enter/E walks into the only wing that's open, so the hub is never a dead end on a keyboard.
    if (this.ctx.input.pressed.use) this.goTo = 'warehouse';
  }

  private hotspot(w: Wing, view: Viewport): Rect {
    const size = Math.round(Math.min(view.w, view.h) * 0.19);
    return {
      x: Math.round(view.w * w.fx - size / 2),
      y: Math.round(view.h * w.fy - size / 2),
      w: size,
      h: size,
    };
  }

  draw(g: CanvasRenderingContext2D, view: Viewport): void {
    const inp = this.ctx.input;
    const p = this.ctx.profile;

    if (!drawCoverBg(g, 'hubBg', view.w, view.h)) {
      g.fillStyle = PAL.shadow;
      g.fillRect(0, 0, view.w, view.h);
      g.fillStyle = PAL.steel0;
      g.fillRect(0, Math.round(view.h * 0.62), view.w, view.h);
    }

    // Header strip.
    g.fillStyle = PAL.ink;
    g.globalAlpha = 0.82;
    g.fillRect(0, 0, view.w, 15);
    g.globalAlpha = 1;
    drawText(g, `${BRAND.place.toUpperCase()}`, 5, 4, PAL.brassLit);
    const who = `${RANKS[p.rank]}`.toUpperCase();
    drawText(g, who, 80, 4, PAL.steel3);
    const next = `NEXT: ${trackAt(p.race).name}`.toUpperCase();
    drawText(g, next, view.w - 5 - next.length * 6 + 1, 4, PAL.amber);

    this.hovered = null;
    for (const w of WINGS) {
      const r = this.hotspot(w, view);
      const over = hit(r, inp.pointer.x, inp.pointer.y);
      if (over) this.hovered = w;

      const col = w.open ? PAL.volt : PAL.steel3;

      // A translucent wash plus a border, over the painted building. Redrawing the architecture on top
      // of architecture always looks pasted; tinting what is already there does not.
      g.globalAlpha = over ? 0.26 : w.open ? 0.14 : 0.1;
      g.fillStyle = col;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.globalAlpha = 1;

      // Corner brackets, drawn as explicit L pairs. The earlier min/max arithmetic collapsed them to
      // invisible single pixels.
      const b = 8;
      g.fillStyle = col;
      g.globalAlpha = over ? 1 : 0.8;
      g.fillRect(r.x, r.y, b, 2);
      g.fillRect(r.x, r.y, 2, b);
      g.fillRect(r.x + r.w - b, r.y, b, 2);
      g.fillRect(r.x + r.w - 2, r.y, 2, b);
      g.fillRect(r.x, r.y + r.h - 2, b, 2);
      g.fillRect(r.x, r.y + r.h - b, 2, b);
      g.fillRect(r.x + r.w - b, r.y + r.h - 2, b, 2);
      g.fillRect(r.x + r.w - 2, r.y + r.h - b, 2, b);
      g.globalAlpha = 1;

      // Label plate under the marker. Hit-tested by hand rather than with button(), which would paint
      // its own panel straight over this.
      const label = w.open ? `> ${w.name.toUpperCase()}` : `${w.name.toUpperCase()} - LOCKED`;
      const lw = label.length * 6 + 8;
      const lx = Math.max(2, Math.min(view.w - lw - 2, Math.round(r.x + r.w / 2 - lw / 2)));
      const bob = w.open ? Math.round(Math.sin(this.t * 3)) : 0;
      const ly = r.y + r.h + 4 + bob;
      g.fillStyle = PAL.ink;
      g.globalAlpha = 0.88;
      g.fillRect(lx, ly, lw, 12);
      g.globalAlpha = 1;
      g.fillStyle = col;
      g.fillRect(lx, ly, lw, 1);
      g.fillRect(lx, ly + 11, lw, 1);
      drawTextCentered(g, label, lx + lw / 2, ly + 3, w.open ? PAL.volt : PAL.steel3);

      const plate: Rect = { x: lx, y: ly, w: lw, h: 12 };
      if (w.open && (hit(plate, inp.pointer.x, inp.pointer.y) || over) && inp.pointer.released) {
        this.goTo = 'warehouse';
      }
    }

    // Detail card for whatever the pointer is over.
    const card: Rect = { x: 4, y: view.h - 40, w: Math.min(260, view.w - 8), h: 36 };
    panel(g, card, PAL.shadow, PAL.brass);
    const w = this.hovered;
    if (w) {
      drawText(g, w.name.toUpperCase(), card.x + 5, card.y + 5, w.open ? PAL.volt : PAL.steel3);
      for (const [i, l] of wrapText(w.blurb, card.w - 10).entries()) {
        drawText(g, l, card.x + 5, card.y + 16 + i * 9, PAL.bone);
      }
    } else {
      drawText(g, 'SHADY WORKS TECHNOLOGY CENTRE', card.x + 5, card.y + 5, PAL.brassLit);
      drawText(g, 'Pick a wing. Only the Motor Wing is open.', card.x + 5, card.y + 16, PAL.steel3);
      drawText(g, `${p.parts.length} parts salvaged`, card.x + 5, card.y + 26, PAL.steel2);
    }

    if (!inp.coarse) {
      const tip = 'CLICK A WING   ENTER: MOTOR WING   ESC: TITLE';
      drawText(g, tip, view.w - 5 - tip.length * 6, view.h - 12, PAL.steel2);
    }
  }
}
