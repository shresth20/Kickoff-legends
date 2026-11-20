/* The crowd: a stand full of fans, synthesised voice by voice and baked once at start-up (an
 * OfflineAudioContext renders a few seconds of each texture in the background), then played live.
 *
 * There is no constant chatter: the stand is heard when it reacts. Its mood, `level` 0…1 (the pressure
 * the Director feeds it — the ball near a goal, the clock running down, sudden death — plus short
 * boosts from reactions), decides when the fans have a calm spell to start a chant.
 *
 * Reactions (one-shots): roar (a goal: the stand erupts, horns blare, applause rolls on), cheer, ooh
 * (a near miss), aww (a chance gone), boo (whistles and jeers), applause, and chants — fans drumming and
 * clapping a rhythm in the calm spells of a match, shouting "HEY!" at the end of each phrase (the music
 * borrows that HEY! for its chorus). A studio recording with the same name (crowd_roar …) replaces a bake. */
window.KL = window.KL || {};

(() => {
  const K = KL.AudioKit;
  const SR = 32000; // crowds have little above 16 kHz: a third less memory than 48 kHz

  /** A crowd of `n` voices, each from make(i) (KL.AudioKit.voice options), spread across the stand. */
  function crowdOf(oc, dest, n, make) {
    for (let i = 0; i < n; i++) K.voice(oc, K.head(K.panner(oc, K.rand(-0.95, 0.95)), dest), make(i));
  }

  /** A fan whistling (fingers in the mouth): a piercing tone with a little wobble. */
  function whistler(oc, dest, t, dur, f, lvl) {
    const o = K.osc(oc, 'sine', f * 0.92, t, t + dur + 0.05);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    o.frequency.setValueAtTime(f, t + dur * 0.7);
    o.frequency.exponentialRampToValueAtTime(f * 0.9, t + dur);
    K.chain(K.osc(oc, 'sine', K.rand(5, 8), t, t + dur), K.gain(oc, f * 0.012), o.frequency);
    const g = oc.createGain();
    K.curve(g.gain, t, [[0, 0], [0.04, lvl], [dur - 0.05, lvl * 0.9], [dur, 0]]);
    K.chain(o, g, K.panner(oc, K.rand(-0.9, 0.9)), dest);
  }

  /** The breath and rumble under a shout, following the level points `pts`. */
  function shoutAir(oc, dest, pts, hz = 1100) {
    const dur = oc.length / oc.sampleRate;
    const g = oc.createGain();
    K.curve(g.gain, 0, pts);
    K.chain(K.noise(oc, 'pink', 0, dur), K.filter(oc, 'bandpass', hz, 0.5), g, dest);
  }

  const lvl = () => K.rand(0.25, 0.6);

  /** The bakes: name → { sec, loop?, build(oc, dest) | js(sr) → [L, R] }. */
  const BAKES = {
    crowd_hey: {
      sec: 0.8,
      build(oc, d) {
        crowdOf(oc, d, 36, () => {
          const f = K.rand(190, 380), dur = K.rand(0.2, 0.32), l = lvl();
          return { t: Math.abs(K.rand(-1, 1)) * 0.03, dur, shift: K.rand(0.95, 1.25), breath: 0.35, bright: 4200,
            f0: [[0, f * 0.9], [0.05, f * 1.12], [dur, f * 0.95]], vowels: [[0, 'e'], [dur, 'e']], amp: [[0, 0], [0.018, l], [dur * 0.6, l * 0.8], [dur, 0]] };
        });
        shoutAir(oc, d, [[0, 0], [0.03, 0.3], [0.3, 0]], 1600);
      },
    },
    crowd_roar: {
      sec: 6,
      build(oc, d) {
        crowdOf(oc, d, 44, () => {
          const on = Math.random() < 0.85 ? K.rand(0, 0.3) : K.rand(0.3, 0.9);
          const f = K.rand(170, 390), rise = K.rand(0.12, 0.35), hold = K.rand(1.5, 3.2);
          const dur = Math.min(5.9 - on, rise + hold + K.rand(0.6, 1.5)), l = lvl();
          return { t: on, dur, shift: K.rand(0.95, 1.25), breath: K.rand(0.15, 0.4), bright: K.rand(2500, 4500), vib: { rate: K.rand(4.5, 7), depth: K.rand(0.01, 0.025) },
            f0: [[0, f * 0.78], [rise, f * 1.12], [rise + hold, f * 0.98], [dur, f * 0.72]],
            vowels: [[0, 'e'], [rise, 'ae'], [rise + 0.35, 'a'], [dur, K.pick(['a', 'o'])]],
            amp: [[0, 0], [0.05, l * 0.6], [rise, l], [rise + hold, l * 0.8], [dur, 0]] };
        });
        shoutAir(oc, d, [[0, 0], [0.3, 0.35], [2.8, 0.3], [5.6, 0]]);
        for (let i = 0; i < 6; i++) whistler(oc, d, K.rand(0.4, 2.5), K.rand(0.4, 1.1), K.rand(2200, 3500), K.rand(0.05, 0.1));
      },
    },
    crowd_ooh: {
      sec: 2.6,
      build(oc, d) {
        crowdOf(oc, d, 40, () => {
          const on = K.rand(0, 0.18), f = K.rand(150, 320), dur = 2.35 - on, l = lvl();
          return { t: on, dur, shift: K.rand(0.95, 1.25), breath: 0.25, bright: 3000, vib: { rate: K.rand(4.5, 6.5), depth: 0.015 },
            f0: [[0, f * 0.85], [0.45, f * 1.22], [1.3, f], [dur, f * 0.72]], vowels: [[0, 'u'], [0.5, 'o'], [dur, 'o']], amp: [[0, 0], [0.3, l], [1, l * 0.85], [dur, 0]] };
        });
        shoutAir(oc, d, [[0, 0], [0.35, 0.18], [2.4, 0]], 700);
      },
    },
    crowd_aww: {
      sec: 2.4,
      build(oc, d) {
        crowdOf(oc, d, 40, () => {
          const f = K.rand(160, 300), dur = K.rand(1.6, 2.3), l = lvl();
          return { t: K.rand(0, 0.12), dur, shift: K.rand(0.95, 1.25), breath: 0.3, bright: 2800,
            f0: [[0, f * 1.15], [0.25, f * 1.2], [dur, f * 0.68]], vowels: [[0, 'a'], [0.35, 'o'], [dur, 'o']], amp: [[0, 0], [0.12, l], [0.7, l * 0.8], [dur, 0]] };
        });
      },
    },
    crowd_boo: {
      sec: 3.2,
      build(oc, d) {
        crowdOf(oc, d, 26, () => {
          const f = K.rand(100, 170), dur = K.rand(1.8, 2.8), l = lvl();
          return { t: K.rand(0, 0.4), dur, shift: K.rand(0.9, 1.15), breath: 0.3, bright: 2000,
            f0: [[0, f], [dur * 0.5, f * 1.04], [dur, f * 0.9]], vowels: [[0, 'u'], [dur, 'u']], amp: [[0, 0], [0.2, l], [dur * 0.8, l * 0.9], [dur, 0]] };
        });
        for (let i = 0; i < 10; i++) whistler(oc, d, K.rand(0, 1.2), K.rand(0.6, 1.6), K.rand(2600, 3900), K.rand(0.06, 0.1));
      },
    },
    crowd_applause: { sec: 4, js: (sr) => K.applause(sr, 4) },
    crowd_clap: { sec: 0.32, js: (sr) => K.unisonClap(sr) },
  };
  // the order they bake in: what the menus need first
  const ORDER = ['crowd_hey', 'crowd_roar', 'crowd_applause', 'crowd_ooh', 'crowd_clap', 'crowd_aww', 'crowd_boo'];

  /** Peak-normalise an AudioBuffer in place. */
  function normaliseBuffer(buf, to = 0.9) {
    K.normalise(Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)), to);
    return buf;
  }

  KL.Crowd = class Crowd {
    constructor(A) {
      const c = A.ctx;
      this.A = A;
      this.out = K.head(K.gain(c, 1), A.buses.crowd);
      K.chain(this.out, K.gain(c, 0.3), A.reverb);
      // the drummers and clappers of the chants sit in one end of the stand
      this.chantBus = K.head(K.gain(c, 0.6), K.panner(c, -0.35), this.out);
      this.mode = 'off';
      this.level = 0;
      this.pressure = 0;
      this.boost = 0;
      this.lastReact = -9;
      this.nextChant = Infinity;
    }

    /** Bake every texture not supplied as a studio sample, one after another, in the background. */
    bakeAll() {
      let p = Promise.resolve();
      for (const name of ORDER) {
        if (this.A.hasSample(name)) continue;
        p = p.then(() => this.bake(name)).catch((e) => console.warn(`[audio] crowd bake ${name}:`, e));
      }
      return p;
    }

    async bake(name) {
      const job = BAKES[name];
      let buf;
      if (job.js) buf = K.toBuffer(this.A.ctx, job.js(SR), SR);
      else buf = await K.bake(job.sec, job.build, { sampleRate: SR });
      this.A.bakes[name] = normaliseBuffer(buf);
    }

    /** 'off' | 'menu' | 'match' (a live stand: it chants in the calm spells). */
    setMode(mode) {
      if (mode === this.mode) return;
      this.mode = mode;
      this.pressure = 0;
      this.nextChant = mode === 'match' ? this.A.now + K.rand(12, 20) : Infinity;
    }

    tick(t, dt) {
      this.boost *= Math.exp(-dt / 1.4);
      const base = { off: 0, menu: 0.05, match: 0.26 }[this.mode] ?? 0;
      const target = this.mode === 'off' ? 0 : K.clamp(base + this.pressure + this.boost, 0, 1);
      // a crowd's mood swells fast and settles slowly
      this.level += (target - this.level) * (1 - Math.exp(-dt / (target > this.level ? 0.25 : 1.2)));
      if (!Number.isFinite(this.level)) this.level = this.pressure = this.boost = 0;
      // the calm spells of a match: the fans start a chant
      if (t >= this.nextChant) {
        if (!this.A.paused && this.level < 0.55 && t - this.lastReact > 5) this.chant(t + 0.15);
        this.nextChant = t + K.rand(16, 30);
      }
    }

    /** Play a crowd buffer through the stand's bus. */
    oneShot(name, t, o = {}) {
      const buf = this.A.buffer(name);
      if (!buf) return null;
      return this.A.playBuffer(buf, { dest: this.out, at: t, ...o });
    }

    applause(t, dur, gain = 0.6) {
      const buf = this.A.buffer('crowd_applause');
      if (!buf) return;
      this.A.playBuffer(buf, { dest: this.out, at: t, loop: true, dur, fadeIn: 0.35, fadeOut: Math.min(2.5, dur * 0.6), gain, offset: Math.random() * buf.duration });
    }

    /**
     * React to the game. kind: roar · cheer · ooh · aww · boo · rise (draws breath as a shot goes in) ·
     * applause. o = { delay, dur, gain }.
     */
    react(kind, o = {}) {
      if (!this.A.ready) return;
      const t = this.A.now + (o.delay || 0);
      this.lastReact = t;
      switch (kind) {
        case 'roar':
          this.oneShot('crowd_roar', t, { gain: o.gain ?? 1 });
          this.applause(t + 1.8, o.dur ?? 5, 0.5);
          for (let i = 0; i < 3; i++) this.A.play('air_horn', { delay: (o.delay || 0) + 0.35 + i * K.rand(0.35, 0.9), key: i });
          this.boost = Math.max(this.boost, 0.7);
          break;
        case 'cheer':
          this.oneShot('crowd_roar', t, { gain: o.gain ?? 0.55, dur: 2.6, fadeOut: 1.3, rate: K.vary(1.03, 0.03) });
          this.boost = Math.max(this.boost, 0.35);
          break;
        case 'ooh':
          this.oneShot('crowd_ooh', t, { gain: o.gain ?? 0.9, rate: K.vary(1, 0.04) });
          this.boost = Math.max(this.boost, 0.25);
          break;
        case 'aww':
          this.oneShot('crowd_aww', t, { gain: o.gain ?? 0.7, rate: K.vary(1, 0.04) });
          break;
        case 'boo':
          this.oneShot('crowd_boo', t, { gain: o.gain ?? 0.55 });
          break;
        case 'rise':
          this.boost = Math.max(this.boost, o.gain ?? 0.38);
          break;
        case 'applause':
          this.applause(t, o.dur ?? 4, o.gain ?? 0.6);
          break;
        default:
          break;
      }
    }

    /** The music's chorus: the crowd shouts "HEY!" at t, into `dest` (the music track). */
    hey(t, dest) {
      const buf = this.A.buffer('crowd_hey');
      if (buf) this.A.playBuffer(buf, { dest, at: t, gain: 0.5, rate: K.vary(1, 0.02) });
    }

    /** A big stand drum, booming round the stadium. */
    drum(t, v = 1) {
      const c = this.A.ctx, out = this.chantBus;
      const o = K.osc(c, 'sine', 82, t, t + 0.7);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
      const g = c.createGain();
      K.perc(g.gain, t, 0.55 * v, 0.003, 0.55);
      K.chain(o, g, out);
      const n = K.noise(c, 'pink', t, 0.2);
      const ng = c.createGain();
      K.perc(ng.gain, t, 0.3 * v, 0.002, 0.09);
      K.chain(n, K.filter(c, 'lowpass', 420), ng, out);
    }

    /** Fans drum and clap a rhythm two or three times round, with a "HEY!" to end each phrase. */
    chant(t0) {
      const clap = this.A.buffer('crowd_clap');
      if (!clap) return;
      const hey = this.A.buffer('crowd_hey');
      const eighth = 60 / K.rand(106, 118) / 2;
      const reps = Math.random() < 0.5 ? 2 : 3;
      for (let r = 0; r < reps; r++) {
        const base = t0 + r * 16 * eighth;
        for (const p of [0, 2, 4, 5, 6, 8, 9, 10, 11, 12]) {
          const at = base + p * eighth;
          this.A.playBuffer(clap, { dest: this.chantBus, at, gain: 0.75 * K.vary(1, 0.1), rate: K.vary(1, 0.04) });
          this.drum(at, p % 4 === 0 ? 1 : 0.55);
        }
        if (hey) this.A.playBuffer(hey, { dest: this.chantBus, at: base + 14 * eighth, gain: 0.85 });
      }
      this.boost = Math.max(this.boost, 0.12);
      this.lastReact = t0;
    }
  };
})();
