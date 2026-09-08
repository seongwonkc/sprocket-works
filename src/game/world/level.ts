/**
 * Warehouse generation.
 *
 * Floors stacked vertically, connected by springs. Deliberately *not* a maze: the 1993 original's
 * front/back warehouse split was dead time, and on a phone in a five-minute session, navigation friction
 * is pure cost. The tension comes from the gremlins and the part economy, not from getting lost.
 *
 * Guaranteed parts (see tracks.ts) are placed first so the ladder can never become unwinnable — a player
 * who loses every crate still finds enough to field a car.
 */

import type { Rng } from '../../core/rng';
import { dropPool, type Part } from '../../content/parts';
import type { Track } from '../../content/tracks';
import type { Domain } from '../puzzles/types';
import { DOMAINS } from '../puzzles/host';

export const TILE = 16;

export type Tile = 0 | 1 | 2;
export const AIR: Tile = 0;
export const SOLID: Tile = 1;
export const SPRING: Tile = 2;

export interface Crate {
  /** Tile coords. */
  tx: number;
  ty: number;
  domain: Domain;
  part: Part;
  /** Set once the puzzle is solved. Failing leaves the crate shut but re-openable, at no cost. */
  opened: boolean;
  /** Seeds this crate's puzzle, so re-entering gives the same instance. */
  seed: number;
}

export interface Gremlin {
  x: number;
  y: number;
  vx: number;
  /** Tile-space bounds of its patrol. */
  minX: number;
  maxX: number;
  /** Sim seconds of remaining stun. */
  stunned: number;
}

export interface Level {
  w: number;
  h: number;
  tiles: Tile[];
  crates: Crate[];
  gremlins: Gremlin[];
  spawnX: number;
  spawnY: number;
  /** Tile coords of the workshop exit. Walk into it to go build. */
  exitTx: number;
  exitTy: number;
}

export function tileAt(l: Level, tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= l.w || ty >= l.h) return SOLID;
  return l.tiles[ty * l.w + tx] as Tile;
}

function set(l: Level, tx: number, ty: number, t: Tile): void {
  if (tx < 0 || ty < 0 || tx >= l.w || ty >= l.h) return;
  l.tiles[ty * l.w + tx] = t;
}

const FLOORS = 4;
/** Tile rows per floor, including the platform row. At 16px tiles that is an 80px deck, which is
 *  roughly the shelf pitch in the reference art and leaves headroom above a 48px character. */
const FLOOR_H = 5;

export function generate(rng: Rng, track: Track, tier: number, withGremlins: boolean): Level {
  const w = 62;
  const h = FLOORS * FLOOR_H + 2;
  const level: Level = {
    w, h,
    tiles: new Array<Tile>(w * h).fill(AIR),
    crates: [],
    gremlins: [],
    spawnX: 3 * TILE,
    spawnY: (h - 3) * TILE,
    exitTx: 2,
    exitTy: h - 3,
  };

  // Outer shell.
  for (let x = 0; x < w; x++) {
    set(level, x, h - 1, SOLID);
    set(level, x, 0, SOLID);
  }
  for (let y = 0; y < h; y++) {
    set(level, 0, y, SOLID);
    set(level, w - 1, y, SOLID);
  }

  // Floor slabs with a gap, so you can also drop down rather than only spring up.
  const floorRows: number[] = [];
  for (let f = 1; f < FLOORS; f++) {
    const y = h - 1 - f * FLOOR_H;
    floorRows.push(y);
    const gap = rng.int(6, w - 10);
    for (let x = 1; x < w - 1; x++) {
      if (x >= gap && x < gap + 3) continue;
      set(level, x, y, SOLID);
    }
  }
  const groundRow = h - 1;
  const rows = [groundRow, ...floorRows];

  // Springs: one per floor, positioned away from that floor's own gap so you don't fall straight back.
  for (let i = 0; i < rows.length - 1; i++) {
    const standRow = rows[i] as number;
    const above = rows[i + 1] as number;
    let sx = rng.int(4, w - 6);
    for (let tries = 0; tries < 24 && tileAt(level, sx, above) === AIR; tries++) {
      sx = rng.int(4, w - 6);
    }
    set(level, sx, standRow - 1, SPRING);
    // Punch a hole in the ceiling directly above so the spring actually delivers you somewhere.
    set(level, sx, above, AIR);
    set(level, sx + 1, above, AIR);
  }

  // Scattered ledges — variety, and cover for crates that would otherwise sit in a row.
  for (let i = 0; i < rows.length; i++) {
    const base = rows[i] as number;
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const lx = rng.int(3, w - 8);
      const ly = base - rng.int(2, 3);
      const len = rng.int(2, 4);
      for (let x = lx; x < lx + len; x++) set(level, x, ly, SOLID);
    }
  }

  // --- crates -------------------------------------------------------------------
  const guaranteed = track.guaranteed.map((id) => dropPool(9).find((p) => p.id === id)).filter(Boolean) as Part[];
  const extras = rng.shuffle(dropPool(tier)).slice(0, Math.max(0, 10 - guaranteed.length));
  const loot = [...guaranteed, ...extras];

  const spots: { tx: number; ty: number }[] = [];
  for (const base of rows) {
    for (let x = 3; x < w - 3; x++) {
      // A crate needs solid ground under it and headroom above.
      if (tileAt(level, x, base) === SOLID && tileAt(level, x, base - 1) === AIR && tileAt(level, x, base - 2) === AIR) {
        spots.push({ tx: x, ty: base - 1 });
      }
    }
  }
  const chosen = spreadOut(rng.shuffle(spots), loot.length, 4);
  for (let i = 0; i < loot.length && i < chosen.length; i++) {
    const s = chosen[i] as { tx: number; ty: number };
    level.crates.push({
      tx: s.tx, ty: s.ty,
      domain: DOMAINS[i % DOMAINS.length] as Domain,
      part: loot[i] as Part,
      opened: false,
      seed: rng.int(1, 0x7fffffff),
    });
  }

  // --- gremlins -----------------------------------------------------------------
  if (withGremlins) {
    const count = Math.min(4, 1 + Math.floor(tier / 2));
    for (let i = 0; i < count; i++) {
      const base = rng.pick(rows);
      const minX = rng.int(3, w - 16);
      level.gremlins.push({
        x: (minX + 2) * TILE,
        y: (base - 1) * TILE,
        vx: 14,
        minX: minX * TILE,
        maxX: (minX + rng.int(6, 12)) * TILE,
        stunned: 0,
      });
    }
  }

  // Exit alcove, bottom-left, clear of anything else.
  set(level, 1, h - 2, AIR);
  set(level, 2, h - 2, AIR);
  level.crates = level.crates.filter((c) => !(c.ty >= h - 3 && c.tx <= 4));

  return level;
}

/** Greedy min-spacing filter, so crates don't clump into an unreadable pile. */
function spreadOut<T extends { tx: number; ty: number }>(pool: T[], want: number, minDist: number): T[] {
  const out: T[] = [];
  for (const p of pool) {
    if (out.length >= want) break;
    if (out.every((q) => Math.abs(q.tx - p.tx) >= minDist || q.ty !== p.ty)) out.push(p);
  }
  // If spacing was too strict to fill the quota, top up with whatever's left.
  for (const p of pool) {
    if (out.length >= want) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}
