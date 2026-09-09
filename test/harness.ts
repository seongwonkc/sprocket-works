/**
 * Headless checks for the parts of the game that are wrong silently.
 *
 * The platformer and the UI you can see is broken. The race ladder and the puzzle generators you cannot:
 * a track that's unwinnable with every available part, or a balance instance with no solution, looks
 * exactly like a hard one until a player is stuck on it.
 *
 * Run: npx esbuild test/harness.ts --bundle --platform=node --format=esm --outfile=.tmp/h.mjs && node .tmp/h.mjs
 */

import { PARTS, dropPool, type Part } from '../src/content/parts';
import { TRACKS, trackAt } from '../src/content/tracks';
import { Rng } from '../src/core/rng';
import { simulate, toBuild, topSpeed, type Build } from '../src/game/race/sim';
import { balanceGen } from '../src/game/puzzles/balance';
import { circuitGen } from '../src/game/puzzles/circuit';
import { gearsGen } from '../src/game/puzzles/gears';
import { machinesGen } from '../src/game/puzzles/machines';
import { energyGen } from '../src/game/puzzles/energy';
import { magnetsGen } from '../src/game/puzzles/magnets';
import { forceGen, rangeOf } from '../src/game/puzzles/force';
import { solve } from '../src/game/puzzles/circuitSolver';
import { SOLID, SPRING, generate, tileAt } from '../src/game/world/level';
import { moveBody } from '../src/game/world/physics';

let failures = 0;
function ok(cond: boolean, msg: string, detail = ''): void {
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${msg}${detail ? `  [${detail}]` : ''}`);
  } else {
    console.log(`  ok    ${msg}${detail ? `  [${detail}]` : ''}`);
  }
}

// ---------------------------------------------------------------------------------
// 1. Race ladder: for every track, is there a winning build from the parts on offer,
//    and is the lazy build actually punished?
// ---------------------------------------------------------------------------------
console.log('\n== RACE LADDER ==');

/** Everything the player could plausibly hold by race N: all guaranteed drops so far, plus tier pool. */
function availableBy(raceIdx: number): Part[] {
  const ids = new Set<string>();
  for (let i = 0; i <= raceIdx; i++) for (const g of (TRACKS[i] as (typeof TRACKS)[number]).guaranteed) ids.add(g);
  for (const p of dropPool(raceIdx + 1)) ids.add(p.id);
  return PARTS.filter((p) => ids.has(p.id));
}

function bestTime(pool: Part[], raceIdx: number): { t: number; build: Build } | null {
  const track = trackAt(raceIdx);
  const bySlot = {
    power: pool.filter((p) => p.slot === 'power'),
    nose: pool.filter((p) => p.slot === 'nose'),
    body: pool.filter((p) => p.slot === 'body'),
    wheels: pool.filter((p) => p.slot === 'wheels'),
  };
  let best: { t: number; build: Build } | null = null;
  for (const pw of bySlot.power)
    for (const n of bySlot.nose)
      for (const b of bySlot.body)
        for (const w of bySlot.wheels) {
          const built = toBuild({ power: pw.id, nose: n.id, body: b.id, wheels: w.id });
          if (Array.isArray(built)) continue;
          const r = simulate(built, track);
          if (r.finishTime < (best?.t ?? Infinity)) best = { t: r.finishTime, build: built };
        }
  return best;
}

for (let i = 0; i < TRACKS.length; i++) {
  const track = trackAt(i);
  const rivalBuild = toBuild(track.rival);
  if (Array.isArray(rivalBuild)) {
    ok(false, `race ${i + 1} rival build resolves`);
    continue;
  }
  const rival = simulate(rivalBuild, track);
  const pool = availableBy(i);
  const best = bestTime(pool, i);

  ok(Number.isFinite(rival.finishTime), `race ${i + 1} rival finishes`, `${rival.finishTime.toFixed(2)}s`);
  ok(
    best !== null && best.t < rival.finishTime,
    `race ${i + 1} is winnable`,
    best ? `best ${best.t.toFixed(2)}s vs rival ${rival.finishTime.toFixed(2)}s` : 'no build',
  );

  // The starter build must NOT walk it, or the race teaches nothing.
  const lazy = toBuild({ power: 'p_windup', nose: 'n_slab', body: 'b_crate', wheels: 'w_iron' });
  if (!Array.isArray(lazy)) {
    const l = simulate(lazy, track);
    const lazyWins = l.finishTime < rival.finishTime;
    ok(
      i === 0 ? true : !lazyWins,
      `race ${i + 1} punishes the lazy build`,
      `lazy ${l.finishTime === Infinity ? 'DNF' : l.finishTime.toFixed(2) + 's'}`,
    );
  }

  if (best) {
    const b = best.build;
    console.log(
      `        winner: ${b.power.name} / ${b.nose.name} / ${b.body.name} / ${b.wheels.name}` +
        `  top ${(topSpeed(b) * 3.6).toFixed(0)}km/h`,
    );
  }
}

// ---------------------------------------------------------------------------------
// 2. Aero. The claim the ladder rests on is NOT "drag is irrelevant when slow" — drag beats rolling
//    resistance from about 5 m/s upward with these body sizes, so it is never truly irrelevant. The
//    real claim, and the one the debrief makes to the player, is that drag's *share of the losses*
//    grows with speed while rolling resistance's shrinks. Assert that, not something stronger.
// ---------------------------------------------------------------------------------
console.log('\n== AERO CLAIM ==');
{
  const mk = (nose: string) => toBuild({ power: 'p_leadcell', nose, body: 'b_tub', wheels: 'w_rubber' }) as Build;
  const dragShare = (b: Build, t: number): number => {
    const r = simulate(b, trackAt(t));
    const tot = r.lost.drag + r.lost.roll + r.lost.climb + r.lost.slip;
    return r.lost.drag / Math.max(1, tot);
  };
  const slowShare = dragShare(mk('n_slab'), 0);
  const fastShare = dragShare(mk('n_slab'), 2);
  ok(fastShare > slowShare, 'drag takes a bigger share of the losses on the fast track',
    `${(slowShare * 100).toFixed(0)}% -> ${(fastShare * 100).toFixed(0)}%`);
  ok(fastShare > 0.6, 'drag dominates the debrief on the fast track', `${(fastShare * 100).toFixed(0)}%`);

  // The design claim isn't "aero is worth more seconds on the fast track" — that's just track length.
  // It's that a *different slot* is the best thing to spend a part on, per race. Measure that directly:
  // upgrade exactly one slot from the same baseline and see which upgrade wins.
  const baseIds = { power: 'p_leadcell', nose: 'n_slab', body: 'b_tub', wheels: 'w_iron' };
  const swap = (t: number, slot: string, id: string): number => {
    const b0 = simulate(toBuild(baseIds) as Build, trackAt(t)).finishTime;
    const b1 = simulate(toBuild({ ...baseIds, [slot]: id }) as Build, trackAt(t)).finishTime;
    return b0 - b1; // seconds saved
  };
  const slowNose = swap(0, 'nose', 'n_needle');
  const slowWheel = swap(0, 'wheels', 'w_rubber');
  const fastNose = swap(2, 'nose', 'n_needle');
  const fastWheel = swap(2, 'wheels', 'w_rubber');
  ok(slowWheel > slowNose, 'on race 1 the best upgrade is the wheels',
    `wheels +${slowWheel.toFixed(1)}s vs nose +${slowNose.toFixed(1)}s`);
  ok(fastNose > fastWheel, 'on race 3 the best upgrade is the nose',
    `nose +${fastNose.toFixed(1)}s vs wheels +${fastWheel.toFixed(1)}s`);
}

// ---------------------------------------------------------------------------------
// 2b. THE CURRICULUM. DESIGN.md §6 claims each race is decided by a different variable. That claim is
//     only true if the numbers make it true, and it is invisible from the code — a parts table where
//     drag swamps everything on every track looks completely reasonable until you measure it.
//
//     These assertions ARE the ladder design. If tuning breaks one, the ladder is broken, not the test.
// ---------------------------------------------------------------------------------
console.log('\n== CURRICULUM ==');
{
  /** Loss shares for a representative mid-grade build on a given track. */
  const shares = (raceIdx: number, ids: Record<string, string>) => {
    const b = toBuild(ids);
    if (Array.isArray(b)) throw new Error('bad build');
    const r = simulate(b, trackAt(raceIdx));
    const tot = Math.max(1, r.lost.drag + r.lost.roll + r.lost.climb + r.lost.slip);
    return {
      drag: r.lost.drag / tot,
      roll: r.lost.roll / tot,
      climb: r.lost.climb / tot,
      t: r.finishTime,
      spent: r.forces.spent,
      finished: r.finished,
    };
  };
  const starter = { power: 'p_windup', nose: 'n_slab', body: 'b_crate', wheels: 'w_iron' };
  const mid = { power: 'p_leadcell', nose: 'n_round', body: 'b_tub', wheels: 'w_rubber' };

  // Race 1 — slow and short. Rolling resistance must be the story, not aero.
  const r1 = shares(0, starter);
  ok(r1.roll > r1.drag, 'race 1 is decided by rolling resistance, not air',
    `roll ${(r1.roll * 100).toFixed(0)}% vs drag ${(r1.drag * 100).toFixed(0)}%`);

  // Race 2 — the windup spring must reach the flag at 200 m and run dry at 300 m. That is the lesson.
  const springShort = simulate(toBuild(starter) as Build, trackAt(0));
  const springLong = simulate(toBuild(starter) as Build, trackAt(1));
  ok(springShort.finished, 'the spring finishes race 1', `${springShort.finishTime.toFixed(1)}s`);
  ok(!springLong.finished || springLong.forces.spent, 'the spring runs dry on race 2',
    springLong.finished ? 'finished anyway' : 'DNF');

  // Race 3 — fast and flat. Aero must dominate.
  const r3 = shares(2, mid);
  ok(r3.drag > 0.6, 'race 3 is decided by air', `drag ${(r3.drag * 100).toFixed(0)}%`);

  // Race 4 — the climb must be the dominant loss, so mass is what the player is really choosing.
  const r4 = shares(3, mid);
  ok(r4.climb > 0.3, 'race 4 is decided by the climb', `climb ${(r4.climb * 100).toFixed(0)}%`);

  // And on race 4, shedding mass must beat improving the nose — otherwise it's another aero race.
  const heavy = simulate(toBuild({ ...mid, body: 'b_crate' }) as Build, trackAt(3)).finishTime;
  const light = simulate(toBuild({ ...mid, body: 'b_frame' }) as Build, trackAt(3)).finishTime;
  const slick = simulate(toBuild({ ...mid, nose: 'n_needle' }) as Build, trackAt(3)).finishTime;
  const base = simulate(toBuild(mid) as Build, trackAt(3)).finishTime;
  ok(heavy - light > (base - slick) * 1.3, 'on race 4, mass beats aero',
    `mass swing ${(heavy - light).toFixed(2)}s vs nose swing ${(base - slick).toFixed(2)}s`);
}

// ---------------------------------------------------------------------------------
// 3. Circuit solver: known-good textbook cases.
// ---------------------------------------------------------------------------------
console.log('\n== CIRCUIT SOLVER ==');
{
  // Two lamps in parallel across the supply: both full.
  const par = solve({
    nodeCount: 2, wires: [], lamps: [[0, 1], [0, 1]], vplus: 0, vminus: 1,
  });
  ok(par.brightness.every((b) => Math.abs(b - 1) < 1e-6), 'parallel lamps read full', par.brightness.join(','));

  // Two lamps in series: each sees V/2, so power is a quarter.
  const ser = solve({
    nodeCount: 3, wires: [], lamps: [[0, 1], [1, 2]], vplus: 0, vminus: 2,
  });
  ok(ser.brightness.every((b) => Math.abs(b - 0.25) < 1e-6), 'series pair reads 25%', ser.brightness.map((b) => b.toFixed(3)).join(','));

  // Three in series: V/3 each -> 1/9.
  const s3 = solve({
    nodeCount: 4, wires: [], lamps: [[0, 1], [1, 2], [2, 3]], vplus: 0, vminus: 3,
  });
  ok(s3.brightness.every((b) => Math.abs(b - 1 / 9) < 1e-6), 'series triple reads 11%', s3.brightness.map((b) => b.toFixed(3)).join(','));

  // Dead short across the terminals.
  const sh = solve({ nodeCount: 2, wires: [[0, 1]], lamps: [[0, 1]], vplus: 0, vminus: 1 });
  ok(sh.shorted, 'dead short detected');

  // Lamp shorted out by a wire across it, in series with a live one.
  const byp = solve({
    nodeCount: 3, wires: [[1, 2]], lamps: [[0, 1], [1, 2]], vplus: 0, vminus: 2,
  });
  ok(
    Math.abs((byp.brightness[0] as number) - 1) < 1e-6 && (byp.brightness[1] as number) < 1e-9,
    'bypassed lamp goes dark and the other goes full',
    byp.brightness.map((b) => b.toFixed(2)).join(','),
  );
}

// ---------------------------------------------------------------------------------
// 4. Generators: every instance must be solvable, and instances must actually vary.
// ---------------------------------------------------------------------------------
console.log('\n== GENERATORS ==');
for (const [name, gen] of [
  ['balance', balanceGen], ['circuit', circuitGen], ['machines', machinesGen], ['gears', gearsGen],
  ['energy', energyGen], ['magnets', magnetsGen], ['force', forceGen],
] as const) {
  for (const tier of [0, 3, 6]) {
    const seen = new Set<string>();
    let bad = 0;
    for (let i = 0; i < 200; i++) {
      const p = gen.make(new Rng(i * 7919 + tier), tier);
      seen.add(p.instance);
      if (!p.prompt || !p.teach) bad++;
      // An unsolvable-looking instance: nothing to do, or a fallback leaked out.
      if (p.instance.includes('fallback')) bad++;
    }
    ok(bad === 0, `${name} t${tier}: every instance well-formed`, `${bad} bad`);
    ok(seen.size >= 8, `${name} t${tier}: enough variety`, `${seen.size} distinct in 200`);
    // Every puzzle must offer a hint. The original had one on every screen; omitting it made this
    // build harsher than the thing it remakes.
    const one = gen.make(new Rng(tier * 31 + 5), tier);
    ok(!!one.hint && one.hint.length > 20, `${name} t${tier}: has a usable hint`);
  }
}

// Balance solvability is checkable directly: the generated weights must have an exact placement.
console.log('\n== BALANCE SOLVABILITY ==');
{
  let unsolvable = 0;
  for (let i = 0; i < 500; i++) {
    const p = balanceGen.make(new Rng(i * 104729 + 11), (i % 8)) as unknown as {
      instance: string;
    };
    // instance encodes kg@peg for every weight; the generator places the answer then hides it,
    // so a well-formed instance always has one. A leaked fallback means generation gave up.
    if (p.instance === 'bal-fallback') unsolvable++;
  }
  ok(unsolvable === 0, 'balance generator never falls back', `${unsolvable}/500`);
}

// ---------------------------------------------------------------------------------
// 6. Warehouse reachability: every floor's one spring must have a clear launch
//    corridor to the deck above. A capped spring is a soft-lock, and it looks
//    exactly like a normal level until a player is standing under it.
// ---------------------------------------------------------------------------------
console.log('\n== WAREHOUSE REACHABILITY ==');
{
  const FLOOR_H = 5;
  let levels = 0;
  let missing = 0;
  let capped = 0;
  for (let seed = 1; seed <= 400; seed++) {
    for (let race = 0; race < 5; race++) {
      const level = generate(new Rng((seed ^ (race * 0x9e3779b1)) >>> 0), trackAt(race), 0, true);
      levels++;
      const rows = [level.h - 1, level.h - 1 - FLOOR_H, level.h - 1 - 2 * FLOOR_H, level.h - 1 - 3 * FLOOR_H];
      for (let i = 0; i < rows.length - 1; i++) {
        const standRow = rows[i] as number;
        const above = rows[i + 1] as number;
        let sx = -1;
        for (let x = 1; x < level.w - 1; x++) {
          if (tileAt(level, x, standRow - 1) === SPRING) { sx = x; break; }
        }
        if (sx < 0) { missing++; continue; }
        for (let ty = above + 1; ty <= standRow - 2; ty++) {
          if (tileAt(level, sx, ty) === SOLID || tileAt(level, sx + 1, ty) === SOLID) { capped++; break; }
        }
      }
    }
  }
  ok(missing === 0, 'every floor has a spring', `${missing} missing in ${levels} levels`);
  ok(capped === 0, 'no spring launch corridor is blocked', `${capped} capped in ${levels} levels`);
}

// The player body (14x26 logical px — mirror warehouse.ts if those change) must never spawn
// overlapping a solid tile: an embedded body ignores all input, which reads as a dead game.
{
  const TILE = 16;
  let embedded = 0;
  let levels = 0;
  for (let seed = 1; seed <= 400; seed++) {
    for (let race = 0; race < 5; race++) {
      const l = generate(new Rng((seed ^ (race * 0x9e3779b1)) >>> 0), trackAt(race), 0, true);
      levels++;
      const x0 = Math.floor(l.spawnX / TILE);
      const x1 = Math.floor((l.spawnX + 13) / TILE);
      const y0 = Math.floor(l.spawnY / TILE);
      const y1 = Math.floor((l.spawnY + 25) / TILE);
      outer: for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (tileAt(l, tx, ty) === SOLID) { embedded++; break outer; }
        }
      }
    }
  }
  ok(embedded === 0, 'spawn is never inside a solid tile', `${embedded} embedded in ${levels} levels`);
}

// A body standing on a spring tile must launch. The spring is a walkable tile the feet stand IN,
// on top of the slab — a check that probes one pixel below the feet reads the slab forever, and
// that exact off-by-one shipped: springs never fired for anyone until the second human playtest.
{
  const w = 8, h = 8;
  const tiles = new Array<number>(w * h).fill(0);
  for (let x = 0; x < w; x++) tiles[6 * w + x] = 1; // slab row 6 (y 96..112)
  tiles[5 * w + 3] = 2;                             // spring at (3,5), standing tile on the slab
  const lvl = { w, h, tiles, crates: [], gremlins: [], spawnX: 0, spawnY: 0, exitTx: 0, exitTy: 0 } as unknown as Parameters<typeof moveBody>[0];
  const mk = (x: number) => ({ x, y: 96 - 26, w: 14, h: 26, vx: 0, vy: 0, onGround: false, sprung: false });
  const onSpring = mk(3 * 16 + 1);
  const onSlab = mk(5 * 16 + 1);
  for (let i = 0; i < 3; i++) moveBody(lvl, onSpring, 1 / 60);
  for (let i = 0; i < 3; i++) moveBody(lvl, onSlab, 1 / 60);
  ok(onSpring.sprung, 'standing on a spring sets sprung');
  ok(!onSlab.sprung, 'standing beside a spring does not');
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
