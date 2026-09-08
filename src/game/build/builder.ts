/**
 * The workshop. Four slots, whatever you've salvaged, and a spec sheet.
 *
 * Deliberate omission: the workshop does **not** show a predicted lap time. It shows the derived physical
 * quantities you could legitimately read off a datasheet — mass, drag area, top speed on the flat, grip
 * limit — and stops there. Predicting the time for *this* track, with its hill and its broken surface, is
 * what the race is for.
 *
 * Give the player a lap-time readout here and the race becomes a formality you click through; the whole
 * commit-then-find-out loop collapses. This is the single most important restraint in the game.
 */

import { BRAND, PAL } from '../../content/brand';
import { SLOTS, SLOT_LABEL, maybePart, part, type Part, type Slot } from '../../content/parts';
import { trackAt } from '../../content/tracks';
import { drawText, drawTextCentered, wrapText } from '../../core/font';
import type { Viewport } from '../../core/canvas';
import { RANKS } from '../../core/save';
import { emit } from '../../core/telemetry';
import { specOf, toBuild, topSpeed } from '../race/sim';
import type { Ctx, Scene, SceneName } from '../scene';
import { bar, button, heading, panel, type Rect } from '../ui/widgets';
import { drawCoverBg } from '../../core/assets';
import { drawPartThumb, drawVehicle } from './vehicle';

export class BuildScene implements Scene {
  private goTo: SceneName | null = null;
  private open: Slot | null = null;
  private scroll = 0;

  constructor(private readonly ctx: Ctx) {}

  next(): SceneName | null {
    return this.goTo;
  }

  step(_dt: number, _view: Viewport): void {
    if (this.ctx.input.pressed.back) {
      if (this.open) this.open = null;
      else this.goTo = 'warehouse';
    }
  }

  private owned(slot: Slot): Part[] {
    return this.ctx.profile.parts
      .map((id) => maybePart(id))
      .filter((p): p is Part => p !== null && p.slot === slot);
  }

  private fit(slot: Slot, id: string | null): void {
    const p = this.ctx.profile;
    const from = p.fitted[slot] ?? null;
    p.fitted[slot] = id;
    const built = toBuild(p.fitted);
    emit({
      k: 'build.change',
      slot,
      from,
      to: id,
      // Logged for a limb, never shown: this is the quantity the player is being asked to predict.
      predictedTime: Array.isArray(built) ? -1 : topSpeed(built),
    });
    this.ctx.save();
  }

  draw(g: CanvasRenderingContext2D, view: Viewport): void {
    const p = this.ctx.profile;
    const track = trackAt(p.race);
    const inp = this.ctx.input;

    // The painted workshop room, with the panels sitting over it. A flat grid behind a spec sheet is
    // what made this screen read as a form; the room makes it read as a place you are standing in.
    if (drawCoverBg(g, 'workshopBg', view.w, view.h)) {
      g.globalAlpha = 0.42;
      g.fillStyle = PAL.ink;
      g.fillRect(0, 0, view.w, view.h);
      g.globalAlpha = 1;
    } else {
      g.fillStyle = PAL.shadow;
      g.fillRect(0, 0, view.w, view.h);
      g.fillStyle = PAL.steel0;
      for (let x = 0; x < view.w; x += 16) g.fillRect(x, 0, 1, view.h);
    }

    // Header
    g.fillStyle = PAL.ink;
    g.fillRect(0, 0, view.w, 12);
    drawText(g, 'WORKSHOP', 4, 3, PAL.brassLit);
    drawText(g, `${RANKS[p.rank]}`.toUpperCase(), 70, 3, PAL.steel3);
    const rp = `RACE ${p.race + 1}: ${track.name}`.toUpperCase();
    drawText(g, rp, view.w - 4 - rp.length * 6 + 1, 3, PAL.amber);

    const leftW = Math.min(132, Math.round(view.w * 0.30));
    this.drawSlots(g, inp, { x: 4, y: 16, w: leftW, h: view.h - 36 });

    // The car itself, centre stage. This screen exists because you assembled a machine; showing the
    // machine is not decoration, it is the subject.
    const stageX = leftW + 8;
    const stageW = view.w - stageX - 4;
    const stage: Rect = { x: stageX, y: 16, w: stageW, h: view.h - 36 };
    this.drawStage(g, stage);    // Footer actions
    const built = toBuild(p.fitted);
    const ready = !Array.isArray(built);
    const fy = view.h - 17;
    if (button(g, inp, { x: 4, y: fy, w: 62, h: 13 }, { label: 'SALVAGE' })) {
      this.goTo = 'warehouse';
    }
    if (
      button(g, inp, { x: view.w - 80, y: fy, w: 76, h: 13 }, {
        label: ready ? 'TO THE LINE' : 'SLOTS EMPTY',
        disabled: !ready,
        accent: PAL.volt,
      })
    ) {
      this.goTo = 'race';
    }

    if (this.open) this.drawPicker(g, view, this.open);
  }

  private drawSlots(g: CanvasRenderingContext2D, inp: Ctx['input'], r: Rect): void {
    panel(g, r, PAL.steel0);
    heading(g, 'FITTED', r.x + 4, r.y + 4, r.w - 8);

    const p = this.ctx.profile;
    const rowH = Math.floor((r.h - 20) / SLOTS.length);
    for (const [i, slot] of SLOTS.entries()) {
      const y = r.y + 16 + i * rowH;
      const fitted = maybePart(p.fitted[slot]);
      const count = this.owned(slot).length;

      // Thumbnail well. Every slot shows the thing, not just its name — that absence is most of why
      // this screen read as a form.
      const thumbW = 30;
      const wellX = r.x + 4;
      g.fillStyle = PAL.shadow;
      g.fillRect(wellX, y, thumbW, rowH - 6);
      g.fillStyle = PAL.steel1;
      g.fillRect(wellX, y, thumbW, 1);
      g.fillRect(wellX, y + rowH - 7, thumbW, 1);
      if (fitted) {
        // Bodies are 96px wide against a 30px well, so they need a tighter scale than the small parts.
        const ts = fitted.slot === 'body' ? 0.3 : 0.62;
        const drew = drawPartThumb(g, fitted.id, wellX + thumbW / 2, y + rowH - 10, ts);
        if (!drew) {
          // No art for this part yet — a labelled chip beats an empty hole.
          g.fillStyle = PAL.brass0;
          g.fillRect(wellX + 6, y + 6, thumbW - 12, rowH - 20);
          drawTextCentered(g, fitted.name.slice(0, 1), wellX + thumbW / 2, y + rowH / 2 - 8, PAL.amber);
        }
      }

      const bx = wellX + thumbW + 4;
      const bw = r.x + r.w - 4 - bx;
      drawText(g, SLOT_LABEL[slot].toUpperCase(), bx, y, PAL.steel3);
      if (button(g, inp, { x: bx, y: y + 9, w: bw, h: 12 }, {
        label: fitted ? fitted.name : count ? `PICK (${count})` : 'NONE FOUND',
        disabled: count === 0,
        on: !!fitted,
      })) {
        this.open = slot;
        this.scroll = 0;
      }
      if (fitted) drawText(g, `${fitted.mass}KG`, bx, y + 23, PAL.steel2);
    }
  }

  /** The build bay: the assembled car above, its numbers on a strip below. */
  private drawStage(g: CanvasRenderingContext2D, r: Rect): void {
    const built = toBuild(this.ctx.profile.fitted);

    // Bay floor and back wall, so the car stands somewhere rather than floating on the room photo.
    panel(g, r, PAL.steel0);
    const floorY = r.y + Math.round(r.h * 0.56);
    g.fillStyle = PAL.shadow;
    g.fillRect(r.x + 1, r.y + 1, r.w - 2, floorY - r.y);
    g.fillStyle = PAL.steel1;
    g.fillRect(r.x + 1, floorY, r.w - 2, 2);
    // Hoist rails overhead.
    g.fillStyle = PAL.steel1;
    g.fillRect(r.x + 6, r.y + 6, r.w - 12, 1);
    for (let x = r.x + 14; x < r.x + r.w - 12; x += 22) g.fillRect(x, r.y + 6, 1, 5);

    if (Array.isArray(built)) {
      const lines = wrapText(
        `Empty bay. Fit ${built.map((sl) => SLOT_LABEL[sl]).join(', ')} to build a car.`,
        r.w - 16,
      );
      for (const [i, l] of lines.entries()) {
        drawTextCentered(g, l, r.x + r.w / 2, floorY - 24 + i * 9, PAL.steel2);
      }
      return;
    }

    // Scale the car to the bay, capped so a small window doesn't blow it up past its art resolution.
    const scale = Math.min(1.6, (r.w - 24) / 108);
    drawVehicle(g, built, r.x + r.w / 2, floorY, scale, 0);

    // --- numbers strip ---
    const spec = specOf(built);
    const vmax = topSpeed(built);
    const grip = built.wheels.grip * spec.mass * 9.81;
    const rows: [string, string, number, string][] = [
      ['MASS', `${Math.round(spec.mass)}KG`, clamp(spec.mass / 130), PAL.rust],
      ['DRAG', spec.cdA.toFixed(2), clamp(spec.cdA / 0.6), PAL.spark],
      ['TOP', `${(vmax * 3.6).toFixed(0)}KM/H`, clamp(vmax / 40), PAL.volt],
      ['GRIP', `${Math.round(grip)}N`, clamp(grip / 900), PAL.amber],
    ];
    const stripY = floorY + 10;
    const cw = Math.floor((r.w - 10) / 4);
    for (const [i, [label, val, frac, col]] of rows.entries()) {
      const x = r.x + 5 + i * cw;
      drawText(g, label, x, stripY, PAL.steel3);
      drawText(g, val, x, stripY + 9, PAL.bone);
      bar(g, { x, y: stripY + 19, w: cw - 6, h: 3 }, frac, col);
    }
    for (const [i, l] of wrapText('Lower mass and drag are better. The track decides which matters most.', r.w - 10).entries()) {
      drawText(g, l, r.x + 5, stripY + 27 + i * 8, PAL.steel2);
    }
  }

  private drawPicker(g: CanvasRenderingContext2D, view: Viewport, slot: Slot): void {
    const inp = this.ctx.input;
    const list = this.owned(slot);
    const w = Math.min(220, view.w - 16);
    const rowH = 22;
    const maxRows = Math.min(list.length + 1, Math.floor((view.h - 44) / rowH));
    const h = 22 + maxRows * rowH;
    const r: Rect = { x: Math.round((view.w - w) / 2), y: Math.round((view.h - h) / 2), w, h };

    g.globalAlpha = 0.78;
    g.fillStyle = PAL.ink;
    g.fillRect(0, 0, view.w, view.h);
    g.globalAlpha = 1;
    panel(g, r, PAL.steel0, PAL.brass);

    drawText(g, SLOT_LABEL[slot].toUpperCase(), r.x + 4, r.y + 4, PAL.brassLit);
    if (button(g, inp, { x: r.x + r.w - 26, y: r.y + 2, w: 24, h: 11 }, { label: 'X' })) {
      this.open = null;
      return;
    }

    // Wheel/drag scroll for long lists.
    const visible = maxRows - 1;
    if (list.length > visible) {
      if (inp.pressed.down) this.scroll = Math.min(list.length - visible, this.scroll + 1);
      if (inp.pressed.up) this.scroll = Math.max(0, this.scroll - 1);
    } else {
      this.scroll = 0;
    }

    const fittedId = this.ctx.profile.fitted[slot];
    let row = 0;

    // "Remove" is always the first row so the slot can be emptied without hunting.
    if (fittedId) {
      const box: Rect = { x: r.x + 4, y: r.y + 16, w: r.w - 8, h: 13 };
      if (button(g, inp, box, { label: 'REMOVE', accent: PAL.rust })) {
        this.fit(slot, null);
        this.open = null;
        return;
      }
      row = 1;
    }

    for (let i = this.scroll; i < list.length && row < maxRows; i++, row++) {
      const pt = list[i] as Part;
      const y = r.y + 16 + row * rowH;
      const box: Rect = { x: r.x + 4, y, w: r.w - 8, h: 13 };
      if (button(g, inp, box, { label: pt.name, on: pt.id === fittedId })) {
        this.fit(slot, pt.id);
        this.open = null;
        return;
      }
      // The note states the trade, never the verdict — picking is the player's job.
      drawText(g, pt.note, r.x + 6, y + 14, PAL.steel2);
    }

    if (list.length > visible) {
      drawTextCentered(g, `${this.scroll + 1}-${Math.min(list.length, this.scroll + visible)} OF ${list.length}`, r.x + r.w / 2, r.y + r.h - 9, PAL.steel2);
    }
  }
}

function clamp(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Rival build for a track, resolved from ids. Exported so the race scene and debrief agree. */
export function rivalBuild(raceIndex: number) {
  const t = trackAt(raceIndex);
  const b = toBuild(t.rival);
  if (Array.isArray(b)) throw new Error(`${BRAND.rival} has an invalid build for race ${raceIndex}`);
  return b;
}

export { part };
