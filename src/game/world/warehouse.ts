/**
 * The exploration scene: run, jump, spring, open crates, dodge gremlins, walk out to the workshop.
 *
 * Art is PixelLab-generated pixel art (originals, not extracted — see DESIGN.md §3). Every draw site
 * keeps its old primitive as a fallback, so a missing or failed asset degrades to the placeholder
 * instead of blanking the scene.
 */

import { BRAND, PAL } from '../../content/brand';
import { trackAt } from '../../content/tracks';
import { drawText, drawTextCentered } from '../../core/font';
import type { Viewport } from '../../core/canvas';
import { play } from '../../core/audio';
import { Rng } from '../../core/rng';
import { emit } from '../../core/telemetry';
import { RANKS } from '../../core/save';
import { drawFrame, drawSprite, drawTiledBg, has } from '../../core/assets';
import { PuzzleHost, makePuzzle } from '../puzzles/host';
import type { Ctx, Scene, SceneName } from '../scene';
import { button, panel, type Rect } from '../ui/widgets';
import {
  AIR, SOLID, TILE, generate, tileAt,
  type Crate, type Gremlin, type Level,
} from './level';
import {
  COYOTE, JUMP_BUFFER, JUMP_V, SPRING_V, applyRun, moveBody, type Body,
} from './physics';

const PLAYER_W = 14;
const PLAYER_H = 26;
const INTERACT_R = 26;
/** Character art is a 68px square canvas; the figure inside wants to stand about 44px tall. */
const KID_SCALE = 0.72;
const GREMLIN_SCALE = 0.66;
const GREMLIN_SPEED = 52;
const STUN_TIME = 7;
const HIT_INVULN = 1.4;

interface Bolt {
  x: number;
  y: number;
  vx: number;
  life: number;
}

export class WarehouseScene implements Scene {
  /** Seconds the rotate hint stays up on a portrait screen. */
  private rotateHint = 4;
  private readonly level: Level;
  private readonly body: Body;
  private readonly bolts: Bolt[] = [];
  private facing = 1;
  private coyote = 0;
  private jumpBuf = 0;
  private invuln = 0;
  private camX = 0;
  private camY = 0;
  private host: PuzzleHost | null = null;
  private activeCrate: Crate | null = null;
  /** True while airborne from a keyed jump — the only rise the variable-height cut may shorten. */
  private cutable = false;
  private goTo: SceneName | null = null;
  /** Transient banner, e.g. "gremlin took your Wedge Nose". */
  private toast = '';
  private toastT = 0;
  private anim = 0;

  constructor(private readonly ctx: Ctx) {
    const p = ctx.profile;
    const track = trackAt(p.race);
    // Seeded per (save, race) so re-entering the same warehouse gives the same layout.
    const rng = new Rng((p.seed ^ (p.race * 0x9e3779b1)) >>> 0);
    this.level = generate(rng, track, p.rank, p.rivalsEnabled);
    this.body = {
      x: this.level.spawnX, y: this.level.spawnY,
      w: PLAYER_W, h: PLAYER_H,
      vx: 0, vy: 0, onGround: false, sprung: false,
    };
    emit({ k: 'run.start', seed: p.seed, race: p.race });

    // Dev hook: `?puzzle=gears` opens that generator immediately. Four puzzle types behind a platformer
    // is four types nobody re-checks after changing the host layout.
    const want = new URLSearchParams(location.search).get('puzzle');
    if (want) {
      const c = this.level.crates.find((k) => k.domain === want) ?? this.level.crates[0];
      if (c) this.openCrate(c);
    }

    // The jump deliberately can't reach the next deck — springs do that — and the first hands-on
    // playtest proved nothing in the scene says so. Repeats each visit until the first part is won.
    if (p.race === 0 && p.parts.length === 0) this.say('BOUNCE ON A SPRING TO REACH THE UPPER DECKS');
  }

  next(): SceneName | null {
    return this.goTo;
  }

  // --- simulation -----------------------------------------------------------------
  step(dt: number, view: Viewport): void {
    this.anim += dt;
    if (this.rotateHint > 0) this.rotateHint -= dt;
    if (this.toastT > 0) this.toastT -= dt;

    if (this.host) {
      this.host.step(this.ctx.input, dt, view.w, view.h);
      const s = this.host.status();
      if (s === 'retry') {
        // Free retry, same crate, fresh instance from the same seed. No cost — see PuzzleHost.
        const c = this.activeCrate;
        this.host = null;
        this.activeCrate = null;
        if (c) this.openCrate(c);
      } else if (s !== 'running') {
        this.resolvePuzzle(s === 'won');
      }
      return;
    }

    const inp = this.ctx.input;
    const dir = (inp.held.right ? 1 : 0) - (inp.held.left ? 1 : 0);
    if (dir !== 0) this.facing = dir;
    applyRun(this.body, dir, dt);

    // Coyote time and jump buffering, resolved together so an early press near a ledge still fires.
    this.coyote = this.body.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    this.jumpBuf = inp.pressed.jump ? JUMP_BUFFER : Math.max(0, this.jumpBuf - dt);
    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.body.vy = JUMP_V;
      this.coyote = 0;
      this.jumpBuf = 0;
      this.cutable = true;
      play('jump');
    }
    // Variable jump height: releasing early cuts the rise — but only a rise the jump key started.
    // A spring launch is not a jump: cutting its -620 to -126 turned every spring into a 6px hop
    // for anyone not holding the jump key, which is everyone.
    if (this.cutable && !inp.held.jump && this.body.vy < JUMP_V * 0.35) this.body.vy = JUMP_V * 0.35;

    const wasAir = !this.body.onGround;
    moveBody(this.level, this.body, dt);
    if (this.body.sprung) {
      this.body.vy = SPRING_V;
      this.body.onGround = false;
      this.cutable = false;
      play('spring');
    } else if (wasAir && this.body.onGround) {
      play('land');
    }

    if (inp.pressed.throw) this.throwBolt();
    this.stepBolts(dt);
    this.stepGremlins(dt);

    if (this.invuln > 0) this.invuln -= dt;

    if (inp.pressed.use) this.tryInteract();

    this.updateCamera(view, dt);
  }

  private throwBolt(): void {
    if (this.ctx.profile.bananas <= 0) {
      this.say(`NO ${BRAND.ammoPlural.toUpperCase()} LEFT`);
      play('nope');
      return;
    }
    this.ctx.profile.bananas--;
    this.bolts.push({
      x: this.body.x + PLAYER_W / 2,
      y: this.body.y + 9,
      vx: this.facing * 250,
      life: 1.6,
    });
    play('throw');
  }

  private stepBolts(dt: number): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i] as Bolt;
      b.x += b.vx * dt;
      b.life -= dt;
      const tx = Math.floor(b.x / TILE);
      const ty = Math.floor(b.y / TILE);
      let dead = b.life <= 0 || tileAt(this.level, tx, ty) === SOLID;

      if (!dead) {
        for (const g of this.level.gremlins) {
          if (g.stunned > 0) continue;
          if (Math.abs(g.x + 9 - b.x) < 14 && Math.abs(g.y + 12 - b.y) < 16) {
            g.stunned = STUN_TIME;
            dead = true;
            play('stun');
            break;
          }
        }
      }
      if (dead) this.bolts.splice(i, 1);
    }
  }

  private stepGremlins(dt: number): void {
    for (const g of this.level.gremlins) {
      if (g.stunned > 0) {
        g.stunned -= dt;
        continue;
      }
      g.x += g.vx * dt * (GREMLIN_SPEED / 26);
      // Turn at the patrol bounds or at a wall.
      const aheadTx = Math.floor((g.x + (g.vx > 0 ? 18 : -2)) / TILE);
      const ty = Math.floor((g.y + 10) / TILE);
      const floorGone = tileAt(this.level, aheadTx, ty + 1) === AIR;
      if (g.x < g.minX || g.x > g.maxX || tileAt(this.level, aheadTx, ty) === SOLID || floorGone) {
        g.vx = -g.vx;
        g.x = Math.max(g.minX, Math.min(g.maxX, g.x));
      }

      if (this.invuln <= 0 && this.overlapsPlayer(g)) this.gremlinHit();
    }
  }

  private overlapsPlayer(g: Gremlin): boolean {
    return (
      g.x < this.body.x + PLAYER_W && g.x + 18 > this.body.x &&
      g.y < this.body.y + PLAYER_H && g.y + 24 > this.body.y
    );
  }

  /** Losing a part is the only real punishment in the game, so it is never silent. */
  private gremlinHit(): void {
    this.invuln = HIT_INVULN;
    const p = this.ctx.profile;
    if (p.parts.length === 0) {
      this.say('A GREMLIN SHOVES YOU');
      play('nope');
      this.body.vx = -this.facing * 180;
      this.body.vy = -220;
      return;
    }
    // Take an unfitted part first — losing the car you just built mid-run is not fun, it's cruel.
    const spare = p.parts.filter((id) => !Object.values(p.fitted).includes(id));
    const pool = spare.length ? spare : p.parts;
    const lost = pool[Math.floor(Math.random() * pool.length)] as string;
    p.parts.splice(p.parts.indexOf(lost), 1);
    for (const k of Object.keys(p.fitted)) if (p.fitted[k] === lost) p.fitted[k] = null;
    emit({ k: 'part.lost', part: lost });
    this.say('GREMLIN TOOK A PART!');
    play('nope');
    this.body.vx = -this.facing * 90;
    this.body.vy = -110;
  }

  private tryInteract(): void {
    // Exit first: it shares the bottom-left corner with nothing, but check it before crates anyway.
    const ex = this.level.exitTx * TILE;
    const ey = this.level.exitTy * TILE;
    if (Math.abs(this.body.x - ex) < INTERACT_R && Math.abs(this.body.y - ey) < INTERACT_R) {
      this.goTo = 'build';
      return;
    }

    const c = this.nearestCrate();
    if (!c) return;
    if (c.opened) return;
    this.openCrate(c);
  }

  private openCrate(c: Crate): void {
    const puzzle = makePuzzle(c.domain, new Rng(c.seed), this.ctx.profile.rank);
    this.host = new PuzzleHost(puzzle, this.ctx.profile.rank, c.part.id, c.part.name);
    this.activeCrate = c;
    play('open');
  }

  private resolvePuzzle(won: boolean): void {
    const c = this.activeCrate;
    this.host = null;
    this.activeCrate = null;
    if (!c) return;

    const stats = this.ctx.profile.puzzleStats[c.domain] ?? [0, 0];
    stats[0]++;
    if (won) stats[1]++;
    this.ctx.profile.puzzleStats[c.domain] = stats;

    if (won) {
      c.opened = true;
      if (!this.ctx.profile.parts.includes(c.part.id)) {
        this.ctx.profile.parts.push(c.part.id);
      }
      emit({ k: 'part.won', part: c.part.id });
      this.say(`GOT: ${c.part.name.toUpperCase()}`);
    }
    // Losing costs nothing. The crate is still shut and still there, exactly as in the original.
    this.ctx.save();
  }

  private nearestCrate(): Crate | null {
    let best: Crate | null = null;
    let bestD = INTERACT_R;
    for (const c of this.level.crates) {
      if (c.opened) continue;
      const d = Math.hypot(
        c.tx * TILE + TILE / 2 - (this.body.x + PLAYER_W / 2),
        c.ty * TILE + TILE / 2 - (this.body.y + PLAYER_H / 2),
      );
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  private say(s: string): void {
    this.toast = s;
    this.toastT = 2.2;
  }

  private updateCamera(view: Viewport, dt: number): void {
    const targetX = this.body.x + PLAYER_W / 2 - view.w / 2;
    const targetY = this.body.y + PLAYER_H / 2 - view.h / 2;
    const maxX = this.level.w * TILE - view.w;
    const maxY = this.level.h * TILE - view.h;
    // Snappy but not rigid; 12/s reaches the target in ~3 frames without visible lag.
    const k = Math.min(1, dt * 12);
    this.camX += (Math.max(0, Math.min(maxX, targetX)) - this.camX) * k;
    this.camY += (Math.max(0, Math.min(maxY, targetY)) - this.camY) * k;
  }

  // --- rendering ------------------------------------------------------------------
  draw(g: CanvasRenderingContext2D, view: Viewport): void {
    const ox = Math.round(this.camX);
    const oy = Math.round(this.camY);

    g.fillStyle = PAL.ink;
    g.fillRect(0, 0, view.w, view.h);
    this.drawBackdrop(g, view, ox, oy);
    this.drawTiles(g, view, ox, oy);
    for (const c of this.level.crates) this.drawCrate(g, c, ox, oy);
    for (const gr of this.level.gremlins) this.drawGremlin(g, gr, ox, oy);
    for (const b of this.bolts) {
      g.fillStyle = PAL.amber;
      g.fillRect(Math.round(b.x - ox) - 1, Math.round(b.y - oy) - 1, 3, 2);
    }
    this.drawExit(g, ox, oy);
    this.drawPlayer(g, ox, oy);
    this.drawHud(g, view);

    if (this.host) this.host.draw(g, this.ctx.input, view.w, view.h);
  }

  private drawBackdrop(g: CanvasRenderingContext2D, view: Viewport, ox: number, oy: number): void {
    g.fillStyle = PAL.shadow;
    g.fillRect(0, 0, view.w, view.h);
    // The painted rack, tiled and scrolled at 0.75 so it reads as the wall behind the shelves rather
    // than as a flat sticker. Falls back to the old girder hatching if the art is missing.
    if (drawTiledBg(g, 'warehouseBg', view.w, view.h, Math.round(ox * 0.75), Math.round(oy * 0.75))) {
      g.globalAlpha = 0.28;
      g.fillStyle = PAL.ink;
      g.fillRect(0, 0, view.w, view.h);
      g.globalAlpha = 1;
      return;
    }
    g.fillStyle = PAL.steel0;
    const px = Math.round(ox * 0.5);
    const py = Math.round(oy * 0.5);
    for (let x = -px % 40; x < view.w; x += 40) g.fillRect(x, 0, 2, view.h);
    for (let y = -py % 28; y < view.h; y += 28) g.fillRect(0, y, view.w, 1);
  }

  private drawTiles(g: CanvasRenderingContext2D, view: Viewport, ox: number, oy: number): void {
    const x0 = Math.max(0, Math.floor(ox / TILE));
    const x1 = Math.min(this.level.w - 1, Math.ceil((ox + view.w) / TILE));
    const y0 = Math.max(0, Math.floor(oy / TILE));
    const y1 = Math.min(this.level.h - 1, Math.ceil((oy + view.h) / TILE));

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = tileAt(this.level, tx, ty);
        if (t === AIR) continue;
        const px = tx * TILE - ox;
        const py = ty * TILE - oy;
        if (t === SOLID) {
          // Shelf deck. The background is a plain wall on purpose — decks are drawn here so they line
          // up with collision exactly. A painted backdrop with its own shelf lines never will.
          const openAbove = tileAt(this.level, tx, ty - 1) !== SOLID;
          g.fillStyle = PAL.steel1;
          g.fillRect(px, py, TILE, TILE);
          if (openAbove) {
            g.fillStyle = PAL.steel3;
            g.fillRect(px, py, TILE, 2);
            g.fillStyle = PAL.bone;
            g.fillRect(px, py, TILE, 1);
            // Front lip of the shelf, catching the light.
            g.fillStyle = PAL.steel2;
            g.fillRect(px, py + 2, TILE, 2);
          }
          g.fillStyle = PAL.steel0;
          g.fillRect(px, py + TILE - 3, TILE, 3);
          // Rivets every other tile — enough rhythm to read as steel, cheap enough to not matter.
          if (tx % 2 === 0 && openAbove) {
            g.fillStyle = PAL.steel3;
            g.fillRect(px + 3, py + 6, 2, 2);
            g.fillRect(px + TILE - 5, py + 6, 2, 2);
          }
        } else {
          // Spring: coil that compresses on the animation cycle.
          const squash = 1 + Math.round(Math.sin(this.anim * 6) * 0.5);
          g.fillStyle = PAL.brass;
          for (let i = 0; i < 3; i++) {
            g.fillRect(px + 1, py + 2 + i * 2 + squash, TILE - 2, 1);
          }
          g.fillStyle = PAL.brassLit;
          g.fillRect(px, py + squash, TILE, 1);
        }
      }
    }
  }

  private drawCrate(g: CanvasRenderingContext2D, c: Crate, ox: number, oy: number): void {
    const x = c.tx * TILE - ox;
    const y = c.ty * TILE - oy;
    const S = TILE;

    if (c.opened) {
      // Flattened packing after it has been opened.
      g.fillStyle = PAL.brass0;
      g.fillRect(x + 1, y + S - 5, S - 2, 4);
      g.fillStyle = PAL.steel0;
      g.fillRect(x + 1, y + S - 5, S - 2, 1);
      return;
    }

    g.globalAlpha = 0.3;
    g.fillStyle = PAL.ink;
    g.fillRect(x, y + S - 2, S, 3);
    g.globalAlpha = 1;

    // Native art is 48px; the collision box is one 16px tile, so scale to a ~28px crate that
    // overhangs its tile slightly rather than dwarfing the character.
    if (!drawSprite(g, 'crate', x + S / 2, y + S + 2, 0.58)) {
      g.fillStyle = PAL.brass0;
      g.fillRect(x, y, S, S);
      g.fillStyle = PAL.brass;
      g.fillRect(x, y, S, 2);
      g.fillRect(x, y + S - 2, S, 2);
      g.fillRect(x, y, 2, S);
      g.fillRect(x + S - 2, y, 2, S);
    }

    // Domain badge, so you can pick which puzzle you fancy from across the room. Drawn on a dark chip
    // rather than straight onto the crate art, which is too busy to read a 5px glyph against.
    const bx = x + S / 2 - 6;
    const by = y - 2;
    g.fillStyle = PAL.ink;
    g.fillRect(bx, by, 12, 12);
    g.fillStyle = PAL.brassLit;
    g.fillRect(bx, by, 12, 1);
    g.fillRect(bx, by + 11, 12, 1);
    g.fillRect(bx, by, 1, 12);
    g.fillRect(bx + 11, by, 1, 12);
    g.fillStyle = PAL.amber;
    const cx = bx + 4;
    const cy = by + 4;
    switch (c.domain) {
      case 'balance': g.fillRect(cx - 2, cy + 2, 8, 1); g.fillRect(cx + 1, cy + 3, 2, 3); break;
      case 'circuit': g.fillRect(cx, cy, 4, 4); g.fillRect(cx + 1, cy - 2, 2, 2); break;
      case 'machines': g.fillRect(cx - 2, cy, 8, 2); g.fillRect(cx, cy + 3, 4, 2); break;
      case 'gears': g.fillRect(cx, cy, 4, 4); g.fillRect(cx + 1, cy - 2, 2, 8); g.fillRect(cx - 2, cy + 1, 8, 2); break;
      case 'energy': g.fillRect(cx + 2, cy - 2, 2, 3); g.fillRect(cx + 1, cy + 1, 2, 2); g.fillRect(cx - 1, cy + 3, 3, 3); break;
      case 'magnets': g.fillRect(cx - 2, cy, 2, 6); g.fillRect(cx + 4, cy, 2, 6); g.fillRect(cx - 2, cy, 8, 2); break;
      case 'force': g.fillRect(cx - 2, cy + 5, 8, 2); g.fillRect(cx, cy + 3, 2, 2); g.fillRect(cx + 2, cy + 1, 2, 2); g.fillRect(cx + 4, cy - 1, 2, 2); break;
    }

    if (this.nearestCrate() === c && !this.host) {
      const bob = Math.round(Math.sin(this.anim * 5) * 2);
      const label = this.ctx.input.coarse ? 'TAP' : 'E';
      const w = label.length * 6 + 6;
      const lx = Math.round(x + S / 2 - w / 2);
      const ly = y - 20 + bob;
      g.fillStyle = PAL.ink;
      g.fillRect(lx, ly, w, 11);
      g.fillStyle = PAL.volt;
      g.fillRect(lx, ly, w, 1);
      drawTextCentered(g, label, x + S / 2, ly + 2, PAL.volt);
    }
  }

  private drawGremlin(g: CanvasRenderingContext2D, gr: Gremlin, ox: number, oy: number): void {
    const x = Math.round(gr.x - ox);
    const y = Math.round(gr.y - oy);
    const out = gr.stunned > 0;
    const W = 18;
    const H = 24;

    g.globalAlpha = 0.3;
    g.fillStyle = PAL.ink;
    g.fillRect(x - 1, y + H - 2, W + 2, 3);
    g.globalAlpha = 1;

    // Stunned gremlins slump: half height, desaturated. Reads as harmless from across the room.
    if (out) g.globalAlpha = 0.55;
    const drew = drawSprite(g, gr.vx > 0 ? 'gremlinEast' : 'gremlinWest', x + W / 2, y + H, GREMLIN_SCALE);
    g.globalAlpha = 1;

    if (!drew) {
      g.fillStyle = out ? PAL.steel1 : PAL.grape;
      g.fillRect(x, y + 5, W, H - 5);
      g.fillStyle = out ? PAL.steel0 : PAL.steel2;
      g.fillRect(x + 2, y, W - 4, 6);
      if (!out) {
        g.fillStyle = PAL.amber;
        g.fillRect(x + (gr.vx > 0 ? 10 : 4), y + 2, 4, 3);
      }
    }
    if (out) drawText(g, 'Z', x + 4, y - 12, PAL.spark);
  }

  private drawExit(g: CanvasRenderingContext2D, ox: number, oy: number): void {
    const x = this.level.exitTx * TILE - ox;
    const y = this.level.exitTy * TILE - oy;
    const W = TILE + 8;
    const H = TILE * 2;
    g.fillStyle = PAL.steel0;
    g.fillRect(x - 4, y - H + TILE, W, H);
    g.fillStyle = PAL.volt;
    g.fillRect(x - 4, y - H + TILE, W, 2);
    g.fillRect(x - 4, y - H + TILE, 2, H);
    g.fillRect(x + W - 6, y - H + TILE, 2, H);
    g.fillStyle = PAL.ink;
    g.fillRect(x - 1, y - H + TILE + 5, W - 6, H - 8);
    drawTextCentered(g, 'OUT', x + W / 2 - 4, y - H + TILE + 9, PAL.volt);
    drawTextCentered(g, 'SHOP', x + W / 2 - 4, y - H + TILE + 18, PAL.steel3);
  }

  private drawPlayer(g: CanvasRenderingContext2D, ox: number, oy: number): void {
    // Flash while invulnerable. 12 Hz — visible, below the photosensitivity threshold.
    if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) return;

    const x = Math.round(this.body.x - ox);
    const y = Math.round(this.body.y - oy);

    // Shadow first, so the character sits on the deck instead of hovering over it.
    g.globalAlpha = 0.3;
    g.fillStyle = PAL.ink;
    g.fillRect(x - 2, y + PLAYER_H - 2, PLAYER_W + 4, 3);
    g.globalAlpha = 1;

    // Feet-anchored: the art canvas is padded square, so top-left anchoring floats the figure.
    const footX = x + PLAYER_W / 2;
    const footY = y + PLAYER_H;
    const strip = this.facing > 0 ? 'kidWalkEast' : 'kidWalkWest';
    const still = this.facing > 0 ? 'kidEast' : 'kidWest';

    // Walk cycle is driven by distance travelled, not by a timer, so the feet can never slide: one
    // stride always covers the same ground however fast the player is moving.
    const running = Math.abs(this.body.vx) > 8 && this.body.onGround;
    if (running && has(strip)) {
      const frame = Math.floor(Math.abs(this.body.x) / 9);
      if (drawFrame(g, strip, frame, footX, footY, KID_SCALE)) return;
    }
    // Airborne uses a fixed mid-stride frame — a legs-together pose reads as a jump.
    if (!this.body.onGround && has(strip)) {
      if (drawFrame(g, strip, 3, footX, footY, KID_SCALE)) return;
    }
    if (drawSprite(g, still, footX, footY, KID_SCALE)) return;

    // --- fallback: the original primitive kid, kept so a missing asset never blanks the player ---
    const step = Math.abs(this.body.vx) > 6 && this.body.onGround ? Math.floor(this.body.x / 9) % 2 : 0;
    g.fillStyle = PAL.spark;
    g.fillRect(x, y, PLAYER_W, 6);
    g.fillStyle = PAL.bone;
    g.fillRect(x + 2, y + 6, PLAYER_W - 4, 5);
    g.fillStyle = PAL.rust;
    g.fillRect(x, y + 11, PLAYER_W, 9);
    g.fillStyle = PAL.steel3;
    if (this.body.onGround) {
      g.fillRect(x + step * 2, y + 20, 5, 6);
      g.fillRect(x + 9 - step * 2, y + 20, 5, 6);
    } else {
      g.fillRect(x + 3, y + 20, 8, 6);
    }
    g.fillStyle = PAL.ink;
    g.fillRect(x + (this.facing > 0 ? 10 : 3), y + 7, 2, 2);
  }

  private drawHud(g: CanvasRenderingContext2D, view: Viewport): void {
    const p = this.ctx.profile;
    const open = this.level.crates.filter((c) => !c.opened).length;

    g.fillStyle = PAL.ink;
    g.globalAlpha = 0.75;
    g.fillRect(0, 0, view.w, 11);
    g.globalAlpha = 1;

    // Laid out left-to-right by measured width rather than fixed columns: "Works Director" is 14
    // characters and would run straight through a hardcoded parts counter at minimum viewport width.
    let hx = 3;
    const chip = (s: string, col: string): void => {
      drawText(g, s, hx, 2, col);
      hx += s.length * 6 + 5;
    };
    chip(`${RANKS[p.rank]}`.toUpperCase(), PAL.brassLit);
    chip(`PARTS ${p.parts.length}`, PAL.bone);
    chip(`${BRAND.ammo.toUpperCase()} ${p.bananas}`, p.bananas > 0 ? PAL.amber : PAL.steel2);
    chip(`CRATES ${open}`, PAL.bone);

    const race = `RACE ${p.race + 1}/5`;
    const rx = view.w - 4 - race.length * 6 + 1;
    // Drop it rather than overlap if the rank name has eaten the bar.
    if (rx > hx) drawText(g, race, rx, 2, PAL.steel3);

    // Portrait is playable, but landscape shows about a third more of the floor. Say so once.
    if (this.rotateHint > 0 && view.h > view.w * 0.95 && this.toastT <= 0) {
      const msg = 'TURN SIDEWAYS FOR MORE VIEW';
      const w = msg.length * 6 + 8;
      const r: Rect = { x: Math.round((view.w - w) / 2), y: view.h - 46, w, h: 12 };
      panel(g, r, PAL.shadow, PAL.steel2);
      drawTextCentered(g, msg, r.x + r.w / 2, r.y + 3, PAL.steel3);
    }

    if (this.toastT > 0) {
      const w = this.toast.length * 6 + 8;
      const r: Rect = { x: Math.round((view.w - w) / 2), y: view.h - 30, w, h: 12 };
      panel(g, r, PAL.shadow, PAL.brass);
      drawTextCentered(g, this.toast, r.x + r.w / 2, r.y + 3, PAL.amber);
    }

    // Desktop-only affordance strip; touch players get the on-screen pad instead.
    if (!this.ctx.input.coarse) {
      // Bottom-right: the top strip collided with the HUD chips and the bottom-left is the exit alcove.
      const hint = 'MOVE  JUMP:SPACE  USE:E  THROW:Q';
      drawText(g, hint, view.w - 6 - hint.length * 6, view.h - 10, PAL.steel1);
    }

    // A permanent way out, because on a phone there is no Escape key.
    if (this.ctx.input.coarse && !this.host) {
      const r: Rect = { x: view.w - 38, y: 13, w: 34, h: 12 };
      if (button(g, this.ctx.input, r, { label: 'SHOP' })) this.goTo = 'build';
    }
  }
}
