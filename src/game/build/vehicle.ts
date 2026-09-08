/**
 * Draws the vehicle you actually built, from the parts you actually fitted.
 *
 * This is the piece the workshop was missing. Four dropdown buttons and a bar chart is a form; the
 * point of the scene is that you assembled a machine, and you should be able to see it. Every slot
 * maps to a sprite, and the sprite you see is the sprite that raced.
 *
 * The first attempt composited body + nose + wheels from separate sprites, on the reasoning that 4x4x4
 * is 64 combinations and anchors are cheaper than 64 sprites. In practice the generator bakes wheels
 * into anything shaped like a car no matter how firmly the prompt says otherwise, so compositing
 * produced four-wheeled cars wearing two extra wheels and a detached cone floating off the nose.
 *
 * So: the body sprite is the whole car, and nose and wheel choices are shown as part thumbnails beside
 * their slots instead. The silhouette still changes with the build, and nothing floats.
 */

import { drawSprite, has, type SpriteId } from '../../core/assets';
import { PAL } from '../../content/brand';
import type { Build } from '../race/sim';

const BODY_SPRITE: Record<string, SpriteId> = {
  b_crate: 'bodyCrate',
  b_tub: 'bodyTub',
  b_skin: 'bodySkin',
  b_frame: 'bodyFrame',
};
const NOSE_SPRITE: Record<string, SpriteId> = {
  n_slab: 'noseSlab',
  n_round: 'noseRound',
  n_wedge: 'noseWedge',
  n_needle: 'noseNeedle',
};
const POWER_SPRITE: Record<string, SpriteId> = {
  p_leadcell: 'powerLeadCell',
};
const WHEEL_SPRITE: Record<string, SpriteId> = {
  w_iron: 'wheelIron',
  w_rubber: 'wheelRubber',
  w_balloon: 'wheelBalloon',
  w_slick: 'wheelSlick',
};

/** Native body-art width, used by the width helper. */
const BODY_W = 96;

/**
 * Draw the assembled vehicle with its wheel contact point at (x, y), facing right.
 * `spin` rotates the wheels; pass the distance travelled for a rolling look.
 */
export function drawVehicle(
  ctx: CanvasRenderingContext2D,
  build: Build,
  x: number,
  y: number,
  scale = 1,
  spin = 0,
): void {
  const bodyId = BODY_SPRITE[build.body.id];
  if (!bodyId || !has(bodyId)) {
    drawSchematic(ctx, build, x, y, scale);
    return;
  }
  // Body art is the complete vehicle. `spin` is kept in the signature because the race scene has a
  // real wheel rate to hand and a future wheel-overlay pass should use it.
  void spin;
  drawSprite(ctx, bodyId, x, y, scale);
}

/** One part, drawn small, for the slot rows in the workshop. Returns false if there is no art. */
export function drawPartThumb(
  ctx: CanvasRenderingContext2D,
  partId: string,
  cx: number,
  bottomY: number,
  scale: number,
): boolean {
  const id = NOSE_SPRITE[partId] ?? WHEEL_SPRITE[partId] ?? POWER_SPRITE[partId] ?? BODY_SPRITE[partId];
  if (!id || !has(id)) return false;
  return drawSprite(ctx, id, cx, bottomY, scale);
}

/** Wireframe stand-in, keyed off the same physical numbers the sim uses. */
function drawSchematic(
  ctx: CanvasRenderingContext2D,
  build: Build,
  x: number,
  y: number,
  s: number,
): void {
  const len = Math.round((40 + build.body.area * 30) * s);
  const h = Math.round(18 * s);
  const wr = Math.round(7 * s);
  ctx.fillStyle = PAL.rust;
  ctx.fillRect(Math.round(x - len / 2), Math.round(y - wr - h), len, h);
  const noseLen = Math.round((1 - build.nose.cd) * 22 * s);
  for (let i = 0; i < noseLen; i++) {
    const hh = Math.max(2, h - Math.round(((i + 1) / noseLen) * h * 0.7));
    ctx.fillRect(Math.round(x + len / 2 + i), Math.round(y - wr - h + (h - hh) / 2), 1, hh);
  }
  ctx.fillStyle = PAL.ink;
  for (const wx of [x - len / 3, x + len / 3]) {
    ctx.fillRect(Math.round(wx - wr), Math.round(y - wr * 2), wr * 2, wr * 2);
  }
}

/** Rough drawn width, so callers can centre or scale to fit a panel. */
export function vehicleWidth(scale = 1): number {
  return (BODY_W + 24) * scale;
}
