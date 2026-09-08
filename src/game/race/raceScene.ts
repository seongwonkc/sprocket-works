/**
 * The race, and then the debrief.
 *
 * The debrief is the actual teaching surface of this game. The original never told you *why* you lost —
 * you re-guessed. Here the integrator has been accumulating the energy lost to drag, rolling resistance,
 * the climb, and wheelspin the whole way down the track, so afterwards we can say "you spent 41% of your
 * energy pushing air" and point at the part responsible.
 *
 * It only appears after the flag. Told beforehand, it's a walkthrough; told afterwards, it's a result.
 */

import { BRAND, PAL } from '../../content/brand';
import { SLOT_LABEL, type Slot } from '../../content/parts';
import { heightAt, trackAt, type Track } from '../../content/tracks';
import { drawText, drawTextCentered, wrapText } from '../../core/font';
import type { Viewport } from '../../core/canvas';
import { play } from '../../core/audio';
import { RANKS } from '../../core/save';
import { emit } from '../../core/telemetry';
import { rivalBuild } from '../build/builder';
import type { Ctx, Scene, SceneName } from '../scene';
import { bar, button, heading, panel, type Rect } from '../ui/widgets';
import { drawTiledBg } from '../../core/assets';
import { drawVehicle } from '../build/vehicle';
import { makeRacer, stepRacer, toBuild, type Build, type Racer } from './sim';

type Phase = 'countdown' | 'running' | 'done';

/** Metres of track shown across the viewport during the run. */
const VIEW_M = 120;
/** Vertical gap between the rival's lane and yours, in logical px. */
const LANE_SEP = 26;
/** If both cars are this slow for this long, the race is over — a build can genuinely fail to climb. */
const STALL_V = 0.15;
const STALL_T = 2.5;

export class RaceScene implements Scene {
  private readonly track: Track;
  private readonly you: Racer;
  private readonly rival: Racer;
  private phase: Phase = 'countdown';
  private timer = 3.2;
  private stall = 0;
  private goTo: SceneName | null = null;
  private won = false;
  private rankedUp = false;

  constructor(private readonly ctx: Ctx) {
    const p = ctx.profile;
    this.track = trackAt(p.race);
    const b = toBuild(p.fitted);
    if (Array.isArray(b)) throw new Error('race entered with empty slots');
    this.you = makeRacer(b);
    this.rival = makeRacer(rivalBuild(p.race));
    emit({
      k: 'race.start',
      race: p.race,
      build: p.fitted as Record<string, string>,
      predictedTime: -1,
    });
  }

  next(): SceneName | null {
    return this.goTo;
  }

  step(dt: number, _view: Viewport): void {
    if (this.phase === 'countdown') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 'running';
        play('open');
      }
      return;
    }

    if (this.phase === 'running') {
      stepRacer(this.you, this.track, dt);
      stepRacer(this.rival, this.track, dt);

      // A car that can't climb its own hill would otherwise hang the scene forever.
      if (this.you.v < STALL_V && this.rival.v < STALL_V) this.stall += dt;
      else this.stall = 0;

      if ((this.you.finished && this.rival.finished) || this.stall > STALL_T) {
        this.finish();
      }
      return;
    }

    if (this.ctx.input.pressed.use || this.ctx.input.pressed.back) this.leave();
  }

  private finish(): void {
    this.phase = 'done';
    const mine = this.you.finished ? this.you.finishTime : Infinity;
    const theirs = this.rival.finished ? this.rival.finishTime : Infinity;
    this.won = mine < theirs;
    play(this.won ? 'winRace' : 'loseRace');

    const p = this.ctx.profile;
    const margin = theirs - mine;
    const prev = p.bestMargin[p.race];
    if (prev === undefined || margin > prev) p.bestMargin[p.race] = margin;

    emit({
      k: 'race.end',
      race: p.race,
      won: this.won,
      time: mine,
      rivalTime: theirs,
      lost: { ...this.you.lost },
    });

    if (this.won) {
      if (p.rank < RANKS.length - 1) {
        p.rank++;
        this.rankedUp = true;
        emit({ k: 'rank.up', rank: p.rank });
      }
      // Two fresh bolts per win — the ammo economy should never be the thing that stops a run.
      p.bananas = Math.min(9, p.bananas + 2);
    }
    this.ctx.save();
  }

  private leave(): void {
    const p = this.ctx.profile;
    if (this.won) {
      p.race = Math.min(p.race + 1, 4);
      // A new warehouse for the new race. Losing keeps the current one, parts and all.
      p.seed = (p.seed * 1664525 + 1013904223) >>> 0;
    }
    this.ctx.save();
    // Win: back out to the campus, which is where a new race is chosen. Lose: straight back to the
    // floor you were already working, because the parts you need are still in it.
    this.goTo = this.won ? 'hub' : 'warehouse';
  }

  // --- rendering ------------------------------------------------------------------
  draw(g: CanvasRenderingContext2D, view: Viewport): void {
    g.fillStyle = PAL.ink;
    g.fillRect(0, 0, view.w, view.h);
    this.drawTrack(g, view);
    this.drawHud(g, view);

    if (this.phase === 'countdown') {
      // The brief needs its own backing — laid over the horizon it collided with the ground line and
      // the distance markers and became unreadable.
      const lines = wrapText(this.track.brief, view.w - 44);
      const bh = 14 + lines.length * 9;
      const br: Rect = { x: 18, y: 26, w: view.w - 36, h: bh };
      panel(g, br, PAL.shadow, PAL.brass);
      drawTextCentered(g, this.track.name.toUpperCase(), view.w / 2, br.y + 4, PAL.brassLit);
      for (const [i, l] of lines.entries()) {
        drawTextCentered(g, l, view.w / 2, br.y + 14 + i * 9, PAL.bone);
      }

      const n = Math.ceil(this.timer - 0.2);
      const label = n <= 0 ? 'GO' : String(n);
      drawTextCentered(g, label, view.w / 2 - 1, br.y + bh + 12, PAL.amber, 3);
    }

    if (this.phase === 'done') this.drawDebrief(g, view);
  }

  private drawTrack(g: CanvasRenderingContext2D, view: Viewport): void {
    // Camera follows whoever is ahead. The lower clamp is deliberately negative: with a floor of 0 the
    // cars sit at x=0 on the countdown and get drawn off the left edge, so you start the race unable to
    // see your own car.
    const lead = Math.max(this.you.x, this.rival.x);
    const camM = Math.max(
      -VIEW_M * 0.18,
      Math.min(this.track.length - VIEW_M, lead - VIEW_M * 0.32),
    );
    const pxPerM = view.w / VIEW_M;
    const horizon = Math.round(view.h * 0.62);

    // Sky and skyline. The painted backdrop scrolls at a quarter rate for parallax; the block
    // silhouettes below are the fallback if the art is missing.
    if (!drawTiledBg(g, 'raceBg', view.w, horizon + 12, Math.round(camM * 0.25 * pxPerM), 0)) {
      g.fillStyle = PAL.shadow;
      g.fillRect(0, 0, view.w, horizon);
      g.fillStyle = PAL.steel0;
      for (let i = 0; i < 14; i++) {
        const x = ((i * 47 - camM * 0.25) % (view.w + 60)) - 30;
        g.fillRect(Math.round(x), horizon - 26 - (i % 3) * 7, 18, 26 + (i % 3) * 7);
      }
    }

    // Ground, drawn from the elevation profile so the hill is literally visible.
    const baseH = heightAt(this.track, camM);
    const yOf = (m: number): number =>
      horizon + Math.round((heightAt(this.track, m) - baseH) * -1.6) + 10;

    // Tarmac below the horizon. Left as the panel colour it looked like the world simply stopped.
    g.fillStyle = '#3a3f4a';
    for (let px = 0; px < view.w; px++) {
      const m = camM + px / pxPerM;
      const y = yOf(m) - LANE_SEP;
      g.fillRect(px, y, 1, view.h - y);
    }
    // Two lanes. Both cars started at x=0 on a single line and drew directly on top of each other,
    // labels and all — at the one moment the player most needs to see which car is theirs.
    for (let px = 0; px < view.w; px++) {
      const y = yOf(camM + px / pxPerM);
      g.fillStyle = PAL.steel3;
      g.fillRect(px, y, 1, 1);
      g.fillStyle = PAL.steel2;
      g.fillRect(px, y - LANE_SEP, 1, 1);
    }

    // Surface dashes. Without them the ground is a flat slab and there is no sense of speed at all —
    // the cars just slide along a bar. Spacing in metres, so they scroll at the true rate.
    g.fillStyle = PAL.steel0;
    const firstDash = Math.floor(camM / 4) * 4;
    const dashW = Math.max(1, Math.round(pxPerM * 1.6));
    for (let m = firstDash; m < camM + VIEW_M; m += 4) {
      const px = Math.round((m - camM) * pxPerM);
      g.fillRect(px, yOf(m) + 5, dashW, 1);
      g.fillRect(px, yOf(m) - LANE_SEP + 5, dashW, 1);
    }

    // Start line.
    {
      const px = Math.round((0 - camM) * pxPerM);
      if (px > -4 && px < view.w) {
        g.fillStyle = PAL.steel3;
        g.fillRect(px, yOf(0) - LANE_SEP - 16, 1, LANE_SEP + 16);
        drawText(g, 'START', px + 2, yOf(0) - LANE_SEP - 24, PAL.steel2);
      }
    }

    // Distance markers every 50 m, and the flag.
    g.fillStyle = PAL.steel2;
    for (let m = 50; m <= this.track.length; m += 50) {
      const px = Math.round((m - camM) * pxPerM);
      if (px < -8 || px > view.w) continue;
      g.fillStyle = PAL.steel2;
      g.fillRect(px, yOf(m) - LANE_SEP - 14, 1, 8);
      drawText(g, String(m), px + 2, yOf(m) - LANE_SEP - 22, PAL.steel2);
    }
    const fx = Math.round((this.track.length - camM) * pxPerM);
    if (fx > -12 && fx < view.w + 12) {
      const fy = yOf(this.track.length);
      g.fillStyle = PAL.bone;
      g.fillRect(fx, fy - 34, 1, 34);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i % 2 ? PAL.ink : PAL.bone;
        g.fillRect(fx + 1, fy - 34 + i * 3, 7, 3);
      }
    }

    this.drawCar(g, this.rival, camM, pxPerM, yOf, PAL.grape, false);
    this.drawCar(g, this.you, camM, pxPerM, yOf, PAL.hot, true);
  }

  private drawCar(
    g: CanvasRenderingContext2D,
    r: Racer,
    camM: number,
    pxPerM: number,
    yOf: (m: number) => number,
    colour: string,
    isPlayer: boolean,
  ): void {
    const px = Math.round((r.x - camM) * pxPerM);
    if (px < -60 || px > 3000) return;
    // Your car runs on the near lane, the rival on the far one.
    const py = yOf(r.x) - (isPlayer ? 0 : LANE_SEP);

    // Contact shadow, then the assembled vehicle. Wheel spin is driven by real distance travelled and
    // real wheel radius, so a slipping car visibly scrabbles without a special case.
    g.globalAlpha = 0.32;
    g.fillStyle = PAL.ink;
    g.fillRect(px - 20, py - 1, 40, 3);
    g.globalAlpha = 1;

    const spin = r.x * 0.5 + (r.forces.slipping ? r.t * 26 : 0);
    // The rival sits further away, so it is drawn a touch smaller — cheap depth cue.
    drawVehicle(g, r.build, px, py, isPlayer ? 0.7 : 0.6, spin);

    // A coloured underline rather than a tint box — the box read as a rectangle pasted over the car.
    g.fillStyle = colour;
    g.fillRect(px - 26, py + 1, 52, 2);

    if (r.forces.slipping) {
      g.fillStyle = PAL.bone;
      for (let i = 0; i < 3; i++) {
        g.fillRect(px - 22 - i * 5 - (Math.floor(r.t * 20) % 3), py - 1 - i, 3, 1);
      }
    }
    if (r.forces.spent) {
      drawText(g, 'FLAT', px - 12, py - 44, PAL.hot);
    }

    // Label trails the car instead of sitting above it — above, the near car's tag landed on the far car.
    drawText(g, isPlayer ? 'YOU' : BRAND.rivalShort, px - 44, py - 18, isPlayer ? PAL.amber : PAL.grape);
  }

  private drawHud(g: CanvasRenderingContext2D, view: Viewport): void {
    g.fillStyle = PAL.ink;
    g.globalAlpha = 0.8;
    g.fillRect(0, 0, view.w, 20);
    g.globalAlpha = 1;

    const t = this.you.finished ? this.you.finishTime : this.you.t;
    drawText(g, `${t.toFixed(2)}S`, 4, 3, PAL.bone);
    drawText(g, `${(this.you.v * 3.6).toFixed(0)} KM/H`, 4, 12, PAL.steel3);

    // Progress rail: both cars on one line, so the gap is legible at a glance.
    const railX = 62;
    const railW = view.w - railX - 6;
    g.fillStyle = PAL.steel0;
    g.fillRect(railX, 8, railW, 3);
    const mark = (r: Racer, col: string): void => {
      const x = railX + Math.round((r.x / this.track.length) * (railW - 2));
      g.fillStyle = col;
      g.fillRect(x, 6, 2, 7);
    };
    mark(this.rival, PAL.grape);
    mark(this.you, PAL.amber);

    const gap = this.you.x - this.rival.x;
    const label = Math.abs(gap) < 0.5 ? 'LEVEL' : `${gap > 0 ? '+' : ''}${gap.toFixed(0)}M`;
    drawText(g, label, railX, 14, gap >= 0 ? PAL.volt : PAL.hot);
  }

  // --- debrief --------------------------------------------------------------------
  private drawDebrief(g: CanvasRenderingContext2D, view: Viewport): void {
    const w = Math.min(268, view.w - 12);
    const h = Math.min(158, view.h - 10);
    const r: Rect = { x: Math.round((view.w - w) / 2), y: Math.round((view.h - h) / 2), w, h };

    g.globalAlpha = 0.85;
    g.fillStyle = PAL.ink;
    g.fillRect(0, 0, view.w, view.h);
    g.globalAlpha = 1;
    panel(g, r, PAL.steel0, this.won ? PAL.volt : PAL.rust);

    const mine = this.you.finished ? this.you.finishTime : Infinity;
    const theirs = this.rival.finished ? this.rival.finishTime : Infinity;

    drawTextCentered(g, this.won ? 'YOU WIN' : `${BRAND.rivalShort} WINS`, r.x + r.w / 2, r.y + 4, this.won ? PAL.volt : PAL.hot);
    const times = `${fmtT(mine)}  V  ${fmtT(theirs)}`;
    drawTextCentered(g, times, r.x + r.w / 2, r.y + 14, PAL.bone);

    // --- where the energy went ---
    // Column heading kept short on purpose: at 128 logical px this fits 21 characters, and the obvious
    // "WHERE YOUR ENERGY WENT" ran straight into the verdict column beside it.
    const half = Math.floor(r.w / 2) - 6;
    heading(g, 'ENERGY SPENT', r.x + 4, r.y + 26, half);

    const L = this.you.lost;
    const total = Math.max(1, L.drag + L.roll + L.climb + L.slip);
    const rows: [string, number, string, Slot][] = [
      ['PUSHING AIR', L.drag, PAL.spark, 'nose'],
      ['ROLLING', L.roll, PAL.amber, 'wheels'],
      ['CLIMBING', L.climb, PAL.rust, 'body'],
      ['WHEELSPIN', L.slip, PAL.hot, 'wheels'],
    ];
    for (const [i, [label, val, col]] of rows.entries()) {
      const y = r.y + 36 + i * 13;
      const pct = Math.max(0, val) / total;
      drawText(g, label, r.x + 4, y, PAL.steel3);
      drawText(g, `${Math.round(pct * 100)}%`, r.x + half - 16, y, PAL.bone);
      bar(g, { x: r.x + 4, y: y + 8, w: half - 4, h: 3 }, pct, col);
    }

    // --- the one sentence that matters ---
    const rx = r.x + half + 8;
    const rw = r.w - half - 12;
    heading(g, 'THE VERDICT', rx, r.y + 26, rw);
    for (const [i, line] of wrapText(this.verdict(rows), rw).entries()) {
      drawText(g, line, rx, r.y + 36 + i * 8, PAL.bone);
    }

    // --- what each of you actually ran ---
    // The verdict names a cause; this names the two parts that produced it. Without the comparison the
    // player knows they lost to drag but not that the rival turned up with a wedge nose.
    const cy = r.y + 90;
    heading(g, 'WHAT RAN', r.x + 4, cy, r.w - 8);
    drawText(g, 'YOU', r.x + 58, cy + 9, PAL.amber);
    drawText(g, BRAND.rivalShort, r.x + 58 + 74, cy + 9, PAL.grape);

    const mineB = this.you.build;
    const theirsB = this.rival.build;
    const slots: [string, Slot][] = [
      ['POWER', 'power'], ['NOSE', 'nose'], ['BODY', 'body'], ['WHEELS', 'wheels'],
    ];
    for (const [i, [label, slot]] of slots.entries()) {
      const y = cy + 18 + i * 8;
      const a = mineB[slot].name;
      const b = theirsB[slot].name;
      const same = a === b;
      drawText(g, label, r.x + 4, y, PAL.steel2);
      drawText(g, clip(a, 12), r.x + 58, y, same ? PAL.steel3 : PAL.bone);
      drawText(g, clip(b, 12), r.x + 58 + 74, y, same ? PAL.steel3 : PAL.bone);
    }

    if (this.rankedUp) {
      drawText(g, `PROMOTED: ${RANKS[this.ctx.profile.rank]}`.toUpperCase(), rx, r.y + 76, PAL.brassLit);
    }

    const label = this.won ? 'NEXT RACE' : 'BACK TO WORK';
    const bw = label.length * 6 + 12;
    const btn: Rect = { x: Math.round(r.x + r.w / 2 - bw / 2), y: r.y + r.h - 17, w: bw, h: 13 };
    if (button(g, this.ctx.input, btn, { label, accent: this.won ? PAL.volt : PAL.brass })) {
      this.leave();
    }
  }

  /**
   * Names the dominant loss and the part that owns it. Never "you should have picked X" — the point is
   * to hand back the observation, not the answer.
   */
  private verdict(rows: [string, number, string, Slot][]): string {
    const mine = this.you.finished ? this.you.finishTime : Infinity;
    const theirs = this.rival.finished ? this.rival.finishTime : Infinity;

    if (!this.you.finished && this.you.forces.spent) {
      return `Your ${this.you.build.power.name} ran out before the flag. Range and power are different things.`;
    }
    if (!this.you.finished) {
      return `You never reached the flag. At ${Math.round(this.you.spec.mass)} kg this car could not out-push the slope.`;
    }

    const top = rows.slice().sort((a, b) => b[1] - a[1])[0] as [string, number, string, Slot];
    const share = top[1] / Math.max(1, rows.reduce((s, x) => s + x[1], 0));
    const owner = SLOT_LABEL[top[3]];
    const gap = Math.abs(theirs - mine);

    const head = this.won
      ? `Won by ${gap.toFixed(2)}s.`
      : Number.isFinite(theirs)
        ? `Lost by ${gap.toFixed(2)}s.`
        : 'Neither of you finished.';

    if (top[1] <= 0) return `${head} Nothing much held you back.`;

    const cause: Record<string, string> = {
      'PUSHING AIR': `${Math.round(share * 100)}% of your energy went into shoving air aside. That is the ${owner.toLowerCase()}'s job.`,
      ROLLING: `${Math.round(share * 100)}% went into rolling resistance. Look at the ${owner.toLowerCase()} and the surface.`,
      CLIMBING: `${Math.round(share * 100)}% went into lifting the car up the slope. Every kilo had to be carried.`,
      WHEELSPIN: `${Math.round(share * 100)}% was thrown away as wheelspin. More power than the tyres could hold.`,
    };
    return `${head} ${cause[top[0]] ?? ''}`;
  }
}

/** Truncate with an ellipsis character the font actually has. */
function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}.`;
}

function fmtT(t: number): string {
  return Number.isFinite(t) ? `${t.toFixed(2)}S` : 'DNF';
}

export type { Build };
