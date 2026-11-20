/* The ball.
 *
 * Physics: an Arcade circle body (gravity, bounces off the turf, posts, bar and walls); after every fixed
 * physics step js/systems/BallPhysics.js adds what Arcade doesn't know — air drag, the swerve of its spin
 * (topspin dips a drive, backspin floats a long ball), rolling resistance and the skid of each bounce.
 * The spin (`omega`) is that physical spin, and the rig below shows it. The physics sprite itself is
 * drawn fully transparent (it stays `visible`, so its ground shadow keeps following it).
 *
 * Look: a rig synced just before every render — after the physics step, so it never trails a frame:
 *  - `visual`, a container turned to the axis of the last impact and squashed along it; inside it the
 *    `skin` counter-rotates, so the panels keep spinning freely while the ball is flattened in the
 *    direction it was hit;
 *  - `ghosts`, faint after-images on hard shots.
 * Every impact — boot, turf, post, crossbar, head, chest, wall — is read from the change in velocity
 * between two rendered frames, so the ball squashes by how hard it was hit and springs back round
 * through a slight stretch, like a real air-filled ball. A kick's hit-stop slows the world right down
 * for a moment, so the ball is seen pressed against the boot before it springs away. On the turf it rolls at its ground speed; a long kick
 * carries backspin, a straight kick topspin. Feel numbers: KL.TUNING.motion.ball. */
window.KL = window.KL || {};

KL.Ball = class Ball extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'props', 'ball/00');
    const T = KL.TUNING.ball;
    const M = KL.TUNING.motion.ball;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.superMode = false;
    this.lastKicker = null;
    this.lastTouchKind = null;
    this.lastKickAt = -1e9;
    this.passKicker = null; // { index, until }: just struck, it leaves through that player's body
    this.trail = null;
    this.setDisplaySize(T.radius * 2, T.radius * 2);
    this.body.setCircle(this.width / 2);
    this.body.setBounce(T.bounce, T.bounce);
    this.body.setCollideWorldBounds(true, T.bounce, T.bounce);
    this.body.setMaxVelocity(T.maxSpeed, T.maxSpeed);
    this.setAlpha(0); // the rig below draws the ball

    if (!scene.anims.exists('ball_super')) {
      scene.anims.create({ key: 'ball_super', frames: scene.anims.generateFrameNames('props', { prefix: 'ball_super/', start: 0, end: 5, zeroPad: 2 }), frameRate: 14 * KL.animPace(), repeat: -1 });
    }

    // ---- rig ----
    this.ghosts = [0, 1, 2].map(() => scene.add.image(x, y, 'props', 'ball/00').setVisible(false));
    this.skin = scene.add.sprite(0, 0, 'props', 'ball/00');
    this.visual = scene.add.container(x, y, [this.skin]);
    this.plainScale = (T.radius * 2) / this.skin.frame.realWidth;
    this.skin.setScale(this.plainScale);
    this.ghosts.forEach((g) => g.setScale(this.plainScale));
    // radius of the drawn ball (the art leaves a margin in its cell): what it rolls on
    this.visR = T.radius * (this.skin.frame.width / this.skin.frame.realWidth);
    this.setRigDepth(20);

    this.deform = new KL.Motion.Spring(M.spring.hz, M.spring.damping); // + squash / − stretch
    this.deformAxis = 0; // world angle of the squash axis
    this.contactX = 0; // unit vector pointing away from the last contact point
    this.contactY = 0;
    this.spin = 0; // world rotation of the panels
    this.omega = 0; // rad/s, physical (KL.BallPhysics): + clockwise on screen
    this.phys = { vx: 0, vy: 0, omega: 0 }; // scratch state handed to KL.BallPhysics.step
    this.heading = 0; // smoothed flight angle of the fireball
    this.prevVx = 0;
    this.prevVy = 0;
    this.history = []; // recent { t, x, y } for the after-images
    this.rigClock = 0; // game-time ms (stops in hit-stop, slows in slow-mo)

    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.syncRig, this);
    scene.physics.world.on('worldstep', this.physicsStep, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unhook(scene));
  }

  unhook(scene) {
    scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.syncRig, this);
    scene.physics?.world?.off('worldstep', this.physicsStep, this);
  }

  /**
   * After every fixed physics step (dt = that step's game time): air or turf, from what Arcade just did.
   * blocked.down = it touched the turf (or the top of a crossbar) this step; bouncing up off it faster than
   * a settle means it landed.
   */
  physicsStep(dt) {
    const b = this.body;
    if (!b?.enable) return;
    const T = KL.TUNING.ball;
    const v = b.velocity;
    const contact = !b.blocked.down ? 'air' : v.y < -T.turf.bounceMinVy * T.bounce ? 'bounce' : 'roll';
    const s = this.phys;
    s.vx = v.x;
    s.vy = v.y;
    s.omega = this.omega;
    KL.BallPhysics.step(s, dt, contact, T, this.visR, this.superMode);
    v.x = s.vx;
    v.y = s.vy;
    this.omega = s.omega;
  }

  /** Just struck by player `i`: the ball is still leaving through their body. */
  passesThrough(i) {
    return this.passKicker !== null && this.passKicker.index === i && this.scene.time.now < this.passKicker.until;
  }

  get isSuper() {
    return this.superMode;
  }

  resetTo(x, y) {
    this.setSuper(false);
    this.setPosition(x, y);
    this.body.reset(x, y);
    this.body.setVelocity(0, 0);
    this.lastKicker = null;
    this.lastTouchKind = null;
    this.lastKickAt = -1e9;
    this.passKicker = null;
    // a placed ball is round, still and has no history to smear
    this.deform.reset();
    this.spin = 0;
    this.omega = 0;
    this.prevVx = 0;
    this.prevVy = 0;
    this.history.length = 0;
  }

  /**
   * A boot or a head strikes the ball. shot = { vx, vy, omega } from KL.BallPhysics.launch; kind: low |
   * high | header | super. Returns the kind that happened: 'clash' when the other player struck the same
   * touch a moment ago — then it squirts straight up instead of the second kick silently winning.
   */
  kick(shot, kicker, kind) {
    const now = this.scene.time.now;
    const v = this.body.velocity;
    const bx = v.x, by = v.y;
    const clash = kind !== 'super' && this.lastKicker !== null && this.lastKicker !== kicker && now - this.lastKickAt < KL.TUNING.clashMs && this.lastTouchKind !== 'super';
    this.lastKickAt = now;
    this.lastKicker = kicker;
    this.passKicker = { index: kicker, until: now + KL.TUNING.player.kickerPassMs };
    if (clash) {
      this.body.setVelocity(v.x * 0.1, -KL.TUNING.ball.clashPop);
      this.lastTouchKind = 'clash';
      this.struck(bx, by, 'clash');
      this.omega = (Math.random() < 0.5 ? -1 : 1) * KL.TUNING.ball.clashSpin;
      return 'clash';
    }
    this.body.setVelocity(shot.vx, shot.vy);
    this.lastTouchKind = kind;
    if (kind === 'super') this.setSuper(true);
    this.struck(bx, by, kind);
    this.omega = shot.omega; // after struck(): the squash of its own strike mustn't scrub the spin it gives
    return kind;
  }

  /** A boot or a head met the ball: squash it against the contact, harder the harder the strike. */
  struck(bx, by, kind) {
    const v = this.body.velocity;
    this.impact(v.x - bx, v.y - by, kind === 'super' ? 1.25 : kind === 'header' ? 1 : 1.15);
    // already squashed for this one: the impact detector must not count it again
    this.prevVx = v.x;
    this.prevVy = v.y;
  }

  /** Squash along the change of velocity (dvx, dvy), by how big it is. */
  impact(dvx, dvy, boost = 1) {
    const M = KL.TUNING.motion.ball;
    const dv = Math.hypot(dvx, dvy);
    if (dv < M.minImpact) return;
    const cap = M.squashMax * boost;
    const amount = cap * (1 - Math.exp(-(dv - M.minImpact * 0.5) / M.squashRef)) * (KL.Motion.reduced ? 0.5 : 1);
    if (amount <= this.deform.x) return; // still squashed harder from a moment ago
    this.deform.x = amount;
    this.deform.v = 0;
    this.deformAxis = Math.atan2(dvy, dvx);
    this.contactX = dvx / dv;
    this.contactY = dvy / dv;
    if (dv > 400) this.omega *= 0.7; // a hard knock scrubs some spin off
  }

  nudge(dir, amount) {
    this.body.velocity.x += dir * amount;
    this.body.velocity.y -= amount * 0.4;
    this.lastTouchKind = 'bump';
  }

  setSuper(on) {
    if (on === this.superMode) return;
    this.superMode = on;
    const M = KL.TUNING.motion.ball;
    const r = KL.TUNING.ball.radius;
    if (on) {
      this.skin.play('ball_super');
      const f = this.skin.frame;
      this.skin.setScale((r * M.superSize) / f.realWidth);
      // the studio fireball draws its ball ahead of the flames: pivot on that ball, not the frame centre
      this.skin.setOrigin(f.trimmed ? M.superPivotX : 0.5, 0.5);
      const v = this.body.velocity;
      this.skin.setFlipX(v.x < 0);
      this.heading = v.x < 0 ? Math.atan2(-v.y, -v.x) : Math.atan2(v.y, v.x);
      if (!this.trail && this.scene.textures.exists('fx')) {
        this.trail = this.scene.add.particles(0, 0, 'fx', {
          frame: ['fx_confetti/04', 'fx_confetti/05'],
          follow: this,
          lifespan: 350,
          speed: { min: 20, max: 90 },
          scale: { start: 0.9, end: 0 },
          alpha: { start: 1, end: 0 },
          frequency: 25,
          blendMode: Phaser.BlendModes.ADD,
        });
        this.trail.setDepth(this.visual.depth - 1);
      }
    } else {
      this.skin.stop();
      this.skin.setFrame('ball/00').setOrigin(0.5, 0.5).setFlipX(false).setScale(this.plainScale);
      this.trail?.destroy();
      this.trail = null;
    }
  }

  /** Behind a goal's near side netting (KL.GOAL_DEPTH.near): drawn under it, else over everything on the pitch. */
  setBehindNet(on) {
    if (on === !!this.behindNet) return;
    this.behindNet = on;
    this.setRigDepth(on ? KL.GOAL_DEPTH.near - 1 : 20);
  }

  setRigDepth(d) {
    this.setDepth(d);
    this.visual.setDepth(d);
    this.ghosts.forEach((g) => g.setDepth(d - 0.5));
    this.trail?.setDepth(d - 1);
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    // (drag, spin and turf act per physics step: physicsStep, so a hit-stop or the pause menu costs no pace)
    if (this.superMode && this.body.velocity.length() < 250) this.setSuper(false); // the fireball burns out
  }

  /** Runs on the scene's PRE_RENDER: physics has stepped, so this is where the ball really is. */
  syncRig() {
    if (!this.body || !this.scene) return;
    const M = KL.TUNING.motion.ball;
    const world = this.scene.physics.world;
    const dt = world.isPaused ? 0 : (Math.min(this.scene.game.loop.delta, 50) / 1000) * (this.scene.speed ?? 1);
    const v = this.body.velocity;

    if (dt > 0) {
      this.spin = (this.spin + this.omega * dt) % (Math.PI * 2);
      this.deform.step(dt);
      this.rigClock += dt * 1000;
      this.history.push({ t: this.rigClock, x: this.x, y: this.y });
      while (this.history.length > 2 && this.history[1].t < this.rigClock - 100) this.history.shift();
    }

    // impacts: any sudden change of velocity since the last frame (bounces, posts, bodies, walls).
    // After the spring step, so a fresh impact shows its full squash on its first frame.
    this.impact(v.x - this.prevVx, v.y - this.prevVy);
    this.prevVx = v.x;
    this.prevVy = v.y;

    // squash about the contact point: the side that touched stays put while the ball flattens onto it
    const q = Phaser.Math.Clamp(this.deform.x, -M.stretchMax, M.squashMax * 1.3);
    const push = Math.max(q, 0) * this.visR;
    this.visual.setPosition(this.x - this.contactX * push, this.y - this.contactY * push);
    this.visual.setRotation(this.deformAxis).setScale(1 - q, 1 + q * M.widen);
    this.visual.setVisible(this.visible);

    let face = this.spin;
    if (this.superMode) {
      // the fireball flies nose-first, its flames streaming behind it
      if (dt > 0 && v.x * v.x + v.y * v.y > 1600) {
        const flip = v.x < 0;
        const target = flip ? Math.atan2(-v.y, -v.x) : Math.atan2(v.y, v.x);
        if (flip !== this.skin.flipX) {
          this.skin.setFlipX(flip);
          this.heading = target;
        } else this.heading += KL.Motion.angleDelta(this.heading, target) * (1 - Math.exp(-14 * dt));
      }
      face = this.heading;
    }
    this.skin.setRotation(face - this.deformAxis);
    this.syncGhosts(Math.hypot(v.x, v.y));
  }

  /** After-images trail a hard shot, sampled at fixed time gaps (the same spacing at 60 or 144 Hz). */
  syncGhosts(speed) {
    const G = KL.TUNING.motion.ball.ghosts;
    const a = this.superMode || KL.Motion.reduced || !this.visible ? 0 : Phaser.Math.Clamp((speed - G.from) / (G.full - G.from), 0, 1);
    this.ghosts.forEach((g, i) => {
      const p = a > 0 && this.sampleHistory(this.rigClock - G.gapMs * (i + 1));
      if (!p) return g.setVisible(false);
      g.setVisible(true).setPosition(p.x, p.y).setRotation(this.spin).setAlpha(a * G.alpha[i]);
    });
  }

  sampleHistory(t) {
    const h = this.history;
    if (h.length < 2 || t < h[0].t) return null;
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (a.t <= t) {
        const k = b.t > a.t ? Math.min(1, (t - a.t) / (b.t - a.t)) : 1;
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    return null;
  }

  destroy(fromScene) {
    if (this.scene) this.unhook(this.scene);
    this.trail?.destroy();
    this.visual?.destroy();
    this.ghosts?.forEach((g) => g.destroy());
    super.destroy(fromScene);
  }
};
