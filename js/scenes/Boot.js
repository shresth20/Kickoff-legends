/* Boot: the loading screen. Tries to load the sliced atlases, backgrounds and welcome art from
 * assets/images, while a football rolls along the loading line (KL.BallLoader). Any file that is
 * missing (404 / file:// block) is replaced by procedural placeholder art, so the game always boots.
 * Once everything is loaded and ready to draw, "Tap to start" takes the line's place: that tap (or a
 * click / any key) unlocks the audio, so the welcome screen (Menu) opens with its music, and takes a
 * phone full screen (KL.Fullscreen). */
window.KL = window.KL || {};

/** The sliced atlases (tools/slice-sheet.mjs); crowd = the fans of the stands. */
KL.ATLAS_KEYS = ['characters', 'props', 'ui', 'fx', 'crowd'];

/**
 * Canvas renderer only (file://): the browser decodes an <img> lazily, on the frame it is first drawn,
 * and may drop the decoded pixels again later — so the first run of a character on the second atlas
 * page, or the first kick's starburst, stalled that frame by up to ~60 ms. Swap every loaded image for
 * an ImageBitmap, decoded once up front (off the main thread) and kept ready to draw. WebGL needs none
 * of this: it uploads every texture while booting. Resolves once every image is decoded (or failed,
 * which keeps drawing the <img>).
 */
KL.predecodeTextures = (textures) => {
  if (typeof createImageBitmap !== 'function') return Promise.resolve();
  const jobs = [];
  for (const key of textures.getTextureKeys()) {
    for (const src of textures.get(key).source) {
      const img = src.image;
      if (!(img instanceof HTMLImageElement) || !img.complete || !img.naturalWidth) continue;
      jobs.push(
        createImageBitmap(img)
          .then((bmp) => {
            if (src.image === img) src.image = bmp; // what the Canvas renderer draws from
          })
          .catch(() => {}), // keep drawing the <img>
      );
    }
  }
  return Promise.all(jobs);
};

/**
 * The loading line: a football rolls along it from left to right as the files come in, the line
 * filling in gold behind it. The ball turns as it rolls (by the distance it covers) and keeps turning
 * slowly while it waits. Its progress eases after the real one, so it rolls instead of jumping, and a
 * load that finishes at once still rolls home. whenDone(fn): fn once loading is complete and the ball
 * has reached the end. Painted in code (KL.Paint.football), so it shows before any image has loaded.
 */
KL.BallLoader = class BallLoader extends Phaser.GameObjects.Container {
  constructor(scene, x, y, width = 440, r = 20) {
    super(scene, x, y);
    scene.add.existing(this);
    this.lineW = width;
    this.r = r;
    this.target = 0;
    this.shown = 0;
    this.line = scene.add.graphics();
    const ball = KL.Paint.football(scene, r);
    this.ball = KL.Paint.place(scene, 0, 0, ball.panels);
    this.light = KL.Paint.place(scene, 0, 0, ball.light);
    this.add([this.line, this.ball, this.light]);
    // scene update events run while the scene is still loading (its update() method does not)
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this));
    this.draw();
  }

  setProgress(p) {
    this.target = Math.max(this.target, p);
    return this;
  }

  whenDone(fn) {
    this.target = 1;
    this.onDone = fn;
    return this;
  }

  tick(time, delta) {
    if (!this.active) return;
    const dt = Math.min(0.1, delta / 1000);
    const was = this.shown;
    // ease toward the real progress, never slower than a steady roll, never past it
    this.shown = Math.min(this.target, this.shown + Math.max((this.target - this.shown) * 5 * dt, 0.45 * dt));
    this.ball.rotation += ((this.shown - was) * this.lineW) / this.r + dt * 1.6;
    this.draw();
    if (this.shown >= 1 && this.onDone) {
      const fn = this.onDone;
      this.onDone = null;
      fn();
    }
  }

  draw() {
    const W = this.lineW, h = 8, x0 = -W / 2, fill = this.shown * W;
    const g = this.line;
    g.clear();
    g.fillStyle(0xffffff, 0.16); // the line still to cover
    g.fillRoundedRect(x0, -h / 2, W, h, h / 2);
    if (fill > 0) {
      g.fillStyle(KL.PAL.goldDark, 1); // covered: gold, lit along its top
      g.fillRoundedRect(x0, -h / 2, Math.max(h, fill), h, h / 2);
      g.fillStyle(KL.PAL.goldLight, 1);
      g.fillRoundedRect(x0, -h / 2, Math.max(h, fill), h * 0.5, { tl: h / 2, tr: h / 2, bl: 0, br: 0 });
    }
    this.ball.x = this.light.x = x0 + fill;
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
    // title and loading line in one group centred on the screen
    const center = this.add.container(0, 0);
    const title = KL.displayText(this, 0, -48, KL.t('app_title'), 72);
    const loader = new KL.BallLoader(this, 0, 42);
    center.add([title, loader]);
    this.loading = { center, loader };
    V.layout(this, (v) => center.setPosition(v.cx, v.cy));
    this.load.on('progress', (p) => loader.setProgress(p));
    this.load.on('loaderror', (file) => {
      this.missing = this.missing || new Set();
      this.missing.add(file.key);
    });

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
    // the welcome screen: backdrop, logo and the logo's spinning football (tools/make-welcome.mjs)
    for (const key of ['welcome_bg', 'welcome_logo', 'welcome_ball', 'welcome_ball_light']) this.load.image(key, `${img}/welcome/${key}.webp`);
    // the controller's buttons (tools/make-pad.mjs; without them js/ui/TouchControls.js paints its own)
    if (window.KL_PAD_ART) this.load.image('pad_art', `${img}/pad/pad.webp`);
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
    // Nothing may pop in or stall after "Tap to start": the welcome screen's painted buttons are
    // painted now, and (Canvas renderer) every image is decoded before the prompt shows. WebGL has
    // already uploaded every texture as it loaded. The cap keeps a stuck decode from holding it up.
    KL.MenuScene.warm(this);
    const decoded = this.game.renderer.type === Phaser.CANVAS ? KL.predecodeTextures(this.textures) : Promise.resolve();
    Promise.race([decoded, new Promise((ok) => setTimeout(ok, 5000))]).then(() => {
      if (this.scene.isActive()) this.loading.loader.whenDone(() => this.waitForTap());
    });
  }

  /**
   * Loaded and the ball home: the loading line gives way to a blinking "Tap to start" in its place.
   * Browsers keep sound off until the player touches the page, so the welcome screen waits for this tap.
   */
  waitForTap() {
    const { center, loader } = this.loading;
    const prompt = KL.displayText(this, 0, loader.y, KL.t('tap_to_start'), 34, '#ffffff').setAlpha(0);
    center.add(prompt);
    this.tweens.add({ targets: loader, alpha: 0, duration: KL.paced(180), onComplete: () => loader.setVisible(false) });
    this.tweens.add({
      targets: prompt, alpha: 1, duration: KL.paced(220), delay: KL.paced(120),
      onComplete: () => this.tweens.add({ targets: prompt, alpha: 0.35, duration: KL.paced(600), yoyo: true, repeat: -1, ease: 'Sine.inOut' }),
    });
    const go = () => {
      KL.audio?.unlock(); // inside the gesture: the welcome screen's music can start
      KL.audio?.play('ui_start');
      KL.goTo(this, 'Menu');
    };
    this.input.keyboard.once('keydown', go);
    this.input.once('pointerdown', go);
    this.ready = true; // tools/smoke.mjs waits for this before tapping
  }
};
