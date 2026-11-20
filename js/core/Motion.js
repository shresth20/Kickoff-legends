/* Motion toolkit: the small pieces that make movement read smoothly at any frame rate.
 *  - damp / approach: frame-rate independent easing towards a target;
 *  - Spring: a damped spring for squash & stretch, lean and recoil (overshoots a little, then settles);
 *  - refresh tracking: the match steps its physics at the display's refresh rate, so a 120 Hz screen
 *    gets a new position every frame instead of the same one twice (the classic 60 Hz-physics judder).
 * Nothing here moves anything in the physics world; it only shapes how things look. */
window.KL = window.KL || {};

(() => {
  const TAU = Math.PI * 2;

  /** Exponential smoothing towards target; behaves the same at 30, 60 or 144 fps. lambda in 1/s. */
  const damp = (current, target, lambda, dt) => target + (current - target) * Math.exp(-lambda * dt);

  /** Step towards target by at most maxStep (linear acceleration / braking). */
  const approach = (current, target, maxStep) => (current < target ? Math.min(target, current + maxStep) : Math.max(target, current - maxStep));

  /** Shortest signed angle from a to b, in (−π, π]. */
  const angleDelta = (a, b) => {
    const d = (((b - a) % TAU) + TAU) % TAU;
    return d > Math.PI ? d - TAU : d;
  };

  /**
   * A damped spring pulled back to `target` (0 by default). Set `x` for an instant pose (a squash on
   * impact) or add to `v` for a push; step() lets it return with a natural overshoot.
   * hz: how fast it swings · damping: 0 wobbles forever, 1 returns without overshoot.
   */
  class Spring {
    constructor(hz, damping) {
      this.x = 0;
      this.v = 0;
      this.w = TAU * hz;
      this.z = damping;
    }
    step(dt, target = 0) {
      // sub-stepped semi-implicit Euler: stable and frame-rate independent for any dt we see
      let left = Math.min(dt, 0.1);
      while (left > 1e-6) {
        const h = Math.min(left, 1 / 240);
        this.v += (-this.w * this.w * (this.x - target) - 2 * this.z * this.w * this.v) * h;
        this.x += this.v * h;
        left -= h;
      }
      if (Math.abs(this.x - target) < 1e-4 && Math.abs(this.v) < 1e-3) {
        this.x = target;
        this.v = 0;
      }
      return this.x;
    }
    reset() {
      this.x = 0;
      this.v = 0;
    }
  }

  // ---- display refresh ------------------------------------------------------------------------
  const HZ_STEPS = [60, 75, 90, 100, 120, 144, 165, 240];
  /** The display refresh a measured frame rate most likely is (never below 60: a slow device still
   *  gets 60 Hz physics, run as two steps per frame). */
  const snapHz = (fps) => {
    if (!(fps > 0)) return 60;
    let best = HZ_STEPS[0];
    for (const h of HZ_STEPS) if (Math.abs(h - fps) < Math.abs(best - fps)) best = h;
    return best;
  };

  const deltas = new Float32Array(90);
  let count = 0, head = 0;
  /** Record raw frame times from the game loop (main.js calls this once). */
  const trackRefresh = (game) => {
    game.events.on('poststep', () => {
      const d = game.loop.rawDelta;
      if (!(d > 2 && d < 100)) return; // a stall or a background tab says nothing about the screen
      deltas[head] = d;
      head = (head + 1) % deltas.length;
      count = Math.min(count + 1, deltas.length);
    });
  };
  /** Physics rate for this display: the median frame time ignores the odd hitch. */
  const physicsHz = () => {
    if (count < 20) return 60;
    const s = Array.from(deltas.subarray(0, count)).sort((a, b) => a - b);
    return snapHz(1000 / s[s.length >> 1]);
  };

  KL.Motion = {
    damp,
    approach,
    angleDelta,
    Spring,
    snapHz,
    trackRefresh,
    physicsHz,
    /** OS "reduce motion": squash and after-images are toned down. */
    reduced: !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  };
})();
