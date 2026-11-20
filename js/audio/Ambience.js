/* Ambience: the air around the stadium, behind the crowd.
 *
 * Day: a breathing wind (it gusts now and then), the far hum of the city, songbirds in the trees
 * behind the stands, and gulls that call only while the sky's flock is actually flying overhead —
 * read off KL.SkyLife's shared clock and panned to where the lead bird is.
 * Night: a softer wind, the floodlights' mains hum, crickets chirping in pulse trains, an owl far
 * off now and then, and a faint shimmer when a shooting star streaks across the sky.
 *
 * A studio loop named amb_day / amb_night (assets/audio/audio.js) replaces the synthesised beds. */
window.KL = window.KL || {};

(() => {
  const K = KL.AudioKit;

  KL.Ambience = class Ambience {
    constructor(A) {
      const c = A.ctx;
      this.A = A;
      this.out = K.head(K.gain(c, 1), A.buses.amb);
      K.chain(this.out, K.gain(c, 0.12), A.reverb);
      this.kind = null;
      this.layers = [];
      this.bugs = [];
      this.ev = {};
    }

    /** Overall level: the match pulls the ambience back under the crowd. */
    setLevel(v) {
      if (this.A.ctx) this.out.gain.setTargetAtTime(v, this.A.now, 0.6);
    }

    /** 'day' | 'night': cross-fade to that bed. */
    set(kind) {
      if (kind === this.kind) return;
      const c = this.A.ctx, t = c.currentTime;
      for (const l of this.layers) {
        l.g.gain.cancelScheduledValues(t);
        l.g.gain.setTargetAtTime(0, t, 0.4);
        for (const s of l.srcs) s.stop(t + 2.5);
      }
      this.layers = [];
      this.bugs = [];
      this.kind = kind;
      this.studio = this.A.hasSample(`amb_${kind}`);
      if (this.studio) {
        const p = this.A.playBuffer(this.A.buffer(`amb_${kind}`), { dest: this.out, loop: true, fadeIn: 1.2 });
        this.layers.push({ g: p.gain, srcs: [p.src] });
        return;
      }
      if (kind === 'day') this.layers.push(this.wind(0.16, 420), this.wind(0.05, 130));
      else this.layers.push(this.wind(0.08, 260), this.hum(), this.crickets());
      this.ev = { bird: t + K.rand(1, 4), gull: 0, gust: t, owl: t + K.rand(20, 45), meteor: -1 };
    }

    wind(level, hz) {
      const c = this.A.ctx, t = c.currentTime;
      const n = K.noise(c, 'brown', t);
      const lp = K.filter(c, 'lowpass', hz, 0.6);
      const g = K.gain(c, 0);
      g.gain.setTargetAtTime(level, t, 0.8);
      K.chain(n, lp, g, this.out);
      return { g, srcs: [n], lp, level, hz, wind: true };
    }

    /** The floodlights' mains hum: faint, but it's what a floodlit night sounds like. */
    hum() {
      const c = this.A.ctx, t = c.currentTime;
      const g = K.head(K.gain(c, 0), this.out);
      g.gain.setTargetAtTime(1, t, 0.8);
      const a = K.osc(c, 'sine', 100, t);
      const b = K.osc(c, 'sawtooth', 50, t);
      K.chain(a, K.gain(c, 0.012), g);
      K.chain(b, K.filter(c, 'lowpass', 320), K.gain(c, 0.007), g);
      return { g, srcs: [a, b] };
    }

    /** Four crickets, each an always-on tone whose level the scheduler pulses into chirps. */
    crickets() {
      const c = this.A.ctx, t = c.currentTime;
      const g = K.head(K.gain(c, 0), this.out);
      g.gain.setTargetAtTime(1, t, 1);
      const srcs = [];
      for (let i = 0; i < 4; i++) {
        const o = K.osc(c, 'sine', K.rand(4200, 5000), t);
        const env = K.gain(c, 0);
        K.chain(o, env, K.panner(c, K.rand(-0.85, 0.85)), g);
        srcs.push(o);
        this.bugs.push({ env, next: t + K.rand(0.2, 1.5), period: K.rand(0.5, 0.9), level: K.rand(0.012, 0.028), pulses: K.pick([2, 3, 3, 4]) });
      }
      return { g, srcs };
    }

    tick(t) {
      if (!this.kind || this.studio) return;
      const E = this.ev, sky = KL.SkyLife;
      const live = !this.A.paused;
      // the wind breathes: a new gust target every few seconds
      if (t >= E.gust) {
        for (const l of this.layers) {
          if (!l.wind) continue;
          l.g.gain.setTargetAtTime(l.level * K.rand(0.55, 1.5), t, 1.2);
          l.lp.frequency.setTargetAtTime(l.hz * K.rand(0.8, 1.4), t, 1.5);
        }
        E.gust = t + K.rand(2.5, 5);
      }
      if (this.kind === 'day') {
        if (t >= E.bird && live) {
          this.songbird(t + 0.05);
          E.bird = t + K.rand(3.5, 9);
        }
        // gulls call while the sky's flock is overhead (the same clock that flies them)
        const now = sky && !sky.still ? sky.flockAt(sky.clock) : null;
        if (now && t >= E.gull && live) {
          const b = sky.bird(now.f, 0, now.tau);
          if (b.x > -150 && b.x < 1430) this.gull(t + 0.02, b.x);
          E.gull = t + K.rand(1.4, 4.2);
        }
      } else {
        this.chirp(t);
        if (t >= E.owl && live) {
          this.owl(t + 0.05);
          E.owl = t + K.rand(35, 80);
        }
        if (sky && !sky.still && KL.SKY_LIFE) {
          const k = Math.floor(sky.clock / KL.SKY_LIFE.meteor.slot);
          const m = sky.meteor(k);
          if (m && E.meteor !== k && sky.clock >= m.start && sky.clock < m.start + 0.3) {
            E.meteor = k;
            this.shimmer(t, m.x);
          }
        }
      }
    }

    /** Schedule the crickets' chirps half a second ahead: 2–4 pulses of ~15 ms, every 0.5–0.9 s. */
    chirp(t) {
      for (const b of this.bugs) {
        while (b.next < t + 0.5) {
          const at = Math.max(b.next, t);
          if (Math.random() < 0.12) {
            b.next = at + K.rand(1.5, 4); // a cricket falls quiet for a moment
            continue;
          }
          for (let p = 0; p < b.pulses; p++) {
            const s = at + p * 0.034;
            b.env.gain.setValueAtTime(0, s);
            b.env.gain.linearRampToValueAtTime(b.level, s + 0.004);
            b.env.gain.setValueAtTime(b.level, s + 0.014);
            b.env.gain.linearRampToValueAtTime(0, s + 0.02);
          }
          b.next = at + b.period * K.vary(1, 0.05);
        }
      }
    }

    /** A songbird's phrase: quick FM chirps sweeping up or down. */
    songbird(t) {
      const c = this.A.ctx;
      const out = K.head(K.gain(c, 0.5), K.panner(c, K.rand(-0.9, 0.9)), this.out);
      const base = K.rand(2600, 4200);
      const up = Math.random() < 0.5;
      let at = t;
      for (let i = 0, n = 2 + Math.floor(Math.random() * 5); i < n; i++) {
        const d = K.rand(0.04, 0.11);
        const o = K.osc(c, 'sine', base, at, at + d + 0.02);
        o.frequency.setValueAtTime(base * (up ? 0.8 : 1.25), at);
        o.frequency.exponentialRampToValueAtTime(base * (up ? 1.3 : 0.85), at + d);
        K.chain(K.osc(c, 'sine', K.rand(40, 90), at, at + d), K.gain(c, base * 0.06), o.frequency);
        const g = c.createGain();
        K.curve(g.gain, at, [[0, 0], [0.008, K.rand(0.03, 0.06)], [d, 0]]);
        K.chain(o, g, out);
        at += d + K.rand(0.03, 0.12);
      }
    }

    /** A gull's "kyow", once to three times, from where the flock is. */
    gull(t, x) {
      const c = this.A.ctx;
      const out = K.head(K.gain(c, 0.55), K.panner(c, this.A.panFor(x)), this.out);
      let at = t;
      for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) {
        const d = K.rand(0.22, 0.34), f = K.rand(780, 1050) * (1 - i * 0.04);
        const o = K.osc(c, 'sawtooth', f * 0.75, at, at + d + 0.03);
        K.curve(o.frequency, at, [[0, f * 0.75], [d * 0.3, f * 1.25], [d, f * 0.8]], true);
        const g = c.createGain();
        K.curve(g.gain, at, [[0, 0], [0.03, 0.05], [d * 0.6, 0.04], [d, 0]]);
        K.chain(o, K.filter(c, 'bandpass', 1900, 1.4), K.filter(c, 'lowpass', 3500), g, out);
        at += d + K.rand(0.08, 0.2);
      }
    }

    /** An owl far off: hoo — hoo-hoooo. */
    owl(t) {
      const c = this.A.ctx;
      const out = K.head(K.gain(c, 0.6), K.panner(c, K.rand(-0.8, 0.8)), this.out);
      for (const [dt, d] of [[0, 0.3], [0.55, 0.16], [0.78, 0.42]]) {
        const at = t + dt;
        const o = K.osc(c, 'sine', 410, at, at + d + 0.05);
        o.frequency.exponentialRampToValueAtTime(370, at + d);
        const g = c.createGain();
        K.curve(g.gain, at, [[0, 0], [0.05, 0.06], [d * 0.7, 0.05], [d, 0]]);
        K.chain(o, K.filter(c, 'lowpass', 900), g, out);
      }
    }

    /** A shooting star: a faint, falling sparkle where it streaks. */
    shimmer(t, x) {
      const c = this.A.ctx;
      const out = K.head(K.gain(c, 0.5), K.panner(c, this.A.panFor(x)), this.out);
      for (let i = 0; i < 7; i++) {
        const at = t + i * 0.07;
        const o = K.osc(c, 'sine', 5200 - i * 380, at, at + 0.5);
        const g = c.createGain();
        K.perc(g.gain, at, 0.02, 0.005, 0.45);
        K.chain(o, g, out);
      }
      const n = K.noise(c, 'white', t, 1.1);
      const bp = K.filter(c, 'bandpass', 6000, 3);
      bp.frequency.exponentialRampToValueAtTime(2500, t + 1);
      const g = c.createGain();
      K.curve(g.gain, t, [[0, 0], [0.15, 0.02], [1, 0]]);
      K.chain(n, bp, g, out);
    }
  };
})();
