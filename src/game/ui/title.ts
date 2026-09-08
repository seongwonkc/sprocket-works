/**
 * Title screen. Continue, new game, and the two toggles that were in the original's Options menu and
 * still matter: sound, and whether the gremlins are in the building.
 *
 * "Without gremlins" is not an easy mode to be embarrassed about. Losing a part you earned is the one
 * genuinely punishing thing here, and a kid who wants to do the physics without being mugged should be
 * able to say so on the first screen rather than hunting through a menu.
 */

import { BRAND, PAL } from '../../content/brand';
import type { Viewport } from '../../core/canvas';
import { drawText, drawTextCentered } from '../../core/font';
import { isAudioEnabled, setAudioEnabled } from '../../core/audio';
import { RANKS, blankProfile, wipe } from '../../core/save';
import type { Ctx, Scene, SceneName } from '../scene';
import { button, panel, type Rect } from '../ui/widgets';

export class TitleScene implements Scene {
  private goTo: SceneName | null = null;
  private t = 0;
  private confirmNew = false;

  constructor(private readonly ctx: Ctx, private readonly hasSave: boolean) {}

  next(): SceneName | null {
    return this.goTo;
  }

  step(dt: number, _view: Viewport): void {
    this.t += dt;
  }

  draw(g: CanvasRenderingContext2D, view: Viewport): void {
    const inp = this.ctx.input;

    g.fillStyle = PAL.ink;
    g.fillRect(0, 0, view.w, view.h);

    // Slow-drifting gear silhouettes. Cheap, and it stops the screen reading as a form.
    g.fillStyle = PAL.shadow;
    for (let i = 0; i < 5; i++) {
      const r = 18 + i * 9;
      const cx = (i * 71 + this.t * (4 + i)) % (view.w + 120) - 60;
      const cy = 30 + ((i * 37) % Math.max(1, view.h - 60));
      for (let dy = -r; dy <= r; dy += 2) {
        const hw = Math.sqrt(Math.max(0, r * r - dy * dy));
        g.fillRect(Math.round(cx - hw), Math.round(cy + dy), Math.round(hw * 2), 1);
      }
    }

    const cx = view.w / 2;
    drawTextCentered(g, BRAND.title.toUpperCase(), cx, 26, PAL.brassLit, 2);
    drawTextCentered(g, BRAND.tagline.toUpperCase(), cx, 46, PAL.steel3);

    const bw = 124;
    const bx = Math.round(cx - bw / 2);
    let y = 68;

    if (this.hasSave && !this.confirmNew) {
      const p = this.ctx.profile;
      if (button(g, inp, { x: bx, y, w: bw, h: 14 }, { label: 'CONTINUE', accent: PAL.volt })) {
        this.goTo = 'hub';
      }
      drawTextCentered(
        g,
        `${RANKS[p.rank]} - RACE ${p.race + 1} - ${p.parts.length} PARTS`.toUpperCase(),
        cx, y + 17, PAL.steel2,
      );
      y += 28;
    }

    if (this.confirmNew) {
      const r: Rect = { x: bx - 14, y: y - 4, w: bw + 28, h: 44 };
      panel(g, r, PAL.steel0, PAL.rust);
      drawTextCentered(g, 'WIPE THE CURRENT RUN?', cx, y + 2, PAL.bone);
      if (button(g, inp, { x: r.x + 6, y: y + 14, w: (r.w - 18) / 2, h: 13 }, { label: 'CANCEL' })) {
        this.confirmNew = false;
      }
      if (button(g, inp, { x: r.x + r.w / 2 + 3, y: y + 14, w: (r.w - 18) / 2, h: 13 }, { label: 'WIPE', accent: PAL.rust })) {
        wipe();
        Object.assign(this.ctx.profile, blankProfile());
        this.ctx.save();
        this.goTo = 'hub';
      }
      y += 50;
    } else {
      if (button(g, inp, { x: bx, y, w: bw, h: 14 }, { label: this.hasSave ? 'NEW RUN' : 'START' })) {
        if (this.hasSave) {
          this.confirmNew = true;
        } else {
          Object.assign(this.ctx.profile, blankProfile());
          this.ctx.save();
          this.goTo = 'hub';
        }
      }
      y += 20;
    }

    const p = this.ctx.profile;
    if (button(g, inp, { x: bx, y, w: bw, h: 13 }, {
      label: `SOUND: ${isAudioEnabled() ? 'ON' : 'OFF'}`,
      on: isAudioEnabled(),
    })) {
      setAudioEnabled(!isAudioEnabled());
      p.audio = isAudioEnabled();
      this.ctx.save();
    }
    y += 17;
    if (button(g, inp, { x: bx, y, w: bw, h: 13 }, {
      label: `GREMLINS: ${p.rivalsEnabled ? 'ON' : 'OFF'}`,
      on: p.rivalsEnabled,
    })) {
      p.rivalsEnabled = !p.rivalsEnabled;
      this.ctx.save();
    }

    drawText(g, 'A REMAKE IN SPIRIT. ALL ART AND CODE ORIGINAL.', 4, view.h - 9, PAL.steel1);
  }
}
