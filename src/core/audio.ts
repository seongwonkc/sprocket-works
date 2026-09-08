/**
 * Procedural SFX. No audio files ship at v1 — zero weight, zero licensing, and the whole palette is a
 * few oscillators. `play(id)` is the only surface, so swapping in ElevenLabs VO or recorded SFX later
 * is a change to this file and nothing else.
 */

export type SfxId =
  | 'jump' | 'land' | 'spring' | 'pickup' | 'throw' | 'stun'
  | 'ok' | 'nope' | 'click' | 'open' | 'winRace' | 'loseRace';

interface Voice {
  wave: OscillatorType;
  /** [startHz, endHz] */
  freq: [number, number];
  dur: number;
  gain: number;
  /** Optional second partial, detuned in cents. */
  detune?: number;
}

const BANK: Record<SfxId, Voice[]> = {
  jump:     [{ wave: 'square',   freq: [330, 620], dur: 0.10, gain: 0.16 }],
  land:     [{ wave: 'triangle', freq: [180, 90],  dur: 0.07, gain: 0.12 }],
  spring:   [{ wave: 'sine',     freq: [220, 880], dur: 0.20, gain: 0.20 }],
  pickup:   [{ wave: 'square',   freq: [660, 990], dur: 0.09, gain: 0.15 },
             { wave: 'square',   freq: [990, 1320], dur: 0.09, gain: 0.10 }],
  throw:    [{ wave: 'sawtooth', freq: [520, 260], dur: 0.09, gain: 0.10 }],
  stun:     [{ wave: 'sawtooth', freq: [420, 60],  dur: 0.28, gain: 0.16 }],
  ok:       [{ wave: 'triangle', freq: [523, 784], dur: 0.14, gain: 0.18, detune: 6 }],
  nope:     [{ wave: 'square',   freq: [200, 130], dur: 0.22, gain: 0.14 }],
  click:    [{ wave: 'square',   freq: [900, 900], dur: 0.03, gain: 0.09 }],
  open:     [{ wave: 'triangle', freq: [300, 700], dur: 0.22, gain: 0.16 }],
  winRace:  [{ wave: 'square',   freq: [523, 1046], dur: 0.5, gain: 0.18, detune: 8 }],
  loseRace: [{ wave: 'sawtooth', freq: [300, 90],  dur: 0.6, gain: 0.16 }],
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

/** Browsers refuse to start audio before a gesture; every input path calls this, it's idempotent. */
export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
}

export function setAudioEnabled(on: boolean): void {
  enabled = on;
  if (master) master.gain.value = on ? 0.7 : 0;
}

export function isAudioEnabled(): boolean {
  return enabled;
}

export function play(id: SfxId): void {
  if (!enabled || !ctx || !master) return;
  const now = ctx.currentTime;
  for (const v of BANK[id]) {
    spawn(ctx, master, v, now);
    if (v.detune !== undefined) {
      spawn(ctx, master, { ...v, gain: v.gain * 0.6 }, now, v.detune);
    }
  }
}

function spawn(c: AudioContext, out: GainNode, v: Voice, at: number, detune = 0): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = v.wave;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(v.freq[0], at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, v.freq[1]), at + v.dur);
  // Tiny attack kills the click that a hard gate produces on square waves.
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(v.gain, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + v.dur);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + v.dur + 0.02);
}
