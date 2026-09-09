/**
 * Boot and scene manager.
 *
 * The whole flow lives in `swap()` below — title → warehouse → build → race → warehouse. Keeping it in
 * one function means the game's shape is readable in twenty lines instead of being inferred from four
 * scene files calling each other.
 */

import { Screen } from './core/canvas';
import { drawTextCentered } from './core/font';
import { Input } from './core/input';
import { Loop, STEP } from './core/loop';
import { setAudioEnabled, unlockAudio } from './core/audio';
import { loadAssets, loadProgress } from './core/assets';
import { blankProfile, load, save as persist, type Profile } from './core/save';
import { PARTS } from './content/parts';
import { dump, initTelemetry } from './core/telemetry';
import { BuildScene } from './game/build/builder';
import { RaceScene } from './game/race/raceScene';
import type { Ctx, Scene, SceneName } from './game/scene';
import { HubScene } from './game/ui/hub';
import { TitleScene } from './game/ui/title';
import { TouchPad } from './game/ui/touchpad';
import { WarehouseScene } from './game/world/warehouse';

const stage = document.getElementById('stage');
if (!stage) throw new Error('#stage missing');

const screen = new Screen(stage);
const input = new Input(screen);
const pad = new TouchPad(screen, input);

initTelemetry();

const existing = load();
const profile: Profile = existing ?? blankProfile();
setAudioEnabled(profile.audio);

const ctx: Ctx = {
  profile,
  input,
  save: () => persist(profile),
};

/**
 * Dev entry points: `?scene=race&seed=7&parts=all` drops straight into a scene with a stocked profile.
 * Worth the fifteen lines — otherwise verifying a change to the debrief means playing three puzzles and
 * a race first, and nobody does that more than twice before they stop checking.
 */
const q = new URLSearchParams(location.search);
if (q.get('parts') === 'all') {
  profile.parts = PARTS.map((p) => p.id);
  profile.fitted = { power: 'p_leadcell', nose: 'n_round', body: 'b_tub', wheels: 'w_rubber' };
}
if (q.has('seed')) profile.seed = Number(q.get('seed')) >>> 0;
if (q.has('rank')) profile.rank = Math.max(0, Math.min(7, Number(q.get('rank'))));
if (q.has('race')) profile.race = Math.max(0, Math.min(4, Number(q.get('race'))));

const startAt = q.get('scene') as SceneName | null;
const VALID: SceneName[] = ['title', 'hub', 'warehouse', 'build', 'race', 'debrief'];

let currentName: SceneName = startAt && VALID.includes(startAt) ? startAt : 'title';
/**
 * Deliberately not constructed here. Scene constructors run generators that ask whether art exists
 * (the Machines puzzle prefers items it can illustrate), so building a scene before loadAssets()
 * resolves makes every one of those checks answer "no". Constructed in the .then() below instead.
 */
let current: Scene | null = null;

function makeScene(to: SceneName): Scene {
  switch (to) {
    case 'title':
      return new TitleScene(ctx, existing !== null);
    case 'hub':
      return new HubScene(ctx);
    case 'warehouse':
      return new WarehouseScene(ctx);
    case 'build':
      return new BuildScene(ctx);
    case 'race':
    case 'debrief':
      // The debrief is drawn inside RaceScene; 'debrief' exists so the union stays exhaustive.
      return new RaceScene(ctx);
  }
}

function swap(to: SceneName): void {
  persist(profile);
  currentName = to;
  current = makeScene(to);
}

/** The touch pad is a platformer control. It has no meaning in the menu-driven scenes. */
function padActive(): boolean {
  return currentName === 'warehouse';
}

const loop = new Loop(
  (dt) => {
    if (!current) return;
    pad.update(screen.view, padActive());
    input.sample();
    current.step(dt, screen.view);
    const to = current.next();
    if (to) swap(to);
  },
  () => {
    if (!current) return;
    const g = screen.ctx;
    current.draw(g, screen.view);
    pad.draw(g, screen.view, padActive());
    input.endFrame();
  },
);

// Audio can't start before a gesture; any of these counts.
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  addEventListener(ev, () => unlockAudio(), { once: false, passive: true });
}

// Save on the way out. `visibilitychange` is the only one iOS reliably fires.
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist(profile);
});
addEventListener('pagehide', () => persist(profile));

/**
 * `?ff=8` advances the simulation eight seconds before the first frame is drawn. Chrome's
 * --virtual-time-budget never advances under a requestAnimationFrame loop, so without this there is no
 * way to screenshot anything past the first frame of a scene — including the race debrief, which is the
 * screen most worth checking.
 */
function ff(): void {
  const n = Number(q.get('ff') ?? 0);
  if (!(n > 0) || !current) return;
  for (let i = 0; i < Math.min(n, 300) / STEP; i++) {
    input.sample();
    current.step(STEP, screen.view);
    const to = current.next();
    if (to) swap(to);
  }
}

/**
 * Art loads before the first frame. It is ~200 kB of PNG, so on a cold mobile connection this is a
 * visible moment — it gets a real progress bar rather than a frozen canvas.
 */
const boot = document.getElementById('boot');
const paint = (): void => {
  const g = screen.ctx;
  const { w, h } = screen.view;
  const { loaded, total } = loadProgress();
  g.fillStyle = '#0d0f16';
  g.fillRect(0, 0, w, h);
  drawTextCentered(g, 'SPROCKET WORKS', w / 2, h / 2 - 22, '#e0b062', 2);
  const bw = Math.min(220, w - 60);
  const bx = Math.round((w - bw) / 2);
  g.fillStyle = '#2b3245';
  g.fillRect(bx, h / 2 + 6, bw, 4);
  g.fillStyle = '#a9793f';
  g.fillRect(bx, h / 2 + 6, Math.round(bw * (total ? loaded / total : 0)), 4);
  drawTextCentered(g, 'LOADING ART', w / 2, h / 2 + 18, '#5b6b8a');
};
paint();
const spin = setInterval(paint, 80);

// `.then` rather than top-level await: TLA needs an es2022 target, and the es2020 target exists to
// keep older mobile Safari working.
void loadAssets().then(() => {
  clearInterval(spin);
  boot?.remove();
  current = makeScene(currentName);
  ff();
  loop.start();
});

// Debug handle. Harmless in production and the only way to read telemetry without a sink.
(window as unknown as Record<string, unknown>).__sprocket = {
  profile,
  telemetry: dump,
  scene: () => currentName,
};
