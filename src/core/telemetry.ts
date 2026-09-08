/**
 * Structured event log with a no-op sink.
 *
 * v1 is a standalone game with no accounts and no network. But the events a measurement product would
 * want out of this — which puzzle domain, what difficulty, how long to first action, solved or bailed,
 * and (the interesting one) *which physical variable the player was reasoning about when they rebuilt
 * the car* — are only cheap to capture at the moment they happen. Adding them later means re-touching
 * every scene.
 *
 * So: emit now, sink to a ring buffer, ship nowhere. If this ever becomes a limb, `setSink` is the
 * whole integration. If it never does, this costs one function call per player action.
 *
 * Deliberately not captured: anything identifying. There is no user here, only a local profile.
 */

export type Event =
  | { k: 'run.start'; seed: number; race: number }
  | { k: 'puzzle.open'; domain: string; tier: number; instance: string }
  | { k: 'puzzle.close'; domain: string; tier: number; instance: string; solved: boolean; ms: number; attempts: number; usedHint: boolean }
  | { k: 'part.won'; part: string }
  | { k: 'part.lost'; part: string }
  | { k: 'build.change'; slot: string; from: string | null; to: string | null; predictedTime: number }
  | { k: 'race.start'; race: number; build: Record<string, string>; predictedTime: number }
  | { k: 'race.end'; race: number; won: boolean; time: number; rivalTime: number; lost: Record<string, number> }
  | { k: 'rank.up'; rank: number };

export type Sink = (e: Event & { t: number }) => void;

const RING = 500;
const buffer: (Event & { t: number })[] = [];
let sink: Sink | null = null;
let t0 = 0;

export function initTelemetry(): void {
  t0 = performance.now();
}

export function setSink(s: Sink | null): void {
  sink = s;
}

export function emit(e: Event): void {
  const stamped = { ...e, t: Math.round(performance.now() - t0) };
  buffer.push(stamped);
  if (buffer.length > RING) buffer.shift();
  try {
    sink?.(stamped);
  } catch {
    // A broken sink must never take the game down with it.
  }
}

/** Everything captured this session. Exposed on `window.__sprocket` for debugging. */
export function dump(): readonly (Event & { t: number })[] {
  return buffer;
}
