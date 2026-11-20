/* Boot: tries to load the sliced atlases + backgrounds from assets/images.
 * Any file that is missing (404 / file:// block) is replaced by procedural
 * placeholder art, so the game always boots. Then shows the title/press-any-key. */
window.KL = window.KL || {};

KL.BootScene = class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const W = KL.TUNING.world;
    this.cameras.main.setBackgroundColor('#0f1230');
    this.add.rectangle(W.width / 2, W.height / 2, W.width, W.height, 0x0f1230);
    const title = KL.displayText(this, W.width / 2, W.height / 2 - 60, KL.t('app_title'), 72);
    const bar = this.add.graphics();
    const label = KL.bodyText(this, W.width / 2, W.height / 2 + 60, `${KL.t('loading')}…`, 20, '#ffffff');
    this.tipText = KL.bodyText(this, W.width / 2, W.height - 60, KL.t(`tip_${Phaser.Math.Between(1, 4)}`), 18, '#9aa1b8');
    const draw = (p) => {
      bar.clear();
      bar.fillStyle(0x1b1f3b, 1);
      bar.fillRoundedRect(W.width / 2 - 200, W.height / 2 + 10, 400, 18, 9);
      bar.fillStyle(0x3fbf5a, 1);
      bar.fillRoundedRect(W.width / 2 - 200, W.height / 2 + 10, 400 * p, 18, 9);
      bar.lineStyle(3, 0xffffff, 1);
      bar.strokeRoundedRect(W.width / 2 - 200, W.height / 2 + 10, 400, 18, 9);
      bar.fillStyle(0xffffff, 1);
      bar.fillRect(W.width / 2 - 2, W.height / 2 + 10, 4, 18);
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
    for (const key of ['characters', 'props', 'ui', 'fx']) {
      [].concat(window.KL_ATLASES?.[key] || []).forEach((page, i) => this.load.image(`atlas_${key}_${i}`, `${img}/atlases/${page.meta.image}`));
    }
    for (const key of ['bg_sky', 'bg_sky_night', 'bg_stands', 'bg_fence_crowd_a', 'bg_fence_crowd_b', 'bg_fence_crowd_c', 'bg_crowd_calm', 'bg_crowd_cheer', 'bg_pitch']) {
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
    for (const key of ['characters', 'props', 'ui', 'fx']) {
      const pages = [].concat(atlases[key] || []);
      const temp = pages.map((_, i) => `atlas_${key}_${i}`);
      if (pages.length && temp.every((t) => this.textures.exists(t))) {
        // one texture key, one source image per page (Phaser multi-atlas)
        this.textures.addAtlasJSONHash(key, temp.map((t) => this.textures.get(t).getSourceImage()), pages);
      }
      temp.forEach((t) => this.textures.exists(t) && this.textures.remove(t));
    }
    const realAtlases = ['characters', 'props', 'ui', 'fx'].filter((k) => this.textures.exists(k)).length;
    KL.Placeholders.makeAll(this); // fills whatever is still missing
    KL.artSource = realAtlases === 4 ? 'studio' : realAtlases > 0 ? 'mixed' : 'placeholder';

    if (KL.hasUiFrame(this, 'ui_logo')) {
      // swap the text title for the logo art once the atlases are in
      this.title.setVisible(false);
      this.title = this.add.image(KL.TUNING.world.width / 2, KL.TUNING.world.height / 2 - 120, 'ui', 'ui_logo');
      KL.fit(this.title, 560, 230);
      this.title.baseScale = this.title.scaleX;
    }
    this.label.setText(KL.t('press_any_key'));
    this.tweens.add({ targets: this.label, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });
    const bs = this.title.baseScale ?? 1;
    this.tweens.add({ targets: this.title, scaleX: bs * 1.04, scaleY: bs * 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const go = () => {
      KL.audio?.unlock();
      KL.goTo(this, 'Menu');
    };
    this.input.keyboard.once('keydown', go);
    this.input.once('pointerdown', go);
    // auto-advance if nobody presses within a few seconds (kiosk/demo friendliness)
    this.time.delayedCall(6000, () => this.scene.isActive() && go());
  }
};
