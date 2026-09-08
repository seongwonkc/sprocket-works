/**
 * Scene contract and the shared context every scene gets.
 *
 * Scenes never construct each other — they return a request and the manager in main.ts decides. That
 * keeps the flow (warehouse → build → race → warehouse) in one readable place instead of smeared across
 * four files, and it's the seam where a level-select or practice mode would slot in later.
 */

import type { Input } from '../core/input';
import type { Profile } from '../core/save';
import type { Viewport } from '../core/canvas';

export type SceneName = 'title' | 'hub' | 'warehouse' | 'build' | 'race' | 'debrief';

export interface Ctx {
  profile: Profile;
  input: Input;
  /** Persist the profile now. Called by the manager on every transition. */
  save(): void;
}

export interface Scene {
  step(dt: number, view: Viewport): void;
  draw(ctx: CanvasRenderingContext2D, view: Viewport): void;
  /** Non-null once the scene wants to hand over. */
  next(): SceneName | null;
}
