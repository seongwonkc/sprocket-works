/**
 * AABB platformer physics against the tile grid.
 *
 * Axis-separated sweep: resolve X fully, then Y. It's the standard approach because it can't tunnel at
 * these speeds and never wedges a body in a corner the way a combined resolve does.
 *
 * The feel constants at the bottom are the ones worth arguing about. Coyote time and jump buffering are
 * not cheats — without them a 60 Hz platformer feels broken to anyone who isn't frame-perfect, and this
 * game is aimed at nine-year-olds on a touchscreen.
 */

import { SOLID, SPRING, TILE, tileAt, type Level } from './level';

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** Set for one step when the body lands on a spring tile. */
  sprung: boolean;
}

// All lengths are in logical pixels, and the world doubled when TILE went 8 -> 16. Jump height is
// v^2/2g: -360 with g=1300 clears 50px, just over three tiles, which is what the ledge generator asks
// for. The spring clears 147px, enough to reach the next floor deck.
export const GRAVITY = 1300;
export const MAX_FALL = 620;
export const RUN_SPEED = 155;
export const RUN_ACCEL = 1300;
export const RUN_FRICTION = 1800;
export const JUMP_V = -360;
export const SPRING_V = -620;
/** Seconds after walking off a ledge during which a jump still counts. */
export const COYOTE = 0.09;
/** Seconds a jump press is remembered while airborne. */
export const JUMP_BUFFER = 0.11;

function solidAt(l: Level, px: number, py: number): boolean {
  return tileAt(l, Math.floor(px / TILE), Math.floor(py / TILE)) === SOLID;
}

/** True if any part of the box overlaps a solid tile. */
function boxHits(l: Level, x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.floor(x / TILE);
  const x1 = Math.floor((x + w - 0.001) / TILE);
  const y0 = Math.floor(y / TILE);
  const y1 = Math.floor((y + h - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tileAt(l, tx, ty) === SOLID) return true;
    }
  }
  return false;
}

export function moveBody(l: Level, b: Body, dt: number): void {
  b.sprung = false;

  // --- X ---
  const dx = b.vx * dt;
  if (dx !== 0) {
    const nx = b.x + dx;
    if (!boxHits(l, nx, b.y, b.w, b.h)) {
      b.x = nx;
    } else {
      // Step up to the wall face, then stop.
      const dir = Math.sign(dx);
      let probe = b.x;
      while (!boxHits(l, probe + dir, b.y, b.w, b.h) && Math.abs(probe - b.x) < Math.abs(dx)) {
        probe += dir;
      }
      b.x = probe;
      b.vx = 0;
    }
  }

  // --- Y ---
  b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
  const dy = b.vy * dt;
  const wasFalling = b.vy > 0;
  b.onGround = false;

  if (dy !== 0) {
    const ny = b.y + dy;
    if (!boxHits(l, b.x, ny, b.w, b.h)) {
      b.y = ny;
    } else {
      const dir = Math.sign(dy);
      let probe = b.y;
      while (!boxHits(l, b.x, probe + dir, b.w, b.h) && Math.abs(probe - b.y) < Math.abs(dy)) {
        probe += dir;
      }
      b.y = probe;
      if (wasFalling) {
        b.onGround = true;
        // Spring check reads the tile under the feet, not the tile we collided with — a spring is a
        // walkable tile, so the body lands on the solid beneath and the spring is what it's standing on.
        const feetY = b.y + b.h + 1;
        const left = Math.floor((b.x + 1) / TILE);
        const right = Math.floor((b.x + b.w - 2) / TILE);
        const row = Math.floor(feetY / TILE);
        for (let tx = left; tx <= right; tx++) {
          if (tileAt(l, tx, row) === SPRING) {
            b.sprung = true;
            break;
          }
        }
      }
      b.vy = 0;
    }
  }

  // Standing still on a spring should also launch — otherwise you can park on one.
  if (b.onGround && !b.sprung) {
    const row = Math.floor((b.y + b.h + 1) / TILE);
    const left = Math.floor((b.x + 1) / TILE);
    const right = Math.floor((b.x + b.w - 2) / TILE);
    for (let tx = left; tx <= right; tx++) {
      if (tileAt(l, tx, row) === SPRING) {
        b.sprung = true;
        break;
      }
    }
  }
}

/** Horizontal accel/friction shared by the player and the gremlins. */
export function applyRun(b: Body, dir: number, dt: number, speed = RUN_SPEED): void {
  if (dir !== 0) {
    b.vx += dir * RUN_ACCEL * dt;
    b.vx = Math.max(-speed, Math.min(speed, b.vx));
  } else {
    const drop = RUN_FRICTION * dt;
    b.vx = Math.abs(b.vx) <= drop ? 0 : b.vx - Math.sign(b.vx) * drop;
  }
}

export { solidAt };
