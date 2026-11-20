/* Boot: tries to load the sliced atlases + backgrounds from assets/images.
 * Any file that is missing (404 / file:// block) is replaced by procedural
 * placeholder art, so the game always boots. Then shows the title/press-any-key. */
window.KL = window.KL || {};

/** The sliced atlases (tools/slice-sheet.mjs); crowd = the fans of the stands. */
KL.ATLAS_KEYS = ['characters', 'props', 'ui', 'fx', 'crowd'];

/**
 * Canvas renderer only (file://): the browser decodes an <img> lazily, on the frame it is first drawn,
 * and may drop the decoded pixels again later — so the first run of a character on the second atlas
 * page, or the first kick's starburst, stalled that frame by up to ~60 ms. Swap every loaded image for
 * an ImageBitmap, decoded once up front (off the main thread) and kept ready to draw. WebGL needs none
 * of this: it uploads every texture while booting.
 */
KL.predecodeTextures = (textures) => {
  if (typeof createImageBitmap !== 'function') return;
  for (const key of textures.getTextureKeys()) {
    for (const src of textures.get(key).source) {
      const img = src.image;
      if (!(img instanceof HTMLImageElement) || !img.complete || !img.naturalWidth) continue;
      createImageBitmap(img)
        .then((bmp) => {
          if (src.image === img) src.image = bmp; // what the Canvas renderer draws from
        })
        .catch(() => {}); // keep drawing the <img>
    }
  }
};

KL.BootScene = class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const V = KL.View;
    this.cameras.main.setBackgroundColor('#0f1230');
    V.cover(this, 0x0f1230);
    // title, loading bar and label in one group centred on the screen; the tip near its bottom edge
    const center = (this.center = this.add.container(0, 0));
    const title = KL.displayText(this, 0, -60, KL.t('app_title'), 72);
    const bar = this.add.graphics();
    const label = KL.bodyText(this, 0, 60, `${KL.t('loading')}…`, V.font(20), '#ffffff');
    center.add([title, bar, label]);
    // touch screens have no keys: their tips are about the on-screen pad
    const tips = V.touch ? ['tip_3', 'tip_touch_1', 'tip_touch_2'] : ['tip_1', 'tip_2', 'tip_3', 'tip_4'];
    this.tipText = KL.bodyText(this, 0, 0, KL.t(Phaser.Utils.Array.GetRandom(tips)), V.font(18), '#9aa1b8', { wrap: 1100 });
    V.layout(this, (v) => {
      center.setPosition(v.cx, v.cy);
      this.tipText.setPosition(v.cx, v.bottom - 60);
    });
    const draw = (p) => {
      bar.clear();
      bar.fillStyle(0x1b1f3b, 1);
      bar.fillRoundedRect(-200, 10, 400, 18, 9);
      bar.fillStyle(0x3fbf5a, 1);
      bar.fillRoundedRect(-200, 10, 400 * p, 18, 9);
      bar.lineStyle(3, 0xffffff, 1);
      bar.strokeRoundedRect(-200, 10, 400, 18, 9);
      bar.fillStyle(0xffffff, 1);
      bar.fillRect(-2, 10, 4, 18);
    };
    draw(0);
    this.load.on('progress', draw);
    this.load.on('loaderror', (file) => {
      this.missing = this.missing || new Set();
      this.missing.add(file.key);
    });
    this.title = title;
    this.label = label;

    // Real art. Atlas JSON comes from window.KL_ATLASES (atlas .js files) so file:// works.
    // A big atlas (characters) is split into several pages; each page image loads separately.
    const img = 'assets/images';
    for (const key of KL.ATLAS_KEYS) {
      [].concat(window.KL_ATLASES?.[key] || []).forEach((page, i) => this.load.image(`atlas_${key}_${i}`, `${img}/atlases/${page.meta.image}`));
    }
    for (const key of ['bg_sky', 'bg_sky_night', 'bg_stands', 'bg_fence', 'bg_pitch']) {
      this.load.image(key, `${img}/backgrounds/${key}.webp`);
    }
    // living sky: clear skies + cloud sheets (window.KL_SKY from sky.js; harmless if missing)
    for (const sky of Object.values(window.KL_SKY || {})) {
      for (const key of [sky.clear, sky.sheet].filter(Boolean)) this.load.image(key, `${img}/backgrounds/${key}.webp`);
    }
  }

  create() {
    // Stop arrow keys / space / numpad from scrolling the page (Phaser-side capture keeps its own listeners first).
    this.input.keyboard.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'SHIFT', 'CTRL', 'NUMPAD_ZERO', 'NUMPAD_ONE', 'NUMPAD_TWO', 'NUMPAD_THREE']);
    const atlases = window.KL_ATLASES || {};
    for (const key of KL.ATLAS_KEYS) {
      const pages = [].concat(atlases[key] || []);
      const temp = pages.map((_, i) => `atlas_${key}_${i}`);
      if (pages.length && temp.every((t) => this.textures.exists(t))) {
        // one texture key, one source image per page (Phaser multi-atlas)
        this.textures.addAtlasJSONHash(key, temp.map((t) => this.textures.get(t).getSourceImage()), pages);
      }
      temp.forEach((t) => this.textures.exists(t) && this.textures.remove(t));
    }
    const realAtlases = KL.ATLAS_KEYS.filter((k) => this.textures.exists(k)).length;
    KL.Placeholders.makeAll(this); // fills whatever is still missing
    KL.artSource = realAtlases === KL.ATLAS_KEYS.length ? 'studio' : realAtlases > 0 ? 'mixed' : 'placeholder';
    if (this.game.renderer.type === Phaser.CANVAS) KL.predecodeTextures(this.textures);

    if (KL.hasUiFrame(this, 'ui_logo')) {
      // swap the text title for the logo art once the atlases are in
      this.title.setVisible(false);
      this.title = this.add.image(0, -120, 'ui', 'ui_logo');
      this.center.add(this.title);
      KL.fit(this.title, 560, 230);
      this.title.baseScale = this.title.scaleX;
    }
    // a phone or tablet: "tap to play" (and that tap also takes it full screen, see KL.Fullscreen)
    this.label.setText(KL.t(KL.View.touch ? 'tap_to_start' : 'press_any_key'));
    this.tweens.add({ targets: this.label, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });
    const bs = this.title.baseScale ?? 1;
    this.tweens.add({ targets: this.title, scaleX: bs * 1.04, scaleY: bs * 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const go = () => {
      KL.audio?.unlock();
      KL.audio?.play('ui_start');
      KL.goTo(this, 'Menu');
    };
    this.input.keyboard.once('keydown', go);
    this.input.once('pointerdown', go);
    // auto-advance if nobody presses within a few seconds (kiosk/demo friendliness)
    this.time.delayedCall(6000, () => this.scene.isActive() && go());
  }
};
