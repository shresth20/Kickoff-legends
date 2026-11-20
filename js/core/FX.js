/* FXManager: one-shot effects, particles, hit-stop and camera shake.
 * Subscribes to the match EventBus so gameplay code never calls it directly.
 * Kick starbursts and dust clouds are the fx_impact / fx_dust art (fx atlas), played here. The speed
 * lines, whistle, super-ready twinkles and goal confetti are drawn by the CSS layer (js/core/FXLayer.js
 * + css/fx.css) when it is on, with sprite fallbacks (?cssfx=0). Shake and hit-stop stay here. */
window.KL = window.KL || {};

KL.FX = class FXManager {
  /** @param {Phaser.Scene} scene @param {KL.EventBus} bus */
  constructor(scene, bus) {
    this.scene = scene;
    this.bus = bus;
    this.offs = [];
    const css = (this.css = KL.FXLayer?.enabled() ? new KL.FXLayer(scene) : null);
    const a = scene.anims;
    const def = (key, prefix, end, fps) => {
      if (!a.exists(key)) a.create({ key, frames: a.generateFrameNames('fx', { prefix, start: 0, end, zeroPad: 2 }), frameRate: fps, repeat: 0 });
    };
    def('fx_impact', 'fx_impact/', 4, 24);
    def('fx_dust', 'fx_dust/', 5, 18);
    def('fx_whistle', 'fx_whistle/', 2, 10);

    if (!css) {
      this.confetti = scene.add.particles(0, 0, 'fx', {
        frame: ['fx_confetti/00', 'fx_confetti/01', 'fx_confetti/02', 'fx_confetti/03', 'fx_confetti/04', 'fx_confetti/05', 'fx_confetti/06', 'fx_confetti/07'],
        x: { min: 0, max: KL.TUNING.world.width },
        y: -40,
        lifespan: 2600,
        speedY: { min: 120, max: 320 },
        speedX: { min: -60, max: 60 },
        rotate: { min: 0, max: 360 },
        scale: { min: 0.5, max: 1 },
        gravityY: 120,
        quantity: 1, // ~25 pieces/s → ~50 per goal: a sprinkle, not a curtain over the play
        frequency: 40,
        emitting: false,
      }).setDepth(40);
    }

    this.offs.push(
      bus.on('KICK', (e) => {
        this.impact(e.x, e.y, e.kind);
        this.shake(e.kind === 'super' ? KL.TUNING.juice.goalShakePx : KL.TUNING.juice.kickShakePx, 80);
        this.hitStop(e.kind === 'super' ? KL.TUNING.juice.hitStopMs * 2 : KL.TUNING.juice.hitStopMs);
      }),
      bus.on('LAND', (e) => this.dust(e.x, e.y - 8, 0.62)),
      bus.on('HURT', () => this.shake(4, 150)),
      bus.on('GOAL', (e) => {
        this.shake(KL.TUNING.juice.goalShakePx, 350);
        if (css) css.confetti(scene.defs?.[e.scorer]);
        else {
          this.confetti.start();
          scene.time.delayedCall(KL.TUNING.juice.confettiMs, () => this.confetti.stop());
        }
      }),
      bus.on('WHISTLE', (e) => (css ? css.whistle(e.reason) : this.burst('fx_whistle', KL.TUNING.world.width / 2, 300, 1.2))),
      bus.on('SUPER_READY', (e) => css?.superReady(scene.players?.[e.player])),
      bus.on('PAUSE', (e) => css?.setPaused(e.paused)),
    );
    // sprint footfalls: see update()
    this.stepMs = [0, 0];
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
  }

  burst(anim, x, y, scale = 1, depth = 30) {
    const s = this.scene.add.sprite(x, y, 'fx').setDepth(depth).setScale(scale);
    s.play(anim);
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
    return s;
  }

  /** Kick starburst (fx_impact): sized by the strike, turned and mirrored at random so no two match. */
  impact(x, y, kind) {
    const k = { header: 0.7, clash: 1, super: 1.35 }[kind] ?? 0.8;
    this.burst('fx_impact', x, y, k * Phaser.Math.FloatBetween(0.92, 1.08))
      .setAngle(Phaser.Math.Between(-25, 25))
      .setFlipX(Math.random() < 0.5);
    // a strike along the turf kicks up some dust
    const G = KL.TUNING.world.groundY;
    if ((kind === 'low' || kind === 'super') && y > G - 60) this.dust(x, G - 8, 0.45);
  }

  /** Dust cloud (fx_dust). dir ≠ 0: it drifts that way as it puffs out (sprint dust trails the runner). */
  dust(x, y, scale, dir = 0, depth = 30) {
    const s = this.burst('fx_dust', x, y, scale, depth).setFlipX(Math.random() < 0.5);
    if (dir) this.scene.tweens.add({ targets: s, x: x + dir * 22, y: y - 4, duration: 330, ease: 'Sine.out' });
  }

  /** Sprinting on the turf (Player shows its sprint lines): a small cloud behind the boots every stride. */
  update(time, delta) {
    const s = this.scene;
    if (s.paused || s.physics.world.isPaused) return;
    s.players?.forEach((p, i) => {
      if (!p.sprintLines?.visible) {
        this.stepMs[i] = 0;
        return;
      }
      if ((this.stepMs[i] -= delta * s.time.timeScale) > 0) return;
      this.stepMs[i] = Phaser.Math.Between(110, 150);
      const dir = p.sprintLines.flipX ? 1 : -1; // Player flips the lines for a rightward run
      this.dust(p.x - dir * 14, p.y - 6, 0.3, -dir, p.depth - 1);
    });
  }

  shake(px, ms) {
    if (!KL.Save.settings.screenShake) return;
    // Phaser's shake offset is intensity × camera width × zoom, applied before the zoom again:
    // divide by RES² so `px` stays logical pixels at any render resolution.
    this.scene.cameras.main.shake(ms, px / 1000 / (KL.RES * KL.RES));
  }

  hitStop(ms) {
    if (!ms) return;
    const s = this.scene;
    if (s.physics.world.isPaused || s._hitStopping) return;
    s._hitStopping = true;
    s.physics.world.pause();
    s.anims.pauseAll();
    s.time.delayedCall(ms, () => {
      s._hitStopping = false;
      if (s.paused) return; // the pause menu opened meanwhile; resuming is its job
      s.physics.world.resume();
      s.anims.resumeAll();
    });
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.offs.forEach((off) => off());
    this.confetti?.destroy();
    this.css?.destroy();
  }
};
