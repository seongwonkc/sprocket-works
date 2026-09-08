/**
 * Sprite loading.
 *
 * Everything visual used to be drawn with fillRect from the palette. That was defensible as a
 * placeholder, but it is why the game read as a spreadsheet with a physics engine attached — the 1993
 * original is dense painted pixel art and the density *is* the product. These are PixelLab-generated
 * originals, not extracted assets (see DESIGN.md §3).
 *
 * The loader is deliberately forgiving: a missing or broken image yields `null` and every draw site
 * falls back to the primitive it used before. Art can therefore land one file at a time without ever
 * leaving the game unplayable, and a failed CDN fetch degrades instead of white-screening.
 */

export type SpriteId =
  | 'warehouseBg' | 'workshopBg' | 'hubBg' | 'raceBg'
  | 'kidEast' | 'kidWest' | 'kidWalkEast' | 'kidWalkWest'
  | 'gremlinEast' | 'gremlinWest'
  | 'crate'
  | 'bodyCrate' | 'bodyTub' | 'bodySkin' | 'bodyFrame'
  | 'noseSlab' | 'noseRound' | 'noseWedge' | 'noseNeedle'
  | 'wheelIron' | 'wheelRubber' | 'wheelBalloon' | 'wheelSlick'
  | 'powerLeadCell';

const MANIFEST: Record<SpriteId, string> = {
  warehouseBg: 'warehouse_bg.png',
  workshopBg: 'workshop_bg.png',
  hubBg: 'hub_bg.png',
  raceBg: 'race_bg.png',
  kidEast: 'kid_east.png',
  kidWest: 'kid_west.png',
  kidWalkEast: 'kid_walk_east.png',
  kidWalkWest: 'kid_walk_west.png',
  gremlinEast: 'gremlin_east.png',
  gremlinWest: 'gremlin_west.png',
  crate: 'crate.png',
  bodyCrate: 'body_crate.png',
  bodyTub: 'body_tub.png',
  bodySkin: 'body_skin.png',
  bodyFrame: 'body_frame.png',
  noseSlab: 'nose_slab.png',
  noseRound: 'nose_round.png',
  noseWedge: 'nose_wedge.png',
  noseNeedle: 'nose_needle.png',
  wheelIron: 'wheel_iron.png',
  wheelRubber: 'wheel_rubber.png',
  wheelBalloon: 'wheel_balloon.png',
  wheelSlick: 'wheel_slick.png',
  powerLeadCell: 'power_leadcell.png',
};

const BASE = 'art/';

/**
 * Puzzle illustrations, keyed by name rather than by a union member.
 *
 * The Machines bank alone is 74 items; adding each one to `SpriteId` would make the union unreadable
 * and every new drawing a two-file change. These load by string key from `art/puzzle/<key>.png`, and a
 * key with no file simply draws nothing — so the bank can be illustrated a few items at a time.
 */
export const PUZZLE_ART: readonly string[] = [
  'mach_scissors', 'mach_wheelbarrow', 'mach_seesaw', 'mach_axe', 'mach_corkscrew',
  'mach_crowbar', 'mach_doorknob', 'mach_jarlid', 'mach_slide', 'mach_nutcracker',
  'mach_shovel', 'mach_pliers', 'mach_flagpole', 'mach_stapler', 'mach_bolt',
  'mach_windmill',
  'elec_bulb_on', 'elec_bulb_off', 'elec_battery',
  'force_bucket', 'force_ramp',
  'mag_bar',
  'en_torch', 'en_dam', 'en_turbine', 'en_candle', 'en_toaster', 'en_solar',
];

const extras = new Map<string, HTMLImageElement>();

/** Puzzle illustration by key, or null if that one has no drawing yet. */
export function art(key: string): HTMLImageElement | null {
  return extras.get(key) ?? null;
}

export function hasArt(key: string): boolean {
  return extras.has(key);
}

/** Draw a puzzle illustration centred on (cx, cy), scaled to fit inside maxW x maxH. */
export function drawArtFit(
  ctx: CanvasRenderingContext2D,
  key: string,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
): boolean {
  const img = extras.get(key);
  if (!img) return false;
  // Contain, not cover: an illustration that gets cropped loses the very feature being asked about.
  const s = Math.min(maxW / img.width, maxH / img.height, 2);
  const w = Math.round(img.width * s);
  const h = Math.round(img.height * s);
  ctx.drawImage(img, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
  return true;
}

const images = new Map<SpriteId, HTMLImageElement>();
let loaded = 0;
let attempted = 0;

/** Kicks off every fetch and resolves when all have settled, successfully or not. */
export function loadAssets(): Promise<void> {
  const ids = Object.keys(MANIFEST) as SpriteId[];
  attempted = ids.length + PUZZLE_ART.length;

  const one = (src: string, keep: (img: HTMLImageElement) => void): Promise<void> =>
    new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        keep(img);
        loaded++;
        resolve();
      };
      // A missing file is not an error — the draw site falls back to primitives.
      img.onerror = () => {
        loaded++;
        resolve();
      };
      img.src = src;
    });

  return Promise.all([
    ...ids.map((id) => one(`${BASE}${MANIFEST[id]}`, (img) => images.set(id, img))),
    ...PUZZLE_ART.map((k) => one(`${BASE}puzzle/${k}.png`, (img) => extras.set(k, img))),
  ]).then(() => undefined);
}

export function sprite(id: SpriteId): HTMLImageElement | null {
  return images.get(id) ?? null;
}

export function has(id: SpriteId): boolean {
  return images.has(id);
}

export function loadProgress(): { loaded: number; total: number } {
  return { loaded, total: attempted };
}

/**
 * Draw a sprite with its *bottom-centre* at (x, y).
 *
 * Sprite sheets from the generator are square canvases with the figure floating in the middle, so
 * anchoring by top-left puts characters at wildly different heights depending on canvas padding.
 * Feet-on-the-ground is the only anchor that behaves for a platformer.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  id: SpriteId,
  x: number,
  y: number,
  scale = 1,
): boolean {
  const img = images.get(id);
  if (!img) return false;
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
  return true;
}

/** Draw one frame of a horizontal strip. Frames are square, side length = image height. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  id: SpriteId,
  frame: number,
  x: number,
  y: number,
  scale = 1,
): boolean {
  const img = images.get(id);
  if (!img) return false;
  const size = img.height;
  const count = Math.max(1, Math.floor(img.width / size));
  const f = ((frame % count) + count) % count;
  const w = size * scale;
  ctx.drawImage(
    img, f * size, 0, size, size,
    Math.round(x - w / 2), Math.round(y - w), Math.round(w), Math.round(w),
  );
  return true;
}

/**
 * Tile a background horizontally and vertically to fill a rect, offset by a scroll position.
 * Used for the warehouse rack, which is one 400px panel repeated across a much wider level.
 */
export function drawTiledBg(
  ctx: CanvasRenderingContext2D,
  id: SpriteId,
  vw: number,
  vh: number,
  offX: number,
  offY: number,
): boolean {
  const img = images.get(id);
  if (!img) return false;
  const iw = img.width;
  const ih = img.height;
  const startX = -(((offX % iw) + iw) % iw);
  const startY = -(((offY % ih) + ih) % ih);
  for (let y = startY; y < vh; y += ih) {
    for (let x = startX; x < vw; x += iw) {
      ctx.drawImage(img, Math.round(x), Math.round(y));
    }
  }
  return true;
}

/** Stretch a background to exactly cover the viewport. For single-screen rooms. */
export function drawCoverBg(
  ctx: CanvasRenderingContext2D,
  id: SpriteId,
  vw: number,
  vh: number,
): boolean {
  const img = images.get(id);
  if (!img) return false;
  // Cover, not contain: a letterboxed room background looks like a bug, a cropped one looks framed.
  const s = Math.max(vw / img.width, vh / img.height);
  const w = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img, Math.round((vw - w) / 2), Math.round((vh - h) / 2), Math.round(w), Math.round(h));
  return true;
}
