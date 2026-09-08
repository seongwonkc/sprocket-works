# SPROCKET WORKS — design spec

Working title. One constant (`src/content/brand.ts`) holds the name; renaming is a one-line change.

A remake in spirit of *Super Solvers: Gizmos & Gadgets!* (The Learning Company, 1993) — same loop, same
subject matter, new everything else.

---

## 1. What the original actually is

Grounded in the shipped binary, not memory. Extracted from `ssg.exe` string table and the `MR0` resource
archives (`gizmo000-003.dat`, 878 / 912 / … entries, offset-table format, RLE-packed VGA sprite blobs):

**Rank ladder** (8 tiers, verbatim from the exe):
`Trainee → Assistant → Technician → Engineer → Scientist → Doctor → Professor → Head Scientist`

**Energy taxonomy** (8, verbatim): Chemical, Electrical, Heat, Kinetic, Light, Mechanical, Nuclear, Potential.

**Puzzle engines** — three source files leak in the binary: `electric.c`, `puzzler.c`, `simple.c`.
Seven subject domains ship: Balance, Electricity, Energy, Force, Gears, Magnetics, Machines.

**Simple-machine item bank** (verbatim from the exe — the "what simple machines compose this object?" puzzle):
backhoe, clothesline, faucet, fishing rod and reel, nail, rope and pulley, scale, seesaw, skateboard,
slide, wheelbarrow, wrench, zipper, ax, nail clippers, scissors, vise grips. Plus sentence-completion
stems: *"the bones and muscle form an arm"*, *"the key fit into the lock"*, *"the teeth fit in the mouth"*.

**Loop:** side-view maze warehouse → crates behind puzzle-locked doors → solve puzzle, win a part →
Cyber Chimps roam and steal a part on contact (stun with thrown bananas) → workshop, assemble a vehicle
from collected parts → race Morty Maxwell. 15 races: 5 each in **automotive / alternative-energy / aircraft**.
Toggle `With Chimps` / `Without Chimps`.

**The thing that made it good, and that most retro-edu remakes miss:** the science is not in the puzzles.
The puzzles are a *gate*. The science is in the **builder** — a pointed nose beats a rounded nose beats a
flat nose, and you only find that out by losing a race. Puzzles pay you in parts; parts are a physics
hypothesis; the race is the experiment. That is the whole design and it is what we keep.

### Observed by running it

The original was later booted under js-dos (DOSBox-WASM) and driven with Puppeteer, and the following is
first-hand, not inferred. Several earlier guesses in this document were wrong and have been corrected.

**Structure.** An isometric hub — the Shady Glen Technology Center — with a separate *building per
vehicle category*. Inside a building: a **workshop** (ground floor) and a **warehouse** reached by
pressing ↑. A pneumatic **tube** moves you between buildings; the HUD reads `TUBE DESTINATION /
BUILDING: ALTERNATIVE ENERGY / SECTOR 1`, so warehouses are divided into numbered sectors.

**Warehouse.** Not a scrolling platformer — a **flip-screen 6-level shelf rack**, green ◀▶ arrows at the
screen edges paging to the adjacent sector. Movement is ←→; **jumping is diagonal only** (↑← or ↑→).
Spacebar throws a banana. A recycling bin sits at the bottom of each screen.

**Parts are not behind puzzles.** They lie loose on the shelves as wrapped boxes; you press ↓ walking
past to pick one up, and **a box may contain bananas instead of a part**. What the puzzles gate is
**doors** between shelf bays — so puzzles buy *access*, not loot. Each door carries an icon for its
puzzle domain.

**Failing a puzzle costs nothing.** Per the in-game help: "Click on the Go Back button if you want to
stop working on a puzzle before you have solved it. The door will stay closed." There is also a **Hint**
button. No penalty, no lockout, retry freely.

**Carry limit:** "You can only have 2 types of each part at a time." A real commit mechanic.

**HUD:** `PARTS NEEDED 0/4` — **four functional parts per vehicle**, which happens to match this build.
Plus `BANANAS` (starts at 10) and a six-digit `SCORE`.

**The blueprint.** The workshop wall holds a blueprint of the current vehicle — `Level-1 PEDAL-POWERED
RACER` — with a callout per slot, and **clicking a callout tells you the answer outright**. Verbatim from
the Body callout: *"Rectangular bodies create the most drag... An egg-shaped body creates the least amount
of drag and will help your vehicle go the fastest."* Slots on that blueprint: body/shell, chain drive,
front wheel, rear wheel, plus a cosmetic **DECAL**. The slot set is **per vehicle type** — a pedal racer
has a chain drive where a car would have an engine.

### Corrections this forced

- §1's claim that "the science is in the builder and you only find out by losing a race" describes **this
  build, not the original**. The original teaches by *telling you first*, in the blueprint. Withholding
  the verdict until the post-race debrief is a deliberate departure — arguably better pedagogy, but it is
  ours, not a restoration.
- The timer row in the table below was invented from bad memory. No timer was observed and none is
  mentioned in the help. Treat it as: **there is no fail-clock in the original either.**
- "Crates gated by puzzles" is wrong about the original. Doors are gated; boxes are free.
- Punishing a failed puzzle (this build jams the crate for 25 s) is **harsher than the original**, which
  has no penalty at all and offers hints. Softened — see §2.

### Still not known

Art style beyond these screens, music, voice, the race screen itself, the puzzle UIs (a door was never
successfully opened under automation), and level layouts. The underlying physics is near-certainly not
the original's — a 286-target title scored builds off a table rather than integrating forces. Ours is
more rigorous than the original was, which is a departure, not a restoration.

## 2. What we keep, change, drop

| | Original | Sprocket Works |
|---|---|---|
| Loop | explore → puzzle → part → build → race | **same** |
| Science in the builder | yes, implicit | **same, but made legible** — post-race telemetry shows *why* you lost (drag vs mass vs traction) |
| Puzzle domains | 7 | 4 at v1 (Balance, Circuits, Machines, Gears), 7 at v1.0 |
| Rank ladder | 8 tiers | **same shape**, new names |
| Antagonist | Morty Maxwell + Cyber Chimps | new rival + new mob (art/name/voice all original) |
| Input | mouse + keyboard, 640×480 VGA | keyboard + gamepad + **touch**, integer-scaled pixel canvas, any aspect |
| Session length | 30–60 min | **3–6 min** per race cycle — resumable, mobile-shaped |
| Timers | **unverified** — no timer string in the binary, and neither source mentions one. I asserted this from vague memory; treat the left column as unknown. | soft pressure: rival mob steals parts, no fail-clock |
| Save | `PLAYERS.DAT`, 12 slots | localStorage profile, one slot, autosave every transition |

**Dropped:** the front/back warehouse split (dead time), the 8-slot player-name kiosk (a 1993 lab-computer
affordance), modal instruction pages.

## 3. Legal position

Abandonware is not public domain — TLC's copyrights were assigned through Broderbund → Riverdeep →
Houghton Mifflin Harcourt and are almost certainly still live, even though nobody is enforcing them. What
that means in practice:

- **Game mechanics, rules, and the physics being taught are not copyrightable.** Reimplementing the loop is fine.
- **Art, audio, music, character names, level layouts, and the literal text are copyrightable.** None of it ships.
- The extracted `MR0` sprite data stays in the scratchpad as *reference for study*. It never enters this repo.
  `.gitignore` blocks `*.dat` and `reference/` as a belt-and-braces measure.
- Trademarks: "Super Solvers", "Gizmos & Gadgets" — avoid entirely, including in store metadata and SEO copy.

All sprites via PixelLab, all voice via ElevenLabs, all copy written fresh.

## 4. Tech

Vite + TypeScript + Canvas2D. **Zero runtime dependencies.** No Unity/Godot: the target is "loads in 2s on
a mid-range Android browser", and the whole game is 2D sprites, AABB collision, and a 1-D race integrator.
An engine would cost 20–40 MB of runtime for nothing.

- **Render:** fixed 320×180 logical backbuffer, nearest-neighbour integer-scaled, letterboxed. Sharp pixels at
  every device scale; identical layout on a 4K monitor and an iPhone SE.
- **Loop:** fixed 60 Hz simulation, decoupled render, accumulator with spiral-of-death clamp. Race sim is
  deterministic so a replay/ghost is free later.
- **Input:** one `Actions` struct fed by keyboard, Gamepad API, and touch. Touch controls only mount on
  coarse pointers; nothing else in the game knows which one is live.
- **Audio:** WebAudio, procedurally synthesised SFX at v1 (no asset weight, no licensing). ElevenLabs VO
  drops into `src/core/audio.ts` behind the same `play(id)` call.
- **Ship:** static build → Netlify. Play Store later via TWA, same as FORGE.

## 5. Physics model (the part that has to be right)

Race sim, 1-D, per fixed step, SI units:

```
F_thrust = powerCurve(v)              # from the power part
F_drag   = 0.5 * ρ * Cd * A * v²      # Cd from the nose, A from the body
F_roll   = Crr * m * g * cos(θ)       # Crr from wheels/tyres
F_grav   = m * g * sin(θ)             # track profile
a        = (F_thrust - F_drag - F_roll - F_grav) / m
```

Consequences that fall out for free, without special-casing:

- Drag scales with v² and rolling resistance doesn't, so **drag's share of the losses grows with speed**.
  On race 1 the split is 68% rolling / 32% drag; on race 3 it is 73% drag. Note the weaker claim: aero is
  never *irrelevant*, it just stops being the thing worth spending a part on. The first version of the
  parts table had car-sized frontal areas on 40 kg vehicles and drag was 91% of losses on every single
  track — the ladder was one lesson repeated five times. `test/harness.ts` now asserts the split per race,
  because this is invisible from reading the code.
- A heavier battery has more energy but worse `a` and worse hill-climb. Range vs. acceleration is a real
  trade, not a stat bar.
- Big wheels: lower `Crr`, higher rotational inertia (modelled as effective mass `m + I/r²`). Good on the
  rough track, bad off the line.

Post-race telemetry breaks the losing margin into seconds lost to drag / mass / rolling resistance /
climb. That is the tutor. The original never told you; we do, but only *after* you commit.

## 6. Content ladder (v1 = automotive, 5 races)

| Race | Track | Teaches | Rival build |
|---|---|---|---|
| 1 | 200 m flat | thrust > nothing | deliberately bad |
| 2 | 300 m flat | mass vs. thrust | light, weak |
| 3 | 400 m flat, fast | **aero** — first race where Cd decides it | pointed nose |
| 4 | 300 m + 8% climb | mass & torque on grade | heavy, torquey |
| 5 | 500 m mixed | full trade-off | near-optimal |

Puzzle difficulty scales with rank tier, not with race number, so a player who grinds parts isn't punished.

## 7. Repo map

```
src/
  core/      loop, canvas, input, audio, save, rng
  game/
    world/   warehouse tilemap, platformer physics, player, rival mob, crates
    puzzles/ registry + one module per domain, each a generator (seeded, infinite)
    build/   part catalog (physical stats), builder scene
    race/    deterministic sim, race scene, telemetry
    ui/      hud, modal, touch pad
  content/   brand, parts, tracks, levels, copy
```

## 8. Verification

`test/harness.ts` is not a unit-test suite; it asserts the *design*. The claims in §5 and §6 are
invisible from reading the source — a parts table where one variable swamps the others looks perfectly
reasonable until it's measured. It checks: every race is winnable from the parts actually reachable by
then; the lazy starter build is punished on races 2-5; the per-race loss breakdown matches the intended
lesson; the nodal solver against textbook series/parallel cases; and generator solvability and variety.

```
npx esbuild test/harness.ts --bundle --platform=node --format=esm --outfile=.tmp/h.mjs && node .tmp/h.mjs
```

Dev entry points for eyeballing a scene without playing to it:
`?scene=race&parts=all&race=2&ff=40` — jump to a scene, stock the profile, fast-forward 40 simulated
seconds. `?puzzle=gears` opens one generator directly. `ff` exists because Chrome's
`--virtual-time-budget` never advances under a `requestAnimationFrame` loop, so headless screenshots
otherwise only ever capture frame one.

## 9. v1 exit criteria

- Playable start→finish on desktop Chrome and mobile Safari, one hand, portrait or landscape.
- 5-race automotive ladder completable; losing is recoverable, never a dead end.
- 4 puzzle domains, seeded generators. Measured distinct instances per 200 draws (`test/harness.ts`):
  balance 58/140/193, circuits 78/168/200, gears 32/121/176 at tiers 0/3/6. **Machines is the outlier at
  20/28/28** — it's a fixed item bank, not a generator, and 28 items is thin. Either the bank grows to
  ~60 or the domain drops to a lower crate weighting before this ships to anyone.
- 60 fps on a 2019 mid-range Android.
- No original assets anywhere in the tree.

### Not yet done
- **Nobody has played this with hands.** Verified by headless screenshot and the physics harness only.
  Platformer feel (jump arc, spring height, gremlin aggression) is unjudged.
- No sprites. Every visual is procedural placeholder art from the palette.
- Touch controls are written but have never been touched.
- Machines item bank is thin (28 items) — see above.
- Alt-energy and aircraft ladders don't exist; automotive only.
