/* Audio kit: the DSP building blocks the whole soundscape is made from — noise, envelopes, a formant
 * voice (the legends' shouts and every fan in the crowd), hand-clap kernels and the stadium's reverb
 * impulse. Everything works on a live AudioContext and on an OfflineAudioContext alike (the crowd is
 * baked offline once, then looped). The pure helpers (vowels, pitch, panning, seeded random, the
 * applause synth) touch no WebAudio and are unit-tested (tests/audio.test.mjs). */
window.KL = window.KL || {};

(() => {
  /**
   * Vowel formants (Hz) of an adult voice (Peterson & Barney) and their relative levels. A speaker's
   * `shift` scales them (≈1.15–1.25 for a lighter, younger voice).
   */
  const VOWELS = {
    a: { f: [730, 1090, 2440], g: [1, 0.5, 0.22] }, // "ah"  (father)
    ae: { f: [660, 1720, 2410], g: [1, 0.5, 0.25] }, // "a"   (bat — the "yeah" of a cheer)
    e: { f: [530, 1840, 2480], g: [1, 0.42, 0.28] }, // "eh"  (hey)
    i: { f: [270, 2290, 3010], g: [1, 0.3, 0.22] }, // "ee"
    o: { f: [570, 840, 2410], g: [1, 0.55, 0.18] }, // "oh / aw"
    u: { f: [300, 870, 2240], g: [1, 0.32, 0.1] }, // "oo"
    uh: { f: [640, 1190, 2390], g: [1, 0.48, 0.2] }, // "uh"  (grunts)
  };
  const FORMANT_Q = [7, 10, 14]; // bandwidths ≈ 90 / 110 / 170 Hz
  // narrow band-passes pass little of the buzz: make the level back up (more on the upper formants)
  const FORMANT_MAKE = [3.2, 4.5, 6];

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  /** ±pct random variation around v (pct 0.05 = ±5 %): no two kicks sound machine-identical. */
  const vary = (v, pct) => v * (1 + (Math.random() * 2 - 1) * pct);
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  /** Design-x (0…1280) → stereo pan, kept off the hard edges so nothing sounds glued to one ear. */
  const panFor = (x, width = 1280, spread = 0.72) => clamp(((x - width / 2) / (width / 2)) * spread, -spread, spread);
  /** Small seeded PRNG (mulberry32), for repeatable synthesis in tests. */
  const seeded = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /* ------------------------------------------------------------------ graph helpers */

  /** a → b → c …; returns the last node. (AudioNode.connect doesn't chain on old Safari.) */
  const chain = (...nodes) => {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  };
  /** a → b → c …; returns the first node (a voice's input, a bus's gain…). */
  const head = (...nodes) => {
    chain(...nodes);
    return nodes[0];
  };
  const gain = (c, v = 1) => {
    const g = c.createGain();
    g.gain.value = v;
    return g;
  };
  const filter = (c, type, freq, Q = 0.707, dB = 0) => {
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    if (dB) f.gain.value = dB;
    return f;
  };
  const panner = (c, pan) => {
    if (!c.createStereoPanner) return gain(c, 1);
    const p = c.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    return p;
  };
  const osc = (c, type, freq, t, end) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    if (end != null) o.stop(end);
    return o;
  };

  /** Percussive envelope on `param`: silence → peak in `attack` s → exponential fade over `decay` s. */
  const perc = (param, t, peak, attack, decay, floor = 0.0001) => {
    param.setValueAtTime(floor, t);
    param.linearRampToValueAtTime(Math.max(peak, floor * 2), t + attack);
    param.exponentialRampToValueAtTime(floor, t + attack + decay);
  };
  /** Automate `param` through points [[dt, value], …] (dt from t): set the first, ramp to the rest. */
  const curve = (param, t, pts, exp = false) => {
    param.setValueAtTime(exp ? Math.max(pts[0][1], 0.0001) : pts[0][1], t + pts[0][0]);
    for (let i = 1; i < pts.length; i++) {
      const [dt, v] = pts[i];
      if (exp) param.exponentialRampToValueAtTime(Math.max(v, 0.0001), t + dt);
      else param.linearRampToValueAtTime(v, t + dt);
    }
  };

  /* ------------------------------------------------------------------ noise */

  const noiseCache = {};
  /** 2 s of white / pink / brown noise (mono, seamless loop). AudioBuffers aren't tied to a context. */
  function noiseBuffer(c, kind = 'white') {
    if (noiseCache[kind]) return noiseCache[kind];
    const sr = c.sampleRate;
    const len = Math.floor(sr * 2);
    const buf = c.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') {
        // Paul Kellet's refined pink filter
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    // fold the last 20 ms into the first so the loop has no click (matters for brown noise)
    const F = Math.floor(sr * 0.02);
    for (let i = 0; i < F; i++) {
      const k = i / F;
      d[i] = d[i] * k + d[len - F + i] * (1 - k);
    }
    noiseCache[kind] = buf;
    return buf;
  }

  /** A looping noise source started at t (from a random point, so layered noises never phase). */
  const noise = (c, kind, t, dur = null, rate = 1) => {
    const s = c.createBufferSource();
    s.buffer = noiseBuffer(c, kind);
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(t, Math.random() * 1.9);
    if (dur != null) s.stop(t + dur);
    return s;
  };

  /* ------------------------------------------------------------------ the formant voice */

  /**
   * One human voice: a glottal buzz (+ breath) through three vowel formants. Shared by the legends'
   * grunts and every fan in the baked crowd.
   * o = { t, dur, f0: [[dt, Hz], …] pitch contour, vowels: [[dt, 'a'], …], amp: [[dt, level], …],
   *       shift (formant scale, 1 = adult), breath (0…1 noise mix), vib: { rate, depth } (depth: fraction
   *       of f0), bright (low-pass Hz) }
   */
  function voice(c, dest, o) {
    const t = o.t;
    const end = t + o.dur;
    const shift = o.shift ?? 1;
    const src = osc(c, 'sawtooth', o.f0[0][1], t, end + 0.02);
    curve(src.frequency, t, o.f0, true);
    if (o.vib) {
      const lfo = osc(c, 'sine', o.vib.rate, t, end + 0.02);
      const depth = gain(c, o.f0[0][1] * o.vib.depth);
      chain(lfo, depth, src.frequency);
    }
    const buzz = gain(c, 1);
    src.connect(buzz);
    if (o.breath) {
      const b = noise(c, 'white', t, o.dur + 0.02);
      chain(b, gain(c, o.breath * 0.6), buzz);
    }
    const amp = c.createGain();
    curve(amp.gain, t, o.amp);
    const tone = filter(c, 'lowpass', o.bright ?? 5200, 0.6);
    chain(amp, tone, dest);
    const vowels = o.vowels;
    for (let k = 0; k < 3; k++) {
      const bp = filter(c, 'bandpass', VOWELS[vowels[0][1]].f[k] * shift, FORMANT_Q[k]);
      const g = c.createGain();
      const make = FORMANT_MAKE[k];
      for (let i = 0; i < vowels.length; i++) {
        const [dt, name] = vowels[i];
        const V = VOWELS[name];
        if (i === 0) {
          bp.frequency.setValueAtTime(V.f[k] * shift, t + dt);
          g.gain.setValueAtTime(V.g[k] * make, t + dt);
        } else {
          bp.frequency.linearRampToValueAtTime(V.f[k] * shift, t + dt);
          g.gain.linearRampToValueAtTime(V.g[k] * make, t + dt);
        }
      }
      chain(buzz, bp, g, amp);
    }
  }

  /* ------------------------------------------------------------------ hand claps (pure) */

  /** RBJ band-pass (constant 0 dB peak) applied in place to a Float32Array. */
  function bandpassInPlace(x, sr, f, Q) {
    const w0 = (2 * Math.PI * f) / sr;
    const alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
    const b0 = alpha, b2 = -alpha;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const y = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1;
      x1 = x[i];
      y2 = y1;
      y1 = y;
      x[i] = y;
    }
    return x;
  }

  /** `n` different single hand claps (≈30 ms each): a noise snap (with a second micro-snap, as real
   * palms meet twice) ringing in the cupped hands' resonance, peak-normalised. */
  function clapKernels(sr, n, rnd = Math.random) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const len = Math.floor(sr * 0.032);
      const x = new Float32Array(len);
      const tau = (0.0025 + rnd() * 0.005) * sr;
      const second = Math.floor((0.002 + rnd() * 0.004) * sr);
      for (let i = 0; i < len; i++) {
        const w = rnd() * 2 - 1;
        const e = Math.exp(-i / tau) + (i >= second ? 0.6 * Math.exp(-(i - second) / tau) : 0);
        x[i] = w * e;
      }
      bandpassInPlace(x, sr, 900 + rnd() * 1600, 1 + rnd() * 1.4);
      let peak = 0;
      for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(x[i]));
      for (let i = 0; i < len; i++) x[i] /= peak || 1;
      out.push(x);
    }
    return out;
  }

  /** Add `kernel` into the stereo pair at sample `at` (wrapping round the end: a seamless loop). */
  function mixWrap(L, R, kernel, at, g, pan) {
    const gl = g * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = g * Math.sin(((pan + 1) * Math.PI) / 4);
    const n = L.length;
    for (let i = 0; i < kernel.length; i++) {
      const j = (at + i) % n;
      L[j] += kernel[i] * gl;
      R[j] += kernel[i] * gr;
    }
  }

  /**
   * Applause as two Float32Arrays (a seamless loop): `clappers` fans each clapping at their own
   * steady rate with a little human wobble, spread across the stand.
   */
  function applause(sr, sec, { clappers = 70, rnd = Math.random } = {}) {
    const len = Math.floor(sr * sec);
    const L = new Float32Array(len), R = new Float32Array(len);
    const kernels = clapKernels(sr, 24, rnd);
    for (let c = 0; c < clappers; c++) {
      const rate = 3.2 + rnd() * 2.2; // claps per second
      const pan = rnd() * 2 - 1;
      const g = 0.25 + rnd() * 0.75;
      const own = [0, 1, 2].map(() => kernels[Math.floor(rnd() * kernels.length)]);
      // whole claps over the loop, so the clapper's rhythm carries on across the seam
      const count = Math.max(1, Math.round(sec * rate));
      const period = sec / count;
      const phase = rnd() * period;
      for (let i = 0; i < count; i++) {
        const t = phase + i * period + (rnd() - 0.5) * 0.016;
        mixWrap(L, R, own[i % 3], Math.floor(((t + sec) % sec) * sr), g * (0.8 + rnd() * 0.4), pan);
      }
    }
    normalise([L, R], 0.8);
    return [L, R];
  }

  /** A whole stand clapping once, together (a chant's beat): many claps within a few ms. */
  function unisonClap(sr, { clappers = 46, rnd = Math.random } = {}) {
    const len = Math.floor(sr * 0.32);
    const L = new Float32Array(len), R = new Float32Array(len);
    const kernels = clapKernels(sr, 16, rnd);
    for (let c = 0; c < clappers; c++) {
      const t = 0.012 + Math.abs(rnd() + rnd() - 1) * 0.045; // most hands land together, a few late
      mixWrap(L, R, kernels[c % kernels.length], Math.floor(t * sr), 0.3 + rnd() * 0.7, rnd() * 2 - 1);
    }
    normalise([L, R], 0.85);
    return [L, R];
  }

  function normalise(chans, to) {
    let peak = 0;
    for (const ch of chans) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    const k = peak ? to / peak : 1;
    for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= k;
  }

  /** Float32Arrays → an AudioBuffer of `c` at sample rate `sr`. */
  const toBuffer = (c, chans, sr) => {
    const buf = c.createBuffer(chans.length, chans[0].length, sr);
    chans.forEach((ch, i) => buf.getChannelData(i).set(ch));
    return buf;
  };

  /* ------------------------------------------------------------------ stadium reverb */

  /**
   * A stadium impulse response: stereo noise decaying over `seconds` (RT60), darker as it decays (the
   * air and the seats soak up the highs), after a short pre-delay, plus discrete early echoes off the
   * stands across the pitch.
   */
  function impulse(c, { seconds = 1.8, predelay = 0.02, damp = 0.85, early = [] } = {}) {
    const sr = c.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        if (t < predelay) continue;
        const env = Math.exp((-6.9 * (t - predelay)) / (seconds - predelay));
        const a = Math.min(0.97, damp * (t / seconds) + 0.1);
        lp += (1 - a) * (Math.random() * 2 - 1 - lp);
        d[i] = lp * env * (1 + a * 1.5); // keep the darkening tail as loud as the bright head
      }
      for (const [et, eg] of early) {
        const at = Math.floor((et + (ch ? 0.007 : 0)) * sr);
        for (let i = 0; i < 90 && at + i < len; i++) d[at + i] += eg * (Math.random() * 2 - 1) * Math.exp(-i / 22);
      }
    }
    return buf;
  }

  /** Turn a buffer rendered `fade` s longer than wanted into a seamless loop: its tail crossfades into its head. */
  function loopify(c, buf, fade) {
    const sr = buf.sampleRate;
    const F = Math.floor(fade * sr);
    const len = buf.length - F;
    const out = c.createBuffer(buf.numberOfChannels, len, sr);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const src = buf.getChannelData(ch);
      const dst = out.getChannelData(ch);
      dst.set(src.subarray(0, len));
      for (let i = 0; i < F; i++) {
        const k = i / F;
        // equal-power crossfade: no dip in the middle of the seam
        dst[i] = src[i] * Math.sin((k * Math.PI) / 2) + src[len + i] * Math.cos((k * Math.PI) / 2);
      }
    }
    return out;
  }

  /** Render `build(oc, destination)` offline into an AudioBuffer (promise and old callback APIs). */
  function bake(sec, build, { channels = 2, sampleRate = 32000 } = {}) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error('no OfflineAudioContext'));
    let oc;
    try {
      oc = new OAC(channels, Math.ceil(sec * sampleRate), sampleRate);
    } catch (_) {
      oc = new OAC(channels, Math.ceil(sec * 44100), 44100); // some Safaris only take 44.1 / 48 kHz
    }
    build(oc, oc.destination);
    return new Promise((resolve, reject) => {
      oc.oncomplete = (e) => resolve(e.renderedBuffer);
      const p = oc.startRendering();
      if (p?.then) p.then(resolve, reject);
    });
  }

  KL.AudioKit = {
    VOWELS,
    FORMANT_Q,
    FORMANT_MAKE,
    clamp,
    rand,
    pick,
    vary,
    midi,
    panFor,
    seeded,
    chain,
    head,
    gain,
    filter,
    panner,
    osc,
    perc,
    curve,
    noiseBuffer,
    noise,
    voice,
    clapKernels,
    applause,
    unisonClap,
    normalise,
    toBuffer,
    impulse,
    loopify,
    bake,
  };
})();
