/* Crisp rendering on any screen.
 * Game code lays everything out in 1280×720 "logical" px (KL.TUNING.world). Instead of drawing
 * into a 1280×720 canvas that the browser then stretches with CSS (soft text and art on Retina /
 * large windows), the canvas is created at the display's real pixel density — KL.RES × the view
 * (KL.View: 1280×720 grown to the screen's shape) — and every scene camera is zoomed by KL.RES from
 * its top-left corner and scrolled to the view's top-left. Sprites, vector shapes and text (see
 * KL.displayText) are therefore rasterised at device resolution, and the 1280×720 design area keeps
 * its coordinates on every screen.
 * The canvas and cameras actually use KL.RENDER, which starts equal to KL.RES: on a GPU that can't fill
 * that many pixels at the screen's refresh rate, KL.RenderScale (below) lowers it rather than let
 * frames drop. Textures stay prepared at KL.RES either way. */
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
  /**
   * Render resolution: canvas px per logical px (the canvas size and every camera's zoom). It starts
   * at KL.RES and KL.RenderScale lowers it on a GPU that can't fill that many pixels in time.
   * Textures keep KL.RES (prepared once, at the screen's density): at a lower render resolution they
   * are only drawn a little smaller, at the same logical size.
   */
  KL.RENDER = KL.RES;

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
      KL.View.events.on('resolution', this.apply, this);
      this.systems.events.once(Phaser.Scenes.Events.DESTROY, () => {
        KL.View.events.off('change', this.apply, this);
        KL.View.events.off('resolution', this.apply, this);
      });
    }
    apply() {
      const cam = this.systems.cameras?.main;
      if (!cam) return;
      const scale = this.systems.game.scale;
      cam.setOrigin(0, 0).setZoom(KL.RENDER);
      cam.setSize(scale.width, scale.height);
      cam.setScroll(KL.View.x, KL.View.y);
      cam.clampX = clampX;
      cam.clampY = clampY;
    }
  };

  /** Pointer → logical world point (pointer.x/y are canvas pixels, i.e. scaled by KL.RENDER). */
  KL.worldPoint = (scene, pointer) => scene.cameras.main.getWorldPoint(pointer.x, pointer.y);

  /* ------------------------------------------------------------- render resolution governor */
  /**
   * A GPU that can't fill the canvas at the display's refresh rate drops frames, and a dropped frame
   * is a hitch in all the motion (it lasts two refreshes and the physics catches up two steps at
   * once), menus included. Frame time is linear in pixel count, so while frames run slow the canvas
   * renders at a lower resolution, a step at a time, down to 1 canvas px per logical px — as long as
   * each step really speeds things up. A device held at a low frame rate whatever is drawn (a phone in
   * low-power mode runs at 30 fps; a slow CPU) doesn't get faster: that step is taken back and the
   * resolution stays put for the session. It never steps back up (a full GPU can't show headroom, and
   * hopping between resolutions would be worse than either). ?res=… or ?autores=0 turns it off.
   */
  const RS = {
    windowMs: 1500, // judge the frame rate over this much running time…
    minFrames: 40, // …and at least this many frames
    settleMs: 700, // after a change, let the new canvas settle before judging it
    slowMs: 1000 / 48, // frames slower than 48 fps on average: the GPU isn't keeping up (a 50 Hz screen is fine)
    gain: 0.92, // a step down must make frames at least 8 % quicker to be kept
    stepK: 0.87, // each step renders ~0.87× as many px per side (~25 % fewer pixels), in quarter steps
  };

  /** Render resolutions to try, from `res` down to 1 (pure): quarter steps, ~stepK apart. */
  const levels = (res) => {
    const out = [res];
    while (out[out.length - 1] > 1) {
      const r = out[out.length - 1];
      out.push(Math.max(1, Math.min(r - 0.25, Math.floor(r * RS.stepK * 4) / 4)));
    }
    return out;
  };

  /** Typical frame time of a window (pure): the mean, without the slowest and quickest 5 % (a scene
   * loading is one long frame; a GPU-bound run alternates one- and two-refresh frames, so not the median). */
  const typical = (deltas) => {
    const s = [...deltas].sort((a, b) => a - b);
    const cut = Math.floor(s.length * 0.05);
    const mid = s.slice(cut, s.length - cut);
    return mid.reduce((a, b) => a + b, 0) / Math.max(1, mid.length);
  };

  /**
   * The governor's next move (pure) after a window whose typical frame took `ms`.
   * state: { level (index into levels), count (levels.length), before (ms just before the last step
   * down, while that step is on trial), locked }. Returns 'down', 'back' (undo the step on trial and
   * stay there) or null; updates `state`.
   */
  const decide = (ms, st) => {
    if (st.locked) return null;
    const slow = ms > RS.slowMs;
    const trial = st.before;
    st.before = null;
    if (trial != null && slow && ms > trial * RS.gain) {
      // the last step didn't speed anything up: pixels aren't what holds this device back
      st.level--;
      st.locked = true;
      return 'back';
    }
    if (!slow) return null; // fast enough here (a step on trial that got there is kept)
    if (st.level >= st.count - 1) {
      st.locked = true; // already at 1 canvas px per logical px
      return null;
    }
    // slow, and (if a step was on trial) it helped: one more step, judged against this window
    st.before = ms;
    st.level++;
    return 'down';
  };

  KL.RenderScale = {
    RS,
    levels,
    typical,
    decide,

    /** Render at r canvas px per logical px: resize the canvas and re-zoom every camera (HiDPIPlugin). */
    set(r) {
      const game = this.game;
      if (!game || r === KL.RENDER) return;
      KL.RENDER = r;
      game.scale.setGameSize(Math.round(KL.View.w * r), Math.round(KL.View.h * r));
      KL.View.events.emit('resolution', r);
    },

    /** Watch the game's frame times (main.js calls this once the game exists). */
    attach(game) {
      this.game = game;
      if (params.get('res') || params.get('autores') === '0') return;
      const steps = levels(KL.RES);
      if (steps.length < 2) return;
      const st = (this.state = { level: 0, count: steps.length, before: null, locked: false });
      const SM = game.scene;
      let deltas = [], sum = 0, quietUntil = 0, scenes = -1, loading = true;
      game.events.on('poststep', () => {
        if (st.locked) return;
        const now = performance.now();
        // the screens running now: a new screen is new work, so a window never spans two, and a step on
        // trial can't be judged across them — it is kept (fewer pixels never slow anything down)
        let mask = 0;
        for (let i = 0; i < SM.scenes.length; i++) if (SM.scenes[i].sys.isActive()) mask |= 1 << i;
        if (mask !== scenes) {
          scenes = mask;
          loading = SM.isActive('Boot'); // the loading screen draws little and decodes a lot
          deltas = [];
          sum = 0;
          st.before = null;
          quietUntil = now + RS.settleMs;
          return;
        }
        const d = game.loop.rawDelta;
        // a stall (a screen building, the tab coming back) or a frame inside the quiet time says nothing
        if (loading || now < quietUntil || !(d > 2 && d < 250) || document.hidden) return;
        deltas.push(d);
        sum += d;
        if (sum < RS.windowMs || deltas.length < RS.minFrames) return;
        const ms = typical(deltas);
        deltas = [];
        sum = 0;
        const move = decide(ms, st);
        if (!move) return;
        this.set(steps[st.level]);
        quietUntil = performance.now() + RS.settleMs;
      });
    },
  };
})();
