/**
 * One profile in localStorage, autosaved on every scene transition.
 *
 * Versioned: an unrecognised or corrupt blob is discarded rather than migrated, because at v0.x a
 * half-migrated save is worse than a fresh one. Add real migrations before the first public build.
 */

import { freshSeed } from './rng';

const KEY = 'sprocket-works:profile:v1';
const VERSION = 1;

export interface Profile {
  version: number;
  seed: number;
  /** Rank index into RANKS. */
  rank: number;
  /** Next race to run, 0-based, within the automotive ladder. */
  race: number;
  /** Part ids the player owns. */
  parts: string[];
  /** Currently fitted parts, slot -> part id. */
  fitted: Record<string, string | null>;
  /** Puzzle domain -> [attempted, solved]. Feeds difficulty and the end-of-run report. */
  puzzleStats: Record<string, [number, number]>;
  bananas: number;
  audio: boolean;
  rivalsEnabled: boolean;
  /** Best margin (seconds) per race index; negative means the rival is still ahead. */
  bestMargin: Record<number, number>;
}

export const RANKS = [
  'Trainee', 'Apprentice', 'Fitter', 'Machinist',
  'Engineer', 'Chief', 'Principal', 'Works Director',
] as const;

export function blankProfile(): Profile {
  return {
    version: VERSION,
    seed: freshSeed(),
    rank: 0,
    race: 0,
    parts: [],
    fitted: { power: null, nose: null, body: null, wheels: null },
    puzzleStats: {},
    bananas: 3,
    audio: true,
    rivalsEnabled: true,
    bestMargin: {},
  };
}

export function load(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Profile>;
    if (p.version !== VERSION) return null;
    // Shallow shape check — enough to reject a truncated write.
    if (typeof p.seed !== 'number' || !Array.isArray(p.parts) || !p.fitted) return null;
    return { ...blankProfile(), ...p } as Profile;
  } catch {
    return null;
  }
}

export function save(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private-mode Safari throws on write. Losing the save is survivable; crashing isn't.
  }
}

export function wipe(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* see above */
  }
}
