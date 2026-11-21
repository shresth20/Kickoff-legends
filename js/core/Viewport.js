/* Responsive viewport: the game fills any landscape screen, edge to edge, without letterboxing.
 *
 * Gameplay is designed in a fixed 1280×720 area (KL.TUNING.world): the pitch, goals, physics and AI
 * never change. The view around it grows to the screen's shape instead of showing black bars:
 *
 *  - wider than 16:9 (phones, ultrawide monitors): the view is 720 tall and wider than 1280; the
 *    design area sits in the middle and more of the stadium shows at the sides
 *  - narrower than 16:9 (iPads, 4:3 / 16:10 tablets and windows): the view is 1280 wide and taller
 *    than 720; the design area stands on the bottom edge and the extra room is sky
 *
 * Aspect ratios outside LIMITS (a portrait desktop window) still letterbox. Every scene camera is
 * scrolled to the view's top-left (js/core/HiDPI.js), so game code keeps working in design coords.
 *
 * KL.View also gives the UI what it needs to sit like a native game's: the safe edges of the screen
 * (left/right/top/bottom, inside notches and the home indicator, in design coords), a UI scale for
 * touch screens (phone buttons are scaled up to proper thumb size), a readable font size helper, and
 * layout callbacks that re-run whenever the view changes (window resize, rotation, full screen).
 *
 * KL.Fullscreen enters full screen on phones and tablets at the first tap (browsers only allow it
 * from a user gesture) and locks landscape where the browser supports it. In portrait, a "rotate
 * your device" screen covers the game and a live match pauses. */
window.KL = window.KL || {};

(() => {
  const DESIGN = { w: 1280, h: 720 };
  /** Aspect ratios the view expands to; beyond these the game letterboxes. 2.4 covers 21:9 phones. */
  const LIMITS = { minAspect: 4 / 3, maxAspect: 2.4 };
  const params = new URLSearchParams(location.search);
  const mq = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** Touch-first device: phone or tablet (coarse pointer, no hover). ?touch=1 / ?touch=0 forces it. */
  const touchParam = params.get('touch');
  const touch = touchParam != null
    ? touchParam !== '0'
    : mq('(hover: none) and (pointer: coarse)') || (navigator.maxTouchPoints > 0 && mq('(pointer: coarse)'));
  // iPhone / iPod Safari: no Fullscreen API for pages (iPadOS has it)
  const ios = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /**
   * The logical view for a cssW × cssH host (pure; see tests/viewport.test.mjs).
   * safe: the device's safe-area insets in CSS px. Returns the view size (w × h, multiples of 4 so
   * every quarter-step render resolution gives whole canvas pixels), its top-left in design coords
   * (x, y ≤ 0), the CSS px per logical px, the safe edges in design coords, and `fills`: the host's
   * shape is within LIMITS, so the canvas covers it edge to edge.
   */
  function compute({ cssW, cssH, safe = {} }) {
    const W = DESIGN.w, H = DESIGN.h;
    const raw = cssW / Math.max(1, cssH);
    const aspect = clamp(raw, LIMITS.minAspect, LIMITS.maxAspect);
    let w = W, h = H;
    if (aspect > W / H) w = Math.round((H * aspect) / 4) * 4;
    else if (aspect < W / H) h = Math.round(W / aspect / 4) * 4;
    const fills = raw === aspect;
    // CSS px per logical px, as Phaser will scale it: ENVELOP while the shape fits (it overhangs the
    // window by a fraction of a px), FIT beyond LIMITS
    const css = fills ? Math.max(cssW / w, cssH / h) : Math.min(cssW / w, cssH / h);
    // a letterbox bar already keeps the canvas clear of the notch on that side
    const padX = (cssW - w * css) / 2, padY = (cssH - h * css) / 2;
    const inset = (v, pad) => Math.max(0, (v || 0) - pad) / css;
    const x = (W - w) / 2, y = H - h;
    const v = {
      w, h, x, y, css, fills,
      left: x + inset(safe.l, padX),
      right: x + w - inset(safe.r, padX),
      top: y + inset(safe.t, padY),
      bottom: y + h - inset(safe.b, padY),
    };
    v.cx = (v.left + v.right) / 2;
    v.cy = (v.top + v.bottom) / 2;
    return v;
  }

  /**
   * UI scale for a screen of long × short CSS px (landscape). Desktop: 1. Touch: buttons and labels
   * grow until they'd look the size they do on a 0.72-scale screen — a phone (≈0.54) gets ≈1.35, so
   * a kick button is ≈50 CSS px tall and a move button ≈66 across; tablets (≥0.75) stay at 1.
   */
  function uiScale(isTouch, long, short) {
    if (!isTouch) return 1;
    const full = Math.min(long / DESIGN.w, short / DESIGN.h);
    return Math.round(clamp(0.72 / full, 1, 1.4) * 20) / 20;
  }

  /** Device safe-area insets in CSS px, read from a probe styled with env(safe-area-inset-*). */
  let probe = null;
  const fakeSafe = params.get('safe')?.split(',').map(Number); // ?safe=top,right,bottom,left (testing notches)
  function readSafe() {
    if (fakeSafe) return { t: fakeSafe[0] || 0, r: fakeSafe[1] || 0, b: fakeSafe[2] || 0, l: fakeSafe[3] || 0 };
    if (!probe) {
      probe = document.createElement('div');
      probe.id = 'kl-safe';
      document.body.appendChild(probe);
    }
    const cs = getComputedStyle(probe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }

  const long = Math.max(screen.width, screen.height), short = Math.min(screen.width, screen.height);
  const html = document.documentElement;
  html.classList.toggle('kl-touch', touch);

  const View = {
    DESIGN, LIMITS, compute, uiScale,
    touch,
    ios,
    /** UI scale (fixed for the session: it depends on the screen, not the window). */
    ui: uiScale(touch, long, short),
    /** Touch phone (scaled-up UI) rather than tablet or desktop. */
    get phone() {
      return this.ui > 1;
    },
    portrait: false,
    measured: false,
    events: new Phaser.Events.EventEmitter(),
    ...compute({ cssW: DESIGN.w, cssH: DESIGN.h }),

    /** A readable size for `px` on this screen: small labels grow with the UI scale, headlines less. */
    font(px) {
      return Math.round(px * (1 + (this.ui - 1) * Math.min(1, 28 / px)));
    },

    /**
     * How Phaser fits the canvas to the window. The view has the window's shape to within rounding
     * (w, h are multiples of 4), so ENVELOP covers it exactly — FIT would leave a sub-pixel hairline
     * of background along two edges. Outside LIMITS it letterboxes (FIT).
     */
    scaleMode() {
      return this.fills && !this.portrait ? Phaser.Scale.ENVELOP : Phaser.Scale.FIT;
    },

    /** Re-read the host size and safe area. Returns true when the view changed. */
    measure() {
      const host = document.getElementById('game');
      let cssW = host?.clientWidth || window.innerWidth;
      let cssH = host?.clientHeight || window.innerHeight;
      let safe = readSafe();
      this.portrait = touch && cssH > cssW;
      html.classList.toggle('kl-portrait', this.portrait);
      if (this.portrait) {
        // keep the landscape layout under the "rotate your device" screen; opened in portrait, lay
        // out for the landscape screen to come
        if (this.measured) return false;
        [cssW, cssH] = [cssH, cssW];
        safe = { t: 0, b: safe.b, l: safe.t, r: safe.t };
      }
      const v = compute({ cssW, cssH, safe });
      const changed = !this.measured || v.fills !== this.fills || ['w', 'h', 'left', 'right', 'top', 'bottom'].some((k) => Math.abs(v[k] - this[k]) > 0.5);
      Object.assign(this, v);
      this.measured = true;
      return changed;
    },

    /**
     * Follow the window: resize the canvas to the view and tell every scene. Rotations and the
     * browser bars settle over a few frames on mobile, so a change is measured on the next frame
     * and once more a moment later.
     */
    attach(game) {
      this.game = game;
      let raf = 0, timer = 0;
      const update = () => {
        raf = 0;
        const was = this.portrait;
        const changed = this.measure();
        if (this.portrait !== was) {
          this.localize();
          game.scale.scaleMode = this.scaleMode();
          game.scale.refresh();
          this.events.emit('orientation', this.portrait);
        }
        if (!changed) return;
        game.scale.scaleMode = this.scaleMode();
        game.scale.setGameSize(Math.round(this.w * KL.RENDER), Math.round(this.h * KL.RENDER));
        this.events.emit('change', this);
      };
      const schedule = () => {
        if (!raf) raf = requestAnimationFrame(update);
        clearTimeout(timer);
        timer = setTimeout(update, 320);
      };
      window.addEventListener('resize', schedule);
      window.addEventListener('orientationchange', schedule);
      window.visualViewport?.addEventListener('resize', schedule);
      document.addEventListener('fullscreenchange', schedule);
      document.addEventListener('webkitfullscreenchange', schedule);
      Fullscreen.listen();
      this.localize();
      schedule(); // the window may have changed while the fonts loaded
    },

    /**
     * Run fn(view) now and again whenever the view changes, until the scene shuts down. Scenes place
     * their screen-anchored UI (corner buttons, HUD, touch pad) here; scene cameras are already
     * updated when it runs.
     */
    layout(scene, fn) {
      fn(this);
      const h = () => fn(this);
      this.events.on('change', h);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off('change', h));
      scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.events.off('change', h));
    },

    /** Full-screen dim / backdrop rectangle that covers any view the game can show. */
    cover(scene, color, alpha = 1) {
      return scene.add.rectangle(-400, -400, DESIGN.w + 800, DESIGN.h + 800, color, alpha).setOrigin(0);
    },

    /** Translate the DOM text (the rotate screen) into the current language. */
    localize() {
      html.lang = KL.I18n?.locale || 'en';
      const el = document.querySelector('#rotate .rotate__text');
      if (el && KL.t) el.textContent = KL.t('rotate_device');
    },
  };

  /* ------------------------------------------------------------- full screen */
  const docEl = document.documentElement;
  const Fullscreen = {
    /** The page can go full screen (not on iPhone, where Safari only allows it for video). */
    get supported() {
      const can = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
      return !!can && (document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true) !== false;
    },
    get active() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    },
    /**
     * Launched from the home screen (PWA): already full screen. A desktop browser window that is
     * merely full screen itself (F11, macOS full screen) matches display-mode: fullscreen too, and
     * there the page can still go full screen, so that query only counts on a phone or tablet.
     */
    standalone: navigator.standalone === true || mq('(display-mode: standalone)') || (touch && mq('(display-mode: fullscreen)')),
    /** The player left full screen with the in-game button: don't pull them back in on the next tap. */
    optOut: false,
    pending: false,

    request() {
      if (!this.supported || this.active || this.pending) return Promise.resolve(this.active);
      this.pending = true;
      let req;
      try {
        req = docEl.requestFullscreen ? docEl.requestFullscreen({ navigationUI: 'hide' }) : docEl.webkitRequestFullscreen();
      } catch (e) {
        req = Promise.reject(e);
      }
      return Promise.resolve(req)
        .then(() => {
          // Android Chrome: hold landscape while in full screen (not supported on iOS / desktop)
          screen.orientation?.lock?.('landscape').catch(() => {});
          return true;
        })
        .catch(() => false)
        .finally(() => (this.pending = false));
    },

    exit() {
      if (!this.active) return Promise.resolve();
      const done = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen?.();
      return Promise.resolve(done).catch(() => {});
    },

    toggle() {
      if (this.active) {
        this.optOut = true;
        return this.exit();
      }
      this.optOut = false;
      return this.request();
    },

    /** On a phone / tablet: go full screen on this tap, unless the player is mid-match or opted out. */
    auto() {
      if (!touch || this.optOut || this.standalone || this.active || !this.supported) return;
      const match = KL.game?.scene.getScene('Match');
      if (match?.sys.isActive() && !match.paused && !match.ended) return; // never resize under a live match
      this.request();
    },

    listen() {
      // fullscreen needs a user gesture; a touch counts on its pointerup / touchend
      const tap = () => this.auto();
      document.addEventListener('pointerup', tap, true);
      document.addEventListener('touchend', tap, { capture: true, passive: true });
      const changed = () => View.events.emit('fullscreen', this.active);
      document.addEventListener('fullscreenchange', changed);
      document.addEventListener('webkitfullscreenchange', changed);
    },
  };

  KL.View = View;
  KL.Fullscreen = Fullscreen;
  View.measure();
})();
