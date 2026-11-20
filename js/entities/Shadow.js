/* Ground shadows: a soft dark ellipse on the grass under each player and the ball. It shrinks and
 * fades as they rise, so a jump or a lob reads at a glance and everything sits on the pitch instead of
 * floating over it. Crisp under the day sun, softer under the night floodlights. */
window.KL = window.KL || {};

KL.SHADOW = {
  alpha: { day: 0.32, night: 0.2 },
  fadeHeight: 380, // px above the ground at which a shadow is at its smallest / faintest
  minScale: 0.45,
  minAlpha: 0.25, // × the shadow's alpha, at fadeHeight and above
  flat: 0.24, // ellipse height / width (the pitch seen from low down)
  player: 1.6, // × body width
  ball: 2.2, // × ball radius
  // the slicer stands characters on a baseline 94 % down their frame: the drawn feet are this fraction
  // of the sprite above its physics bottom, and the shadow belongs under the drawn feet
  feetGap: 0.06,
};

KL.GroundShadow = class GroundShadow {
  /** Soft-edged disc at device resolution; drawn squashed into an ellipse. */
  static texture(scene) {
    const R = KL.RES;
    const key = `kl:shadow:${R}`;
    if (scene.textures.exists(key)) return key;
    const s = 64 * R, m = s / 2, c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(m, m, 0, m, m, m);
    g.addColorStop(0, 'rgba(10,30,15,1)');
    g.addColorStop(0.55, 'rgba(10,30,15,0.9)');
    g.addColorStop(1, 'rgba(10,30,15,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    scene.textures.addImage(key, c);
    return key;
  }

  /** Shadows for the match's players and ball, kept in step with them after every physics step. */
  static addAll(scene, players, ball, night) {
    const P = KL.TUNING.player, B = KL.TUNING.ball, C = KL.SHADOW;
    const all = [
      ...players.map((p) => new GroundShadow(scene, p, P.bodyWidth * P.scale * C.player, () => p.y, night, p.displayHeight * C.feetGap)),
      new GroundShadow(scene, ball, B.radius * C.ball, () => ball.y + B.radius, night, 0),
    ];
    const sync = () => all.forEach((s) => s.update());
    sync();
    scene.events.on('postupdate', sync);
    scene.events.once('shutdown', () => scene.events.off('postupdate', sync));
    return all;
  }

  /**
   * @param {Phaser.GameObjects.Sprite} target
   * @param {number} width  shadow width on the ground (px)
   * @param {() => number} bottom  the target's lowest point (feet / underside of the ball)
   * @param {number} lift  px above the ground line where it visibly stands
   */
  constructor(scene, target, width, bottom, night, lift) {
    this.target = target;
    this.width = width;
    this.bottom = bottom;
    this.lift = lift;
    this.alpha = night ? KL.SHADOW.alpha.night : KL.SHADOW.alpha.day;
    // over the pitch, its night shade and the worn goalmouth; under the goals and the players
    this.img = scene.add.image(target.x, KL.TUNING.world.groundY, GroundShadow.texture(scene)).setDepth(4);
    this.texW = this.img.width;
  }

  update() {
    const t = this.target, C = KL.SHADOW, img = this.img;
    if (!t.active) return img.setVisible(false);
    const ground = KL.TUNING.world.groundY;
    const k = 1 - Math.min(1, Math.max(0, ground - this.bottom()) / C.fadeHeight); // 1 on the ground … 0 high up
    const w = this.width * (C.minScale + (1 - C.minScale) * k);
    img.setVisible(t.visible).setPosition(t.x, ground + 1 - this.lift);
    img.setScale(w / this.texW, (w * C.flat) / this.texW);
    img.setAlpha(this.alpha * (C.minAlpha + (1 - C.minAlpha) * k));
  }
};
