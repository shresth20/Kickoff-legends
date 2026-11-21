/* Welcome screen (scene key 'Menu': every other screen comes back here): the stadium backdrop, the
 * logo with its football slowly spinning, a big Play button and Settings / Credits side by side under
 * it. The art comes from assets/images/welcome/ (built from the raw art in assets/source/ by
 * tools/make-welcome.mjs); the buttons are painted (KL.Paint.pill). The backdrop covers the whole
 * view, the logo rises into the extra sky of a tall screen, and the buttons stay in the 1280×720
 * design area (KL.View). Without the welcome art (placeholder build) the stadium and the atlas logo
 * stand in. */
window.KL = window.KL || {};

/** Where everything sits, in design px (1280×720). */
KL.WELCOME = {
  // the pitch's top edge on welcome_bg (fraction of its height), held at this design y where the
  // view's shape allows: a 16:9 screen shows the backdrop exactly as painted
  horizon: 0.689,
  horizonY: 496,
  logo: { x: 640, top: 52, w: 760 },
  ballTurnMs: 14000, // the logo's football: one slow turn
  play: { x: 640, y: 528, w: 410, h: 124, font: 62 },
  small: { y: 648, xs: [512, 768], w: 218, h: 68, font: 27 },
  glow: { y: 600, sx: 2.3, sy: 0.66 },
};

KL.MenuScene = class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  /**
   * Paint the welcome screen's buttons (every state), play glyph and glow now, while the loading
   * screen is up (js/scenes/Boot.js), so the welcome screen's first frame is complete and hovering
   * never paints.
   */
  static warm(scene) {
    const { play, small } = KL.WELCOME;
    for (const state of [0, 1, 2]) {
      KL.Paint.pill(scene, 'play', state, play.w, play.h);
      KL.Paint.pill(scene, 'blue', state, small.w, small.h);
    }
    KL.Paint.playIcon(scene, Math.round(play.h * KL.PILL_KINDS.play.icon));
    KL.Paint.glow(scene, 128, MenuScene.GLOW);
    // the full-screen button (top-right): its square face in every state, and both glyphs
    for (const state of [0, 1, 2]) KL.Paint.button(scene, 'icon', state, 64, 64);
    for (const exit of [false, true]) KL.Paint.fullscreenIcon(scene, KL.FULLSCREEN_ICON, exit);
  }

  create() {
    const V = KL.View;
    const L = KL.WELCOME;
    const has = (key) => this.textures.exists(key);
    const still = !!KL.Motion?.reduced;
    KL.audio?.playMusic('menu');

    const bg = has('welcome_bg') ? this.add.image(0, 0, 'welcome_bg').setOrigin(0.5, 0) : null;
    if (bg) {
      // the soft light on the grass behind the buttons
      KL.Paint.place(this, L.play.x, L.glow.y, KL.Paint.glow(this, 128, MenuScene.GLOW)).setScale(L.glow.sx / KL.UIRES, L.glow.sy / KL.UIRES).setDepth(1);
    } else KL.Stadium.build(this, { night: false, parallax: false });

    let logo;
    if (has('welcome_logo') || KL.hasUiFrame(this, 'ui_logo')) {
      logo = has('welcome_logo') ? this.add.image(L.logo.x, 0, 'welcome_logo') : this.add.image(L.logo.x, 0, 'ui', 'ui_logo');
      logo.setOrigin(0.5, 0).setScale(L.logo.w / logo.width);
    } else {
      logo = this.add.container(L.logo.x, 0);
      logo.add([KL.displayText(this, 0, 70, 'KICKOFF', 96), KL.displayText(this, 0, 160, 'LEGENDS', 96, '#e63946')]);
    }
    logo.setDepth(3);

    // the logo's football turns slowly: its panels spin under the art's own light, which stays put
    // (tools/make-welcome.mjs cuts the two layers; welcome.js says where the ball sits on the logo)
    const at = window.KL_WELCOME_ART?.logoBall;
    let ball = null;
    if (at && has('welcome_logo') && has('welcome_ball') && has('welcome_ball_light')) {
      const s = logo.scaleX;
      ball = {
        panels: this.add.image(0, 0, 'welcome_ball').setScale(s).setDepth(3.1),
        light: this.add.image(0, 0, 'welcome_ball_light').setScale(s).setDepth(3.2).setBlendMode(Phaser.BlendModes.MULTIPLY),
        dx: (at.x + 0.5 - logo.width / 2) * s, // at = the centre pixel: its middle is half a px in
        dy: (at.y + 0.5) * s,
      };
      if (!still) this.tweens.add({ targets: ball.panels, angle: 360, duration: KL.paced(L.ballTurnMs), repeat: -1, ease: 'Linear' });
    }

    const P = L.play, S = L.small;
    const play = new KL.Button(this, P.x, P.y, KL.t('menu_play'), () => KL.goTo(this, 'CharSelect', { night: !!this.registry.get('night') }), {
      kind: 'play', width: P.w, height: P.h, fontSize: P.font, iconSpec: (size) => KL.Paint.playIcon(this, size),
    });
    const settings = new KL.Button(this, S.xs[0], S.y, KL.t('menu_settings'), () => KL.goTo(this, 'Settings', { from: 'Menu' }), {
      kind: 'blue', width: S.w, height: S.h, fontSize: S.font, icon: 'ui_icons/03',
    });
    const credits = new KL.Button(this, S.xs[1], S.y, KL.t('menu_credits'), () => KL.goTo(this, 'Credits'), {
      kind: 'blue', width: S.w, height: S.h, fontSize: S.font, icon: 'ui_icons/10',
    });
    const items = [play, settings, credits];
    items.forEach((b) => b.setDepth(4));
    this.nav = new KL.MenuNav(this, items, { grid: [[0], [1, 2]] });
    // Play breathes to invite the first tap
    if (!still) this.tweens.add({ targets: play, scaleX: 1.03, scaleY: 1.03, duration: KL.paced(900), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    // full screen on / off in the top-right corner, on every device (an iPhone gets the how-to)
    const fullscreen = KL.fullscreenButton(this, { iosHint: true });

    V.layout(this, (v) => {
      fullscreen?.setPosition(v.right - 46 * v.ui, v.top + 46 * v.ui).setBaseScale(v.ui);
      if (bg) {
        // cover the whole view; keep the horizon where the art has it unless that would show an edge
        const s = Math.max(v.w / bg.width, v.h / bg.height), h = bg.height * s;
        bg.setScale(s).setPosition(v.x + v.w / 2, Phaser.Math.Clamp(L.horizonY - L.horizon * h, v.y + v.h - h, v.y));
      }
      logo.setY(v.top / 2 + L.logo.top); // a tall screen's extra sky: the logo moves up halfway into it
      if (ball) {
        ball.panels.setPosition(logo.x + ball.dx, logo.y + ball.dy);
        ball.light.setPosition(logo.x + ball.dx, logo.y + ball.dy);
      }
    });
    KL.fadeIn(this);
  }
};
KL.MenuScene.GLOW = 'rgba(190,255,215,0.5)';
