/* FXLayer: the CSS special effects (css/fx.css), on a DOM layer laid over the Phaser canvas.
 *
 *  - speed lines streaming off a sprinting player
 *  - the referee's whistle (kickoff / sudden death / full time)
 *  - twinkles when a super is ready, and goal confetti in the scorer's colours
 *
 * The layer works in the game's 1280×720 logical px and is synced after every render (POST_RENDER):
 * scaled onto the canvas (the whole view, KL.View), moved with the camera scroll and shake, faded with camera fades and slowed
 * with the goal slow-mo and the look-only pace (the playbackRate of its CSS animations). The pause menu
 * hides and freezes it.
 * Every effect is a handful of elements whose randomness comes in as CSS custom properties, so no two
 * bursts look alike, and only transform / opacity animate.
 *
 * KL.FX owns one per match and routes the bus events here. The sprint lines keep their sprite logic in
 * Player (the sprite's visibility is the state) but are drawn here instead. The super aura is not a CSS
 * effect: Player draws it from the fx_super_aura art (fx atlas), behind the player; nor are the kick
 * starbursts and dust clouds, which KL.FX plays from the fx_impact / fx_dust art.
 * ?cssfx=0 turns the layer off and brings the sprite effects back. */
window.KL = window.KL || {};

(() => {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const r2 = (v) => Math.round(v * 100) / 100;
  const px = (v) => `${r2(v)}px`;
  const ms = (v) => `${Math.round(v)}ms`;
  const deg = (v) => `${r2(v)}deg`;
  const TAU = Math.PI * 2;
  /** one-shot effects alive at once; the oldest goes first beyond this */
  const MAX_LIVE = 48;
  /** animations whose end removes their effect root */
  const ENDINGS = new Set(['klfx-life', 'klfx-fade-out']);

  /** A div with classes and custom properties ({ x: '4px' } → --x:4px), appended to parent. */
  const div = (parent, cls, vars) => {
    const d = document.createElement('div');
    d.className = cls;
    if (vars) {
      let css = '';
      for (const k in vars) css += `--${k}:${vars[k]};`;
      d.style.cssText = css;
    }
    if (parent) parent.appendChild(d);
    return d;
  };

  /** #rrggbb darkened by k (0..1). */
  const darken = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    return `#${[16, 8, 0].map((s) => Math.round(((n >> s) & 255) * (1 - k)).toString(16).padStart(2, '0')).join('')}`;
  };

  // The layer's DOM is created once and reused by every match.
  let mounted = null;
  const mount = (canvas) => {
    const parent = canvas.parentElement;
    if (mounted?.parentElement === parent) return mounted;
    mounted?.remove();
    mounted = div(null, 'klfx');
    mounted.setAttribute('aria-hidden', 'true');
    div(mounted, 'klfx__space'); // world: moves with the camera
    div(mounted, 'klfx__space'); // screen: only shakes
    parent.appendChild(mounted); // after the canvas, so it is drawn over it
    return mounted;
  };

  KL.FXLayer = class FXLayer {
    /** On unless ?cssfx=0, or there is no DOM to draw into. */
    static enabled() {
      return typeof document !== 'undefined' && new URLSearchParams(location.search).get('cssfx') !== '0';
    }

    /** @param {Phaser.Scene} scene the match (its players and camera are tracked) */
    constructor(scene) {
      this.scene = scene;
      this.canvas = scene.game.canvas;
      this.root = mount(this.canvas);
      [this.world, this.screen] = this.root.children;
      this.root.classList.remove('is-paused');
      this.root.style.opacity = '';
      this.reduced = KL.Motion.reduced;
      this.live = new Set(); // one-shot effect roots, oldest first
      this.follow = new Map(); // effect root → () => its transform this frame (tracks a player)
      this.speed = [];
      this.rate = 1;
      this.retimed = -Infinity; // when the animations were last re-timed (see sync)
      this.k = 1;
      this.layoutKey = '';
      this.camKey = '';
      this.veil = 0;
      // window resizes, counted (see sync): reading window.innerWidth there instead forced a style and
      // layout pass in the middle of every frame
      this.resizes = 0;
      this.onResize = () => this.resizes++;
      window.addEventListener('resize', this.onResize);
      window.visualViewport?.addEventListener('resize', this.onResize);
      KL.View.events.on('change', this.onResize);

      // the sprite version of the sprint lines keeps running (its visibility is the state) but is not
      // drawn: this layer draws them
      for (const p of scene.players || []) p.sprintLines?.setAlpha(0);

      this.onEnd = (e) => {
        if (ENDINGS.has(e.animationName)) this.remove(e.target.closest('.klfx-fx'));
      };
      this.root.addEventListener('animationend', this.onEnd);
      scene.game.events.on(Phaser.Core.Events.POST_RENDER, this.sync, this);
    }

    // ------------------------------------------------------------------ plumbing

    /** A new, detached effect root at (x, y). lifeMs > 0: removed when its life animation ends. */
    make(cls, x, y, lifeMs, vars) {
      const r = div(null, `klfx-fx ${cls}${lifeMs ? ' klfx-life' : ''}`, lifeMs ? { ...vars, life: ms(lifeMs) } : vars);
      r.style.transform = `translate3d(${px(x)}, ${px(y)}, 0)`;
      return r;
    }

    /** Put a built one-shot effect on screen (one DOM insert per effect), in step with any slow-mo. */
    add(r, space = this.world) {
      while (this.live.size >= MAX_LIVE) this.remove(this.live.values().next().value);
      space.appendChild(r);
      this.live.add(r);
      if (this.rate !== 1) this.applyRate(r);
      return r;
    }

    /** Put an effect on screen that follows something until released. */
    attach(r, place) {
      this.world.appendChild(r);
      this.follow.set(r, place);
      r.style.transform = place();
      if (this.rate !== 1) this.applyRate(r);
      return r;
    }

    /** Let an attached effect play its exit animation; it is removed when that ends. */
    release(r) {
      r.classList.add('is-out');
      if (this.rate !== 1) this.applyRate(r);
    }

    remove(r) {
      if (!r) return;
      r.remove();
      this.live.delete(r);
      this.follow.delete(r);
    }

    applyRate(node) {
      if (typeof node.getAnimations !== 'function') return;
      for (const a of node.getAnimations({ subtree: true })) a.playbackRate = this.rate;
    }

    setPaused(on) {
      this.root.classList.toggle('is-paused', !!on);
    }

    /** Size and place the layer exactly over the canvas (Phaser FIT-scales and centres it). */
    layout() {
      const c = this.canvas.getBoundingClientRect();
      const p = this.root.parentElement.getBoundingClientRect();
      const st = this.root.style;
      st.left = `${c.left - p.left}px`;
      st.top = `${c.top - p.top}px`;
      st.width = `${c.width}px`;
      st.height = `${c.height}px`;
      this.k = c.width / KL.View.w || 1;
    }

    /** After every render: follow the canvas, the camera, fades, slow-mo and the players. */
    sync() {
      const sc = this.scene;
      const cam = sc.cameras?.main;
      if (!cam) return;

      // re-measured only when the canvas or the window changed size. Both are read without touching
      // layout: the canvas's inline style (Phaser sets its size and centring there) and a count of
      // resize events
      const cs = this.canvas.style;
      const key = `${cs.width}|${cs.height}|${cs.marginLeft}|${cs.marginTop}|${this.resizes}`;
      if (key !== this.layoutKey) {
        this.layoutKey = key;
        this.layout();
        this.camKey = '';
      }

      // the camera: its scroll moves the world space, its shake moves both spaces. The screen space
      // keeps the design area's coordinates too (the camera scroll is the view's offset around it)
      const sh = cam.shakeEffect;
      const ox = sh?.isRunning ? sh._offsetX || 0 : 0;
      const oy = sh?.isRunning ? sh._offsetY || 0 : 0;
      const wx = r2(ox - cam.scrollX), wy = r2(oy - cam.scrollY);
      const sx = r2(ox - KL.View.x), sy = r2(oy - KL.View.y);
      const camKey = `${this.k}|${wx}|${wy}|${sx}|${sy}`;
      if (camKey !== this.camKey) {
        this.camKey = camKey;
        this.world.style.transform = `scale(${this.k}) translate3d(${wx}px, ${wy}px, 0)`;
        this.screen.style.transform = `scale(${this.k}) translate3d(${sx}px, ${sy}px, 0)`;
      }

      // a camera fade (leaving the match) fades the effects with it
      const f = cam.fadeEffect;
      const veil = f && (f.isRunning || f.isComplete) ? f.alpha : 0;
      if (veil !== this.veil) {
        this.veil = veil;
        this.root.style.opacity = veil ? String(1 - veil) : '';
      }

      // goal slow-mo and the hit-stop dip: every CSS animation runs at the game's speed, at the look-only
      // pace (KL.TUNING.motion.animPace). An easing speed (every strike's hit-stop dip, the goal
      // slow-mo) re-times them in 1/20 steps and at most every 100 ms, not on every frame: each re-time
      // walks every animation in the layer (hundreds, under goal confetti) and hands it back to the
      // compositor. Back to full speed is applied at once.
      const rate = Math.max(0.05, Math.round((sc.time?.timeScale ?? 1) * KL.animPace() * 20) / 20);
      if (rate !== this.rate) {
        const now = performance.now();
        if (rate === 1 || !(now - this.retimed < 100)) {
          this.rate = rate;
          this.retimed = now;
          this.applyRate(this.root);
        }
      }

      this.trackPlayers();
      for (const [node, place] of this.follow) {
        const t = place();
        if (t !== node._t) node.style.transform = node._t = t;
      }
    }

    /** Speed lines follow the players' sprint state. */
    trackPlayers() {
      const players = this.scene.players;
      if (!players) return;
      players.forEach((p, i) => {
        if (!p.active || !p.sprintLines) return;
        const sprinting = p.sprintLines.visible;
        const dir = p.sprintLines.flipX ? 1 : -1; // Player flips the lines for a rightward run
        if (sprinting && !this.speed[i]) this.speed[i] = this.speedLines(p, dir);
        else if (!sprinting && this.speed[i]) {
          this.release(this.speed[i]);
          this.speed[i] = null;
        }
        if (sprinting) this.speed[i]._dir = dir;
      });
    }

    // ------------------------------------------------------------------ speed lines

    speedLines(p, dir) {
      const S = KL.TUNING.player.scale;
      const lift = 86 * S; // feet → middle of the body
      const r = this.make('klfx-speed', p.x, p.y - lift, 0);
      r._dir = dir;
      const body = div(r, 'klfx-speed__body');
      const rows = this.reduced ? [-32, -2, 28] : [-46, -28, -10, 8, 25, 41];
      rows.forEach((y, k) => {
        const d = rnd(300, 440);
        div(body, 'klfx-streak', {
          y: px(y + rnd(-3, 3)),
          w: px(rnd(80, 128) * (k % 2 ? 0.72 : 1)),
          h: px(rnd(9, 13) * (k % 2 ? 0.8 : 1)),
          gap: px(rnd(18, 30)),
          op: r2(rnd(0.75, 1)),
          d: ms(d),
          dl: ms(-rnd(0, d)),
        });
      });
      return this.attach(r, () => `translate3d(${px(p.x)}, ${px(p.y - lift)}, 0) scaleX(${r._dir})`);
    }

    // ------------------------------------------------------------------ whistle

    /** reason: kickoff | suddendeath | fulltime (from the WHISTLE event). Between the timer and the HUD banner. */
    whistle(reason) {
      const r = this.make(`klfx-whistle is-${reason}`, KL.TUNING.world.width / 2, 186, 1150);
      div(r, 'klfx-whistle__glow');
      for (let k = 0; k < 3; k++) {
        const sz = px(30 + k * 16), dl = ms(150 + k * 80);
        div(r, 'klfx-whistle__wave is-right', { sz, cx: '30px', cy: '-16px', dl });
        div(r, 'klfx-whistle__wave is-left', { sz, cx: '-24px', cy: '10px', dl });
      }
      const toy = div(r, 'klfx-whistle__toy');
      for (const part of ['ring', 'mouth', 'chamber', 'slot', 'shine']) div(toy, `klfx-whistle__${part}`);
      div(r, 'klfx-whistle__bang');
      [[-70, -34], [72, -44], [-58, 36], [64, 30]].forEach(([x, y], k) => {
        div(r, 'klfx-twinkle', { x: px(x), y: px(y), sz: px(rnd(12, 18)), c: k % 2 ? '#ffffff' : '#ffe066', d: ms(520), dl: ms(120 + k * 90) });
      });
      return this.add(r, this.screen);
    }

    // ------------------------------------------------------------------ super ready

    superReady(p) {
      if (!p) return;
      const lift = 86 * KL.TUNING.player.scale;
      const r = this.make('klfx-ready', p.x, p.y - lift, 900);
      div(r, 'klfx-ready__glow');
      const n = this.reduced ? 4 : 7;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + rnd(-0.3, 0.3), rad = rnd(38, 62);
        div(r, 'klfx-twinkle', { x: px(Math.cos(a) * rad), y: px(Math.sin(a) * rad * 1.1), sz: px(rnd(10, 18)), c: k % 2 ? '#ffffff' : '#ffe066', d: ms(rnd(450, 620)), dl: ms(k * 50 + rnd(0, 60)) });
      }
      this.add(r);
      this.follow.set(r, () => `translate3d(${px(p.x)}, ${px(p.y - lift)}, 0)`);
      return r;
    }

    // ------------------------------------------------------------------ confetti

    /** @param {object} def the scorer's character (kit colours, super colour) */
    confetti(def) {
      const V = KL.View; // the whole screen, edge to edge
      const team = def?.kit?.primary || '#E63946';
      const colors = [team, team, '#FFD23F', '#FFD23F', '#FFFFFF', def?.superColor || '#3BC9FF', '#FF5DA2'];
      const shapes = [['is-rect', 18, 9], ['is-rect', 14, 8], ['is-strip', 6, 24], ['is-dot', 12, 12], ['is-tri', 17, 15], ['is-star', 22, 22]];
      const r = this.make('klfx-confetti', 0, 0, 4800);
      const piece = (wrap) => {
        const [shape, w, h] = pick(shapes), c = pick(colors), k = rnd(0.85, 1.3);
        div(wrap, `klfx-cf__p ${shape}`, { w: px(w * k), h: px(h * k), c, c2: darken(c, 0.32), fd: ms(rnd(500, 1300)), rz: deg(rnd(0, 360)), ax: r2(rnd(0.2, 1)), ay: r2(rnd(0.2, 1)) });
      };
      // a shower from the top…
      for (let k = 0, n = this.reduced ? 20 : 44; k < n; k++) {
        const sw = rnd(18, 55) * (Math.random() < 0.5 ? -1 : 1);
        piece(div(r, 'klfx-cf is-rain', { x0: px(rnd(V.x + 20, V.x + V.w - 20)), y0: px(V.y + rnd(-60, -20)), fall: px(V.h + rnd(60, 140)), sw: px(sw), d: ms(rnd(2600, 3700)), dl: ms(rnd(0, 900)) }));
      }
      // …and two cannons firing from the bottom corners of the screen
      if (!this.reduced) {
        for (const side of [-1, 1]) {
          for (let k = 0; k < 24; k++) {
            const shot = div(r, 'klfx-cf is-shot', { x0: px(side < 0 ? V.left + 30 : V.right - 30), y0: px(V.bottom - 20), vx: px(-side * rnd(120, 560)), sw: px(rnd(14, 40)), d: ms(rnd(2400, 3300)), dl: ms(rnd(0, 160)) });
            piece(div(shot, 'klfx-cf__y', { peak: px(rnd(380, 640)), drop: px(rnd(40, 140)) }));
          }
        }
      }
      return this.add(r, this.screen);
    }

    destroy() {
      this.scene.game.events.off(Phaser.Core.Events.POST_RENDER, this.sync, this);
      window.removeEventListener('resize', this.onResize);
      window.visualViewport?.removeEventListener('resize', this.onResize);
      KL.View.events.off('change', this.onResize);
      this.root.removeEventListener('animationend', this.onEnd);
      this.world.textContent = '';
      this.screen.textContent = '';
      this.live.clear();
      this.follow.clear();
      this.speed = [];
      this.root.classList.remove('is-paused');
      this.root.style.opacity = '';
    }
  };
})();
