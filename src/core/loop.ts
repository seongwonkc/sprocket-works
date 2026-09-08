/**
 * Fixed-timestep simulation with decoupled render.
 *
 * The race sim integrates forces, so it must not see variable dt — a 144 Hz monitor would otherwise
 * produce different lap times than a 60 Hz one. Render gets an interpolation alpha for smoothing.
 */

export const STEP = 1 / 60;
/** Never simulate more than this many steps in one frame (tab-restore, breakpoint, GC pause). */
const MAX_STEPS = 5;

export type StepFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

export class Loop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  constructor(
    private readonly step: StepFn,
    private readonly render: RenderFn,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    const elapsed = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    this.acc += elapsed;

    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    // Backlog we refuse to chase: drop it rather than spiral.
    if (steps === MAX_STEPS) this.acc = 0;

    this.render(this.acc / STEP);
  };
}
