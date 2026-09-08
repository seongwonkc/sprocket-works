/**
 * Puzzle contract.
 *
 * A puzzle owns a rectangle and nothing else. It cannot change scene, award parts, or touch the profile
 * — it reports `solved`/`failed` and the warehouse decides what that means. That separation is why the
 * same four generators can later back a practice mode, a daily challenge, or a limb instrument without
 * being rewritten.
 *
 * Generators are seeded and must be *infinite*: no instance bank, no repeats to memorise. A player who
 * learns the answer to "what's in a wheelbarrow" has learned the physics, which is the point; a player
 * who learns "the third option is always right" has learned the generator, which is a bug.
 */

import type { Input } from '../../core/input';
import type { Rng } from '../../core/rng';
import type { Rect } from '../ui/widgets';

export type Domain = 'balance' | 'circuit' | 'machines' | 'gears' | 'energy' | 'magnets' | 'force';

export const DOMAIN_LABEL: Record<Domain, string> = {
  balance: 'Balance',
  circuit: 'Circuits',
  machines: 'Machines',
  gears: 'Gears',
  energy: 'Energy',
  magnets: 'Magnets',
  force: 'Force',
};

export type Outcome = 'open' | 'solved' | 'failed';

export interface Puzzle {
  readonly domain: Domain;
  /** Stable id for this generated instance. Logged, so a bad instance can be reproduced. */
  readonly instance: string;
  /** The question. One or two short lines. */
  readonly prompt: string;
  /** Shown after resolution — states the principle, never scolds. */
  readonly teach: string;
  /**
   * Optional nudge, shown on demand before committing. The 1993 original had a Hint button on every
   * puzzle; leaving it out made this build harsher than the thing it's a remake of.
   */
  readonly hint?: string;
  /** How many times the player has hit Check. */
  readonly attempts: number;

  step(input: Input, dt: number, area: Rect): void;
  draw(ctx: CanvasRenderingContext2D, area: Rect, input: Input): void;
  outcome(): Outcome;

  /** Commit the current answer. Must be a no-op once resolved. */
  check(): void;
  /** False greys out the host's Check button — used when nothing has been placed yet. */
  canCheck(): boolean;
}

export interface Generator {
  readonly domain: Domain;
  /** `tier` is the player's rank index, 0-7. */
  make(rng: Rng, tier: number): Puzzle;
}
