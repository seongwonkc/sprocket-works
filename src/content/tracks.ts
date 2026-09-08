/**
 * The five-race automotive ladder.
 *
 * Each track is a sequence of segments with a grade and a surface roughness. The ladder is ordered so
 * that exactly one physical variable becomes decisive per race — see DESIGN.md §6. That ordering is the
 * curriculum; the puzzles are only the gate that pays for it.
 */

export interface Segment {
  /** Metres this segment runs for. */
  len: number;
  /** Grade in percent. Positive is uphill. */
  grade: number;
  /** 0 = glass, 1 = broken concrete. Scales each tyre's roughPenalty. */
  rough: number;
}

export interface Track {
  id: number;
  name: string;
  /** One line before the lights. Sets the hypothesis without giving the answer. */
  brief: string;
  length: number;
  segments: Segment[];
  /** Slot loadout the rival brings. Tuned so a thoughtful build beats it and a lazy one doesn't. */
  rival: Record<string, string>;
  /** Parts guaranteed to be in the warehouse for this race, so the ladder is never unwinnable. */
  guaranteed: string[];
}

function build(id: number, name: string, brief: string, segments: Segment[], rival: Record<string, string>, guaranteed: string[]): Track {
  return {
    id, name, brief, segments, rival, guaranteed,
    length: segments.reduce((s, g) => s + g.len, 0),
  };
}

export const TRACKS: readonly Track[] = [
  build(
    0, 'Loading Dock Sprint',
    'Two hundred metres of flat concrete. Anything that moves under its own power will do.',
    [{ len: 200, grade: 0, rough: 0.5 }],
    { power: 'p_windup', nose: 'n_slab', body: 'b_crate', wheels: 'w_iron' },
    ['p_windup', 'n_slab', 'b_crate', 'w_iron', 'w_rubber'],
  ),
  build(
    1, 'The Long Aisle',
    'Three hundred flat metres. The spring runs dry before the finish — bring something that lasts.',
    [{ len: 300, grade: 0, rough: 0.15 }],
    { power: 'p_solar', nose: 'n_round', body: 'b_tub', wheels: 'w_rubber' },
    ['p_solar', 'p_leadcell', 'n_round', 'b_tub'],
  ),
  build(
    2, 'Wind Tunnel Straight',
    'Four hundred metres, dead flat, dead smooth. Fast enough that the air starts to fight back.',
    [{ len: 400, grade: 0, rough: 0.05 }],
    { power: 'p_leadcell', nose: 'n_wedge', body: 'b_tub', wheels: 'w_rubber' },
    ['n_wedge', 'b_frame', 'w_balloon'],
  ),
  build(
    3, 'Freight Ramp',
    'Flat, then a long eight percent climb. Every kilo you carry has to be lifted.',
    [
      { len: 90, grade: 0, rough: 0.3 },
      { len: 160, grade: 8, rough: 0.45 },
      { len: 50, grade: 0, rough: 0.3 },
    ],
    { power: 'p_boiler', nose: 'n_round', body: 'b_tub', wheels: 'w_balloon' },
    ['p_boiler', 'b_skin'],
  ),
  build(
    4, 'The Whole Works',
    'Five hundred metres. Broken floor, a climb, then a run to the flag. No single part saves this one.',
    [
      { len: 120, grade: 0, rough: 0.75 },
      { len: 130, grade: 6, rough: 0.5 },
      { len: 90, grade: -4, rough: 0.2 },
      { len: 160, grade: 0, rough: 0.1 },
    ],
    { power: 'p_burner', nose: 'n_wedge', body: 'b_skin', wheels: 'w_balloon' },
    ['p_lightcell', 'n_needle', 'w_slick'],
  ),
];

export function trackAt(i: number): Track {
  return TRACKS[Math.min(i, TRACKS.length - 1)] as Track;
}

/** Grade at distance x, in radians. */
export function gradeAt(t: Track, x: number): number {
  let d = 0;
  for (const s of t.segments) {
    d += s.len;
    if (x < d) return Math.atan(s.grade / 100);
  }
  const last = t.segments[t.segments.length - 1];
  return last ? Math.atan(last.grade / 100) : 0;
}

export function roughnessAt(t: Track, x: number): number {
  let d = 0;
  for (const s of t.segments) {
    d += s.len;
    if (x < d) return s.rough;
  }
  return t.segments[t.segments.length - 1]?.rough ?? 0;
}

/** Height above the start line at distance x, in metres. Used to draw the elevation profile. */
export function heightAt(t: Track, x: number): number {
  let d = 0;
  let h = 0;
  for (const s of t.segments) {
    const span = Math.min(s.len, Math.max(0, x - d));
    h += span * (s.grade / 100);
    d += s.len;
    if (x < d) break;
  }
  return h;
}
