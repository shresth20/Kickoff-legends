/* CPU opponent. Runs at 20 Hz and emits the same Intents as the keyboard.
 * Each tick: predict where the ball lands, hold a line between ball and own goal,
 * attack when the ball is close and heading away. KL.TUNING.ai.level (one fixed, easy level)
 * sets reaction delay, prediction error, header chance, super policy, how fast its legend runs
 * and shoots, when it sprints and how long it hesitates before a kick. */
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
    }
    let applied = false;
    while (this.queue.length && this.queue[0].at <= now) {
      this.intent = this.queue.shift().intent;
      applied = true;
    }
    if (!applied) this.intent = { ...this.intent, jump: false, kickLow: false, kickHigh: false, super: false };
    return this.intent;
  }

  predictLandingX() {
    const T = KL.TUNING;
    const b = this.ball.body;
    const groundY = T.world.groundY - T.ball.radius;
    if (b.blocked.down || Math.abs(b.velocity.y) < 5) return this.ball.x + b.velocity.x * 0.25;
    const dy = groundY - this.ball.y;
    const disc = b.velocity.y ** 2 + 2 * T.world.gravity * dy;
    const t = disc > 0 ? (-b.velocity.y + Math.sqrt(disc)) / T.world.gravity : 0.3;
    let x = this.ball.x + b.velocity.x * Math.pow(T.ball.airDrag, t * 60) * t;
    const minX = T.world.wallPadding + 20, maxX = T.world.width - T.world.wallPadding - 20;
    if (x < minX) x = minX + (minX - x) * T.ball.bounce;
    if (x > maxX) x = maxX - (x - maxX) * T.ball.bounce;
    return x;
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
    if (!me.onFloor && Math.abs(dx) < 120 * S && dy > 20 * S) intent.kickHigh = true;

    const inRange = Math.abs(dx) < 120 * S && dy < 90 * S && dy > -40 * S;
    const facingBall = Math.sign(dx) === me.facing || Math.abs(dx) < 30 * S;
    // a ball in reach isn't struck at once: the CPU takes a moment (kickChance per decision)
    if (inRange && facingBall && me.onFloor && Math.random() < this.level.kickChance) {
      // lob over a close opponent or clear from our box; otherwise drive it low (with some variety)
      const foeBetween = Math.sign(this.foe.x - me.x) === attackDir && Math.abs(this.foe.x - me.x) < 240;
      const nearOwnGoal = Math.abs(me.x - ownGoalX) < 300;
      // drive it under a jumping opponent, and now and then anyway, so the CPU isn't predictable
      const lob = nearOwnGoal || (foeBetween && this.foe.onFloor && Math.random() < 0.7) || (!foeBetween && Math.random() < 0.25);
      if (lob) intent.kickHigh = true;
      else intent.kickLow = true;
      if (Math.sign(dx) !== attackDir && Math.abs(dx) > 30 * S) {
        intent.moveX = dx > 0 ? 1 : -1;
        intent.kickLow = false;
        intent.kickHigh = false;
      }
    }

    if (me.superReady && me.onFloor && Math.abs(dx) < 140 * S && Math.sign(dx) === attackDir) {
      const [a, b] = this.getScore();
      const mine = me.index === 0 ? a : b, theirs = me.index === 0 ? b : a;
      const pol = this.level.superPolicy;
      const ok = pol === 'immediate' || (pol === 'trailing' && mine <= theirs) || (pol === 'late' && this.getClock() < 30);
      if (ok) {
        intent.super = true;
        intent.kickLow = false;
        intent.kickHigh = false;
      }
    }
    return intent;
  }

  destroy() {}
};
