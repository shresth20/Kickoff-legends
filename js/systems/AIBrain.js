/* CPU opponent. Runs at 20 Hz and emits the same Intents as the keyboard.
 * Each tick: predict where the ball lands, hold a line between ball and own goal,
 * attack when the ball is close and heading away. KL.TUNING.ai.level (one fixed, easy level)
 * sets reaction delay, prediction error, header chance, super policy, how fast its legend runs
 * and shoots, when it sprints and how long it hesitates before a kick.
 * It reads the ball with the same flight model the ball flies by (KL.BallPhysics), so it judges a
 * long ball's carry, and before a strike it plays both kicks forward to see which one would beat the
 * goal from there: the straight kick (J) when it's on, the long kick (K) over a rival in the way, from
 * range, or to clear its own box. */
window.KL = window.KL || {};

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
    // the CPU's legend runs and shoots a little softer than a human's (Players are rebuilt every match)
    me.stats.speed *= this.level.moveSpeed ?? 1;
    me.stats.power *= this.level.kickPower ?? 1;
    this.getScore = getScore;
    this.getClock = getClock;
    this.acc = 0;
    this.intent = { ...KL.EMPTY_INTENT };
    this.queue = []; // decisions waiting out the reaction delay
    this.predictErr = 0;
    this.errTimer = 0;
    this.world = KL.BallPhysics.matchWorld(KL.TUNING);
    this.pendingKick = null; // { kind, until }: a strike decided, waiting for the ball (see update)
  }

  update(dt) {
    this.acc += dt;
    this.errTimer -= dt;
    if (this.errTimer <= 0) {
      this.errTimer = 0.6;
      this.predictErr = Phaser.Math.FloatBetween(-this.level.predictErrPx, this.level.predictErrPx);
    }
    const tick = 1 / KL.TUNING.ai.tickHz;
    const now = this.me.scene.time.now;
    if (this.acc >= tick) {
      this.acc -= tick;
      this.queue.push({ intent: this.think(), at: now + this.level.reactionMs });
      if (this.queue.length > 12) this.queue.shift();
      this.strikeThink(now);
    }
    let applied = false;
    while (this.queue.length && this.queue[0].at <= now) {
      this.intent = this.queue.shift().intent;
      applied = true;
    }
    if (!applied) this.intent = { ...this.intent, jump: false, kickLow: false, kickHigh: false, super: false };
    // A decided strike is swung once its reaction time is up, and only when the ball is actually at the
    // boot (or forehead) — like a player setting themselves; if it never comes within strikeWindowMs, the
    // CPU lets it go. (Swinging blind on a stale decision missed by a stride or more most of the time.)
    const pk = this.pendingKick;
    if (pk && (this.intent.super || now > pk.until || this.me.isActing)) this.pendingKick = null;
    else if (pk && now >= pk.at && this.ballInReach(pk.kind)) {
      this.intent = { ...this.intent, [pk.kind === 'low' ? 'kickLow' : 'kickHigh']: true };
      this.pendingKick = null;
    }
    return this.intent;
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
    const opts = { maxT: 2.5, spinR: this.ball.visR };
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
    const mouthX = attackDir === 1 ? T.world.width - T.world.wallPadding - T.goal.width : T.world.wallPadding + T.goal.width;
    const crossed = (s) => (s.x - mouthX) * attackDir >= 0;
    const s = KL.BallPhysics.simulate({ ...this.ballState(), ...shot }, T.ball, this.world, crossed, { maxT: 2.5, spinR: this.ball.visR });
    return crossed(s) && s.y > T.world.groundY - T.goal.openingHeight + T.ball.radius; // under the bar
  }

  /** Straight (J) or long (K) kick? */
  chooseKick(attackDir, ownGoalX) {
    const me = this.me, foe = this.foe;
    if (Math.abs(me.x - ownGoalX) < 300) return 'high'; // in our own box: clear it long
    const gap = (foe.x - me.x) * attackDir;
    const S = KL.TUNING.player.scale;
    if (gap > 0 && gap < 260 && foe.onFloor) {
      // a straight kick would hit them: loft it over if there's room, else take a chance either way
      return gap > 190 * S || Math.random() < 0.5 ? 'high' : 'low';
    }
    const low = this.wouldScore('low', attackDir), high = this.wouldScore('high', attackDir);
    if (low && high) return Math.random() < 0.7 ? 'low' : 'high';
    if (low !== high) return low ? 'low' : 'high';
    return Math.random() < 0.65 ? 'low' : 'high'; // nothing's on: drive it forward, now and then hoof it
  }

  think() {
    const T = KL.TUNING;
    const me = this.me, ball = this.ball;
    const ownGoalX = me.side === 'left' ? T.world.wallPadding : T.world.width - T.world.wallPadding;
    const attackDir = me.side === 'left' ? 1 : -1;
    const landX = this.predictLandingX() + this.predictErr;
    // distances measured against the player's body follow its size (T.player.scale); pitch-wide ones don't
    const S = T.player.scale;
    const dx = ball.x - me.x;
    const dy = me.y - 60 * S - ball.y;
    const vx = ball.body.velocity.x;
    const ballTowardMyGoal = Math.sign(vx) === -attackDir && Math.abs(vx) > 60;
    const ballOnMySide = Math.sign(ball.x - T.world.width / 2) === -attackDir;
    const intent = { ...KL.EMPTY_INTENT };

    let targetX;
    if (ballOnMySide || ballTowardMyGoal) {
      const behind = landX - attackDir * 70 * S;
      const guard = ownGoalX + attackDir * 150;
      targetX = attackDir === 1 ? Math.max(behind, guard) : Math.min(behind, guard);
      if (Math.abs(ball.x - ownGoalX) < 220) targetX = ball.x - attackDir * 40 * S;
    } else if (Math.abs(this.foe.x - ball.x) + this.level.keeperBias < Math.abs(me.x - ball.x)) {
      // the opponent will get there first: drop back between the ball and our goal instead of racing
      const guard = ownGoalX + attackDir * 170;
      const cover = ball.x - attackDir * 230;
      targetX = attackDir === 1 ? Math.max(guard, Math.min(cover, me.x)) : Math.min(guard, Math.max(cover, me.x));
    } else {
      targetX = landX - attackDir * 45 * S;
    }
    const diff = targetX - me.x;
    intent.moveX = Math.abs(diff) < 14 ? 0 : diff > 0 ? 1 : -1;
    intent.sprint = Math.abs(diff) > this.level.sprintPx || (ballTowardMyGoal && Math.abs(diff) > this.level.sprintDefendPx);

    // the ball is behind us (between us and our goal): hop over it to get goal-side instead of shoving it in
    const ballBehind = Math.sign(dx) === -attackDir && Math.abs(dx) > 20 * S;
    if (ballBehind && Math.abs(dx) < 150 * S && dy < 70 * S && me.onFloor) {
      intent.moveX = -attackDir;
      intent.jump = true;
    }

    const ballOverhead = Math.abs(dx) < 110 * S && dy > 60 * S && dy < 260; // (the top is jump height: unscaled)
    if (ballOverhead && me.onFloor && Math.random() < this.level.headerChance) intent.jump = true;
    // (strikes and headers: strikeThink, on a shorter fuse)

    if (me.onFloor && Math.abs(dx) < 140 * S && Math.sign(dx) === attackDir && this.superAllowed()) intent.super = true;
    return intent;
  }

  /** The super is charged and the policy says now's the time for it. */
  superAllowed() {
    if (!this.me.superReady) return false;
    const [a, b] = this.getScore();
    const mine = this.me.index === 0 ? a : b, theirs = this.me.index === 0 ? b : a;
    const pol = this.level.superPolicy;
    return pol === 'immediate' || (pol === 'trailing' && mine <= theirs) || (pol === 'late' && this.getClock() < 30);
  }

  /**
   * Strikes, read off the ball as it is now (movement runs on the slower reactionMs). A ball in reach
   * isn't struck at once: the CPU takes a moment (kickChance per decision), then swings strikeReactionMs
   * later — if the ball has come to the boot or the forehead by then (see update).
   */
  strikeThink(now) {
    const T = KL.TUNING, L = this.level;
    const me = this.me, ball = this.ball;
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
      if (inRange && facingBall && Math.random() < L.kickChance) kind = this.chooseKick(attackDir, ownGoalX);
    } else if (Math.abs(dx) < 120 * S && dy > 20 * S) kind = 'high'; // in the air: a header
    if (kind) this.pendingKick = { kind, at: now + L.strikeReactionMs, until: now + L.strikeReactionMs + L.strikeWindowMs };
  }

  destroy() {}
};
