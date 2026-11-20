/* Crisp rendering on any screen.
 * Game code lays everything out in 1280×720 "logical" px (KL.TUNING.world). Instead of drawing
 * into a 1280×720 canvas that the browser then stretches with CSS (soft text and art on Retina /
 * large windows), the canvas is created at the display's real pixel density — KL.RES × the view
 * (KL.View: 1280×720 grown to the screen's shape) — and every scene camera is zoomed by KL.RES from
 * its top-left corner and scrolled to the view's top-left. Sprites, vector shapes and text (see
 * KL.displayText) are therefore rasterised at device resolution, and the 1280×720 design area keeps
 * its coordinates on every screen. */
window.KL = window.KL || {};

(() => {
  const W = KL.TUNING.world;
  const params = new URLSearchParams(location.search);
  const dpr = window.devicePixelRatio || 1;
  // Size for the largest the game can be shown on this screen (full screen, landscape). Phones report
  // their screen in portrait on iOS, so measure the long and short sides, not width and height.
  const long = Math.max(screen.width, screen.height), short = Math.min(screen.width, screen.height);
  const fill = Math.min(long / W.width, short / W.height);
  // file:// runs on the Canvas renderer (see main.js), which is CPU-heavier: cap it lower; phones
  // and tablets are capped too (fill rate), which their pixel density hides
  const cap = location.protocol === 'file:' || KL.View.touch ? 2 : 3;
  const wanted = Number(params.get('res')) || dpr * fill;
  // quarter steps keep the canvas a whole number of pixels (view sizes are multiples of 4)
  KL.RES = Math.min(cap, Math.max(1, Math.round(wanted * 4) / 4));
  /**
   * Resolution of UI textures (painted by KL.Paint) and text. A phone shows its UI scaled up
   * (KL.View.ui), so it is rasterised that much finer to stay sharp; elsewhere it equals KL.RES.
   */
  KL.UIRES = KL.RES * KL.View.ui;

  /** Camera bounds clamp for a top-left-origin camera (Phaser's assumes a centred origin). */
  function clampX(x) {
    const b = this._bounds;
    return Phaser.Math.Clamp(x, b.x, Math.max(b.x, b.x + b.width - this.displayWidth));
  }
  function clampY(y) {
    const b = this._bounds;
    return Phaser.Math.Clamp(y, b.y, Math.max(b.y, b.y + b.height - this.displayHeight));
  }

  /**
   * Installed into every scene (main.js → plugins.scene). Runs on each scene START, after the
   * CameraManager has (re)created the main camera and before the scene's create(), and again when
   * the view changes size, so scenes keep working in logical px: the 1280×720 design area is always
   * at (0, 0)–(1280, 720), input is converted by the camera, and the view's edges are KL.View's.
   */
  KL.HiDPIPlugin = class HiDPIPlugin extends Phaser.Plugins.ScenePlugin {
    boot() {
      this.systems.events.on(Phaser.Scenes.Events.START, this.apply, this);
      KL.View.events.on('change', this.apply, this);
      this.systems.events.once(Phaser.Scenes.Events.DESTROY, () => KL.View.events.off('change', this.apply, this));
    }
    apply() {
      const cam = this.systems.cameras?.main;
      if (!cam) return;
      const scale = this.systems.game.scale;
      cam.setOrigin(0, 0).setZoom(KL.RES);
      cam.setSize(scale.width, scale.height);
      cam.setScroll(KL.View.x, KL.View.y);
      cam.clampX = clampX;
      cam.clampY = clampY;
    }
  };

  /** Pointer → logical world point (pointer.x/y are canvas pixels, i.e. scaled by KL.RES). */
  KL.worldPoint = (scene, pointer) => scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
})();
