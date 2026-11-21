/* CPU opponent. Runs at 20 Hz and emits the same Intents as the keyboard.
 * Each tick: predict where the ball lands, hold a line between ball and own goal,
 * attack when the ball is close and heading away. KL.TUNING.ai.level (one fixed, easy level)
 * sets reaction delay, prediction error, header chance, super policy, how fast its legend runs
 * and shoots, when it sprints and how long it hesitates before a kick.
 * It reads the ball with the same flight model the ball flies by (KL.BallPhysics), so it judges a
 * long ball's carry, and before a strike it plays both kicks forward to see which one would beat the
 * goal from there: the straight kick (J) when it's on, the long kick (K) over a rival in the way, from
 * range, or to clear its own box.
 *
 * Personality (the rest of KL.TUNING.ai) — nothing it does is on a fixed script:
 *  - at the whistle it stands a random beat before it goes for the dropping ball;
 *  - each time it wins the ball it picks a plan: dribble it up the pitch (the body's hop-touches carry
 *    it; it shoots once inside a range picked for that run), shoot straight away, or loft it long — and
 *    a rival planted right in front ends a dribble with a strike;
 *  - it times its headers off the ball's flight, leaving the turf so the top of its jump meets the
 *    ball (when it fancies that one: headerChance, rolled once per ball coming over);
 *  - it never stands exactly on its mark (a fresh small offset every so often);
 *  - after a goal it may pop a reaction over its head. */
window.KL = window.KL || {};

(() => {
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
  /** A key of `weights` ({ name: weight }) picked in proportion to its weight; r ∈ [0, 1) (default random). */
  const pickWeighted = (weights, r = Math.random()) => {
    const keys = Object.keys(weights);
    const total = keys.reduce((s, k) => s + Math.max(0, weights[k]), 0);
    let x = r * total;
    for (const k of keys) {
      x -= Math.max(0, weights[k]);
      if (x < 0) return k;
    }
    return keys[keys.length - 1];
  };

  KL.AIBrain = class AIBrain {
    /**
     * @param {KL.Player} me @param {KL.Player} foe @param {KL.Ball} ball
     * @param {() => [number, number]} getScore @param {() => number} getClock seconds left
     */
    constructor(me, foe, ball, getScore, getClock) {
      this.me = me;
      this.foe = foe;
      this.ball = ball;
      this.level = KL.TUNING.ai.level;
      this.A = KL.TUNING.ai;
      // the CPU's legend runs and shoots a little softer than a human's (Players are rebuilt every match)
      me.stats.speed *= this.level.moveSpeed ?? 1;
      me.stats.power *= this.level.kickPower ?? 1;
      this.getScore = getScore;
      this.getClock = getClock;
      this.acc = 0;
      this.intent = { ...KL.EMPTY_INTENT };
      this.queue = []; // decisions waiting out the reaction delay
      this.decision = null; // the one being acted on: { targetX | moveX, sprint, jump, super } (see update)
      this.hopUntil = 0; // hopping over the ball to get goal-side of it (guardOwnGoal): held till it lands
      this.predictErr = 0;
      this.errTimer = 0;
      this.world = KL.BallPhysics.matchWorld(KL.TUNING);
      this.pendingKick = null; // { kind, until }: a strike decided, waiting for the ball (see update)
      this.pendingJump = 0; // a header jump decided, taken at this time (0: none) — see headerThink
      this.headerRoll = null; // { until, go }: one "do I go up for it?" per ball coming over
      this.wasFrozen = true; // frozen for a countdown: the next unfreeze is a kickoff
      this.holdUntil = 0; // standing a beat at the whistle
      this.plan = null; // this possession's plan: { kind: 'dribble' | 'shoot' | 'lob', shootAt }
      this.jitter = 0; // px off its mark…
      this.jitterUntil = 0; // …until then
      this.pressingSince = 0; // when it started running into the rival's body (see think)
      this.timers = [];
      this.goalOff = me.bus?.on('GOAL', (e) => this.onGoal(e));
    }

    update(dt) {
      const now = this.me.scene.time.now;
      // a countdown: nothing to do; the whistle after it: stand a beat (a fresh pick every kickoff),
      // and drop whatever was decided before it
      if (this.me.frozen) {
        this.wasFrozen = true;
        return { ...KL.EMPTY_INTENT };
      }
      if (this.wasFrozen) {
        this.wasFrozen = false;
        this.holdUntil = now + rand(...this.A.kickoffHoldMs);
        this.queue.length = 0;
        this.decision = null;
        this.hopUntil = 0;
        this.pendingKick = null;
        this.pendingJump = 0;
        this.plan = null;
      }
      if (now < this.holdUntil) return { ...KL.EMPTY_INTENT };

      this.acc += dt;
      this.errTimer -= dt;
      if (this.errTimer <= 0) {
        this.errTimer = 0.6;
        this.predictErr = Phaser.Math.FloatBetween(-this.level.predictErrPx, this.level.predictErrPx);
      }
      const tick = 1 / KL.TUNING.ai.tickHz;
      if (this.acc >= tick) {
        this.acc -= tick;
        this.queue.push({ intent: this.think(), at: now + this.level.reactionMs });
        if (this.queue.length > 12) this.queue.shift();
        this.strikeThink(now);
      }
      let fresh = null;
      while (this.queue.length && this.queue[0].at <= now) fresh = this.queue.shift().intent;
      if (fresh) this.decision = fresh;
      // A decision is where to go (targetX) or which way to run (moveX, while dribbling). The spot is
      // what's delayed by the reaction time; the run to it is steered from where the body is now, so it
      // stops on its mark. (Steering by where it stood a reaction time ago ran it a stride or two past its
      // mark — under a dropping ball and out the other side, leaving the ball behind it, between it and its
      // own goal.) Jump and super fire once, the moment their decision comes due.
      const d = this.decision;
      this.intent = { ...KL.EMPTY_INTENT };
      if (d) {
        const diff = d.targetX == null ? 0 : d.targetX - this.me.x;
        this.intent.moveX = d.targetX == null ? d.moveX : Math.abs(diff) < 14 ? 0 : Math.sign(diff);
        this.intent.sprint = d.sprint;
        if (fresh) (this.intent.jump = fresh.jump), (this.intent.super = fresh.super);
      }
      // A decided strike is swung once its reaction time is up, and only when the ball is actually at the
      // boot (or forehead) — like a player setting themselves; if it never comes within strikeWindowMs, the
      // CPU lets it go. (Swinging blind on a stale decision missed by a stride or more most of the time.)
      const pk = this.pendingKick;
      if (pk && (this.intent.super || now > pk.until || this.me.isActing)) this.pendingKick = null;
      else if (pk && now >= pk.at && this.ballInReach(pk.kind)) {
        this.intent = { ...this.intent, [pk.kind === 'low' ? 'kickLow' : 'kickHigh']: true };
        this.pendingKick = null;
      }
      // a header's jump, timed so the top of it meets the ball
      if (this.pendingJump && now >= this.pendingJump) {
        this.pendingJump = 0;
        if (this.me.onFloor && !this.me.isActing) this.intent = { ...this.intent, jump: true };
      }
      this.guardOwnGoal(now);
      return this.intent;
    }

    /**
     * Never shove the ball into its own net. With the ball between the CPU and its own goal, running back
     * at it only pushes it on goalwards (players face the rival's goal, so a body coming the wrong way is
     * all it can give it) — faster than it can chase, and in. So each frame, near the ball, it plays the
     * ball's flight forward against its own run: if the body would meet the ball from the pitch side, it
     * hops over it if the jump clears it, runs under it if the ball is that high, keeps closing in while
     * there's room (a hop may come clean in a stride or two), and otherwise stops and lets the ball be.
     * A footballer does this on instinct, so it's done in real time, not on the reaction delay; the hop is
     * flown out (run held homewards) so it lands past the ball.
     */
    guardOwnGoal(now) {
      const me = this.me, home = me.side === 'left' ? -1 : 1;
      if (now < this.hopUntil) {
        this.intent.moveX = home;
        this.intent.sprint = true;
        return;
      }
      if (!me.onFloor || me.isActing || me.superCharging > 0 || this.pendingJump || this.intent.jump) return;
      const ball = this.ball.body.center;
      if (Math.abs(ball.x - me.x) > 320) return;
      const path = this.ballPath(0.75);
      const asIs = { move: this.intent.moveX, sprint: this.intent.sprint, jump: false };
      const tAsIs = this.shoveTime(path, asIs, home).t;
      if (tAsIs === Infinity) return;
      const hop = { move: home, sprint: true, jump: true };
      const h = this.shoveTime(path, hop, home);
      if (h.t === Infinity && h.passed) {
        this.intent.moveX = home;
        this.intent.sprint = true;
        this.intent.jump = true;
        const P = KL.TUNING.player;
        this.hopUntil = now + ((2 * Math.abs(P.jumpVelocity * me.stats.jump)) / KL.TUNING.world.gravity) * 1000;
        return;
      }
      const under = { move: home, sprint: true, jump: false };
      if (this.shoveTime(path, under, home).t === Infinity) {
        this.intent.moveX = home;
        this.intent.sprint = true;
        return;
      }
      if (tAsIs > 0.12) return; // still room to close in
      this.intent.moveX = 0;
      this.intent.sprint = false;
    }

    /** The ball's next `secs`, one sample per 60th of a second (held still once it stops). */
    ballPath(secs) {
      const path = [];
      const n = Math.round(secs * 60);
      KL.BallPhysics.simulate(this.ballState(), KL.TUNING.ball, this.world, (s) => path.push({ x: s.x, y: s.y }) >= n, { maxT: secs + 0.05, spinR: this.ball.visR });
      while (path.length < n) path.push(path[path.length - 1] || { x: this.ball.body.center.x, y: this.ball.body.center.y });
      return path;
    }

    /**
     * Played against the ball's path, when (s from now) would the CPU's body, doing `plan` ({ move: -1|0|1,
     * sprint, jump }), first meet the ball while the ball is on its goal side — pushing it home? Infinity
     * if never on the path. passed: a jump lands with the body past the ball (goal-side of it).
     * The body moves by the same rules as KL.Player.step: run speed ramps at runAccel / runDecel (× airControl
     * off the turf), the jump at jumpVelocity under the players' gravity.
     */
    shoveTime(path, plan, home) {
      const T = KL.TUNING, P = T.player, me = this.me, pb = me.body, dt = 1 / 60;
      const hw = pb.halfWidth, bh = pb.height, r = T.ball.radius + 3, g = T.world.gravity, floor = pb.bottom;
      const target = plan.move * (plan.sprint ? P.sprintSpeed : P.runSpeed) * me.stats.speed;
      let x = pb.center.x, vx = pb.velocity.x, feet = floor, vy = 0, air = !!plan.jump, passed = !plan.jump;
      if (air) vy = P.jumpVelocity * me.stats.jump;
      for (let i = 0; i < path.length; i++) {
        const speedingUp = target !== 0 && Math.sign(target) === Math.sign(vx || target) && Math.abs(target) > Math.abs(vx);
        const rate = (speedingUp ? P.runAccel : P.runDecel) * (air ? P.airControl : 1);
        vx = KL.Motion.approach(vx, target, rate * dt);
        x += vx * dt;
        if (air) {
          vy += g * dt;
          feet += vy * dt;
          if (feet >= floor) {
            feet = floor;
            air = false;
            passed = (x - path[i].x) * home > 0;
          }
        }
        // the first touch decides it (the ball's path is the body's to change from there): from the pitch
        // side it's the CPU playing the ball, from the goal side it's a shove home
        const b = path[i];
        const nx = Math.max(x - hw, Math.min(b.x, x + hw)), ny = Math.max(feet - bh, Math.min(b.y, feet));
        if (Math.hypot(b.x - nx, b.y - ny) < r) return { t: (b.x - x) * home > 2 ? (i + 1) * dt : Infinity, passed };
      }
      return { t: Infinity, passed };
    }

    /** Will the ball be on the boot (or the forehead, in the air) when a strike started now makes contact? */
    ballInReach(kind) {
      const T = KL.TUNING, me = this.me, b = this.ball.body;
      const R = T.player.reach[kind === 'low' ? 'kick_low' : me.onFloor ? 'kick_high' : 'header'];
      const S = T.player.scale, lead = 0.07; // ~ the wind-up, in s
      const mx = me.x + me.body.velocity.x * lead * T.player.kickMove, my = me.y + (me.onFloor ? 0 : me.body.velocity.y * lead);
      const bx = b.center.x + b.velocity.x * lead, by = b.center.y + b.velocity.y * lead;
      return Math.hypot(mx + me.facing * R.x * S - bx, my - R.y * S - by) < R.r * S * 0.9;
    }

    /** The ball as the physics has it right now (the body's centre is a step fresher than the sprite). */
    ballState() {
      const b = this.ball.body;
      return { x: b.center.x, y: b.center.y, vx: b.velocity.x, vy: b.velocity.y, omega: this.ball.omega };
    }

    /** Where the ball comes down — or, rolling, where it will be in a quarter of a second. */
    predictLandingX() {
      const T = KL.TUNING;
      const b = this.ball.body;
      const opts = { maxT: 3.5, spinR: this.ball.visR }; // (a long ball hangs ~2 s)
      if (b.blocked.down && Math.abs(b.velocity.y) < T.ball.turf.bounceMinVy) {
        return KL.BallPhysics.simulate(this.ballState(), T.ball, this.world, (s, t) => t >= 0.25, opts).x;
      }
      const s = KL.BallPhysics.simulate(this.ballState(), T.ball, this.world, (st) => st.landed, opts);
      return s.landed ? s.landed.x : s.x;
    }

    /** Would this strike ('low' | 'high'), taken now, beat an empty goal? Plays the flight to the goal mouth. */
    wouldScore(kind, attackDir) {
      const T = KL.TUNING, me = this.me;
      const shot = KL.BallPhysics.launch(kind, attackDir, me.stats.power, me.body.velocity.x * T.ball.carry, T.ball);
      const mouthX = this.mouthX(attackDir);
      const crossed = (s) => (s.x - mouthX) * attackDir >= 0;
      const s = KL.BallPhysics.simulate({ ...this.ballState(), ...shot }, T.ball, this.world, crossed, { maxT: 3.5, spinR: this.ball.visR });
      return crossed(s) && s.y > T.world.groundY - T.goal.openingHeight + T.ball.radius; // under the bar
    }

    /** x of the goal mouth it attacks. */
    mouthX(attackDir) {
      const T = KL.TUNING;
      return attackDir === 1 ? T.world.width - T.world.wallPadding - T.goal.width : T.world.wallPadding + T.goal.width;
    }

    /** Would a long kick (K), taken now, sail over the rival's head? Plays the flight to their body. */
    wouldClear(attackDir) {
      const T = KL.TUNING, me = this.me, fb = this.foe.body, r = T.ball.radius;
      const shot = KL.BallPhysics.launch('high', attackDir, me.stats.power, me.body.velocity.x * T.ball.carry, T.ball);
      const nearX = attackDir === 1 ? fb.left : fb.right;
      const reached = (s) => (s.x + r * attackDir - nearX) * attackDir >= 0;
      const s = KL.BallPhysics.simulate({ ...this.ballState(), ...shot }, T.ball, this.world, (st) => reached(st) || st.landed, { maxT: 2, spinR: this.ball.visR });
      return reached(s) && s.y + r < fb.top - 4;
    }

    /** Straight (J) or long (K) kick? */
    chooseKick(attackDir, ownGoalX) {
      const me = this.me, foe = this.foe;
      if (Math.abs(me.x - ownGoalX) < 300) return 'high'; // in our own box: clear it long
      const gap = (foe.x - me.x) * attackDir;
      if (gap > 0 && gap < 260 && foe.onFloor) {
        // a straight kick would hit them: loft it over if it clears their head, else take a chance either way
        return this.wouldClear(attackDir) || Math.random() < 0.5 ? 'high' : 'low';
      }
      const low = this.wouldScore('low', attackDir), high = this.wouldScore('high', attackDir);
      if (low && high) return Math.random() < 0.7 ? 'low' : 'high';
      if (low !== high) return low ? 'low' : 'high';
      return Math.random() < 0.65 ? 'low' : 'high'; // nothing's on: drive it forward, now and then hoof it
    }

    /**
     * Has the CPU got the ball — on or just off the turf, right in front of its boots? A new possession
     * picks a plan (weighted, KL.TUNING.ai.plans) and, for a dribble, how close it carries the ball before
     * shooting. The plan lapses once the ball is gone.
     */
    updatePossession(attackDir) {
      const T = KL.TUNING, S = T.player.scale, me = this.me, ball = this.ball, A = this.A;
      const ahead = (ball.x - me.x) * attackDir;
      const low = ball.y > T.world.groundY - 110 * S; // about knee height and below: a hop-touch stays in
      const has = me.onFloor && low && ahead > -10 * S && ahead < 130 * S;
      if (!has) {
        if (this.plan && Math.abs(ball.x - me.x) > 220 * S) this.plan = null;
        return false;
      }
      if (!this.plan) this.plan = { kind: pickWeighted(A.plans), shootAt: rand(...A.shootRangePx) };
      return true;
    }

    think() {
      const T = KL.TUNING, A = this.A;
      const me = this.me, ball = this.ball;
      const now = me.scene.time.now;
      const ownGoalX = me.side === 'left' ? T.world.wallPadding : T.world.width - T.world.wallPadding;
      const attackDir = me.side === 'left' ? 1 : -1;
      const landX = this.predictLandingX() + this.predictErr;
      // distances measured against the player's body follow its size (T.player.scale); pitch-wide ones don't
      const S = T.player.scale;
      const dx = ball.x - me.x;
      const vx = ball.body.velocity.x;
      const ballTowardMyGoal = Math.sign(vx) === -attackDir && Math.abs(vx) > A.towardGoalVx;
      const ballOnMySide = Math.sign(ball.x - T.world.width / 2) === -attackDir;
      const intent = { ...KL.EMPTY_INTENT };
      let carrying = this.updatePossession(attackDir) && this.plan.kind === 'dribble';
      // a rival planted right in front: no dribbling through them (that just pins the ball between the two
      // bodies) — set the ball up and chip it over them instead
      const gap = (this.foe.x - me.x) * attackDir;
      if (carrying && gap > 0 && gap < A.blockPx && this.foe.onFloor) {
        this.plan.kind = 'lob';
        carrying = false;
      }

      let targetX;
      if (carrying) {
        // dribbling: run on through the ball towards their goal; the body's touches hop it along
        targetX = ball.x + attackDir * 60 * S;
      } else if (ballOnMySide || ballTowardMyGoal) {
        const behind = landX - attackDir * 70 * S;
        const guard = ownGoalX + attackDir * 150;
        targetX = attackDir === 1 ? Math.max(behind, guard) : Math.min(behind, guard);
        // however it misreads the bounce, it stays goal-side of the ball (getting caught on the wrong side
        // of a floating ball meant shepherding it into its own net)
        const goalSide = ball.x - attackDir * 40 * S;
        targetX = attackDir === 1 ? Math.min(targetX, goalSide) : Math.max(targetX, goalSide);
        if (Math.abs(ball.x - ownGoalX) < 220) targetX = goalSide;
      } else if (this.foeContests() && Math.abs(this.foe.x - ball.x) + this.level.keeperBias < Math.abs(me.x - ball.x)) {
        // the opponent will get there first: drop back between the ball and our goal instead of racing
        // (a loose ball nobody is going for, it goes and takes)
        const guard = ownGoalX + attackDir * 170;
        const cover = ball.x - attackDir * 230;
        targetX = attackDir === 1 ? Math.max(guard, Math.min(cover, me.x)) : Math.min(guard, Math.max(cover, me.x));
      } else {
        targetX = landX - attackDir * 45 * S;
      }
      // never exactly on its mark — but no wandering while carrying the ball or guarding the goalmouth
      if (!carrying && Math.abs(ball.x - ownGoalX) > 260) {
        if (now > this.jitterUntil) {
          this.jitter = rand(-A.jitterPx, A.jitterPx);
          this.jitterUntil = now + rand(...A.jitterMs);
        }
        targetX += this.jitter;
      }
      // dribbling, it just runs on through the ball; otherwise the decision is the spot (update() steers to it)
      if (!carrying) intent.targetX = targetX;
      const diff = targetX - me.x;
      intent.moveX = Math.abs(diff) < 14 ? 0 : diff > 0 ? 1 : -1;
      // (a sprint would run away from its own touches: dribbling is done at a jog). A ball running at its
      // goal with the CPU on the wrong side of it is a race: it sprints to get back past it
      const beaten = ballTowardMyGoal && (ball.x - me.x) * attackDir < 0;
      intent.sprint = !carrying && (beaten || Math.abs(diff) > this.level.sprintPx || (ballTowardMyGoal && Math.abs(diff) > this.level.sprintDefendPx));
      // (a ball behind it — between it and its own goal — is got past by guardOwnGoal, in real time)

      // running into the rival's body and getting nowhere (they won't shift): hop over them
      const foe = this.foe, toFoe = Math.sign(foe.x - me.x);
      const pressing = me.onFloor && intent.moveX === toFoe && Math.abs(foe.x - me.x) < T.player.bodyWidth * S + 8 && Math.abs(me.body.velocity.x) < 40;
      if (!pressing) this.pressingSince = 0;
      else if (!this.pressingSince) this.pressingSince = now;
      else if (now - this.pressingSince > A.unstickMs) {
        intent.jump = true;
        this.pressingSince = 0;
      }
      // (strikes and headers: strikeThink / headerThink, on a shorter fuse)

      if (me.onFloor && Math.abs(dx) < 140 * S && Math.sign(dx) === attackDir && this.superAllowed()) intent.super = true;
      return intent;
    }

    /** Is the opponent going for the ball — on it already, or running at it? */
    contestsBall(p) {
      const S = KL.TUNING.player.scale, ball = this.ball, v = p.body.velocity.x;
      return Math.abs(p.x - ball.x) < 150 * S || (Math.abs(v) > 60 && Math.sign(v) === Math.sign(ball.x - p.x));
    }
    foeContests() {
      return this.contestsBall(this.foe);
    }

    /** The super is charged and the policy says now's the time for it (think() fires it at the first shot
     * it gets: on the turf, at the ball, facing the rival's goal). 'immediate': whenever · 'trailing': only
     * level or behind · 'late': only in the last 30 s · 'chance': level or behind, or in the last 30 s — it
     * doesn't sit on a charged meter, but a CPU in front keeps it to close the match out. */
    superAllowed() {
      if (!this.me.superReady) return false;
      const [a, b] = this.getScore();
      const mine = this.me.index === 0 ? a : b, theirs = this.me.index === 0 ? b : a;
      const pol = this.level.superPolicy, late = this.getClock() < 30;
      return pol === 'immediate' || (pol === 'trailing' && mine <= theirs) || (pol === 'late' && late) || (pol === 'chance' && (mine <= theirs || late));
    }

    /**
     * Strikes, read off the ball as it is now (movement runs on the slower reactionMs). A ball in reach
     * isn't struck at once: the CPU takes a moment (kickChance per decision), then swings strikeReactionMs
     * later — if the ball has come to the boot or the forehead by then (see update). With the ball at its
     * feet, the possession's plan decides whether it strikes at all yet (planKick).
     */
    strikeThink(now) {
      const T = KL.TUNING, L = this.level;
      const me = this.me, ball = this.ball;
      this.headerThink(now);
      if (this.pendingKick || me.isActing || me.superCharging > 0 || this.superAllowed()) return; // that super is think()'s
      const S = T.player.scale;
      const ownGoalX = me.side === 'left' ? T.world.wallPadding : T.world.width - T.world.wallPadding;
      const attackDir = me.side === 'left' ? 1 : -1;
      const dx = ball.x - me.x;
      const dy = me.y - 60 * S - ball.y;
      let kind = null;
      if (me.onFloor) {
        const inRange = Math.abs(dx) < 120 * S && dy < 90 * S && dy > -40 * S;
        const facingBall = Math.sign(dx) === me.facing || Math.abs(dx) < 30 * S;
        if (inRange && facingBall && Math.random() < L.kickChance) kind = this.planKick(attackDir, ownGoalX);
      } else if (Math.abs(dx) < 120 * S && dy > 20 * S) kind = 'high'; // in the air: a header
      if (kind) this.pendingKick = { kind, at: now + L.strikeReactionMs, until: now + L.strikeReactionMs + L.strikeWindowMs };
    }

    /** A ball at the boot, by this possession's plan: 'low' | 'high', or null to keep dribbling it. */
    planKick(attackDir, ownGoalX) {
      const plan = this.plan, me = this.me;
      if (!plan || Math.abs(me.x - ownGoalX) < 300) return this.chooseKick(attackDir, ownGoalX); // loose ball / own box
      if (plan.kind === 'lob') return 'high';
      if (plan.kind === 'dribble') {
        const gap = (this.foe.x - me.x) * attackDir;
        const blocked = gap > 0 && gap < this.A.blockPx && this.foe.onFloor;
        if (!blocked && (this.mouthX(attackDir) - me.x) * attackDir > plan.shootAt) return null;
      }
      return this.chooseKick(attackDir, ownGoalX);
    }

    /**
     * Headers, timed off the ball's flight: where will it come down through heading height (the forehead
     * at the top of a jump)? If that's within reach and it's time to go — the strike reaction plus the
     * climb to the top of the jump, a touch early (headerLeadS) — the CPU jumps, if it fancies this one.
     * In the air, strikeThink nods it (K) once the ball is at the forehead.
     */
    headerThink(now) {
      const T = KL.TUNING, L = this.level, A = this.A, me = this.me;
      if (this.pendingJump || !me.onFloor || me.isActing || me.superCharging > 0) return;
      const S = T.player.scale, R = T.player.reach.header;
      const b = this.ball.body;
      const vJump = Math.abs(T.player.jumpVelocity * me.stats.jump), g = T.world.gravity;
      const climb = vJump / g; // s to the top of the jump
      const headY = me.y - R.y * S - (vJump * vJump) / (2 * g); // the forehead at the top of the jump
      // nothing coming over: too far off, or already below heading height
      if (Math.abs(b.center.x - me.x) > 420 || b.center.y > me.y - R.y * S) return;
      const down = (s) => s.vy > 0 && s.y >= headY;
      const s = KL.BallPhysics.simulate(this.ballState(), T.ball, this.world, down, { maxT: 1.5, spinR: this.ball.visR });
      if (!down(s)) return;
      const reachX = me.x + me.facing * R.x * S;
      if (Math.abs(s.x - reachX) > R.r * S * 1.1) return;
      const wait = s.t - (L.strikeReactionMs / 1000 + climb - A.headerLeadS);
      if (wait < 0 || wait >= 1 / A.tickHz) return;
      if (!this.headerRoll || now > this.headerRoll.until) this.headerRoll = { until: now + 700, go: Math.random() < L.headerChance };
      if (this.headerRoll.go) this.pendingJump = now + L.strikeReactionMs;
    }

    /** After a goal it may pop a reaction over its head (KL.TUNING.ai.emote), a moment later. */
    onGoal(e) {
      const E = this.A.emote, scored = e.scorer === this.me.index;
      if (Math.random() >= (scored ? E.scoreChance : E.concedeChance)) return;
      const me = this.me;
      this.timers.push(me.scene.time.delayedCall(rand(...E.delayMs), () => me.bus.emit('EMOTE', { player: me.index, index: pickOne(scored ? E.score : E.concede) })));
    }

    destroy() {
      this.goalOff?.();
      this.timers.forEach((t) => t.remove(false));
      this.timers.length = 0;
    }
  };

  KL.AIBrain.pickWeighted = pickWeighted;
})();
