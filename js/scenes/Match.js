/* Match scene: owns the world, entities, systems and the EventBus. HUD, FX and
 * audio subscribe to the bus; input sources (keyboard/AI) feed Player intents. */
window.KL = window.KL || {};

KL.MatchScene = class MatchScene extends Phaser.Scene {
  constructor() {
    super('Match');
  }

  init(data) {
    this.cfg = { p1Char: data.p1Char || 'char_01', p2Char: data.p2Char || 'char_02', night: !!data.night };
  }

  create() {
    const W = KL.TUNING.world;
    this.bus = new KL.EventBus();
    this.rules = new KL.MatchRules();
    this.stats = { shots: [0, 0], headers: [0, 0], supers: [0, 0] };
    this.paused = false;
    this.ended = false;
    this.anims.resumeAll(); // the animation manager is game-wide; never inherit a pause from a previous match

    this.physics.world.gravity.y = W.gravity;
    this.physics.world.setBounds(W.wallPadding, -400, W.width - W.wallPadding * 2, W.groundY + 400);
    // one physics step per displayed frame (60, 120, 144 Hz…): a 120 Hz screen otherwise shows every
    // position twice and the ball judders. Re-checked now and then (the window may change screens).
    // preStep() keeps it at exactly one step a frame, and runs slow motion as shorter steps.
    this.speed = 1; // game speed: goal slow-mo × a strike's hit-stop dip (see applySpeed)
    this.physHz = KL.Motion.physicsHz();
    KL.Motion.setStepRate(this.physics.world, this.physHz, 1);
    this.hzCheckMs = 0;
    this.slowMo = null;
    this.hitDip = null;
    this.drift = 0; // how far the far stadium layers have drifted with the ball (parallax), eased
    this.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.preStep, this);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.postStep, this);

    const defs = [KL.CHARACTERS.find((c) => c.id === this.cfg.p1Char), KL.CHARACTERS.find((c) => c.id === this.cfg.p2Char)];
    this.defs = defs;
    // half the crowd supports each player (their flags in that player's kit)
    this.stadium = KL.Stadium.build(this, { night: this.cfg.night, parallax: true, bus: this.bus, teams: defs.map((d) => d.kit) });
    this.goals = [new KL.Goal(this, 'left'), new KL.Goal(this, 'right')];
    this.ball = new KL.Ball(this, W.width / 2, W.groundY - 200);
    this.players = [new KL.Player(this, 0, defs[0], 'left', W.width * 0.3, this.bus), new KL.Player(this, 1, defs[1], 'right', W.width * 0.7, this.bus)];
    KL.GroundShadow.addAll(this, this.players, this.ball, this.cfg.night);
    // floor
    this.floor = this.physics.add.staticImage(W.width / 2, W.groundY + 40, '__DEFAULT').setVisible(false);
    this.floor.setDisplaySize(W.width + 400, 80).refreshBody();

    this.physics.add.collider(this.ball, this.floor);
    this.physics.add.collider(this.players, this.floor);
    // players block each other but can't shove the other one around (no bulldozing a keeper into the net),
    // and can't stand on each other's heads (see playerContact)
    this.players.forEach((p) => (p.body.pushable = false));
    this.physics.add.collider(this.players[0], this.players[1], null, this.playerContact, this);
    this.goals.forEach((g, i) => {
      // the crossbar rings / the back post shakes the net, as hard as the ball's velocity changed
      this.physics.add.collider(this.ball, g.statics, (ball, part) => {
        const v = ball.body.velocity;
        this.bus.emit('FRAME_HIT', { goal: i, part: part === g.bar ? 'bar' : 'post', x: ball.x, y: ball.y, dv: Math.hypot(v.x - ball.prevVx, v.y - ball.prevVy) });
        g.bump(ball);
      });
      this.physics.add.collider(this.players, g.statics);
    });

    // input sources: Player 1's keys + on-screen controller (drawn and touched in the HUD); the CPU
    const c = KL.Save.settings.controls;
    this.pads = [new KL.VirtualPad()];
    this.inputs = [new KL.KeyboardInput(this, c.p1, this.pads[0])];
    this.inputs[1] = new KL.AIBrain(this.players[1], this.players[0], this.ball, () => this.rules.state.score, () => this.rules.secondsLeft);

    this.fx = new KL.FX(this, this.bus);
    this.wireAudio();
    // reactions picked in the HUD drawer pop up over that player's head
    this.headEmotes = new KL.HeadEmotes(this, this.players);
    this.emoteOff = this.bus.on('EMOTE', (e) => this.headEmotes.show(e.player, e.index));
    this.scene.launch('HUD', { bus: this.bus, cfg: this.cfg, defs, pads: this.pads });
    this.scene.bringToTop('HUD');
    KL.audio?.playMusic('match');

    this.input.keyboard.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard.on('keydown-P', () => this.togglePause());
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    // the camera stays put on the view (KL.View, set by HiDPIPlugin): no bounds, nothing scrolls it

    // a phone turned upright or a hidden tab / app switch pauses a live match (resume from the menu)
    this.autoPause = () => !this.paused && !this.ended && this.togglePause();
    this.onOrientation = (portrait) => portrait && this.autoPause();
    KL.View.events.on('orientation', this.onOrientation);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.autoPause);
    if (KL.View.portrait) this.time.delayedCall(0, this.autoPause);

    this.kickoff(true);
    KL.fadeIn(this);
  }

  /** Match stats from the bus, and the match's sound: KL.AudioDirector (js/audio/Director.js) reads
   * the bus and the live state and drives the crowd, effects, voices, commentary and music. */
  wireAudio() {
    this.audioOffs = [
      this.bus.on('KICK', (e) => {
        if (e.kind === 'header') this.stats.headers[e.player]++;
        else if (e.kind === 'super') this.stats.supers[e.player]++;
        else if (e.kind !== 'clash') this.stats.shots[e.player]++;
      }),
    ];
    this.audioDirector = KL.audio ? new KL.AudioDirector(this, this.bus) : null;
  }

  kickoff(first) {
    const W = KL.TUNING.world;
    this.players[0].resetTo(W.width * 0.3);
    this.players[1].resetTo(W.width * 0.7);
    this.ball.resetTo(W.width / 2, W.groundY - 220);
    this.squirting = false;
    this.players.forEach((p) => (p.frozen = true));
    if (!first) this.rules.state.phase = 'countdown';
    this.countdownShown = false;
  }

  togglePause() {
    if (this.ended || this.scene.isActive('Settings')) return;
    this.paused = !this.paused;
    this.pads.forEach((p) => p.clear()); // a finger left on a button must not keep running after the pause
    if (this.paused) {
      this.physics.world.pause();
      this.anims.pauseAll();
      this.scene.launch('Pause', { match: this });
      this.scene.bringToTop('Pause');
      KL.audio?.duck(true);
    } else {
      this.scene.stop('Pause');
      this.physics.world.resume();
      this.anims.resumeAll();
      KL.audio?.duck(false);
    }
    this.bus.emit('PAUSE', { paused: this.paused });
  }

  /**
   * Before the physics step (PRE_UPDATE). Advances the game speed — the goal slow-mo and a strike's
   * hit-stop dip; it runs even once the match has ended, as a golden goal ends it mid slow-mo and that
   * must still ease out — and keeps the physics at exactly one step per displayed frame.
   */
  preStep(time, delta) {
    if (this.paused) return;
    if (this.slowMo || this.hitDip) {
      if (this.slowMo) this.advanceSlowMo(delta);
      if (this.hitDip) this.advanceHitDip(delta);
      this.applySpeed();
    }
    KL.Motion.lockStepPhase(this.physics.world);
  }

  /** After the bodies have moved their sprites (POST_UPDATE): whatever follows a player goes with them. */
  postStep() {
    this.headEmotes?.update();
  }

  update(time, delta) {
    if (this.paused || this.ended) return;
    const dt = Math.min(delta, 50) / 1000;
    const W = KL.TUNING.world;

    if ((this.hzCheckMs += delta) > 2000) {
      this.hzCheckMs = 0;
      const hz = KL.Motion.physicsHz();
      if (hz !== this.physHz) {
        this.physHz = hz;
        KL.Motion.setStepRate(this.physics.world, hz, this.speed);
      }
    }

    // rules
    for (const ev of this.rules.tick(delta)) {
      if (ev.type === 'kickoff') {
        this.players.forEach((p) => (p.frozen = false));
        this.bus.emit('WHISTLE', { reason: 'kickoff' });
      } else if (ev.type === 'reset') {
        this.kickoff(false);
      } else if (ev.type === 'clock') {
        this.bus.emit('CLOCK', { secondsLeft: ev.secondsLeft, suddenDeath: this.rules.state.suddenDeath });
      } else if (ev.type === 'suddendeath') {
        this.kickoff(false);
        this.rules.state.phase = 'suddendeath_countdown';
        this.bus.emit('WHISTLE', { reason: 'suddendeath' });
      } else if (ev.type === 'fulltime') {
        this.endMatch();
        return;
      }
    }

    // intents → players
    for (let i = 0; i < 2; i++) {
      this.players[i].intent = this.inputs[i].update(dt);
      this.players[i].step(this.ball, dt);
    }
    this.slipOffHeads();

    // bodies block the ball (heads bounce it, chests trap it); the super ball ignores the victim
    if (!this.ball.isSuper) this.ballVsBodies();

    // super ball hurts the opponent it passes through
    if (this.ball.isSuper && this.ball.lastKicker !== null) {
      const victim = this.players[1 - this.ball.lastKicker];
      if (victim.state !== 'hurt' && this.physics.overlap(victim, this.ball)) victim.hurt();
    }

    // a ball resting on a crossbar rolls off towards the pitch (the bar top acts sloped), so it can't park there
    const G = KL.TUNING.goal;
    if (this.ball.body.blocked.down && this.ball.y < W.groundY - G.openingHeight) {
      const toField = this.ball.x < W.width / 2 ? 1 : -1;
      if (this.ball.body.velocity.x * toField < 140) this.ball.body.velocity.x = toField * 140;
    }

    // goals
    if (this.rules.isPlaying) {
      for (let g = 0; g < 2; g++) {
        if (this.goals[g].contains(this.ball.x, this.ball.y)) {
          const scorer = g === 0 ? 1 : 0; // ball in left goal → right player scores
          this.onGoal(scorer, g);
          break;
        }
      }
    }

    // a ball in (or passing behind) a goal's near side netting is drawn behind it
    this.ball.setBehindNet(this.goals.some((g) => g.hides(this.ball)));

    // the far stadium layers drift a few px with the ball (parallax), eased so they glide with it rather
    // than twitching at every bounce. (The camera itself stays put: its bounds are the view.)
    const targetX = Phaser.Math.Clamp(this.ball.x, W.width / 2 - 60, W.width / 2 + 60);
    this.drift = KL.Motion.damp(this.drift, (targetX - W.width / 2) * 0.05, 4, dt);
    this.stadium.update(this.drift);
  }

  /**
   * Player vs player process callback. Side by side they block each other as usual (Arcade separates
   * them sideways). But nobody lands on a head: Arcade would treat the head as floor, so the top player
   * could stand there and jump again, and each flicker of the contact was a fresh landing with its own
   * dust cloud. So feet that meet a head from above are only held on it for this step, never grounded,
   * and slipOffHeads() slides them off.
   */
  playerContact(a, b) {
    const [top, under] = a.body.bottom <= b.body.bottom ? [a, b] : [b, a];
    const tb = top.body, ub = under.body;
    // feet coming down onto the head (not rising past it), no deeper in than this step's movement:
    // they met from above. Otherwise it's side by side
    if (tb.deltaY() < ub.deltaY()) return true;
    if (tb.bottom - ub.top > tb.deltaAbsY() + ub.deltaAbsY() + this.physics.world.OVERLAP_BIAS) return true;
    tb.y = ub.top - tb.height;
    tb.updateCenter();
    tb.velocity.y = Math.min(tb.velocity.y, ub.velocity.y); // a head jumping up carries them with it
    return false;
  }

  /** Runs after both players' step(): anyone whose feet are on the other's head slides off it. */
  slipOffHeads() {
    const [a, b] = this.players;
    for (const [top, under] of [[a, b], [b, a]]) {
      if (top.isOnHeadOf(under)) top.slipOff(under);
      else top.slipDir = 0;
    }
  }

  /**
   * Ball vs both bodies, with the same result whichever player is checked first (resolving one after
   * the other let the second one always win: it shoved the ball back into the first, which then popped
   * it out behind them). Pinned between the two, touching both or pushed out of one straight into the
   * other, it's a scrum: see squirt().
   */
  ballVsBodies() {
    // a ball just struck leaves through the kicker's own legs (else a strike from close in was shoved
    // sideways, or popped out over the kicker's head)
    const touch = this.players.map((p, i) => !this.ball.passesThrough(i) && this.ballTouches(p));
    if (this.squirting) {
      // on its way out of a scrum: through both bodies until it's clear of them (or drops back)
      if (touch.some(Boolean) && this.ball.body.velocity.y < 0) return;
      this.squirting = false;
    }
    if (touch[0] && touch[1]) return this.squirt();
    const i = touch.indexOf(true);
    if (i < 0) return;
    this.resolveBallBody(this.players[i]);
    if (!this.ball.passesThrough(1 - i) && this.ballTouches(this.players[1 - i])) this.squirt();
  }

  /** Scrum: the ball pops straight up out from between the players, favouring neither side, and
   * passes through both bodies until it's clear of their heads. Whoever heads or kicks it next wins it. */
  squirt() {
    const bb = this.ball.body;
    bb.velocity.x = 0;
    bb.velocity.y = Math.min(bb.velocity.y, -KL.TUNING.body.squeezePop);
    this.squirting = true;
    this.ball.lastTouchKind = 'body';
  }

  ballTouches(p) {
    const bb = this.ball.body, pb = p.body, r = bb.halfWidth;
    const cx = bb.position.x + r, cy = bb.position.y + r;
    const nx = Phaser.Math.Clamp(cx, pb.position.x, pb.position.x + pb.width), ny = Phaser.Math.Clamp(cy, pb.position.y, pb.position.y + pb.height);
    return Math.hypot(cx - nx, cy - ny) < r;
  }

  /** Circle (ball) vs rectangle (player body) with velocity-relative bounce. Runs after the physics step. */
  resolveBallBody(p) {
    const ball = this.ball;
    if (ball.isSuper) return; // super shots pass through (the victim gets hurt instead)
    const bb = ball.body, pb = p.body, T = KL.TUNING;
    const r = bb.halfWidth;
    const cx = bb.position.x + r, cy = bb.position.y + r;
    const left = pb.position.x, right = left + pb.width, top = pb.position.y, bottom = top + pb.height;
    const nx = Phaser.Math.Clamp(cx, left, right), ny = Phaser.Math.Clamp(cy, top, bottom);
    let dx = cx - nx, dy = cy - ny;
    let d = Math.hypot(dx, dy);
    if (d >= r) return;
    let pen;
    if (d < 0.0001) {
      // centre inside the body (it was rammed in): always leave over the top, never out the far side
      dx = 0;
      dy = -1;
      d = 1;
      pen = cy - top + r;
    } else pen = r - d;
    const n = { x: dx / d, y: dy / d };
    bb.position.x += n.x * pen;
    bb.position.y += n.y * pen;
    const B = T.body;
    const rvx = bb.velocity.x - pb.velocity.x, rvy = bb.velocity.y - pb.velocity.y;
    const vn = rvx * n.x + rvy * n.y;
    const onHead = n.y < -0.6;
    if (vn < 0) {
      // the head is lively (headers, juggling); chest and legs mostly deaden the ball
      const e = onHead ? B.restitution : B.sideRestitution;
      bb.velocity.x -= (1 + e) * vn * n.x;
      bb.velocity.y -= (1 + e) * vn * n.y;
      if (!onHead) {
        const cap = Math.max(B.sideMaxSpeed, Math.abs(pb.velocity.x) * 1.25);
        bb.velocity.x = Phaser.Math.Clamp(bb.velocity.x, -cap, cap);
      }
    }
    // a running player dribbles it: the ball rolls just ahead at the runner's pace (set, never accumulated)
    // only when running forward (towards the opponent's goal); backpedalling into it just blocks it
    if (Math.abs(n.x) > 0.5 && Math.sign(pb.velocity.x) === Math.sign(n.x) && Math.sign(pb.velocity.x) === p.facing) {
      const push = pb.velocity.x * (1 + B.carryX * 0.3);
      if (Math.abs(bb.velocity.x) < Math.abs(push)) bb.velocity.x = push;
    }
    if (onHead && bb.velocity.y > -B.headPop) bb.velocity.y = Math.min(bb.velocity.y, -B.headPop); // juggle off the head
    ball.lastTouchKind = 'body'; // (its sound: Ball.syncRig hears the change of velocity)
  }

  onGoal(scorer, goalIdx) {
    if (!this.rules.goal(scorer)) return;
    this.goals[goalIdx].shake();
    this.players.forEach((p) => (p.frozen = true));
    this.players[scorer].celebrate(); // locked in the pose until the next kickoff
    this.players[1 - scorer].lose();
    this.players[1 - scorer].addSuper(KL.TUNING.super.perConceded);
    this.ball.setSuper(false);
    this.ball.body.setVelocity(this.ball.body.velocity.x * 0.2, 0);
    this.stadium.cheer(scorer); // only the scorer's fans
    this.bus.emit('GOAL', { scorer, score: [...this.rules.state.score] });
    // slow-mo, eased back to full speed (the freeze after it is the rules' goal phase timer)
    this.slowMo = { ms: 0, k: KL.TUNING.match.goalSlowMoScale };
    this.applySpeed();
  }

  /** Hold the goal slow-mo, then ease (sine in-out) back to real time over goalSlowMoRampMs. */
  advanceSlowMo(delta) {
    const M = KL.TUNING.match, s = this.slowMo;
    s.ms += delta;
    const p = Phaser.Math.Clamp((s.ms - M.goalSlowMoMs) / M.goalSlowMoRampMs, 0, 1);
    s.k = M.goalSlowMoScale + (1 - M.goalSlowMoScale) * (0.5 - 0.5 * Math.cos(Math.PI * p));
    if (p >= 1) this.slowMo = null;
  }

  /**
   * A strike's hit-stop (KL.FX on KICK), as a dip in game speed rather than a freeze: the world drops to
   * juice.hitSlowFloor and eases (sine) back to full speed. Over dur = 2·ms / (1 − floor) that costs `ms`
   * of game time — the weight of the freeze it replaces, but the picture never stops. One at a time, like
   * the freeze was.
   */
  hitStop(ms) {
    if (this.paused || this.hitDip || !ms) return;
    const floor = KL.TUNING.juice.hitSlowFloor ?? 0.2;
    this.hitDip = { ms: 0, dur: (2 * ms) / (1 - floor), floor, k: floor };
    // the players' action clocks run in real time: hold them by the game time the dip costs, so their
    // strikes keep in step with their (slowed) animation, exactly as they did with the freeze
    this.players.forEach((p) => p.holdFor(ms));
    this.applySpeed();
  }

  advanceHitDip(delta) {
    const d = this.hitDip;
    d.ms += delta;
    const p = Math.min(1, d.ms / d.dur);
    d.k = d.floor + (1 - d.floor) * (0.5 - 0.5 * Math.cos(Math.PI * p));
    if (p >= 1) this.hitDip = null;
  }

  /** The game speed now: the goal slow-mo times the hit-stop dip. */
  applySpeed() {
    const k = (this.slowMo?.k ?? 1) * (this.hitDip?.k ?? 1);
    if (k !== this.speed) this.setTimeScale(k);
  }

  /** Game speed: the scene clock, the physics and every sprite animation slow down together. The
   * physics still steps once per displayed frame, each step k × as long in game time, so slow motion
   * stays as fluid as full speed. */
  setTimeScale(k) {
    this.speed = k;
    this.time.timeScale = k;
    this.anims.globalTimeScale = k;
    KL.Motion.setStepRate(this.physics.world, this.physHz, k);
  }

  endMatch() {
    if (this.ended) return;
    this.ended = true;
    const s = this.rules.state;
    const winner = s.winner;
    this.players.forEach((p) => (p.frozen = true));
    if (winner !== null) {
      this.players[winner].celebrate();
      this.players[1 - winner].lose();
      this.stadium.cheer(winner);
    }
    this.bus.emit('WHISTLE', { reason: 'fulltime' });
    KL.Save.recordResult(winner);
    const result = { score: [...s.score], winner, stats: this.stats, config: this.cfg };
    this.bus.emit('MATCH_END', result);
    this.time.delayedCall(1800, () => {
      this.scene.stop('HUD');
      KL.goTo(this, 'Result', result);
    });
  }

  cleanup() {
    this.scene.stop('HUD');
    this.scene.stop('Pause');
    this.inputs?.forEach((i) => i?.destroy());
    this.fx?.destroy();
    this.headEmotes?.destroy();
    this.emoteOff?.();
    KL.View.events.off('orientation', this.onOrientation);
    this.game.events.off(Phaser.Core.Events.HIDDEN, this.autoPause);
    this.audioOffs?.forEach((o) => o());
    this.audioDirector?.destroy();
    this.audioDirector = null;
    this.bus?.clear();
    this.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.preStep, this);
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.postStep, this);
    this.slowMo = null;
    this.hitDip = null;
    this.speed = 1;
    this.time.timeScale = 1;
    if (this.physics.world) KL.Motion.setStepRate(this.physics.world, this.physics.world.fps, 1);
    this.anims.globalTimeScale = 1; // game-wide, like the pause below: never leave the menus in slow-mo
    this.anims.resumeAll(); // quitting/restarting from the pause menu must not leave every animation frozen
  }
};
