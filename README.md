# Sprocket Works

A remake in spirit of *Super Solvers: Gizmos & Gadgets!* (The Learning Company, 1993). Explore a
warehouse, solve physics puzzles to win vehicle parts, build a car, race it. Same loop, same subject
matter, all-original art, audio, names and code.

Working title — the name lives in `src/content/brand.ts` and renaming is a one-line change.

**Read [DESIGN.md](DESIGN.md) first.** It covers what the original actually is (decoded from the DOS
binary, not from memory), the legal position, the physics model, and what is deliberately *not* built.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit && vite build  ->  dist/
```

Zero runtime dependencies. The production bundle is ~69 kB (26 kB gzipped).

## Controls

| | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | ←→ / A D | stick or d-pad | on-screen pad |
| Jump | Space / Z | A | JUMP |
| Open a crate, confirm | E / Enter | Y | USE |
| Throw a bolt | Q / X | X | THRW |
| Back | Esc | B | — |

Touch controls mount only when a coarse pointer is seen, and only in the warehouse.

## Verify

The harness asserts the *design*, not just the code — that each race is winnable from the parts
reachable by then, that each race is decided by the variable it's supposed to teach, that the circuit
solver matches textbook series/parallel, and that every generated puzzle is solvable and varied.

```bash
npx esbuild test/harness.ts --bundle --platform=node --format=esm --outfile=.tmp/h.mjs && node .tmp/h.mjs
```

## Dev entry points

Query params, so you don't have to play to a scene to look at it:

| Param | Effect |
|---|---|
| `?scene=title\|warehouse\|build\|race` | start there |
| `?parts=all` | own every part, four slots filled |
| `?puzzle=balance\|circuit\|machines\|gears` | open that generator immediately |
| `?seed=42` `?rank=0-7` `?race=0-4` | pin the run state |
| `?ff=40` | advance 40 simulated seconds before the first frame |

`ff` exists because Chrome's `--virtual-time-budget` never advances under a `requestAnimationFrame`
loop, so a headless screenshot otherwise only ever captures frame one.

In the console, `__sprocket.telemetry()` dumps the structured event log for the session.

## Status

Playable start to finish: warehouse → puzzles → workshop → race → debrief → next race, five races,
saves and resumes. Verified by the physics harness and headless screenshots of every scene.

**Nobody has played it with hands yet.** Platformer feel and the touch controls are unjudged. All art is
procedural placeholder — no sprites, no voice. See the "Not yet done" list at the end of DESIGN.md.

## Licensing note

Abandonware is not public domain. Mechanics and physics aren't copyrightable and are fair to
reimplement; art, audio, character names, level layouts and literal text are not, and none of the
original's ship here. Extracted resource files stay outside this repo and `.gitignore` blocks them.
"Super Solvers" and "Gizmos & Gadgets" are avoided in the name and in all store/SEO copy.
