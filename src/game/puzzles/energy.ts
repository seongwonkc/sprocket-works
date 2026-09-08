/**
 * Energy transformation chains.
 *
 * The 1993 original had an Energy domain that matched an activity to one of eight energy types. That's
 * recall, and it's the weakest kind of question this game can ask. What's actually worth knowing is that
 * energy doesn't appear or vanish, it *changes form in sequence* — so here you build the chain:
 * a torch is Chemical → Electrical → Light, a hydro dam is Potential → Kinetic → Electrical.
 *
 * The eight types are the original's taxonomy verbatim, because it's the standard schools use and there
 * was no reason to invent a different one.
 */

import { PAL } from '../../content/brand';
import { drawText, drawTextCentered } from '../../core/font';
import type { Input } from '../../core/input';
import type { Rng } from '../../core/rng';
import { play } from '../../core/audio';
import { button, hit, panel, type Rect } from '../ui/widgets';
import { drawArtFit, hasArt } from '../../core/assets';
import type { Generator, Outcome, Puzzle } from './types';

export const ENERGY_TYPES = [
  'Chemical', 'Electrical', 'Heat', 'Kinetic',
  'Light', 'Mechanical', 'Nuclear', 'Potential',
] as const;
export type Energy = (typeof ENERGY_TYPES)[number];

/** Short forms — "Electrical" is 10 characters and the chain has to fit three of them across 270px. */
const SHORT: Record<Energy, string> = {
  Chemical: 'CHEM', Electrical: 'ELEC', Heat: 'HEAT', Kinetic: 'KIN',
  Light: 'LIGHT', Mechanical: 'MECH', Nuclear: 'NUKE', Potential: 'POT',
};

interface Device {
  name: string;
  chain: Energy[];
  why: string;
  /** Illustration key under art/puzzle/. Devices without one still work, text-only. */
  art?: string;
}

const DEVICES: Device[] = [
  { name: 'a pocket torch', chain: ['Chemical', 'Electrical', 'Light'], why: 'The battery stores chemical energy, the wire carries it as electricity, the bulb throws it out as light.' , art: 'en_torch' },
  { name: 'a hydroelectric dam', chain: ['Potential', 'Kinetic', 'Electrical'], why: 'Water high up has potential energy; falling turns it into motion; the turbine turns motion into electricity.' , art: 'en_dam' },
  { name: 'a wind turbine', chain: ['Kinetic', 'Mechanical', 'Electrical'], why: 'Moving air spins the blades, the blades turn a shaft, the generator makes electricity.' , art: 'en_turbine' },
  { name: 'a coal power station', chain: ['Chemical', 'Heat', 'Kinetic', 'Electrical'], why: 'Burning coal releases chemical energy as heat, the heat makes steam move, the steam spins a generator.' },
  { name: 'a solar calculator', chain: ['Light', 'Electrical'], why: 'The panel turns light straight into electricity — no moving parts in between.' },
  { name: 'a wind-up toy', chain: ['Mechanical', 'Potential', 'Kinetic'], why: 'Winding does mechanical work, the coiled spring stores it, releasing it makes the toy move.' },
  { name: 'a candle', chain: ['Chemical', 'Heat', 'Light'], why: 'Wax is chemical fuel; burning makes heat; the hot soot glows.' , art: 'en_candle' },
  { name: 'a nuclear power station', chain: ['Nuclear', 'Heat', 'Kinetic', 'Electrical'], why: 'Splitting atoms makes heat, heat makes steam move, moving steam spins a generator.' },
  { name: 'a car engine', chain: ['Chemical', 'Heat', 'Kinetic'], why: 'Fuel burns, the hot gas pushes the piston, the car moves.' },
  { name: 'a bicycle dynamo lamp', chain: ['Kinetic', 'Electrical', 'Light'], why: 'Your wheel spins the dynamo, the dynamo makes electricity, the bulb makes light.' },
  { name: 'a toaster', chain: ['Electrical', 'Heat'], why: 'Current fights its way through a thin wire and the wire gets hot.' , art: 'en_toaster' },
  { name: 'a battery-powered fan', chain: ['Chemical', 'Electrical', 'Kinetic'], why: 'Chemicals in the cell make current, the motor turns current into motion.' },
  { name: 'a bow and arrow', chain: ['Mechanical', 'Potential', 'Kinetic'], why: 'You do the work of drawing it, the bent bow stores it, the arrow carries it away as motion.' },
  { name: 'a solar water heater', chain: ['Light', 'Heat'], why: 'Sunlight lands on a dark panel and the panel warms the water.' },
  { name: 'a steam locomotive', chain: ['Chemical', 'Heat', 'Kinetic'], why: 'Coal burns, water boils, steam shoves the pistons.' },
  { name: 'a glow stick', chain: ['Chemical', 'Light'], why: 'Two chemicals mix and the reaction gives out light directly — that is why it stays cold.' },
  { name: 'a hand-crank radio', chain: ['Mechanical', 'Electrical'], why: 'Your arm turns the generator and the generator makes current.' },
  { name: 'a ball dropped from a roof', chain: ['Potential', 'Kinetic'], why: 'Height is stored energy; falling spends it as speed.' },
  { name: 'a geothermal plant', chain: ['Heat', 'Kinetic', 'Electrical'], why: 'Hot rock boils water, the steam moves, the turbine turns.' },
  { name: 'an electric kettle', chain: ['Electrical', 'Heat'], why: 'The element resists the current and heats the water.' },
  { name: 'a solar panel on a roof', chain: ['Light', 'Electrical'], why: 'Sunlight knocks electrons loose in the cell and they flow as current.' , art: 'en_solar' },
  { name: 'an electric heater', chain: ['Electrical', 'Heat'], why: 'Current forced through a resistance wire warms the room.' },
  { name: 'a stretched catapult', chain: ['Potential', 'Kinetic'], why: 'The stretched rubber holds energy; letting go turns it into speed.' },
  { name: 'a falling apple', chain: ['Potential', 'Kinetic'], why: 'Height is stored energy and gravity spends it as motion.' },
  { name: 'a campfire', chain: ['Chemical', 'Heat'], why: 'Wood is chemical fuel and burning releases it as warmth.' },
  { name: 'an LED torch bulb', chain: ['Electrical', 'Light'], why: 'Current through the diode comes straight back out as light.' },
  { name: 'a struck match', chain: ['Chemical', 'Heat', 'Light'], why: 'Friction starts the reaction; the reaction gives heat, and the flame glows.' },
  { name: 'a pendulum at the top of its swing', chain: ['Potential', 'Kinetic', 'Potential'], why: 'It trades height for speed on the way down and buys the height back on the way up.' },
  { name: 'a tidal barrage', chain: ['Potential', 'Kinetic', 'Electrical'], why: 'Trapped high water falls, the flow spins turbines, the turbines make current.' },
  { name: 'a diesel generator', chain: ['Chemical', 'Heat', 'Kinetic', 'Electrical'], why: 'Fuel burns, hot gas drives pistons, the pistons turn an alternator.' },
  { name: 'a firefly', chain: ['Chemical', 'Light'], why: 'A reaction in its abdomen makes light with almost no heat.' },
  { name: 'a rubber-band aeroplane', chain: ['Mechanical', 'Potential', 'Kinetic'], why: 'Winding does work, the twisted band stores it, unwinding spins the propeller.' },
  { name: 'a nuclear submarine reactor', chain: ['Nuclear', 'Heat', 'Kinetic'], why: 'Fission heats water, the steam drives the turbine, the propeller turns.' },
  { name: 'an electric motor', chain: ['Electrical', 'Kinetic'], why: 'Current in a magnetic field makes the shaft turn.' },
  { name: 'a hairdryer', chain: ['Electrical', 'Heat'], why: 'The element resists the current and the fan blows the warmth out.' },
  { name: 'a burning gas hob', chain: ['Chemical', 'Heat'], why: 'Gas is stored chemical energy; the flame releases it as heat.' },
];

class EnergyPuzzle implements Puzzle {
  readonly domain = 'energy' as const;
  readonly prompt: string;
  readonly teach: string;
  readonly hint: string;
  attempts = 0;

  private state: Outcome = 'open';
  private readonly slots: (Energy | null)[];
  private readonly given: number;
  private active = 0;

  constructor(readonly instance: string, private readonly device: Device, given: number) {
    this.given = given;
    // The first `given` links are filled in as a foothold; the rest are the question.
    this.slots = device.chain.map((e, i) => (i < given ? e : null));
    this.active = given;
    this.prompt = `Trace the energy through ${device.name}.`;
    this.teach = device.why;
    this.hint = `Energy is never created or destroyed — each arrow is the same energy wearing a different coat. There ${
      device.chain.length - given === 1 ? 'is 1 step' : `are ${device.chain.length - given} steps`
    } to fill.`;
  }

  step(_input: Input, _dt: number, _area: Rect): void {
    /* immediate mode */
  }

  check(): void {
    if (this.state !== 'open') return;
    this.attempts++;
    const ok = this.slots.every((s, i) => s === this.device.chain[i]);
    this.state = ok ? 'solved' : 'failed';
    play(ok ? 'ok' : 'nope');
  }

  canCheck(): boolean {
    return this.slots.every((s) => s !== null);
  }

  outcome(): Outcome {
    return this.state;
  }

  draw(ctx: CanvasRenderingContext2D, area: Rect, input: Input): void {
    const n = this.slots.length;

    // --- the device itself -------------------------------------------------------
    // Previously this puzzle named a coal-fired power station and drew nothing at all, which made an
    // energy-transformation question into a vocabulary quiz.
    const stageH = Math.round(area.h * 0.52);
    const stage: Rect = { x: area.x, y: area.y, w: area.w, h: stageH };
    panel(ctx, stage, PAL.shadow, PAL.steel1);
    const drew = this.device.art
      ? drawArtFit(ctx, this.device.art, stage.x + stage.w / 2, stage.y + stage.h / 2 - 5, stage.w - 20, stage.h - 22)
      : false;
    if (!drew) {
      drawTextCentered(ctx, this.device.name.toUpperCase(), stage.x + stage.w / 2, stage.y + stage.h / 2 - 8, PAL.bone);
    } else {
      drawTextCentered(ctx, this.device.name.toUpperCase(), stage.x + stage.w / 2, stage.y + stage.h - 10, PAL.steel3);
    }

    // --- the chain ---------------------------------------------------------------
    const gap = 14;
    const bw = Math.floor((area.w - 4 - gap * (n - 1)) / n);
    const by = stage.y + stageH + 8;
    const bh = 18;

    for (let i = 0; i < n; i++) {
      const r: Rect = { x: area.x + 2 + i * (bw + gap), y: by, w: bw, h: bh };
      const val = this.slots[i];
      const locked = i < this.given;
      const resolved = this.state !== 'open';
      const right = val === this.device.chain[i];

      const border = resolved ? (right ? PAL.volt : PAL.hot)
        : locked ? PAL.steel2
        : i === this.active ? PAL.brassLit : PAL.steel2;
      panel(ctx, r, locked ? PAL.steel1 : PAL.steel0, border);
      drawTextCentered(ctx, val ? SHORT[val] : '?', r.x + r.w / 2, r.y + 6,
        resolved ? (right ? PAL.volt : PAL.hot) : locked ? PAL.steel3 : val ? PAL.bone : PAL.steel2);

      if (!locked && this.state === 'open' && input.pointer.released && hit(r, input.pointer.x, input.pointer.y)) {
        this.active = i;
        play('click');
      }

      // Arrow to the next link.
      if (i < n - 1) {
        ctx.fillStyle = PAL.brass;
        const ax = r.x + r.w + 2;
        const ay = r.y + bh / 2;
        ctx.fillRect(ax, ay, gap - 5, 2);
        ctx.fillRect(ax + gap - 8, ay - 2, 2, 6);
        ctx.fillRect(ax + gap - 6, ay - 1, 2, 4);
      }
    }

    // On a miss, the true chain is written under the boxes so it stays legible afterwards.
    if (this.state === 'failed') {
      for (let i = 0; i < n; i++) {
        const x = area.x + 2 + i * (bw + gap);
        drawTextCentered(ctx, SHORT[this.device.chain[i] as Energy], x + bw / 2, by + bh + 3, PAL.volt);
      }
    }

    if (this.state !== 'open') return;

    // --- type palette ------------------------------------------------------------
    const cols = 4;
    const pw = Math.floor((area.w - 4 - 3 * 4) / cols);
    const py = by + bh + 10;
    const ph = 16;
    for (let i = 0; i < ENERGY_TYPES.length; i++) {
      const e = ENERGY_TYPES[i] as Energy;
      const c = i % cols;
      const rw = Math.floor(i / cols);
      const r: Rect = { x: area.x + 2 + c * (pw + 4), y: py + rw * (ph + 4), w: pw, h: ph };
      const used = this.slots[this.active] === e;
      if (button(ctx, input, r, { label: SHORT[e], on: used })) {
        this.slots[this.active] = e;
        // Advance to the next empty slot; filling left to right is how you'd think about it anyway.
        const nextEmpty = this.slots.findIndex((sl, k) => sl === null && k >= this.given);
        this.active = nextEmpty === -1 ? this.active : nextEmpty;
      }
    }

    drawText(ctx, 'TAP A BOX, THEN TAP THE ENERGY THAT BELONGS THERE.', area.x + 2, py + 2 * (ph + 4) + 2, PAL.steel2);
  }
}

export const energyGen: Generator = {
  domain: 'energy',
  make(rng: Rng, tier: number): Puzzle {
    // Difficulty is *blanks to fill*, not chain length. Restricting tier 0 to two-link devices left only
    // seven possible instances; giving away the first link of a three-link chain is the same two blanks
    // and opens up the whole bank.
    const pool = tier < 2
      ? DEVICES.filter((d) => d.chain.length <= 3)
      : tier < 4
        ? DEVICES.filter((d) => d.chain.length <= 4)
        : DEVICES;
    const withArt = pool.filter((d) => d.art && hasArt(d.art));
    // The device is the question — an illustrated instance is a materially better puzzle, not just a
    // prettier one. Un-illustrated devices still appear, so the bank stays at 37 rather than 6.
    const base = pool.length ? pool : DEVICES;
    const device = rng.pick(withArt.length >= 3 && rng.next() < 0.8 ? withArt : base);
    const given = tier < 2 && device.chain.length > 2 ? 1
      : tier < 4 && device.chain.length > 3 ? 1
      : 0;
    return new EnergyPuzzle(`ene-${device.name.replace(/\s+/g, '_')}-${given}`, device, given);
  },
};

export { EnergyPuzzle };
