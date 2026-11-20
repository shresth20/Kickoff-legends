/* Living sky: the painted clouds drift on a slow wind and gently swell, small flocks of gulls
 * cross the day sky, and at night the stars twinkle with the odd shooting star. Everything is slow,
 * small and behind the stands, so the sky feels real without ever pulling the eye off the ball.
 *
 * Art: tools/sky-split.mjs cuts each painted sky into a clear sky + cloud sprites + star spots
 * (window.KL_SKY). Without that data the painted sky stays as it is and only birds are added on top.
 *
 * Time: every position is a pure function of one shared clock (KL.SkyLife.clock, seconds) that the
 * running stadium scene advances. Menus rebuild the stadium on every screen and the sky simply carries
 * on where it was; a paused match stops its scene's update, so its sky holds still too. Flocks and
 * shooting stars are scheduled from a hash of their time slot (not Math.random) for the same reason.
 * Tune it in KL.SKY_LIFE. */
window.KL = window.KL || {};

KL.SKY_LIFE = {
  wind: 1, // +1: clouds drift left → right
  // px/s from the smallest to the biggest painted cloud (bigger reads as nearer: faster, and in front)
  cloudSpeed: [2.4, 6],
  cloudBreathe: 0.012, // ± scale: the puffs swell and settle a touch
  cloudBreathePeriod: [10, 16], // s
  // one flock per `slot` seconds at most (chance of one), crossing in ~25-35 s; day sky only
  // margin: the flocks fly in and out this far past the design area, beyond the widest view
  // (KL.STADIUM_MARGIN); slot: long enough for the slowest flock to cross before the next takes off
  birds: { slot: 50, chance: 0.7, size: [2, 5], speed: [42, 60], span: [18, 26], y: [25, 150], margin: 250, factor: 0.16 },
  starTwinkle: [2.4, 6], // s per twinkle
  sparkleMin: 13, // painted stars smaller than this (sky texture px) are left out: only sparkles are drawn
  meteor: { slot: 34, chance: 0.55, duration: [0.9, 1.3], length: [120, 180], travel: [200, 300] },
};

(() => {
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const mod = (a, n) => ((a % n) + n) % n;
  /** Deterministic 0..1 noise for (a, b): same slot → same flock on every screen. */
  const hash = (a, b = 0) => {
    const x = Math.sin(a * 127.1 + b * 311.7 + 74.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const BIRD = { frames: 9, px: 30, hMin: -0.9, hMax: 0.4 }; // texture drawn for a 30 px wingspan
  const DEPTH = { stars: 0.2, meteor: 0.25, clouds: 0.5, birds: 0.7 }; // sky 0 … stands 1

  /* ------------------------------------------------------------ pure motion (testable) */

  /** Flock flying in time slot k, or null. Flights never overlap: slot > the longest crossing. */
  function flock(k) {
    const B = KL.SKY_LIFE.birds;
    if (k < 0 || hash(k, 1) > B.chance) return null;
    const speed = lerp(B.speed[0], B.speed[1], hash(k, 2));
    const path = KL.TUNING.world.width + B.margin * 2 + 90; // + room for the trailing birds
    return {
      k,
      start: k * B.slot + 3 + hash(k, 3) * 4,
      duration: path / speed,
      speed,
      dir: hash(k, 4) < 0.5 ? 1 : -1,
      y: lerp(B.y[0], B.y[1], hash(k, 5)),
      climb: (hash(k, 6) - 0.5) * 50,
      size: B.size[0] + Math.floor(hash(k, 7) * (B.size[1] - B.size[0] + 1)),
    };
  }

  /** The flock in the air at time t (if any) and how far into its flight it is. A flight can run a
   * second or two into the next slot, but always lands before that slot's flock takes off. */
  function flockAt(t) {
    const k = Math.floor(t / KL.SKY_LIFE.birds.slot);
    for (const f of [flock(k), flock(k - 1)]) if (f && t >= f.start && t < f.start + f.duration) return { f, tau: t - f.start };
    return null;
  }

  /**
   * Bird i of flock f, tau s into its flight → { x, y, h (wing pose -1 up … +0.4 down), span, alpha }.
   * A loose V: followers trail behind and to alternate sides, each wandering a little; they flap in
   * bursts and glide in between, each on its own beat.
   */
  function bird(f, i, tau) {
    const B = KL.SKY_LIFE.birds;
    const W = KL.TUNING.world.width;
    const r = (n) => hash(f.k * 7.31 + i, n);
    const lead = f.dir > 0 ? -B.margin + tau * f.speed : W + B.margin - tau * f.speed;
    const rank = Math.ceil(i / 2);
    const side = i % 2 ? -1 : 1;
    const x = lead - f.dir * (rank * 34 + r(1) * 12) + 6 * Math.sin(tau * 0.45 + r(2) * TAU);
    let y = f.y + (f.climb * tau) / f.duration + 5 * Math.sin(tau * 0.8 + f.k) + side * rank * 11 + r(3) * 5 + 3 * Math.sin(tau * 0.7 + r(4) * TAU);
    // flap in bursts, glide between (wings held slightly up)
    const cycle = 3.2 + r(5) * 1.6;
    const c = mod(tau + r(6) * cycle, cycle) / cycle;
    const env = smooth(0, 0.08, c) * (1 - smooth(0.47, 0.55, c));
    const beat = Math.sin(TAU * (2.4 + r(7) * 0.7) * tau + r(8) * TAU);
    const h = Math.min(BIRD.hMax, Math.max(BIRD.hMin, -0.28 + env * 0.62 * beat));
    y -= env * beat * 0.8; // the body bobs against the wings
    const span = lerp(B.span[0], B.span[1], r(9)) * (i ? 0.92 : 1);
    return { x, y, h, span, alpha: 0.88 + r(10) * 0.1 };
  }

  /** Shooting star in slot k (night), or null. */
  function meteor(k) {
    const M = KL.SKY_LIFE.meteor;
    if (k < 0 || hash(k, 11) > M.chance) return null;
    const angle = lerp(0.3, 0.6, hash(k, 12)); // radians below horizontal
    const dir = hash(k, 13) < 0.5 ? 1 : -1;
    return {
      start: k * M.slot + 4 + hash(k, 14) * (M.slot - 8),
      duration: lerp(M.duration[0], M.duration[1], hash(k, 15)),
      x: lerp(dir > 0 ? 150 : 400, dir > 0 ? 880 : 1130, hash(k, 16)),
      y: lerp(15, 100, hash(k, 17)),
      dx: Math.cos(angle) * dir,
      dy: Math.sin(angle),
      length: lerp(M.length[0], M.length[1], hash(k, 18)),
      travel: lerp(M.travel[0], M.travel[1], hash(k, 19)),
    };
  }

  /* ------------------------------------------------------------ textures (device resolution) */

  const canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    return c;
  };

  /** A gull from below / behind: two tapered, gently bowed wings. h: tips up (-) … down (+). */
  function drawBird(ctx, cx, cy, a, h) {
    const ty = h * a * 0.85;
    const reach = a * (1 - 0.15 * Math.max(0, h)) * (1 - 0.1 * Math.max(0, -h - 0.5)); // foreshortened at the ends of a stroke
    const thick = a * 0.25;
    ctx.fillStyle = '#ffffff';
    for (const side of [-1, 1]) {
      const p0 = [cx, cy], p1 = [cx + side * reach * 0.42, cy + ty * 0.42 + a * 0.05], p2 = [cx + side * reach, cy + ty];
      const top = [], bot = [];
      for (let k = 0; k <= 14; k++) {
        const u = k / 14, v = 1 - u;
        const x = v * v * p0[0] + 2 * v * u * p1[0] + u * u * p2[0];
        const y = v * v * p0[1] + 2 * v * u * p1[1] + u * u * p2[1];
        const tx = 2 * v * (p1[0] - p0[0]) + 2 * u * (p2[0] - p1[0]);
        const tyy = 2 * v * (p1[1] - p0[1]) + 2 * u * (p2[1] - p1[1]);
        const len = Math.hypot(tx, tyy) || 1;
        let nx = -tyy / len, ny = tx / len;
        if (ny > 0) (nx = -nx), (ny = -ny); // normal pointing up
        const t = thick * (1 - u * 0.85);
        top.push([x + nx * t * 0.35, y + ny * t * 0.35]);
        bot.push([x - nx * t * 0.65, y - ny * t * 0.65]);
      }
      ctx.beginPath();
      top.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let k = bot.length - 1; k >= 0; k--) ctx.lineTo(bot[k][0], bot[k][1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy + thick * 0.1, thick * 0.42, thick * 0.6, 0, 0, TAU);
    ctx.fill();
  }

  function birdTexture(scene) {
    const R = KL.RES;
    const key = `kl:sky:bird:${R}`;
    if (scene.textures.exists(key)) return key;
    const span = BIRD.px * R;
    const cw = Math.ceil(span + 4 * R), ch = Math.ceil(span * 0.8 + 4 * R);
    const c = canvas(cw * BIRD.frames, ch);
    const ctx = c.getContext('2d');
    for (let i = 0; i < BIRD.frames; i++) drawBird(ctx, i * cw + cw / 2, ch * 0.55, span / 2, lerp(BIRD.hMin, BIRD.hMax, i / (BIRD.frames - 1)));
    scene.textures.addImage(key, c);
    const tex = scene.textures.get(key);
    for (let i = 0; i < BIRD.frames; i++) tex.add(i, 0, i * cw, 0, cw, ch);
    return key;
  }

  /** Four-point sparkle like the painted ones, with a faint halo. Drawn 32 px across (star 30). */
  function sparkleTexture(scene) {
    const R = KL.RES;
    const key = `kl:sky:sparkle:${R}`;
    if (scene.textures.exists(key)) return key;
    const s = 32 * R, c = canvas(s, s), ctx = c.getContext('2d'), m = s / 2, r = 15 * R, k = r * 0.13;
    const glow = ctx.createRadialGradient(m, m, 0, m, m, r * 0.6);
    glow.addColorStop(0, 'rgba(255,255,240,0.45)');
    glow.addColorStop(1, 'rgba(255,255,240,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#fffcef';
    ctx.beginPath();
    ctx.moveTo(m, m - r);
    ctx.quadraticCurveTo(m + k, m - k, m + r, m);
    ctx.quadraticCurveTo(m + k, m + k, m, m + r);
    ctx.quadraticCurveTo(m - k, m + k, m - r, m);
    ctx.quadraticCurveTo(m - k, m - k, m, m - r);
    ctx.fill();
    scene.textures.addImage(key, c);
    return key;
  }

  /** Shooting star: a 200 px streak, fading from the bright head (right) to nothing. */
  function meteorTexture(scene) {
    const R = KL.RES;
    const key = `kl:sky:meteor:${R}`;
    if (scene.textures.exists(key)) return key;
    const w = 200 * R, h = 8 * R, c = canvas(w, h), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(200,215,255,0)');
    g.addColorStop(0.75, 'rgba(225,235,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w - 3 * R, h / 2 - 1.2 * R);
    ctx.lineTo(w - 3 * R, h / 2 + 1.2 * R);
    ctx.closePath();
    ctx.fill();
    const head = ctx.createRadialGradient(w - 4 * R, h / 2, 0, w - 4 * R, h / 2, 4 * R);
    head.addColorStop(0, 'rgba(255,255,255,1)');
    head.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = head;
    ctx.fillRect(w - 8 * R, 0, 8 * R, h);
    scene.textures.addImage(key, c);
    return key;
  }

  /* ------------------------------------------------------------ scene objects */

  KL.SkyLife = {
    clock: 0,
    _frame: -1,
    /** Respect the OS "reduce motion" setting: the sky stays as painted, nothing flies. */
    still: !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    flock,
    flockAt,
    bird,
    meteor,

    /** Split data for sky texture `skyKey` when its clear sky and cloud sheet are loaded, else null. */
    data(scene, skyKey) {
      const d = globalThis.KL_SKY?.[skyKey];
      const has = (k) => scene.textures.exists(k);
      if (!d || !has(d.clear) || (d.sheet && !has(d.sheet))) return null;
      if (d.sheet) {
        const tex = scene.textures.get(d.sheet);
        for (const c of d.clouds) if (!tex.has(c.name)) tex.add(c.name, 0, ...c.f);
      }
      return d;
    },

    /** Advance the shared clock once per game frame, whichever scene asks. */
    advance(scene, delta) {
      const frame = scene.game.loop.frame;
      if (this.still || frame === this._frame) return;
      this._frame = frame;
      this.clock += Math.min(delta, 100) / 1000; // a hidden tab doesn't fast-forward the sky
    },

    /**
     * Populate the sky of a stadium. `sky`: the sky TileSprite (Stadium.js), `data`: its split data
     * or null. Updates itself from the scene's update event and cleans up on shutdown.
     */
    build(scene, { sky, data, night, parallax }) {
      if (!sky) return;
      const C = KL.SKY_LIFE;
      const W = KL.TUNING.world;
      const R = KL.RES;
      const s = sky.scaleX; // sky texture px → logical px
      const at = (u, v) => [sky.x + u * s, sky.y + v * s];
      const M = KL.STADIUM_MARGIN ?? 0; // the sky runs this far past each side of the design area
      const parts = []; // (t) => void
      // No scroll factors: the camera never scrolls (it sits on the view's offset, KL.View), so the
      // sky life moves with the sky layer like everything else.

      // clouds: drift with the wind and wrap around just out of view; the nearer, the faster
      if (data?.sheet) {
        const maxW = Math.max(...data.clouds.map((c) => c.f[2]));
        data.clouds.forEach((c, i) => {
          const near = c.f[2] / maxW;
          const [x, y] = at(c.x + c.f[2] / 2, c.y + c.f[3]);
          const img = scene.add.image(x, y, data.sheet, c.name).setOrigin(0.5, 1).setScale(s).setDepth(DEPTH.clouds + near * 0.05);
          // wrap round just out of the widest view: from M + w/2 left of the design area to M + w/2 right of it
          const w = c.f[2] * s + 80;
          const span = W.width + M * 2 + w;
          const speed = lerp(C.cloudSpeed[0], C.cloudSpeed[1], near) * C.wind;
          const period = lerp(C.cloudBreathePeriod[0], C.cloudBreathePeriod[1], hash(i, 21));
          const phase = hash(i, 22) * TAU;
          parts.push((t) => {
            img.x = -M - w / 2 + mod(x + M + w / 2 + speed * t, span);
            const b = Math.sin((TAU * t) / period + phase) * C.cloudBreathe;
            img.setScale(s * (1 + b), s * (1 + b * 1.6));
          });
        });
      }

      if (night) {
        // stars: the big painted sparkles (now live), each on its own slow twinkle; no round dots
        const spark = sparkleTexture(scene);
        const stars = (data?.stars || []).filter((st) => st.s >= C.sparkleMin);
        stars.forEach((st, i) => {
          const [x, y] = at(st.x, st.y);
          const base = (st.s * s) / (30 * R); // the sparkle spans 30 texture px
          const img = scene.add.image(x, y, spark).setScale(base).setDepth(DEPTH.stars);
          const p1 = lerp(C.starTwinkle[0], C.starTwinkle[1], hash(i, 41)), p2 = p1 * 0.37;
          const f1 = hash(i, 42) * TAU, f2 = hash(i, 43) * TAU;
          parts.push((t) => {
            const tw = 0.5 + 0.5 * (0.7 * Math.sin((TAU * t) / p1 + f1) + 0.3 * Math.sin((TAU * t) / p2 + f2));
            img.setAlpha(lerp(0.5, 1, tw));
            img.setScale(base * (0.86 + 0.18 * tw));
          });
        });

        if (!KL.SkyLife.still) {
          // a rare shooting star, high up and quick
          const M = C.meteor;
          const streak = scene.add.image(0, 0, meteorTexture(scene)).setOrigin(1 - 4 / 200, 0.5).setDepth(DEPTH.meteor).setVisible(false);
          parts.push((t) => {
            const m = meteor(Math.floor(t / M.slot));
            const u = m ? (t - m.start) / m.duration : -1;
            if (u < 0 || u >= 1) return streak.setVisible(false);
            const d = m.travel * (1 - (1 - u) * (1 - u)); // eases out as it burns up
            streak.setVisible(true).setPosition(m.x + m.dx * d, m.y + m.dy * d).setRotation(Math.atan2(m.dy, m.dx));
            streak.setScale((m.length / (200 * R)) * lerp(0.35, 1, smooth(0, 0.4, u)), 1 / R);
            streak.setAlpha(smooth(0, 0.12, u) * (1 - smooth(0.6, 1, u)) * 0.9);
          });
        }
      } else if (!KL.SkyLife.still) {
        // gulls: now and then a small flock glides across, flapping in bursts
        const B = C.birds;
        const key = birdTexture(scene);
        const pool = Array.from({ length: B.size[1] }, () => scene.add.image(0, 0, key, 0).setDepth(DEPTH.birds).setVisible(false));
        parts.push((t) => {
          const now = flockAt(t);
          pool.forEach((img, i) => {
            if (!now || i >= now.f.size) return img.setVisible(false);
            const b = bird(now.f, i, now.tau);
            const frame = Math.round(((b.h - BIRD.hMin) / (BIRD.hMax - BIRD.hMin)) * (BIRD.frames - 1));
            img.setVisible(true).setFrame(frame).setPosition(b.x, b.y).setScale(b.span / (BIRD.px * R)).setAlpha(b.alpha);
          });
        });
      }

      const draw = () => parts.forEach((p) => p(KL.SkyLife.clock));
      const tick = (time, delta) => {
        KL.SkyLife.advance(scene, delta);
        draw();
      };
      draw();
      scene.events.on('update', tick);
      scene.events.once('shutdown', () => scene.events.off('update', tick));
    },
  };
})();
