/* A playable footballer. Owns its animation state machine; receives Intents from
 * whichever IntentSource drives it (keyboard or AI) and never reads keys itself.
 *
 * Motion: the run speed ramps up and brakes (KL.TUNING.player.runAccel / runDecel) instead of
 * snapping between 0 and full speed, and the run cycle plays at the real ground speed. On top of the
 * sprite frames a light "pose" layer adds weight: a stretch on take-off, a squash on landing that
 * grows with the fall, a lean into starts and stops, and a recoil tilt when hit. The pose is applied
 * only for the render pass (PRE_RENDER → RENDER) and undone right after, because scaling an Arcade
 * sprite would also resize its body — the hitbox never changes. Feel numbers: KL.TUNING.motion.player. */
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
    const m = (v) => 1 + (v - 3) * 0.075; // stat 1..5 → ±15 %
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
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.applyPose, this);
    scene.events.on(Phaser.Scenes.Events.RENDER, this.clearPose, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unhookPose(scene));
  }

  /** Draw-time only: squash/stretch about the feet (origin 0.5, 1) plus lean and recoil. */
  applyPose() {
    if (!this.body) return;
    const q = this.pose.x;
    this.setScale(this.baseScaleX * (1 + q * KL.TUNING.motion.player.widen), this.baseScaleY * (1 - q));
    this.rotation = this.lean + this.tilt.x;
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
    for (const a of KL.CHARACTER_ANIMS) {
      const key = `${this.def.id}/${a.key}`;
      if (anims.exists(key)) continue;
      anims.create({ key, frames: anims.generateFrameNames('characters', { prefix: `${this.def.id}/${a.key}/`, start: 0, end: a.frames - 1, zeroPad: 2 }), frameRate: a.fps, repeat: a.loop ? -1 : 0 });
    }
    if (!anims.exists('fx_super_aura')) {
      anims.create({ key: 'fx_super_aura', frames: anims.generateFrameNames('fx', { prefix: 'fx_super_aura/', start: 0, end: 7, zeroPad: 2 }), frameRate: 14, repeat: -1 });
      anims.create({ key: 'fx_speedlines', frames: anims.generateFrameNames('fx', { prefix: 'fx_speedlines/', start: 0, end: 3, zeroPad: 2 }), frameRate: 18, repeat: -1 });
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
    this.hurtUntil = 0;
    this.locked = false; // released from a goal / full-time pose
    this.hideAura(false);
    this.pose.reset();
    this.tilt.reset();
    this.lean = 0;
    this.prevVx = 0;
    this.fallVy = 0;
    this.setState('idle');
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
    this.scene.tweens.add({ targets: a, scaleX: s.x, scaleY: s.y, duration: 160, ease: 'Back.out' });
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
    this.scene.tweens.add({ targets: a, scaleX: s.x * 1.4, scaleY: s.y * 1.3, alpha: 0, duration: 220, ease: 'Cubic.out', onComplete: reset });
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
    const def = KL.CHARACTER_ANIMS.find((a) => a.key === next);
    this.actionUntil = this.scene.time.now + (durationMs ?? (def.frames / def.fps) * 1000);
  }

  /** Called by MatchScene each frame with dt in seconds. */
  step(ball, dt) {
    const now = this.scene.time.now;
    const P = KL.TUNING.player;
    const i = this.frozen || this.locked ? KL.EMPTY_INTENT : this.intent;

    if (i.sprint && i.moveX !== 0 && this.stamina > 0) this.stamina = Math.max(0, this.stamina - dt / P.sprintStaminaSec);
    else this.stamina = Math.min(1, this.stamina + dt / P.sprintRechargeSec);
    const sprinting = i.sprint && this.stamina > 0.05 && i.moveX !== 0;

    const hurting = now < this.hurtUntil;
    const acting = this.isActing && this.state !== 'land';
    const PM = KL.TUNING.motion.player;
    const world = this.scene.physics.world;
    const gdt = world.isPaused ? 0 : dt / world.timeScale; // game time: stops in hit-stop, slows in slow-mo
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
        rate = P.plantDecel; // planting the standing foot for a kick
      }
      this.body.setVelocityX(KL.Motion.approach(vx, target, rate * gdt));
    }
    this.setFlipX(this.facing === -1);

    if (i.jump && this.onFloor && !hurting && !acting && this.superCharging === 0) {
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
      this.superCharging -= dt * 1000;
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

    if (!hurting && !acting && this.superCharging === 0) {
      if (i.kickLow) this.setState('kick_low');
      else if (i.kickHigh) this.setState(this.onFloor ? 'kick_high' : 'header');
    }

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

    const S = KL.TUNING.player.scale;
    this.aura.setPosition(this.x, this.y - 95 * S);
    const show = sprinting && this.onFloor && !acting;
    const runDir = i.moveX || this.facing;
    this.sprintLines.setVisible(show).setPosition(this.x - runDir * 110 * S, this.y - 80 * S).setFlipX(runDir === 1);
    if (show && !this.sprintLines.anims.isPlaying) this.sprintLines.play('fx_speedlines');

    this.stepPose(gdt, acting, hurting);
  }

  resolveHit(ball, now) {
    if (this.actionHitDone) return;
    const def = KL.CHARACTER_ANIMS.find((a) => a.key === this.state);
    if (!def?.hitFrames) return;
    const isSuperRelease = this.state === 'super' && this.superCharging === 0;
    const frameIdx = (this.anims.currentFrame?.index ?? 1) - 1;
    const inWindow = isSuperRelease ? now < this.superReleaseUntil : def.hitFrames.includes(frameIdx);
    if (!inWindow) return;

    const P = KL.TUNING.player;
    const B = KL.TUNING.ball;
    const S = P.scale; // foot / head reach follow the player's size
    const reachX = this.x + this.facing * 55 * S;
    const reachY = this.state === 'header' ? this.y - 150 * S : this.y - 40 * S;
    const d = Phaser.Math.Distance.Between(reachX, reachY, ball.x, ball.y);
    const radius = (P.kickRadius + (this.state === 'super' ? 130 : 0) + (this.state === 'header' ? 20 : 0)) * S;
    if (d > radius) return;

    this.actionHitDone = true;
    const carry = this.body.velocity.x * B.kickLow.carry;
    const pow = this.stats.power;
    let kind;
    switch (this.state) {
      case 'kick_low':
        ball.kick(this.facing, B.kickLow.speed * pow, B.kickLow.angleDeg, carry, this.index, 'low');
        kind = 'low';
        break;
      case 'kick_high':
        ball.kick(this.facing, B.kickHigh.speed * pow, B.kickHigh.angleDeg, carry, this.index, 'high');
        kind = 'high';
        break;
      case 'header': {
        const ang = Phaser.Math.RadToDeg(Math.atan2(-(ball.y - reachY), Math.abs(ball.x - reachX) + 1));
        ball.kick(this.facing, B.header.speed * pow, Phaser.Math.Clamp(ang, 5, 60), carry * 0.5, this.index, 'header');
        kind = 'header';
        break;
      }
      case 'super':
        ball.kick(this.facing, B.super.speed, B.super.angleDeg, 0, this.index, 'super');
        kind = 'super';
        break;
      default:
        return;
    }
    if (ball.lastTouchKind === 'clash') kind = 'clash';
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
