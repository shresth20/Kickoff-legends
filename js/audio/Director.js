/* AudioDirector: the match's sound, driven by the game. One per match (MatchScene.wireAudio); it
 * listens to the match EventBus and reads the live state every frame.
 *
 * - Every strike, bounce, body, crossbar and net sounds where it happens (stereo by x), as hard as it
 *   was hit; the ball whooshes through the air by its speed and the fireball roars; boots patter on
 *   the grass with the run cycle; a charged-up player's flames crackle.
 * - The legends grunt on strikes, hup on headers, cry out when knocked down, roar when they score.
 * - The crowd breathes with the game: it builds as the ball nears a goal (more if it's heading in),
 *   as the clock runs down and in sudden death; a shot at goal makes it draw breath, then a goal
 *   erupts (roar, air horns, applause), a near miss gets an "ooh", a chance blocked an "aww", the
 *   woodwork an "ooh" and a fireball knockdown boos and whistles.
 * - The referee whistles kickoffs, goals, sudden death and full time; the stadium horn sounds for a
 *   goal; the music stings goals and plays the tension track over the last ten seconds and in sudden
 *   death; the announcer calls the big moments. */
window.KL = window.KL || {};

KL.AudioDirector = class AudioDirector {
  /**
   * The crowd's pressure from the state of play (pure): the ball close to a goal (more when it's
   * heading in), the last fifteen seconds and sudden death. 0…0.7, added to the stand's base mood.
   */
  static pressure({ x, vx = 0, width = 1280, secondsLeft = 90, suddenDeath = false, playing = true }) {
    if (!playing) return suddenDeath ? 0.12 : 0.04;
    let near = 0;
    for (const [gx, dir] of [[0, -1], [width, 1]]) {
      const close = 1 - Math.min(1, Math.max(0, (Math.abs(x - gx) - 120) / 420));
      near = Math.max(near, close * (Math.sign(vx) === dir ? 1 : 0.55));
    }
    let p = 0.38 * Math.pow(near, 1.4);
    if (secondsLeft <= 15) p += 0.1 + (15 - secondsLeft) * 0.008;
    if (suddenDeath) p += 0.15;
    return Math.min(0.7, p);
  }

  constructor(scene, bus) {
    this.scene = scene;
    this.A = KL.audio;
    // the ball plays on a stretched clock (KL.TUNING.ball.time); the sounds are tuned to its real pace
    this.ballTime = KL.TUNING?.ball?.time ?? 1;
    this.lastFrame = [-1, -1];
    this.superReady = [false, false];
    this.shot = null;
    this.firstKickoff = true;
    this.lastFrameHit = -1e9;
    this.golden = false;
    const A = this.A;
    A?.crowd?.setMode('match');
    A?.ambience?.setLevel(0.55);
    if (A?.ready) A.crowd.react('cheer', { gain: 0.45 }); // the legends walk out
    const C = KL.Commentary;
    const p = (i) => scene.players[i];
    const on = (ev, fn) => bus.on(ev, (e) => A?.ready && fn(e || {}));
    this.offs = [
      on('KICK', (e) => this.kick(e)),
      on('SWING', (e) => A.play('swing', { x: e.x, kind: e.kind, key: e.player })),
      on('JUMP', (e) => {
        A.play('jump', { x: e.x });
        if (Math.random() < 0.3) A.voices.say(p(e.player).def.id, 'hup', { x: e.x, gain: 0.6 });
      }),
      on('LAND', (e) => A.play('land', { x: e.x, impact: e.impact })),
      on('BALL_IMPACT', (e) => this.impact(e)),
      on('FRAME_HIT', (e) => this.frameHit(e)),
      on('HURT', (e) => {
        const v = p(e.player);
        A.play('hurt', { x: v.x });
        A.voices.say(v.def.id, 'hurt', { x: v.x, delay: 0.03 });
        A.crowd.react('boo', { gain: 0.45, delay: 0.15 });
        A.crowd.react('rise', { gain: 0.3 });
        if (Math.random() < 0.6) C.say('comm_knockdown', {}, { priority: 2, delay: 0.35 });
      }),
      on('SUPER_READY', (e) => {
        this.superReady[e.player] = true;
        A.play('super_ready', { x: p(e.player).x, cpu: e.player === 1 });
      }),
      on('SUPER_METER', (e) => e.value <= 0 && (this.superReady[e.player] = false)),
      on('SUPER_FIRED', (e) => {
        const v = p(e.player);
        A.play('super_charge', { x: v.x });
        A.voices.say(v.def.id, 'big', { x: v.x, delay: 0.3 });
        A.crowd.react('rise', { gain: 0.5 });
      }),
      on('GOAL', (e) => this.goal(e)),
      on('WHISTLE', (e) => this.whistle(e)),
      on('CLOCK', (e) => this.clock(e)),
      on('MATCH_END', (e) => this.end(e)),
    ];
    scene.events.on('update', this.update, this);
  }

  kick(e) {
    const A = this.A, s = this.scene, pl = s.players[e.player];
    const v = s.ball?.body?.velocity.length();
    const speed = v === undefined ? 900 : v * this.ballTime;
    const name = { low: 'kick_low', high: 'kick_long', header: 'header', clash: 'kick_clash', super: 'kick_super' }[e.kind] || 'kick_low';
    A.play(name, { x: e.x, power: KL.AudioKit.clamp(speed / 1100, 0.35, 1.4) });
    const id = pl.def.id;
    if (e.kind === 'high' && Math.random() < 0.55) A.voices.say(id, 'big', { x: pl.x, gain: 0.75 });
    else if (e.kind === 'low' && Math.random() < 0.35) A.voices.say(id, 'effort', { x: pl.x, gain: 0.7 });
    else if (e.kind === 'header' && Math.random() < 0.5) A.voices.say(id, 'hup', { x: pl.x, gain: 0.75 });
    // a strike near the goal its player attacks (as the stand sees it, KL.CROWD.nearGoal): the crowd
    // draws breath, and how the chance ends decides the reaction (see update)
    const W = KL.TUNING.world.width, near = KL.CROWD?.nearGoal ?? 330;
    const chance = e.player === 0 ? e.x > W - near : e.x < near;
    if (e.kind !== 'clash' && chance) {
      A.crowd.react('rise', { gain: e.kind === 'super' ? 0.55 : 0.38 });
      this.shot = { goal: e.player === 0 ? 1 : 0, t: s.time.now, closest: Infinity };
    }
  }

  /** The ball hit something (Ball.syncRig): turf, a wall (the back of a goal) or a body. */
  impact(e) {
    if (this.scene.time.now - this.lastFrameHit < 60) return; // the frame already rang for this one
    const name = e.surface === 'turf' ? 'ball_bounce' : e.surface === 'wall' ? 'net' : 'ball_body';
    this.A.play(name, { x: e.x, dv: e.dv });
  }

  /** The ball hit a goal frame (MatchScene's goal collider): the crossbar clangs, the back post shakes the net. */
  frameHit(e) {
    const s = this.scene, now = s.time.now;
    if (e.dv < 160 || now - this.lastFrameHit < 120) return;
    this.lastFrameHit = now;
    this.A.play(e.part === 'bar' ? 'crossbar' : 'net', { x: e.x, dv: e.dv });
    if (e.part === 'bar' && e.dv > 350 && s.rules.isPlaying) {
      this.A.crowd.react('ooh');
      KL.Commentary.say('comm_post', {}, { priority: 2 });
      this.shot = null;
    }
  }

  goal(e) {
    const A = this.A, s = this.scene, C = KL.Commentary;
    const scorer = s.players[e.scorer], other = s.players[1 - e.scorer];
    const gx = s.goals[e.scorer === 0 ? 1 : 0].lineX;
    this.shot = null;
    this.golden = !!s.rules.state.suddenDeath;
    A.slowMoDip(0.35, 0.8); // the slow-mo closes the world in, then it opens into the roar
    A.play('net', { x: gx, dv: 1400 });
    A.play('whistle_goal', { delay: 0.25 });
    A.play('goal_horn', { delay: 0.45 });
    A.crowd.react('roar');
    A.play(e.scorer === 0 ? 'sting_goal' : 'sting_concede', { delay: 0.12 });
    A.voices.say(scorer.def.id, 'cheer', { x: scorer.x, delay: 0.35 });
    if (Math.random() < 0.7) A.voices.say(other.def.id, 'groan', { x: other.x, delay: 1.1, gain: 0.7 });
    // the announcer: the kind of goal, then what it does to the score
    const kind = s.ball?.lastTouchKind;
    const key = this.golden ? 'comm_golden' : kind === 'super' ? 'comm_goal_super' : kind === 'header' ? 'comm_goal_header' : 'comm_goal';
    const mine = e.score[e.scorer], theirs = e.score[1 - e.scorer];
    const then = this.golden ? null : mine === theirs ? 'comm_level' : mine === theirs + 1 ? 'comm_lead' : null;
    C.say(key, { name: scorer.def.name }, { priority: 3, delay: 0.55, excited: true, then: then && { key: then, vars: { name: scorer.def.name } } });
  }

  whistle(e) {
    const A = this.A, C = KL.Commentary;
    if (e.reason === 'kickoff') {
      A.play('whistle_kickoff');
      A.crowd.react('rise', { gain: 0.3 });
      if (this.firstKickoff) C.say('comm_kickoff', {}, { priority: 2, delay: 0.4 });
      this.firstKickoff = false;
    } else if (e.reason === 'suddendeath') {
      A.play('whistle_double');
      A.play('sting_suddendeath', { delay: 0.3 });
      A.playMusic('tension');
      C.say('comm_suddendeath', {}, { priority: 3, delay: 1.3 });
    } else if (e.reason === 'fulltime') {
      A.play('whistle_final');
      A.music.play(null);
    }
  }

  clock(e) {
    const A = this.A, n = e.secondsLeft;
    if (!e.suddenDeath && n === 10) {
      KL.Commentary.say('comm_ten', {}, { priority: 2 });
      A.playMusic('tension');
    }
    if (n <= 10 && n > 3) A.play('clock_tick', { n });
    else if (n <= 3 && n > 0) A.play('countdown');
  }

  end(r) {
    const A = this.A, s = this.scene, C = KL.Commentary;
    A.music.play(null);
    if (r.winner == null) {
      A.crowd.react('applause', { delay: 0.6, dur: 6 });
      C.say('comm_fulltime_draw', {}, { priority: 4, delay: 1.3 });
      return;
    }
    const w = s.players[r.winner];
    if (this.golden) {
      A.crowd.react('applause', { delay: 0.4, dur: 7, gain: 0.7 }); // the golden goal's roar is still going
      return;
    }
    A.crowd.react('roar', { delay: 0.6, dur: 7 });
    A.voices.say(w.def.id, 'cheer', { x: w.x, delay: 0.9 });
    C.say('comm_fulltime_win', { name: w.def.name }, { priority: 4, delay: 1.3, excited: true });
  }

  /** The ball through the air, and the fireball's roar: two loops whose level follows the ball. */
  startLoops() {
    const A = this.A, c = A.ctx, K = KL.AudioKit, t = c.currentTime;
    this.loopsOn = true;
    const pan = (this.pan = K.panner(c, 0));
    pan.connect(A.buses.sfx);
    this.whooshSrc = K.noise(c, 'pink', t);
    this.whooshF = K.filter(c, 'bandpass', 800, 1.1);
    this.whooshG = K.gain(c, 0);
    K.chain(this.whooshSrc, this.whooshF, this.whooshG, pan);
    this.fireSrc = K.noise(c, 'brown', t);
    this.fireLfo = K.osc(c, 'sine', 9, t);
    this.fireG = K.gain(c, 0);
    const flicker = K.gain(c, 0.75);
    K.chain(this.fireLfo, K.gain(c, 0.25), flicker.gain);
    K.chain(this.fireSrc, K.filter(c, 'lowpass', 1400, 0.7), flicker, this.fireG, pan);
  }

  update(time, delta) {
    const A = this.A, s = this.scene, ball = s.ball;
    if (!A?.ready || !ball?.body) return;
    if (!this.loopsOn) this.startLoops();
    const K = KL.AudioKit, t = A.now, dt = Math.min(delta, 50) / 1000;
    const W = KL.TUNING.world;
    const still = s.paused || s.ended;
    const v = ball.body.velocity;
    const speed = still ? 0 : Math.hypot(v.x, v.y) * this.ballTime;
    const air = ball.y < W.groundY - KL.TUNING.ball.radius - 12;
    const k = K.clamp((speed - 600) / 1100, 0, 1);
    this.whooshG.gain.setTargetAtTime(k * k * (air ? 0.34 : 0.12) * (ball.isSuper ? 1.5 : 1), t, 0.04);
    this.whooshF.frequency.setTargetAtTime(380 + speed * 1.3, t, 0.05);
    this.pan.pan?.setTargetAtTime(A.panFor(ball.x), t, 0.05);
    this.fireG.gain.setTargetAtTime(ball.isSuper && !still ? 0.32 : 0, t, ball.isSuper ? 0.03 : 0.12);
    if (still) return;

    s.players.forEach((p, i) => {
      // boots on the grass, in step with the run cycle (two footfalls a cycle)
      if (p.state === 'run' && p.onFloor) {
        const f = p.frameIndex;
        if (f !== this.lastFrame[i] && (f === 1 || f === 5)) A.play('step', { x: p.x, sprint: p.sprintLines?.visible, key: i });
        this.lastFrame[i] = f;
      } else this.lastFrame[i] = -1;
      // a charged-up player's flames crackle (the human's a little louder)
      if (this.superReady[i] && Math.random() < dt * (i === 0 ? 7 : 4)) A.play('crackle', { x: p.x, gain: i === 0 ? 0.35 : 0.2, key: i });
    });

    const R = s.rules;
    A.crowd.pressure = KL.AudioDirector.pressure({ x: ball.x, vx: v.x, width: W.width, secondsLeft: R.secondsLeft, suddenDeath: R.state.suddenDeath, playing: R.isPlaying });

    // how a chance ended: close to the goal mouth and out → "ooh!"; blocked further out → "aww"
    if (this.shot) {
      const G = KL.TUNING.goal;
      const mouthX = s.goals[this.shot.goal].lineX, mouthY = W.groundY - G.openingHeight / 2;
      this.shot.closest = Math.min(this.shot.closest, Math.hypot(ball.x - mouthX, (ball.y - mouthY) * 0.8));
      if (s.time.now - this.shot.t > 1500) {
        const d = this.shot.closest;
        this.shot = null;
        if (R.isPlaying && d < 150) {
          A.crowd.react('ooh');
          if (Math.random() < 0.4) KL.Commentary.say('comm_close', {}, { priority: 1 });
        } else if (R.isPlaying && d < 280 && Math.random() < 0.45) A.crowd.react('aww', { gain: 0.5 });
      }
    }
  }

  destroy() {
    this.offs.forEach((off) => off());
    this.scene.events.off('update', this.update, this);
    const A = this.A;
    if (!A?.ctx) return;
    if (this.loopsOn) {
      const t = A.now;
      this.whooshG.gain.setTargetAtTime(0, t, 0.05);
      this.fireG.gain.setTargetAtTime(0, t, 0.05);
      for (const src of [this.whooshSrc, this.fireSrc, this.fireLfo]) src.stop(t + 0.4);
    }
    A.crowd?.setMode('menu');
    A.ambience?.setLevel(1);
    if (A.music?.track?.name === 'tension') A.music.play(null);
  }
};
