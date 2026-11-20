/* Crisp rendering on any screen.
 * Game code lays everything out in 1280×720 "logical" px (KL.TUNING.world). Instead of drawing
 * into a 1280×720 canvas that the browser then stretches with CSS (soft text and art on Retina /
 * large windows), the canvas is created at the display's real pixel density — KL.RES × 1280×720 —
 * and every scene camera is zoomed by KL.RES from its top-left corner. Sprites, vector shapes and
 * text (see KL.displayText) are therefore rasterised at device resolution. */
window.KL = window.KL || {};

(() => {
  const W = KL.TUNING.world;
  const params = new URLSearchParams(location.search);
  const dpr = window.devicePixelRatio || 1;
  // Size for the largest the game can be shown on this screen (full-screen / maximised window).
  // A smaller window just downsamples, which stays sharp.
  const fill = Math.min(screen.width / W.width, screen.height / W.height);
  // file:// runs on the Canvas renderer (see main.js), which is CPU-heavier: cap it lower.
  const cap = location.protocol === 'file:' ? 2 : 3;
  const wanted = Number(params.get('res')) || dpr * fill;
  // quarter steps keep the canvas a whole number of pixels (1280 × 0.25 = 320, 720 × 0.25 = 180)
  KL.RES = Math.min(cap, Math.max(1, Math.round(wanted * 4) / 4));

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
   * CameraManager has (re)created the main camera and before the scene's create(), so scenes keep
   * working in logical px: scrollX is still the left edge of the view, input is converted by
   * the camera, and scrollFactor(0) objects stay pinned to the screen.
   */
  KL.HiDPIPlugin = class HiDPIPlugin extends Phaser.Plugins.ScenePlugin {
    boot() {
      this.systems.events.on(Phaser.Scenes.Events.START, this.apply, this);
    }
    apply() {
      const cam = this.systems.cameras.main;
      cam.setOrigin(0, 0).setZoom(KL.RES);
      cam.clampX = clampX;
      cam.clampY = clampY;
    }
  };

  /** Pointer → logical world point (pointer.x/y are canvas pixels, i.e. scaled by KL.RES). */
  KL.worldPoint = (scene, pointer) => scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
})();
