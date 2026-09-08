/**
 * One action struct, three sources (keyboard, gamepad, touch). Nothing downstream knows which is live.
 *
 * `held` is level-triggered, `pressed` is edge-triggered and cleared by the sim each step — so a scene
 * that consumes `pressed.jump` gets exactly one jump per physical press regardless of frame rate.
 */

import type { Screen } from './canvas';

export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'use' | 'throw' | 'back' | 'pause';

export const ACTIONS: readonly Action[] = [
  'left', 'right', 'up', 'down', 'jump', 'use', 'throw', 'back', 'pause',
];

type Flags = Record<Action, boolean>;

const blank = (): Flags =>
  ACTIONS.reduce((o, a) => ((o[a] = false), o), {} as Flags);

const KEYMAP: Record<string, Action> = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump',
  KeyE: 'use', Enter: 'use',
  KeyQ: 'throw', KeyX: 'throw',
  Escape: 'back', Backspace: 'back',
  KeyP: 'pause',
};

/** Standard-gamepad button index -> action. */
const PADMAP: Record<number, Action> = {
  0: 'jump', 1: 'back', 2: 'throw', 3: 'use',
  9: 'pause',
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
};

export interface Pointer {
  /** Logical-pixel position. Valid whenever `down` or `released` is true. */
  x: number;
  y: number;
  down: boolean;
  /** True for the single step in which the pointer went down. */
  pressed: boolean;
  /** True for the single step in which the pointer came up. */
  released: boolean;
}

export class Input {
  readonly held: Flags = blank();
  readonly pressed: Flags = blank();
  readonly pointer: Pointer = { x: 0, y: 0, down: false, pressed: false, released: false };

  /** Set by the touch pad overlay each step; merged into `held` before edges are computed. */
  readonly touch: Flags = blank();

  /** True once any touch/coarse pointer is seen — used to mount on-screen controls. */
  coarse = false;

  private readonly keys = new Set<Action>();
  private prev: Flags = blank();
  private prevPointerDown = false;
  private pendingPointerDown = false;
  private pendingPointerUp = false;
  private readonly tmp = { x: 0, y: 0 };

  constructor(private readonly screen: Screen) {
    addEventListener('keydown', this.onKey(true), { passive: false });
    addEventListener('keyup', this.onKey(false));
    addEventListener('blur', () => this.keys.clear());

    const c = screen.canvas;
    c.addEventListener('pointerdown', this.onPointer, { passive: false });
    c.addEventListener('pointermove', this.onPointer, { passive: false });
    addEventListener('pointerup', this.onPointerUp);
    addEventListener('pointercancel', this.onPointerUp);
    // Long-press context menu on mobile interrupts drag-based puzzles.
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKey =
    (down: boolean) =>
    (e: KeyboardEvent): void => {
      const a = KEYMAP[e.code];
      if (!a) return;
      // Space/arrows scroll the page otherwise.
      e.preventDefault();
      if (down) this.keys.add(a);
      else this.keys.delete(a);
    };

  private onPointer = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') this.coarse = true;
    if (e.type === 'pointerdown') {
      e.preventDefault();
      this.pendingPointerDown = true;
      this.pointer.down = true;
    } else if (!this.pointer.down) {
      // Hover: track position for desktop, but don't fake a press.
      this.screen.toLogical(e.clientX, e.clientY, this.tmp);
      this.pointer.x = this.tmp.x;
      this.pointer.y = this.tmp.y;
      return;
    }
    this.screen.toLogical(e.clientX, e.clientY, this.tmp);
    this.pointer.x = this.tmp.x;
    this.pointer.y = this.tmp.y;
  };

  private onPointerUp = (): void => {
    if (!this.pointer.down) return;
    this.pendingPointerUp = true;
    this.pointer.down = false;
  };

  /** Call once at the top of every fixed step, before any scene reads input. */
  sample(): void {
    for (const a of ACTIONS) {
      const now = this.keys.has(a) || this.touch[a] || this.padHas(a);
      this.pressed[a] = now && !this.prev[a];
      this.held[a] = now;
      this.prev[a] = now;
    }

    // A tap shorter than one step must still register as both press and release.
    this.pointer.pressed = this.pendingPointerDown || (this.pointer.down && !this.prevPointerDown);
    this.pointer.released = this.pendingPointerUp;
    this.prevPointerDown = this.pointer.down || this.pendingPointerDown;
    this.pendingPointerDown = false;
    this.pendingPointerUp = false;
  }

  private padHas(a: Action): boolean {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p) continue;
      for (const [idx, act] of Object.entries(PADMAP)) {
        if (act === a && p.buttons[Number(idx)]?.pressed) return true;
      }
      const [ax = 0, ay = 0] = p.axes;
      const DZ = 0.4;
      if (a === 'left' && ax < -DZ) return true;
      if (a === 'right' && ax > DZ) return true;
      if (a === 'up' && ay < -DZ) return true;
      if (a === 'down' && ay > DZ) return true;
    }
    return false;
  }

  clearTouch(): void {
    for (const a of ACTIONS) this.touch[a] = false;
  }
}
