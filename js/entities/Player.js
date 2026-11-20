/* A playable footballer. Owns its animation state machine; receives Intents from
 * whichever IntentSource drives it (keyboard or AI) and never reads keys itself.
 *
 * Motion: the run speed ramps up and brakes (KL.TUNING.player.runAccel / runDecel) instead of
 * snapping between 0 and full speed, and the run cycle plays at the real ground speed. On top of the
 * sprite frames a light "pose" layer adds weight: a stretch on take-off, a squash on landing that
 * grows with the fall, a lean into starts and stops, and a recoil tilt when hit. The pose is applied
 * only for the render pass (PRE_RENDER → RENDER) and undone right after, because scaling an Arcade
 * sprite would also resize its body — the hitbox never changes. Feel numbers: KL.TUNING.motion.player.
 *
 * Strikes: J = the straight kick (kick_low), K = the long kick (kick_high on the turf, a header in the
 * air). The boot meets the ball ~85 ms after the key (KL.CHARACTER_ANIMS frameMs); the run-up as the
 * kick began goes into the ball, and the body carries on through the strike at a stride's pace. A kick
 * or jump pressed a moment early is buffered (KL.TUNING.player.inputBufferMs), and once the follow-
 * through is done the recovery gives way to the next move. The flight itself: js/systems/BallPhysics.js. */
window.KL = window.KL || {};

KL.EMPTY_INTENT = Object.freeze({ moveX: 0, jump: false, kickLow: false, kickHigh: false, super: false, sprint: false });

const ACTION_STATES = ['kick_low', 'kick_high', 'header', 'super', 'hurt', 'land'];
/** On-screen size of a 256-cell character frame (the slicer stands every character 184/256 of the cell → ≈ 172 px). */
KL.PLAYER_SPRITE_SIZE = 240;

KL.Player = class Player extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {0|1} index
   * @param {object} def character definition from KL.CHARACTERS
   * @param {'left'|'right'} side
   * @param {number} x
   * @param {KL.EventBus} bus
   */
  constructor(scene, index, def, side, x, bus) {
    super(scene, x, KL.TUNING.world.groundY, 'characters', `${def.id}/idle/00`);
    this.index = index;
    this.def = def;
    this.side = side;
    this.bus = bus;
    this.state = 'idle';
    this.intent = { ...KL.EMPTY_INTENT };
    this.facing = side === 'left' ? 1 : -1;
    this.superMeter = 0;
    this.stamina = 1;
    this.frozen = false;
    this.locked = false;
    this.actionUntil = 0;
    this.actionHitDone = false;
    this.hurtUntil = 0;
    this.wasOnFloor = true;
    this.superCharging = 0;
    this.superReleaseUntil = 0;
    this.kickBuffer = null; // { kind, until }: a kick pressed while busy (see step)
    this.jumpUntil = 0; // a jump pressed while busy, held until then
    this.runUp = 0; // ground speed as the current kick began (goes into the strike)
    this.stateDef = null;
    this.slipDir = 0; // sliding off the other player's head that way (see slipOff)
    const m =(v) => 1 + (v - 3) * 0.075; // stat 1..5 → ±15 %
    this.stats = { speed: m(def.stats.speed), jump: m(def.stats.jump), power: m(def.stats.power) };

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    const P = KL.TUNING.player;
    const S = P.scale;
    const SIZE = KL.PLAYER_SPRITE_SIZE;
    this.setDisplaySize(SIZE * S, SIZE * S);
    // body dims are authored against the 240 px sprite; as fractions of the frame they scale with it
    this.body.setSize((P.bodyWidth / SIZE) * this.width, (P.bodyHeight / SIZE) * this.height);
    this.body.setOffset((this.width - this.body.width) / 2, this.height - this.body.height);
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocityY(1600);
    this.setDepth(index === 0 ? 11 : 10);
    this.setFlipX(this.facing === -1);
    this.ensureAnims();
    this.play(`${def.id}/idle`);

    // super aura: the fx_super_aura fire-ring art (8 frames, fx atlas), drawn behind the player
    this.aura = scene.add.sprite(x, this.y - 90 * S, 'fx', 'fx_super_aura/00').setDepth(this.depth - 1).setVisible(false).setDisplaySize(220 * S, 240 * S);
    this.auraScale = { x: this.aura.scaleX, y: this.aura.scaleY };
    this.sprintLines = scene.add.sprite(x, this.y - 80 * S, 'fx', 'fx_speedlines/00').setDepth(this.depth - 1).setVisible(false).setDisplaySize(200 * S, 100 * S).setAlpha(0.7);

    // pose layer (see the header): springs advance in step(), are drawn in applyPose()
    const PM = KL.TUNING.motion.player;
    this.baseScaleX = this.scaleX;
    this.baseScaleY = this.scaleY;
    this.pose = new KL.Motion.Spring(PM.spring.hz, PM.spring.damping); // + squash / − stretch
    this.tilt = new KL.Motion.Spring(PM.tiltSpring.hz, PM.tiltSpring.damping); // recoil, radians
    this.lean = 0;
    this.prevVx = 0;
    this.fallVy = 0; // fastest fall of the current jump (sizes the landing squash)
    this.sprintDir = this.facing; // which way the sprint lines stream from
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.applyPose, this);
    scene.events.on(Phaser.Scenes.Events.RENDER, this.clearPose, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unhookPose(scene));
  }

  /** Draw-time only: squash/stretch about the feet (origin 0.5, 1) plus lean and recoil. Also places
   * the aura and sprint lines here, where the body has already moved this frame (placed in step() they
   * trailed the player by a frame). */
  applyPose() {
    if (!this.body) return;
    const q = this.pose.x;
    this.setScale(this.baseScaleX * (1 + q * KL.TUNING.motion.player.widen), this.baseScaleY * (1 - q));
    this.rotation = this.lean + this.tilt.x;
    const S = KL.TUNING.player.scale;
    if (this.aura.visible) this.aura.setPosition(this.x, this.y - 95 * S);
    if (this.sprintLines.visible) this.sprintLines.setPosition(this.x - this.sprintDir * 110 * S, this.y - 80 * S);
  }
  /** Back to the physics shape before the next update reads it. */
  clearPose() {
    if (!this.body) return;
    this.setScale(this.baseScaleX, this.baseScaleY);
    this.rotation = 0;
  }
  unhookPose(scene) {
    scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.applyPose, this);
    scene.events.off(Phaser.Scenes.Events.RENDER, this.clearPose, this);
  }

  /** Advance the pose springs and the lean (dt in game seconds). */
  stepPose(dt, acting, hurting) {
    if (dt <= 0) return;
    const P = KL.TUNING.player;
    const PM = KL.TUNING.motion.player;
    const vx = this.body.velocity.x;
    const ax = (vx - this.prevVx) / dt;
    this.prevVx = vx;
    let target = 0;
    if (this.onFloor && !acting && !hurting && !this.locked && this.superCharging === 0) {
      const DEG = Math.PI / 180;
      const forward = Math.sign(vx) === this.facing ? 1 : 0.4; // backpedalling stays nearly upright
      target = Phaser.Math.Clamp(vx / P.sprintSpeed, -1, 1) * PM.leanDeg * forward * DEG + Phaser.Math.Clamp(ax / P.runAccel, -1, 1) * PM.accelLeanDeg * DEG;
    }
    this.lean = KL.Motion.damp(this.lean, target, PM.leanRate, dt);
    this.pose.step(dt);
    this.tilt.step(dt);
  }

  ensureAnims() {
    const anims = this.scene.anims;
    KL.ensureCharacterAnims(anims, this.def.id);
    if (!anims.exists('fx_super_aura')) {
      anims.create({ key: 'fx_super_aura', frames: anims.generateFrameNames('fx', { prefix: 'fx_super_aura/', start: 0, end: 7, zeroPad: 2 }), frameRate: 14 * KL.animPace(), repeat: -1 });
      anims.create({ key: 'fx_speedlines', frames: anims.generateFrameNames('fx', { prefix: 'fx_speedlines/', start: 0, end: 3, zeroPad: 2 }), frameRate: 18 * KL.animPace(), repeat: -1 });
    }
  }

  get isActing() {
    return ACTION_STATES.includes(this.state) && this.scene.time.now < this.actionUntil;
  }
  get onFloor() {
    return this.body.blocked.down;
  }
  get superReady() {
    return this.superMeter >= KL.TUNING.super.max;
  }

  resetTo(x) {
    const gy = KL.TUNING.world.groundY;
    this.setPosition(x, gy);
    this.body.reset(x, gy);
    this.body.setVelocity(0, 0);
    this.facing = this.side === 'left' ? 1 : -1;
    this.setFlipX(this.facing === -1);
    this.actionUntil = 0;
    this.superCharging = 0;
    this.superReleaseUntil = 0;
    this.hurtUntil = 0;
    this.kickBuffer = null;
    this.jumpUntil = 0;
    this.runUp = 0;
    this.locked = false; // released from a goal / full-time pose
    this.hideAura(false);
    this.pose.reset();
    this.tilt.reset();
    this.lean = 0;
    this.prevVx = 0;
    this.fallVy = 0;
    this.slipDir = 0;
    this.setState('idle');
  }

  /** Feet resting on `other`'s head (MatchScene's player collider holds them there instead of landing them);
   * not when they're only rising past it, jumping up beside the other player. */
  isOnHeadOf(other) {
    const b = this.body, o = other.body;
    return Math.abs(b.bottom - o.top) <= 2 && b.right > o.left && b.left < o.right && b.velocity.y >= o.velocity.y;
  }

  /** On the other player's head: slide off sideways, then gravity drops them to the turf. The way they
   * were already moving (a running jump carries on over), else off the side they hang over, else towards
   * the open pitch; a wall or goalpost turns the slide round. */
  slipOff(under) {
    const b = this.body, vx = b.velocity.x;
    let dir = this.slipDir || (Math.abs(vx) > 60 ? Math.sign(vx) : 0) || Math.sign(this.x - under.x) || (under.x < KL.TUNING.world.width / 2 ? 1 : -1);
    if (dir > 0 ? b.blocked.right : b.blocked.left) dir = -dir;
    this.slipDir = dir;
    b.velocity.x = dir * Math.max(KL.TUNING.player.headSlipSpeed, dir * b.velocity.x);
  }

  addSuper(amount) {
    const was = this.superReady;
    this.superMeter = Phaser.Math.Clamp(this.superMeter + amount, 0, KL.TUNING.super.max);
    this.bus.emit('SUPER_METER', { player: this.index, value: this.superMeter });
    if (!was && this.superReady) this.bus.emit('SUPER_READY', { player: this.index });
  }

  hurt() {
    if (this.locked) return;
    const ms = KL.TUNING.player.hurtDurationMs;
    this.hurtUntil = this.scene.time.now + ms;
    this.superCharging = 0;
    this.hideAura(true); // knocked out of the charge: the flames scatter
    this.setState('hurt', ms);
    const K = KL.TUNING.player.hurtKnockback;
    this.body.setVelocityX(-this.facing * K.x);
    this.body.setVelocityY(K.y);
    // knocked back: the body tips away from the hit and rocks upright again
    const PM = KL.TUNING.motion.player;
    this.tilt.x = -this.facing * PM.hurtTiltDeg * (Math.PI / 180);
    this.tilt.v = 0;
    this.pose.x = Math.max(this.pose.x, PM.hurtSquash);
    this.bus.emit('HURT', { player: this.index });
  }

  /** Super aura on: the fire ring ignites with a quick pop, then loops its 8 frames. */
  showAura() {
    const a = this.aura, s = this.auraScale;
    this.scene.tweens.killTweensOf(a);
    a.setVisible(true).setAlpha(1).setScale(s.x * 0.55, s.y * 0.4).play('fx_super_aura', true);
    this.scene.tweens.add({ targets: a, scaleX: s.x, scaleY: s.y, duration: KL.paced(160), ease: 'Back.out' });
  }

  /** Super aura off: burst = swell and fade out (release / knocked out of it); otherwise gone at once. */
  hideAura(burst) {
    const a = this.aura, s = this.auraScale;
    this.scene.tweens.killTweensOf(a);
    const reset = () => {
      a.stop();
      a.setVisible(false).setAlpha(1).setScale(s.x, s.y);
    };
    if (!burst || !a.visible) return reset();
    this.scene.tweens.add({ targets: a, scaleX: s.x * 1.4, scaleY: s.y * 1.3, alpha: 0, duration: KL.paced(220), ease: 'Cubic.out', onComplete: reset });
  }

  celebrate() {
    this.locked = true;
    this.body.setVelocityX(0);
    this.setState('celebrate');
  }
  lose() {
    this.locked = true;
    this.body.setVelocityX(0);
    this.setState('lose');
  }

  setState(next, durationMs) {
    if (this.state === next && this.anims.currentAnim?.key === `${this.def.id}/${next}` && this.anims.isPlaying) return;
    this.state = next;
    this.actionHitDone = false;
    this.play(`${this.def.id}/${next}`, true);
    if (next !== 'run') this.anims.timeScale = 1; // only the run cycle follows the ground speed
    this.stateDef = KL.CHARACTER_ANIMS.find((a) => a.key === next);
    this.actionUntil = this.scene.time.now + (durationMs ?? KL.charAnimMs(this.stateDef));
  }

  /** 0-based frame of the playing animation. */
  get frameIndex() {
    return (this.anims.currentFrame?.index ?? 1) - 1;
  }

  /** Start a strike. The run-up is read now, before the standing foot plants and brakes the body. */
  startKick(kind) {
    this.kickBuffer = null;
    this.runUp = this.body.velocity.x;
    if (kind === 'low') this.setState('kick_low');
    else this.setState(this.onFloor ? 'kick_high' : 'header');
  }

  /** A hit-stop froze the world for `ms`: the action clocks wait with it, so no strike is cut short. */
  holdFor(ms) {
    const now = this.scene.time.now;
    if (this.actionUntil > now) this.actionUntil += ms;
    if (this.hurtUntil > now) this.hurtUntil += ms;
    if (this.superReleaseUntil > now) this.superReleaseUntil += ms;
    if (this.kickBuffer) this.kickBuffer.until += ms;
    if (this.jumpUntil > now) this.jumpUntil += ms;
  }

  /** Called by MatchScene each frame with dt in seconds. */
  step(ball, dt) {
    const now = this.scene.time.now;
    const P = KL.TUNING.player;
    const i = this.frozen || this.locked ? KL.EMPTY_INTENT : this.intent;
    const world = this.scene.physics.world;
    const gdt = world.isPaused ? 0 : dt * (this.scene.speed ?? 1); // game time: slows in a hit-stop's dip and the goal slow-mo

    // buffered presses: a kick or jump pressed a moment early (still landing, still in a kick's
    // recovery) happens the moment the player is free instead of being swallowed
    if (this.frozen || this.locked) (this.kickBuffer = null), (this.jumpUntil = 0);
    if (i.kickLow || i.kickHigh) this.kickBuffer = { kind: i.kickLow ? 'low' : 'high', until: now + P.inputBufferMs };
    if (i.jump) this.jumpUntil = now + P.inputBufferMs;
    const wantKick = this.kickBuffer && now <= this.kickBuffer.until ? this.kickBuffer.kind : null;
    const wantJump = now <= this.jumpUntil;

    if (i.sprint && i.moveX !== 0 && this.stamina > 0) this.stamina = Math.max(0, this.stamina - dt / P.sprintStaminaSec);
    else this.stamina = Math.min(1, this.stamina + dt / P.sprintRechargeSec);
    const sprinting = i.sprint && this.stamina > 0.05 && i.moveX !== 0;

    // past the follow-through, a kick's recovery frames give way to the next run, jump or kick
    const rf = this.stateDef?.recoverFrame;
    if (rf !== undefined && this.isActing && this.frameIndex >= rf && (i.moveX !== 0 || wantJump || wantKick)) this.actionUntil = now;

    const hurting = now < this.hurtUntil;
    const acting = this.isActing && this.state !== 'land';
    const PM = KL.TUNING.motion.player;
    const vx = this.body.velocity.x;

    if (hurting) {
      this.body.velocity.x *= Math.pow(0.96, gdt * 60);
    } else {
      // ramp towards the wanted speed (accelerate / brake) instead of snapping to it
      let target = 0;
      let rate = P.runDecel;
      if (!this.locked && !(acting && this.onFloor) && this.superCharging === 0) {
        // genre convention: players always face the opponent's goal and backpedal (no turning to face their own net)
        target = i.moveX * (sprinting ? P.sprintSpeed : P.runSpeed) * this.stats.speed;
        const speedingUp = target !== 0 && Math.sign(target) === Math.sign(vx || target) && Math.abs(target) > Math.abs(vx);
        rate = speedingUp ? P.runAccel : P.runDecel;
        if (!this.onFloor) rate *= P.airControl;
      } else if (!this.locked && this.superCharging === 0) {
        // a kick on the move: the standing foot plants (a short skid) and the body carries on through the
        // strike at a stride's pace instead of stopping dead
        target = i.moveX * P.runSpeed * this.stats.speed * P.kickMove;
        rate = P.plantDecel;
      }
      this.body.setVelocityX(KL.Motion.approach(vx, target, rate * gdt));
    }
    this.setFlipX(this.facing === -1);

    if (wantJump && this.onFloor && !hurting && !acting && this.superCharging === 0) {
      this.jumpUntil = 0;
      this.body.setVelocityY(P.jumpVelocity * this.stats.jump);
      this.setState('jump');
      this.pose.x = Math.min(this.pose.x, -PM.jumpStretch); // springs up long and lean
      this.pose.v = 0;
      this.fallVy = 0;
    }
    if (!this.onFloor) this.fallVy = Math.max(this.fallVy, this.body.velocity.y);

    if (this.superReady && !hurting && !acting && i.super && this.superCharging === 0) {
      this.superCharging = KL.TUNING.super.chargeMs;
      this.setState('super', KL.TUNING.super.chargeMs + 500);
      this.showAura();
      this.bus.emit('SUPER_FIRED', { player: this.index });
    }
    if (this.superCharging > 0) {
      this.superCharging -= gdt * 1000; // game time: a hit-stop holds the charge too
      if (this.superCharging <= 0) {
        this.superCharging = 0;
        this.superMeter = 0;
        this.bus.emit('SUPER_METER', { player: this.index, value: 0 });
        this.hideAura(true); // the shot is released: the ring bursts outwards
        this.actionHitDone = false;
        this.actionUntil = now + 500;
        this.superReleaseUntil = now + 500;
      }
    }

    if (wantKick && !hurting && !acting && this.superCharging === 0) this.startKick(wantKick);

    this.resolveHit(ball, now);

    if (this.onFloor && !this.wasOnFloor && !hurting) {
      if (this.state === 'jump' || this.state === 'header') this.setState('land');
      // knees take the landing: the harder the fall, the deeper the squash
      const k = Phaser.Math.Clamp(this.fallVy / PM.landRefVy, 0.25, 1.2);
      this.pose.x = Math.max(this.pose.x, PM.landSquash * k);
      this.pose.v = 0;
      this.fallVy = 0;
      this.bus.emit('LAND', { player: this.index, x: this.x, y: this.y });
    }
    this.wasOnFloor = this.onFloor;

    if (!this.isActing && !hurting && this.superCharging === 0 && !this.locked) {
      if (!this.onFloor) this.setState('jump');
      else if (i.moveX !== 0) this.setState('run');
      else this.setState('idle');
      if (this.state === 'run') {
        const back = i.moveX === -this.facing;
        if (this.anims.inReverse !== back) back ? this.playReverse(`${this.def.id}/run`, true) : this.play(`${this.def.id}/run`, true);
        // the cycle follows the real ground speed: short first strides while accelerating, no skating
        const pace = Math.abs(this.body.velocity.x) / (P.runSpeed * this.stats.speed);
        this.anims.timeScale = Phaser.Math.Clamp(pace * (sprinting ? 1.07 : 1), 0.45, 1.6) * (back ? 0.85 : 1);
      }
    }
    if (this.state === 'jump' && !this.onFloor) {
      const vy = this.body.velocity.y;
      const frame = vy < -300 ? 1 : vy < 0 ? 2 : vy < 300 ? 3 : 4;
      this.anims.stop();
      this.setFrame(`${this.def.id}/jump/0${frame}`);
    }

    if (!this.isActing && !this.locked && this.scene.physics.overlap(this, ball)) {
      const dir = ball.x >= this.x ? 1 : -1;
      if (Math.abs(ball.body.velocity.x) < 80) ball.nudge(dir, P.bumpNudge);
    }

    // (the aura and the sprint lines are placed in applyPose, once the body has moved)
    const show = sprinting && this.onFloor && !acting;
    this.sprintDir = i.moveX || this.facing;
    this.sprintLines.setVisible(show).setFlipX(this.sprintDir === 1);
    if (show && !this.sprintLines.anims.isPlaying) this.sprintLines.play('fx_speedlines');

    this.stepPose(gdt, acting, hurting);
  }

  resolveHit(ball, now) {
    if (this.actionHitDone) return;
    const def = this.stateDef;
    if (!def?.hitFrames) return;
    const isSuperRelease = this.state === 'super' && this.superCharging === 0;
    const inWindow = isSuperRelease ? now < this.superReleaseUntil : def.hitFrames.includes(this.frameIndex);
    if (!inWindow) return;

    const P = KL.TUNING.player;
    const B = KL.TUNING.ball;
    const S = P.scale; // foot / head reach follow the player's size
    const R = P.reach[this.state];
    if (!R) return;
    const reachX = this.x + this.facing * R.x * S;
    const reachY = this.y - R.y * S;
    if (Phaser.Math.Distance.Between(reachX, reachY, ball.x, ball.y) > R.r * S) return;

    const KIND = { kick_low: 'low', kick_high: 'high', header: 'header', super: 'super' };
    let kind = KIND[this.state];
    if (!kind) return;
    this.actionHitDone = true;
    let angle; // a header is aimed by where the ball meets the head: under its middle it's nodded down
    if (kind === 'header') {
      const H = B.kicks.header;
      angle = Phaser.Math.Clamp(Phaser.Math.RadToDeg(Math.atan2(reachY - ball.y, Math.abs(ball.x - reachX) + 12)), H.minDeg, H.maxDeg);
    }
    // the run-up goes into the strike: taken as the kick began (the plant brakes the body before contact);
    // a header gets half of the body's drift, a super none
    const runUp = kind === 'header' ? this.body.velocity.x * 0.5 : kind === 'super' ? 0 : this.runUp;
    const shot = KL.BallPhysics.launch(kind, this.facing, this.stats.power, runUp * B.carry, B, angle);
    kind = ball.kick(shot, this.index, kind);
    this.pose.x = Math.max(this.pose.x, KL.TUNING.motion.player.kickSquash); // the strike's recoil
    if (kind !== 'super') this.addSuper(KL.TUNING.super.perKick);
    this.bus.emit('KICK', { player: this.index, kind, x: ball.x, y: ball.y });
  }

  destroy(fromScene) {
    if (this.scene) this.unhookPose(this.scene);
    this.aura?.destroy();
    this.sprintLines?.destroy();
    super.destroy(fromScene);
  }
};
