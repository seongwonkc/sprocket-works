/**
 * Deterministic 1-D race integrator.
 *
 * Semi-implicit Euler at the fixed sim step. No randomness anywhere: the same build on the same track
 * always produces the same time, which is what makes "swap one part, re-run" a usable experiment and
 * what will make ghost replays free later.
 *
 * Everything is SI. The only tuned constant is `SCALE_TIME` in the scene, which decides how many
 * simulated metres a screen pixel is worth — the physics itself is not fudged.
 */

import type { Part, PowerPart, NosePart, BodyPart, WheelPart, Slot } from '../../content/parts';
import { maybePart } from '../../content/parts';
import type { Track } from '../../content/tracks';
import { gradeAt, roughnessAt } from '../../content/tracks';

const G = 9.81;
/** Air density at sea level, kg/m³. */
const RHO = 1.225;

export interface Build {
  power: PowerPart;
  nose: NosePart;
  body: BodyPart;
  wheels: WheelPart;
}

/** Resolve a slot map into a Build, or report which slots are empty. */
export function toBuild(fitted: Record<string, string | null>): Build | Slot[] {
  const missing: Slot[] = [];
  const get = <T extends Part>(s: Slot): T | null => {
    const p = maybePart(fitted[s]);
    if (!p || p.slot !== s) {
      missing.push(s);
      return null;
    }
    return p as T;
  };
  const power = get<PowerPart>('power');
  const nose = get<NosePart>('nose');
  const body = get<BodyPart>('body');
  const wheels = get<WheelPart>('wheels');
  if (!power || !nose || !body || !wheels) return missing;
  return { power, nose, body, wheels };
}

/** Static properties that don't change during the run. */
export interface Spec {
  /** Total mass, kg. */
  mass: number;
  /** Mass the engine must accelerate, including wheel rotational inertia. */
  effMass: number;
  /** Cd·A, the only combination that ever appears in the drag term. */
  cdA: number;
}

export function specOf(b: Build): Spec {
  const mass = b.power.mass + b.nose.mass + b.body.mass + b.wheels.mass;
  return {
    mass,
    // I/r² for a wheel collapses to inertiaK·m_wheel — radius cancels, so it never needs modelling.
    effMass: mass + b.wheels.inertiaK * b.wheels.mass,
    cdA: b.nose.cd * b.body.area,
  };
}

/** Per-step force breakdown, in newtons. Signed as they act along the direction of travel. */
export interface Forces {
  thrust: number;
  drag: number;
  roll: number;
  grav: number;
  /** True when thrust was clipped by tyre grip rather than by the power unit. */
  slipping: boolean;
  /** True when the power source has run dry. */
  spent: boolean;
}

export interface Racer {
  readonly build: Build;
  readonly spec: Spec;
  /** Metres from the start line. */
  x: number;
  /** m/s. */
  v: number;
  /** Seconds since the lights. */
  t: number;
  /** Joules drawn from the power source so far. */
  used: number;
  finished: boolean;
  finishTime: number;
  /** Running integral of energy lost to each resistance, J. Drives the post-race telemetry. */
  lost: { drag: number; roll: number; climb: number; slip: number };
  forces: Forces;
}

export function makeRacer(build: Build): Racer {
  return {
    build,
    spec: specOf(build),
    x: 0,
    v: 0,
    t: 0,
    used: 0,
    finished: false,
    finishTime: 0,
    lost: { drag: 0, roll: 0, climb: 0, slip: 0 },
    forces: { thrust: 0, drag: 0, roll: 0, grav: 0, slipping: false, spent: false },
  };
}

/**
 * Advance one racer by `dt`.
 *
 * Thrust model: a power unit delivers `stallForce` off the line and `power/v` once moving — the standard
 * constant-power hyperbola, clipped at both ends. That single curve is why a high-power/low-force unit
 * loses the launch and wins the straight, with no special cases in the code.
 */
export function stepRacer(r: Racer, track: Track, dt: number): void {
  if (r.finished) return;
  r.t += dt;

  const { power, wheels } = r.build;
  const { mass, effMass, cdA } = r.spec;

  const grade = gradeAt(track, r.x);
  const cos = Math.cos(grade);
  const sin = Math.sin(grade);

  // --- thrust -----------------------------------------------------------------
  const spent = r.used >= power.energy;
  let thrust = 0;
  if (!spent) {
    // 0.5 m/s floor keeps power/v finite at the line; below that stallForce dominates anyway.
    const curve = Math.min(power.stallForce, power.power / Math.max(r.v, 0.5));
    // Linear spool-up. A boiler that needs 2.4 s to make steam genuinely loses a short race.
    const ramp = power.spool <= 0 ? 1 : Math.min(1, r.t / power.spool);
    thrust = curve * ramp;
  }

  // Grip ceiling. Exceed it and the surplus becomes wheelspin, not acceleration.
  const tractionCap = wheels.grip * mass * G * cos;
  let slipping = false;
  if (thrust > tractionCap) {
    r.lost.slip += (thrust - tractionCap) * Math.max(r.v, 0.5) * dt;
    thrust = tractionCap;
    slipping = true;
  }

  // --- resistances ------------------------------------------------------------
  const drag = 0.5 * RHO * cdA * r.v * r.v;
  const crr = wheels.crr + wheels.roughPenalty * roughnessAt(track, r.x);
  const roll = crr * mass * G * cos;
  const grav = mass * G * sin;

  // --- integrate --------------------------------------------------------------
  const net = thrust - drag - roll - grav;
  const a = net / effMass;

  const vPrev = r.v;
  r.v = Math.max(0, r.v + a * dt);
  const vAvg = (vPrev + r.v) * 0.5;
  r.x += vAvg * dt;

  // Energy accounting uses the step-average speed so the bars agree with the finishing time.
  r.used += thrust * vAvg * dt;
  r.lost.drag += drag * vAvg * dt;
  r.lost.roll += roll * vAvg * dt;
  r.lost.climb += grav * vAvg * dt;

  r.forces = { thrust, drag, roll, grav, slipping, spent };

  if (r.x >= track.length) {
    r.x = track.length;
    r.finished = true;
    // Linear back-interpolation to the exact crossing — otherwise times quantise to the 16.7 ms step
    // and two close builds tie when they shouldn't.
    const over = r.x - track.length;
    r.finishTime = r.t - (vAvg > 0 ? over / vAvg : 0);
  }
}

/** Run to completion headlessly. Used by the builder preview and to tune rival difficulty. */
export function simulate(build: Build, track: Track, dt = 1 / 60, maxT = 240): Racer {
  const r = makeRacer(build);
  while (!r.finished && r.t < maxT) stepRacer(r, track, dt);
  if (!r.finished) r.finishTime = Infinity;
  return r;
}

/**
 * Terminal speed on the flat: where thrust equals drag plus rolling resistance.
 * Bisection, because the thrust curve is piecewise and not worth inverting analytically.
 */
export function topSpeed(build: Build, roughness = 0): number {
  const { mass, cdA } = specOf(build);
  const { power, wheels } = build;
  const crr = wheels.crr + wheels.roughPenalty * roughness;
  const resist = (v: number): number =>
    0.5 * RHO * cdA * v * v + crr * mass * G;
  const drive = (v: number): number =>
    Math.min(power.stallForce, power.power / Math.max(v, 0.5), wheels.grip * mass * G);

  let lo = 0;
  let hi = 200;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (drive(mid) > resist(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}
