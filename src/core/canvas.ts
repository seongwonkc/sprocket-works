/**
 * Fixed logical backbuffer, nearest-neighbour integer-scaled into whatever the device gives us.
 *
 * Everything in the game draws in 320x180 logical pixels and never thinks about DPR, orientation or
 * aspect ratio again. On a display wider than 16:9 we widen the logical viewport instead of pillarboxing,
 * so an ultrawide monitor sees *more warehouse* rather than black bars — but the vertical extent is
 * pinned, so nobody gets a competitive advantage from their hardware.
 */

// The 1993 original ran at 640x400 (VGA mode 12h-ish, 8:5). The first pass here used 320x180, a
// quarter of the pixel count in a different aspect — and that is precisely why every screen degenerated
// into text: there was no room for a picture. 480x300 keeps the original's 8:5 shape, gives 2.5x the
// pixels, and still integer-scales cleanly to 960x600 / 1440x900 / 1920x1200.
export const BASE_W = 480;
export const BASE_H = 300;

/** Hard ceiling on how wide the logical viewport may grow on very wide displays. */
const MAX_W = 640;
/** Same, vertically. Portrait phones have height to spare; this stops the world becoming trivial. */
const MAX_H = 400;
/**
 * How much of the shorter axis we'll waste before giving up on integer scaling.
 *
 * Integer scaling is what keeps pixels square, so it's the default. But a 390pt-wide portrait phone
 * computes a raw scale of 1.22, floors to 1, and renders a 390x180 postage stamp in the middle of an
 * 844pt screen. Above this threshold we take the fractional scale instead: on a 3x-DPR phone that's
 * ~3.65 device pixels per logical pixel, and the unevenness is invisible.
 */
const WASTE_TOLERANCE = 0.15;

export interface Viewport {
  /** Logical width this frame (>= BASE_W, <= MAX_W). */
  w: number;
  /** Logical height this frame (>= BASE_H, <= MAX_H). */
  h: number;
  /** Integer scale factor from logical px to device px. */
  scale: number;
}

export class Screen {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly view: Viewport = { w: BASE_W, h: BASE_H, scale: 1 };
  /** True when the window is taller than it is wide. Scenes use it to suggest rotating. */
  portrait = false;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    parent.appendChild(this.canvas);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
    // iOS fires resize before the URL bar settles; re-measure once it has.
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const availW = Math.max(1, window.innerWidth);
    const availH = Math.max(1, window.innerHeight);

    const rawScale = Math.min(availW / BASE_W, availH / BASE_H);
    const intScale = Math.max(1, Math.floor(rawScale));
    const waste = (rawScale - intScale) / rawScale;
    const scale = rawScale >= 1 && waste <= WASTE_TOLERANCE ? intScale : rawScale;

    // Spend leftover room on logical size, in whole logical pixels. Even numbers only, so anything
    // centred on the midpoint lands on a pixel boundary.
    const fitsW = Math.floor(availW / scale);
    const fitsH = Math.floor(availH / scale);
    const w = Math.min(MAX_W, Math.max(BASE_W, fitsW - (fitsW % 2)));
    const h = Math.min(MAX_H, Math.max(BASE_H, fitsH - (fitsH % 2)));

    this.view.w = w;
    this.view.h = h;
    this.view.scale = scale;
    this.portrait = availH > availW;

    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${Math.round(w * scale)}px`;
    this.canvas.style.height = `${Math.round(h * scale)}px`;

    this.ctx.imageSmoothingEnabled = false;
  }

  /** Map a client-space point (pointer/touch) into logical pixels. */
  toLogical(clientX: number, clientY: number, out: { x: number; y: number }): void {
    const r = this.canvas.getBoundingClientRect();
    out.x = ((clientX - r.left) / r.width) * this.view.w;
    out.y = ((clientY - r.top) / r.height) * this.view.h;
  }
}
