/**
 * Part catalog. Every field is a real physical quantity that the race integrator reads directly —
 * there are no "speed: 7/10" stat bars anywhere in this game.
 *
 * This matters pedagogically: because nose shape only feeds Cd, and Cd only enters as v², the lesson
 * "aero matters at speed and nowhere else" emerges from the sim instead of being asserted by a tooltip.
 * A player who fits a needle cone to a 200 m crawler will correctly observe that it changed nothing.
 */

export type Slot = 'power' | 'nose' | 'body' | 'wheels';

export const SLOTS: readonly Slot[] = ['power', 'nose', 'body', 'wheels'];

export const SLOT_LABEL: Record<Slot, string> = {
  power: 'Power',
  nose: 'Nose',
  body: 'Body',
  wheels: 'Wheels',
};

interface Base {
  id: string;
  name: string;
  slot: Slot;
  /** kg */
  mass: number;
  /** Rank tier at which this can start dropping (0-7). */
  tier: number;
  /** One line shown in the builder. States the trade, never the verdict. */
  note: string;
}

export interface PowerPart extends Base {
  slot: 'power';
  /** Thrust at zero speed, N. Caps the low-speed end of the power hyperbola. */
  stallForce: number;
  /** Mechanical power at the wheels, W. Sets the high-speed end. */
  power: number;
  /** Seconds to reach full output from rest. Boilers are slow; springs are instant. */
  spool: number;
  /** Usable energy, J. Infinity for anything that doesn't run out. */
  energy: number;
}

export interface NosePart extends Base {
  slot: 'nose';
  /** Drag coefficient, dimensionless. */
  cd: number;
}

export interface BodyPart extends Base {
  slot: 'body';
  /** Frontal area, m². */
  area: number;
}

export interface WheelPart extends Base {
  slot: 'wheels';
  /** Coefficient of rolling resistance on a smooth surface. */
  crr: number;
  /** Extra crr added per unit of track roughness. Narrow hard tyres suffer most. */
  roughPenalty: number;
  /** Coefficient of friction — caps how much thrust reaches the ground before it spins. */
  grip: number;
  /**
   * Rotational inertia expressed as an equivalent added mass, as a fraction of the wheel mass.
   * (I/r² collapses to inertiaK·m_wheel for a wheel of any radius, which is why radius isn't modelled.)
   */
  inertiaK: number;
}

export type Part = PowerPart | NosePart | BodyPart | WheelPart;

export const PARTS: readonly Part[] = [
  // ---- POWER ------------------------------------------------------------------
  {
    id: 'p_windup', name: 'Windup Spring', slot: 'power', tier: 0, mass: 8,
    stallForce: 150, power: 320, spool: 0, energy: 9_000,
    note: 'Instant, feather-light, and it runs out.',
  },
  {
    id: 'p_solar', name: 'Solar Array', slot: 'power', tier: 1, mass: 11,
    stallForce: 70, power: 430, spool: 0.4, energy: Infinity,
    note: 'Weak forever. Never needs winding.',
  },
  {
    id: 'p_leadcell', name: 'Lead Cell', slot: 'power', tier: 1, mass: 34,
    stallForce: 220, power: 900, spool: 0.2, energy: Infinity,
    note: 'Honest power. Heavy as a brick.',
  },
  {
    id: 'p_lightcell', name: 'Light Cell', slot: 'power', tier: 3, mass: 15,
    stallForce: 175, power: 1_150, spool: 0.2, energy: 300_000,
    note: 'Lead Cell output at a third the weight.',
  },
  {
    id: 'p_boiler', name: 'Steam Boiler', slot: 'power', tier: 2, mass: 48,
    stallForce: 400, power: 820, spool: 2.4, energy: Infinity,
    note: 'Enormous shove, once it gets going.',
  },
  {
    id: 'p_burner', name: 'Fuel Burner', slot: 'power', tier: 4, mass: 38,
    stallForce: 330, power: 1_750, spool: 0.9, energy: 520_000,
    note: 'Top end nothing else touches.',
  },

  // ---- NOSE -------------------------------------------------------------------
  {
    id: 'n_slab', name: 'Slab Front', slot: 'nose', tier: 0, mass: 5,
    cd: 0.95, note: 'A flat plate. Pushes the air, badly.',
  },
  {
    id: 'n_round', name: 'Round Cowl', slot: 'nose', tier: 0, mass: 5,
    cd: 0.55, note: 'Air slides off the curve.',
  },
  {
    id: 'n_wedge', name: 'Wedge Nose', slot: 'nose', tier: 2, mass: 4,
    cd: 0.34, note: 'Splits the air instead of shoving it.',
  },
  {
    id: 'n_needle', name: 'Needle Cone', slot: 'nose', tier: 4, mass: 4,
    cd: 0.22, note: 'Barely there. Only pays above a sprint.',
  },

  // ---- BODY -------------------------------------------------------------------
  {
    id: 'b_crate', name: 'Crate Body', slot: 'body', tier: 0, mass: 40,
    area: 0.58, note: 'A box on wheels. Tall, wide, heavy.',
  },
  {
    id: 'b_tub', name: 'Tub Shell', slot: 'body', tier: 0, mass: 26,
    area: 0.42, note: 'Sits lower. Less air to move.',
  },
  {
    id: 'b_skin', name: 'Skin Shell', slot: 'body', tier: 3, mass: 16,
    area: 0.32, note: 'Stretched fabric over ribs.',
  },
  {
    id: 'b_frame', name: 'Bare Frame', slot: 'body', tier: 2, mass: 9,
    area: 0.26, note: 'Nothing but tube. Nothing to hold it down, either.',
  },

  // ---- WHEELS -----------------------------------------------------------------
  {
    id: 'w_iron', name: 'Iron Cart Wheels', slot: 'wheels', tier: 0, mass: 22,
    crr: 0.028, roughPenalty: 0.018, grip: 0.55, inertiaK: 0.90,
    note: 'Solid iron. Grinds along, spins up slowly.',
  },
  {
    id: 'w_rubber', name: 'Rubber Treads', slot: 'wheels', tier: 0, mass: 16,
    crr: 0.013, roughPenalty: 0.006, grip: 0.95, inertiaK: 0.70,
    note: 'Grips almost anything.',
  },
  {
    id: 'w_balloon', name: 'Balloon Tyres', slot: 'wheels', tier: 2, mass: 20,
    crr: 0.017, roughPenalty: 0.001, grip: 0.85, inertiaK: 0.75,
    note: 'Soft and fat. Rough ground stops mattering.',
  },
  {
    id: 'w_slick', name: 'Hard Slicks', slot: 'wheels', tier: 3, mass: 12,
    crr: 0.007, roughPenalty: 0.022, grip: 0.75, inertiaK: 0.55,
    note: 'Glassy on smooth tarmac. Hates a bad surface.',
  },
];

const BY_ID = new Map(PARTS.map((p) => [p.id, p]));

export function part(id: string): Part {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`unknown part: ${id}`);
  return p;
}

export function maybePart(id: string | null | undefined): Part | null {
  return id ? BY_ID.get(id) ?? null : null;
}

export function partsInSlot(slot: Slot): Part[] {
  return PARTS.filter((p) => p.slot === slot);
}

/** Everything a player of this rank could plausibly be given. */
export function dropPool(tier: number): Part[] {
  return PARTS.filter((p) => p.tier <= tier);
}
