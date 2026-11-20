/* The crowd: a stand full of fans, synthesised voice by voice and baked once at start-up (an
 * OfflineAudioContext renders a few seconds of each texture in the background), then played live.
 *
 * Bed: two seamless loops — a murmur (30 fans chatting) and an excited stand (38 fans shouting) —
 * cross-faded by the crowd's mood, `level` 0…1, which follows the game: the base of the mode (menus:
 * a distant murmur; a match: a lively stand), the pressure the Director feeds it (the ball near a
 * goal, the clock running down, sudden death) and short boosts from reactions. The louder the stand,
 * the brighter it sounds (a low-pass opens with the level).
 *
 * Reactions (one-shots): roar (a goal: the stand erupts, horns blare, applause rolls on), cheer, ooh
 * (a near miss), aww (a chance gone), boo (whistles and jeers), applause, and chants — fans drumming and
 * clapping a rhythm in the calm spells of a match, shouting "HEY!" at the end of each phrase (the music
 * borrows that HEY! for its chorus). A studio recording with the same name (crowd_roar …) replaces a bake. */
window.KL = window.KL || {};

(() => {
  const K = KL.AudioKit;
  const LOOP_FADE = 1; // s rendered past a loop's length, crossfaded into its start
  const SR = 32000; // crowds have little above 16 kHz: a third less memory than 48 kHz
  const SPEECH = ['a', 'e', 'i', 'o', 'u', 'uh', 'ae'];

  /** One fan chatting: syllables of random vowels in phrases, pitch wandering like speech. */
  function talker(oc, dest, dur, o) {
    const src = K.osc(oc, 'sawtooth', o.f0, 0, dur);
    const buzz = K.gain(oc, 1);
    src.connect(buzz);
    K.chain(K.noise(oc, 'white', 0, dur), K.gain(oc, 0.1 + 0.2 * o.excited), buzz);
    const amp = K.head(K.gain(oc, 0), dest);
    const bands = [0, 1, 2].map((k) => {
      const bp = K.filter(oc, 'bandpass', 600, K.FORMANT_Q[k]);
      const g = K.gain(oc, 0);
      K.chain(buzz, bp, g, amp);
      return { bp, g };
    });
    let t = Math.random() * 0.8;
    while (t < dur) {
      const n = 2 + Math.floor(Math.random() * 6);
      for (let s = 0; s < n && t < dur; s++) {
        const shout = o.excited && Math.random() < 0.14;
        const syl = shout ? K.rand(0.3, 0.75) : K.rand(0.08, 0.2);
        const V = K.VOWELS[shout ? K.pick(['a', 'e', 'o', 'ae']) : K.pick(SPEECH)];
        bands.forEach(({ bp, g }, k) => {
          bp.frequency.setTargetAtTime(V.f[k] * o.shift, t, 0.012);
          g.gain.setTargetAtTime(V.g[k] * K.FORMANT_MAKE[k], t, 0.012);
        });
        const lvl = o.level * K.rand(0.45, 1) * (shout ? 1.5 : 1);
        amp.gain.setTargetAtTime(lvl, t, 0.012);
        amp.gain.setTargetAtTime(lvl * 0.12, t + syl * 0.65, 0.025);
        src.frequency.setTargetAtTime(o.f0 * K.rand(0.88, 1.18) * (shout ? 1.35 : 1), t, 0.03);
        t += syl;
      }
      amp.gain.setTargetAtTime(0, t, 0.04);
      t += K.rand(0.12, 1.1) * (1 - 0.65 * o.excited);
    }
  }

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
    crowd_murmur: { sec: 8, loop: true, build: (oc, d) => babbleOf(oc, d, { talkers: 30, f0: [95, 220], level: 0.32, bright: 2200, excited: 0, rumble: 0.5, rumbleHz: 450 }) },
    crowd_excited: {
      sec: 8,
      loop: true,
      build(oc, d) {
        babbleOf(oc, d, { talkers: 38, f0: [140, 320], level: 0.42, bright: 3600, excited: 1, rumble: 0.7, rumbleHz: 800 });
        for (let i = 0; i < 5; i++) whistler(oc, d, K.rand(0, 8), K.rand(0.4, 1), K.rand(2400, 3600), K.rand(0.03, 0.06));
      },
    },
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
  const ORDER = ['crowd_murmur', 'crowd_hey', 'crowd_excited', 'crowd_roar', 'crowd_applause', 'crowd_ooh', 'crowd_clap', 'crowd_aww', 'crowd_boo'];

  /** Many fans talking at once (+ the low rumble of a full stand). */
  function babbleOf(oc, dest, o) {
    const dur = oc.length / oc.sampleRate;
    K.chain(K.noise(oc, 'pink', 0, dur), K.filter(oc, 'lowpass', o.rumbleHz, 0.5), K.gain(oc, o.rumble), dest);
    for (let i = 0; i < o.talkers; i++) {
      const near = Math.random(); // far fans are quieter and duller
      const lp = K.filter(oc, 'lowpass', o.bright * (0.5 + near * 0.6), 0.5);
      K.chain(lp, K.panner(oc, K.rand(-0.95, 0.95)), dest);
      talker(oc, lp, dur, { f0: K.rand(o.f0[0], o.f0[1]), shift: K.rand(0.95, 1.25), level: o.level * (0.35 + near * 0.65), excited: o.excited });
    }
  }

  /** Peak-normalise an AudioBuffer in place. */
  function normaliseBuffer(buf, to = 0.9) {
    K.normalise(Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)), to);
    return buf;
  }

  KL.Crowd = class Crowd {
    constructor(A) {
      const c = A.ctx;
      this.A = A;
      this.out = K.head(K.gain(c, 1), A.buses.crowd); // commentary ducks it
      K.chain(this.out, K.gain(c, 0.3), A.reverb);
      this.bedFilter = K.head(K.filter(c, 'lowpass', 1000, 0.5), this.out);
      this.murmurG = K.head(K.gain(c, 0), this.bedFilter);
      this.excitedG = K.head(K.gain(c, 0), this.bedFilter);
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
      this.startBeds(); // studio beds start straight away
      return p;
    }

    async bake(name) {
      const job = BAKES[name];
      let buf;
      if (job.js) buf = K.toBuffer(this.A.ctx, job.js(SR), SR);
      else {
        buf = await K.bake(job.sec + (job.loop ? LOOP_FADE : 0), job.build, { sampleRate: SR });
        if (job.loop) buf = K.loopify(this.A.ctx, buf, LOOP_FADE);
      }
      this.A.bakes[name] = normaliseBuffer(buf);
      if (name === 'crowd_murmur' || name === 'crowd_excited') this.startBeds();
    }

    /** Start the two bed loops (silent until the level asks for them), once their buffers exist. */
    startBeds() {
      const c = this.A.ctx;
      for (const [name, g, key] of [['crowd_murmur', this.murmurG, 'murmurSrc'], ['crowd_excited', this.excitedG, 'excitedSrc']]) {
        if (this[key]) continue;
        const buf = this.A.buffer(name);
        if (!buf) continue;
        const s = c.createBufferSource();
        s.buffer = buf;
        s.loop = true;
        s.connect(g);
        s.start(c.currentTime, Math.random() * buf.duration);
        this[key] = s;
      }
    }

    /** 'off' | 'menu' (a distant murmur round the menus) | 'match' (a live stand). */
    setMode(mode) {
      if (mode === this.mode) return;
      this.mode = mode;
      this.pressure = 0;
      this.nextChant = mode === 'match' ? this.A.now + K.rand(12, 20) : Infinity;
    }

    /** Commentary talks over the crowd: it drops back a little. */
    duck(on) {
      if (!this.A.ctx) return;
      this.out.gain.setTargetAtTime(on ? 0.62 : 1, this.A.now, on ? 0.1 : 0.4);
    }

    /** Bed gains and brightness for a crowd `level` 0…1 in `mode` (pure). */
    static levels(level, mode) {
      if (mode === 'off') return { murmur: 0, excited: 0, cutoff: 800 };
      if (mode === 'menu') return { murmur: 0.22 + level, excited: 0, cutoff: 900 };
      return {
        murmur: 0.8 - 0.35 * level,
        excited: Math.pow(level, 1.4) * 1.15,
        cutoff: 800 + 4200 * Math.pow(level, 1.2),
      };
    }

    tick(t, dt) {
      this.boost *= Math.exp(-dt / 1.4);
      const base = { off: 0, menu: 0.05, match: 0.26 }[this.mode] ?? 0;
      const target = this.mode === 'off' ? 0 : K.clamp(base + this.pressure + this.boost, 0, 1);
      // a crowd's mood swells fast and settles slowly
      this.level += (target - this.level) * (1 - Math.exp(-dt / (target > this.level ? 0.25 : 1.2)));
      if (!Number.isFinite(this.level)) this.level = this.pressure = this.boost = 0;
      const L = KL.Crowd.levels(this.level, this.mode);
      this.murmurG.gain.setTargetAtTime(L.murmur, t, 0.1);
      this.excitedG.gain.setTargetAtTime(L.excited, t, 0.1);
      this.bedFilter.frequency.setTargetAtTime(L.cutoff, t, 0.15);
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
