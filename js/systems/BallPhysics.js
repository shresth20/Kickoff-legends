/* Ball physics that Arcade doesn't do: the air and the turf.
 *
 * Arcade integrates gravity and resolves the bounces (floor, posts, crossbar, walls). After every fixed
 * physics step (the world's `worldstep` event) js/entities/Ball.js hands the ball to step(), which adds:
 *  - air: quadratic drag, so a hard strike sheds pace faster than a floated pass but still carries, and
 *    the Magnus force of the ball's spin — topspin dips a driven shot, backspin holds a long ball up;
 *  - turf: rolling resistance (a constant brake plus a little linear), the spin locking onto the roll,
 *    and the skid of every bounce — friction at the contact point trades pace for spin, so a backspun
 *    long ball checks up when it lands while a topspun drive skips on;
 * launch() turns a kick into velocity + spin, and simulate() runs the same model forward (gravity,
 * floor and side walls included) so the CPU can read a ball's flight and the tests can measure it.
 * Pure functions, no Phaser: tests/ball-physics.test.mjs runs it in node. Numbers: KL.TUNING.ball. */
window.KL = window.KL || {};

(() => {
  const DEG = Math.PI / 180;

  /**
   * One fixed physics step of air / turf forces. `s` = { vx, vy, omega } (px/s, rad/s; omega > 0 turns
   * clockwise on screen, i.e. topspin for a ball going right) is changed in place.
   * contact: 'air' (flying) · 'roll' (on the turf) · 'bounce' (the step it landed).
   * cfg = KL.TUNING.ball; spinR = the radius the drawn ball rolls on; fireball = a super shot.
   */
  function step(s, dt, contact, cfg, spinR, fireball = false) {
    const A = cfg.air, T = cfg.turf;
    if (contact === 'air') {
      const sp = Math.hypot(s.vx, s.vy);
      const k = Math.exp(-(A.dragQuad * sp + A.dragLin) * (fireball ? A.fireballDrag : 1) * dt);
      s.vx *= k;
      s.vy *= k;
      if (!fireball) {
        // Magnus: perpendicular to the flight, turned by the spin (topspin pushes down, backspin lifts)
        let ax = -A.magnus * s.omega * s.vy, ay = A.magnus * s.omega * s.vx;
        const a = Math.hypot(ax, ay);
        if (a > A.magnusMax) (ax *= A.magnusMax / a), (ay *= A.magnusMax / a);
        s.vx += ax * dt;
        s.vy += ay * dt;
      }
      s.omega *= Math.exp(-A.spinDecay * dt);
    } else if (contact === 'bounce') {
      // the contact point slides at vx − ω·r; friction cuts that slide. For a hollow ball 2/5 of the
      // correction comes out of the pace and 3/5 goes into the spin.
      const u = s.vx - s.omega * spinR;
      s.vx -= 0.4 * u * T.bounceGrip;
      s.omega += (0.6 * u * T.bounceGrip) / spinR;
    } else {
      const dec = (T.roll + T.rollLin * Math.abs(s.vx)) * dt;
      s.vx = Math.abs(s.vx) <= dec ? 0 : s.vx - Math.sign(s.vx) * dec;
      const rolling = s.vx / spinR;
      s.omega = rolling + (s.omega - rolling) * Math.exp(-T.spinGrip * dt);
    }
    const max = cfg.maxSpin;
    if (s.omega > max) s.omega = max;
    else if (s.omega < -max) s.omega = -max;
  }

  /**
   * A boot (or head) strikes the ball. kind: 'low' (J, the driven straight kick) · 'high' (K, the long
   * kick) · 'header' · 'super'. dir ±1, power = the kicker's power stat, carryVx = the run-up passed on.
   * angleDeg overrides the kick's angle (headers aim by where the ball meets the head).
   * Returns { vx, vy, omega }.
   */
  function launch(kind, dir, power, carryVx, cfg, angleDeg) {
    const K = cfg.kicks[kind];
    const speed = K.speed * (kind === 'super' ? 1 : power);
    const a = (angleDeg ?? K.angleDeg) * DEG;
    return { vx: Math.cos(a) * speed * dir + carryVx, vy: -Math.sin(a) * speed, omega: dir * (K.spin || 0) };
  }

  /**
   * Run a ball forward with the full model. b = { x, y, vx, vy, omega }. world: { gravity, groundY,
   * minX, maxX } (minX / maxX: where the ball's centre meets the side walls). `until(state, t)` stops
   * the run when it returns true. Returns the last state with t, the first landing and the apex.
   */
  function simulate(b, cfg, world, until, opts = {}) {
    const hz = opts.hz || 60, dt = 1 / hz, maxT = opts.maxT ?? 3;
    const r = cfg.radius, spinR = opts.spinR ?? r, floorY = world.groundY - r;
    const s = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, omega: b.omega || 0, t: 0, landed: null, apexY: b.y };
    for (let t = dt; t <= maxT + 1e-9; t += dt) {
      // Arcade: gravity into the velocity, then the move, then the collisions
      s.vy += world.gravity * dt;
      const max = cfg.maxSpeed;
      s.vx = Math.max(-max, Math.min(max, s.vx));
      s.vy = Math.max(-max, Math.min(max, s.vy));
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      let contact = 'air';
      if (s.y >= floorY && s.vy > 0) {
        contact = s.vy > cfg.turf.bounceMinVy ? 'bounce' : 'roll';
        s.y = floorY;
        s.vy = -s.vy * cfg.bounce;
        if (contact === 'bounce' && !s.landed) s.landed = { x: s.x, t };
      } else if (s.y >= floorY - 0.5) contact = 'roll';
      if (s.x < world.minX) (s.x = world.minX), (s.vx = -s.vx * cfg.bounce);
      else if (s.x > world.maxX) (s.x = world.maxX), (s.vx = -s.vx * cfg.bounce);
      step(s, dt, contact, cfg, spinR, !!opts.fireball);
      if (s.y < s.apexY) s.apexY = s.y;
      s.t = t;
      if (until && until(s, t)) break;
      if (contact === 'roll' && s.vx === 0) break;
    }
    return s;
  }

  /** The world a match ball flies in (from KL.TUNING). */
  function matchWorld(T) {
    const W = T.world, r = T.ball.radius;
    return { gravity: W.gravity, groundY: W.groundY, minX: W.wallPadding + r, maxX: W.width - W.wallPadding - r };
  }

  KL.BallPhysics = { step, launch, simulate, matchWorld };
})();
