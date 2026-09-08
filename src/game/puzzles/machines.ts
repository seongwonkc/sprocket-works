/**
 * Simple-machine classification.
 *
 * Pick every simple machine present in an everyday object. Exact set required — "scissors are levers"
 * is half an answer, and the half that's missing (the wedge that does the cutting) is the interesting half.
 *
 * The item bank is written from scratch and deliberately excludes the genuinely arguable cases. A
 * screwdriver is a wheel-and-axle to one textbook and a lever to another; shipping it would punish a
 * correct student. Every item here has one defensible answer, and the `why` line gives the reasoning
 * rather than just confirming the score.
 */

import { PAL } from '../../content/brand';
import { drawText, drawTextCentered, wrapText } from '../../core/font';
import type { Input } from '../../core/input';
import type { Rng } from '../../core/rng';
import { play } from '../../core/audio';
import { button, hit, panel, type Rect } from '../ui/widgets';
import { drawArtFit, hasArt } from '../../core/assets';
import type { Generator, Outcome, Puzzle } from './types';

export const MACHINES = ['Lever', 'Wheel & Axle', 'Pulley', 'Ramp', 'Wedge', 'Screw'] as const;
export type Machine = (typeof MACHINES)[number];

interface Item {
  name: string;
  has: Machine[];
  why: string;
  /** Illustration key under art/puzzle/. Items without one still work, text-only. */
  art?: string;
}

/** Single-machine items. Introduced first. */
const SIMPLE: Item[] = [
  { name: 'a seesaw', has: ['Lever'], why: 'A bar pivoting on a fixed point is the definition of a lever.', art: 'mach_seesaw' },
  { name: 'a doorknob', has: ['Wheel & Axle'], why: 'The wide knob turns a narrow shaft — a small force over a big circle becomes a big force over a small one.', art: 'mach_doorknob' },
  { name: 'a flagpole rope', has: ['Pulley'], why: 'The wheel at the top only changes the direction of your pull.', art: 'mach_flagpole' },
  { name: 'a wheelchair ramp', has: ['Ramp'], why: 'A slope trades a short hard lift for a long easy push.' },
  { name: 'a playground slide', has: ['Ramp'], why: 'Same slope, used to come down instead of go up.', art: 'mach_slide' },
  { name: 'a doorstop', has: ['Wedge'], why: 'Two slopes back to back, driven in to push things apart.' },
  { name: 'a jar lid', has: ['Screw'], why: 'A ramp wrapped around a cylinder.', art: 'mach_jarlid' },
  { name: 'a spiral staircase', has: ['Screw'], why: 'A ramp wrapped around a column — the same shape as a screw thread.' },
  { name: 'a bolt', has: ['Screw'], why: 'A ramp wrapped around a shaft, turning rotation into a pull.', art: 'mach_bolt' },
  { name: 'a nail', has: ['Wedge'], why: 'The point is a wedge that pushes wood fibres apart.' },
  { name: 'a kitchen knife', has: ['Wedge'], why: 'The blade is a thin slope that separates what it cuts.' },
  { name: 'a chisel', has: ['Wedge'], why: 'A slope driven into material to split it.' },
  { name: 'a crowbar', has: ['Lever'], why: 'A bar and a pivot, trading distance for force.', art: 'mach_crowbar' },
  { name: 'a bottle opener', has: ['Lever'], why: 'The cap edge is the pivot; your hand moves far so the cap moves hard.' },
  { name: 'a nutcracker', has: ['Lever'], why: 'Two levers sharing one pivot at the hinge.', art: 'mach_nutcracker' },
  { name: 'a steering wheel', has: ['Wheel & Axle'], why: 'A big rim turning a small column.' },
  { name: 'a windmill', has: ['Wheel & Axle'], why: 'Long blades turn a short shaft, the wheel-and-axle running backwards.', art: 'mach_windmill' },
  { name: 'a skateboard', has: ['Wheel & Axle'], why: 'Each wheel spins on its axle; that is the whole machine.' },
  { name: 'a clothesline pulley', has: ['Pulley'], why: 'A loop over a wheel, so you can reach the far end without walking.' },
  { name: 'a well bucket crank', has: ['Wheel & Axle'], why: 'The crank handle sweeps a big circle; the drum it turns is small.' },
  { name: 'a swinging door', has: ['Lever'], why: 'The door is a bar swinging on a pivot — a lever you walk through.' },
  { name: 'a light switch', has: ['Lever'], why: 'A tiny bar rocking on a pivot inside the wall plate.' },
  { name: 'a swing gate latch', has: ['Lever'], why: 'Press one end down, the far end lifts. One bar, one pivot.' },
  { name: 'a pizza cutter', has: ['Wheel & Axle'], why: 'A disc turning freely on a short pin.' },
  { name: 'a rolling pin', has: ['Wheel & Axle'], why: 'A wide barrel spinning on thin handles.' },
  { name: 'a ferris wheel', has: ['Wheel & Axle'], why: 'A huge rim carried round by a small central shaft.' },
  { name: 'a fishing net winch', has: ['Wheel & Axle'], why: 'A long handle turning a short drum to haul the net.' },
  { name: 'a flag halyard', has: ['Pulley'], why: 'One wheel at the top, so pulling down sends the flag up.' },
  { name: 'a well bucket rope over a wheel', has: ['Pulley'], why: 'The wheel changes which way you pull, nothing more.' },
  { name: 'a lift counterweight', has: ['Pulley'], why: 'The cable runs over wheels so the falling weight raises the car.' },
  { name: 'a sailboat halyard', has: ['Pulley'], why: 'A block at the masthead turns your downward pull into a rising sail.' },
  { name: 'a loading dock ramp', has: ['Ramp'], why: 'A slope so a heavy crate can be pushed instead of lifted.' },
  { name: 'a mountain switchback road', has: ['Ramp'], why: 'A long gentle slope instead of a short impossible climb.' },
  { name: 'a skateboard half-pipe', has: ['Ramp'], why: 'A slope that trades height for speed and back again.' },
  { name: 'a plough blade', has: ['Wedge'], why: 'A slope driven forward to split the soil apart.' },
  { name: 'a boat hull', has: ['Wedge'], why: 'The bow is a slope that pushes water aside as it moves.' },
  { name: 'a tooth', has: ['Wedge'], why: 'An incisor is a thin slope that splits what you bite.' },
  { name: 'a splitting maul head', has: ['Wedge'], why: 'A thick slope that forces the log apart as it enters.' },
  { name: 'a pin tumbler key', has: ['Wedge'], why: 'Each cut is a small slope that lifts a pin as the key slides in.' },
  { name: 'a light bulb thread', has: ['Screw'], why: 'A slope wound round the base, pulling the bulb in as it turns.' },
  { name: 'a bottle cap thread', has: ['Screw'], why: 'A ramp wrapped around the neck, drawing the cap down and sealing it.' },
  { name: 'a C-clamp', has: ['Screw'], why: 'Turning the handle drives a threaded shaft that squeezes hard and slowly.' },
  { name: 'a swivel stool post', has: ['Screw'], why: 'Spinning the seat runs it up or down a thread.' },
  { name: 'an auger bit', has: ['Screw'], why: 'The spiral pulls itself into the wood and carries the shavings out.' },
  { name: 'a piano key', has: ['Lever'], why: 'Press the near end, the far end lifts the hammer.' },
  { name: 'a stapler', has: ['Lever'], why: 'A hinged bar that turns a light press into a hard punch.', art: 'mach_stapler' },
  { name: 'a broom', has: ['Lever'], why: 'Your upper hand is the pivot; the lower hand sweeps the far end.' },
  { name: 'a diving board', has: ['Lever'], why: 'A bar fixed at one end, bending about its support.' },
  { name: 'a car steering column', has: ['Wheel & Axle'], why: 'A wide wheel turning a narrow shaft.' },
  { name: 'a pottery wheel', has: ['Wheel & Axle'], why: 'A broad disc driven by a small spindle underneath.' },
  { name: 'a doorknob spindle', has: ['Wheel & Axle'], why: 'The knob is the wheel, the square bar through the door is the axle.' },
];

/** Two-machine items. Introduced from tier 2. */
const COMPOUND: Item[] = [
  { name: 'scissors', has: ['Lever', 'Wedge'], why: 'Two levers on one pivot, each carrying a wedge — the blade.', art: 'mach_scissors' },
  { name: 'a wheelbarrow', has: ['Lever', 'Wheel & Axle'], why: 'The handles are a lever with the wheel as its pivot, and that wheel rides an axle.', art: 'mach_wheelbarrow' },
  { name: 'an axe', has: ['Lever', 'Wedge'], why: 'The handle is a lever that swings the head; the head is a wedge that splits.', art: 'mach_axe' },
  { name: 'a corkscrew', has: ['Screw', 'Lever'], why: 'The spiral is a screw; the arms you press down are levers.', art: 'mach_corkscrew' },
  { name: 'a shovel', has: ['Lever', 'Wedge'], why: 'The shaft levers the load up; the blade is a wedge that enters the ground.', art: 'mach_shovel' },
  { name: 'a construction crane', has: ['Pulley', 'Lever'], why: 'The hook hangs from pulleys; the jib is a lever balanced over its tower.' },
  { name: 'a fishing rod and reel', has: ['Lever', 'Wheel & Axle'], why: 'The rod levers the fish in; the reel is a handle turning a spool.' },
  { name: 'a hand drill', has: ['Wheel & Axle', 'Screw'], why: 'The crank is a wheel-and-axle; the twisted bit is a screw pulling itself in.' },
  { name: 'a pair of pliers', has: ['Lever', 'Wedge'], why: 'Two levers on a pivot, and the cutting jaws are wedges.', art: 'mach_pliers' },
  { name: 'nail clippers', has: ['Lever', 'Wedge'], why: 'The arm is a lever pressing two wedge-shaped blades together.' },
  { name: 'a wheelbarrow with a screw jack', has: ['Lever', 'Screw'], why: 'The handles lever the load; the jack thread lifts it slowly and hard.' },
  { name: 'a can opener', has: ['Lever', 'Wheel & Axle'], why: 'The handles are levers; the knurled knob and cutting disc turn on axles.' },
  { name: 'a bicycle', has: ['Wheel & Axle', 'Lever'], why: 'Wheels ride on axles; the brake levers and pedal cranks are levers.' },
  { name: 'a garden spade', has: ['Lever', 'Wedge'], why: 'The shaft levers earth up; the sharpened blade wedges into the ground.' },
  { name: 'a wheelchair', has: ['Wheel & Axle', 'Lever'], why: 'Wheels on axles, and the brake arm is a lever.' },
  { name: 'a well with a crank and rope', has: ['Wheel & Axle', 'Pulley'], why: 'The crank turns a drum, and the rope runs over a wheel above the shaft.' },
  { name: 'a drawbridge', has: ['Lever', 'Pulley'], why: 'The deck pivots like a lever, hauled up by ropes over pulleys.' },
  { name: 'a hand-cranked winch on a slope', has: ['Wheel & Axle', 'Ramp'], why: 'The crank multiplies your turn; the slope means you pull rather than lift.' },
  { name: 'a screwdriver driving a screw', has: ['Wheel & Axle', 'Screw'], why: 'The fat handle turning the thin shaft is a wheel-and-axle; the screw is the thread it drives.' },
  { name: 'a hand-pushed lawnmower', has: ['Wheel & Axle', 'Wedge'], why: 'Wheels on axles drive the reel, and every blade is a wedge.' },
  { name: 'a paper guillotine', has: ['Lever', 'Wedge'], why: 'The long arm is a lever; the descending blade is a wedge.' },
  { name: 'an old hand water pump', has: ['Lever', 'Wheel & Axle'], why: 'The handle levers the piston; the linkage turns on a pin.' },
];

class MachinesPuzzle implements Puzzle {
  readonly domain = 'machines' as const;
  readonly prompt: string;
  readonly teach: string;
  readonly hint: string;
  attempts = 0;

  private state: Outcome = 'open';
  private readonly picked = new Set<Machine>();

  constructor(readonly instance: string, private readonly item: Item) {
    this.prompt = `Which simple machines are in ${item.name}?`;
    this.teach = item.why;
    this.hint = item.has.length > 1
      ? `There ${item.has.length === 2 ? 'are two' : `are ${item.has.length}`} of them. Ask what does the pushing and what does the turning — they are usually different parts.`
      : 'There is just one. Ask what the object is really doing: pivoting, rolling, wedging, lifting, or winding.';
  }

  step(_input: Input, _dt: number, _area: Rect): void {
    // All interaction happens through buttons in draw() — immediate mode.
  }

  check(): void {
    if (this.state !== 'open') return;
    this.attempts++;
    const want = new Set(this.item.has);
    const ok =
      this.picked.size === want.size && [...this.picked].every((m) => want.has(m));
    this.state = ok ? 'solved' : 'failed';
    play(ok ? 'ok' : 'nope');
  }

  canCheck(): boolean {
    return this.picked.size > 0;
  }

  outcome(): Outcome {
    return this.state;
  }

  draw(ctx: CanvasRenderingContext2D, area: Rect, input: Input): void {
    // Illustration on the left, choices on the right. Asking "which machines are in a seesaw" with no
    // picture of a seesaw was the single worst thing about this puzzle — the object *is* the question.
    // The stage is always drawn. An item without a picture still gets a plinth with its name on it,
    // so the layout never collapses into six buttons floating above a void.
    const artW = Math.round(area.w * 0.42);
    const stage: Rect = { x: area.x, y: area.y, w: artW, h: area.h - 14 };
    panel(ctx, stage, PAL.shadow, PAL.steel1);
    ctx.fillStyle = PAL.steel0;
    ctx.fillRect(stage.x + 6, stage.y + stage.h - 12, stage.w - 12, 1);
    const drew = this.item.art
      ? drawArtFit(ctx, this.item.art, stage.x + stage.w / 2, stage.y + stage.h / 2 - 4, stage.w - 16, stage.h - 26)
      : false;
    if (!drew) {
      for (const [i, l] of wrapText(this.item.name.toUpperCase(), stage.w - 16).entries()) {
        drawTextCentered(ctx, l, stage.x + stage.w / 2, stage.y + stage.h / 2 - 12 + i * 10, PAL.bone);
      }
    } else {
      drawTextCentered(ctx, this.item.name.toUpperCase(), stage.x + stage.w / 2, stage.y + stage.h - 9, PAL.steel3);
    }

    const bx = area.x + artW + 6;
    const bw = area.x + area.w - bx;
    const cols = 1;
    const cellW = Math.floor(bw / cols) - 3;
    const bh = 15;
    const rows = Math.ceil(MACHINES.length / cols);
    // Capped: without a ceiling, a text-only instance spread six buttons across the whole panel.
    const gap = Math.max(3, Math.min(10, Math.floor((area.h - 26 - rows * bh) / rows)));

    for (let i = 0; i < MACHINES.length; i++) {
      const m = MACHINES[i] as Machine;
      const c = i % cols;
      const rw = Math.floor(i / cols);
      const box: Rect = {
        x: bx + c * (cellW + 4),
        y: area.y + rw * (bh + gap),
        w: cellW,
        h: bh,
      };
      const on = this.picked.has(m);
      if (this.state === 'open') {
        if (button(ctx, input, box, { label: m, on })) {
          if (on) this.picked.delete(m);
          else this.picked.add(m);
        }
      } else {
        // Post-resolution review: what was right, what was missed, what was wrong.
        const should = this.item.has.includes(m);
        const accent = should ? PAL.volt : on ? PAL.hot : PAL.steel2;
        panel(ctx, box, on ? PAL.steel1 : PAL.steel0, accent);
        drawTextCentered(ctx, m, box.x + box.w / 2, box.y + 4, should ? PAL.volt : on ? PAL.hot : PAL.steel3);
        if (should && !on) drawText(ctx, '<', box.x + box.w - 6, box.y + 4, PAL.volt);
      }
    }

    const foot = area.y + area.h - 10;
    const note = this.item.has.length > 1
      ? 'More than one. Pick every machine you can find.'
      : 'Pick every machine you can find.';
    drawText(ctx, note, area.x + 2, foot, PAL.steel2);
  }

  /** Exposed so the host can size its panel. */
  static hitAny(area: Rect, x: number, y: number): boolean {
    return hit(area, x, y);
  }
}

export const machinesGen: Generator = {
  domain: 'machines',
  make(rng: Rng, tier: number): Puzzle {
    // Low tiers only see single-machine items; the compound ones arrive once the vocabulary is in place.
    const pool =
      tier < 2 ? SIMPLE : tier < 4 ? [...SIMPLE, ...COMPOUND] : [...COMPOUND, ...COMPOUND, ...SIMPLE];
    // Weight illustrated items heavily. The object *is* the question here, so a text-only instance is a
    // materially worse puzzle — but the un-illustrated ones still appear, which keeps the bank at 74
    // rather than collapsing to however many drawings exist.
    const drawn = pool.filter((it) => it.art && hasArt(it.art));
    // Decisive, not a nudge: mixing drawn items into the pool three times over still left two thirds
    // of instances text-only, because the pool is 96 entries deep.
    const item = rng.pick(drawn.length >= 4 && rng.next() < 0.85 ? drawn : pool);
    return new MachinesPuzzle(`mac-${item.name.replace(/\s+/g, '_')}`, item);
  },
};

export { MachinesPuzzle };
