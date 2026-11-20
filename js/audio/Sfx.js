/* One-shot sound recipes, synthesised in layers the way a sound designer would stack recordings:
 * a kick = the boot's thump + the leather's slap + the ball's air cavity ringing; the crossbar =
 * a metal tube's inharmonic partials; the referee's whistle = a pea rattling a 3 kHz tone.
 * Each recipe is (A: KL.Audio, t: start time, o: options) → schedules itself and cleans up.
 * Common options: x (design px → stereo pan), power (0…1.4, how hard), gain. */
window.KL = window.KL || {};

(() => {
  const K = KL.AudioKit;

  /* ------------------------------------------------------------------ layers */

  /** A pitched drop: the body of an impact. */
  function thump(A, dest, t, f0, f1, dur, peak, type = 'sine') {
    const c = A.ctx;
    const o = K.osc(c, type, f0, t, t + dur + 0.05);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    const g = c.createGain();
    K.perc(g.gain, t, peak, 0.002, dur);
    K.chain(o, g, dest);
  }

  /** A filtered noise burst: slaps, scuffs, swishes. */
  function burst(A, dest, t, { kind = 'white', type = 'bandpass', f = 1000, Q = 1, peak = 0.5, attack = 0.001, decay = 0.05, hp = 0, sweep = null }) {
    const c = A.ctx;
    const n = K.noise(c, kind, t, attack + decay + 0.06);
    const fl = K.filter(c, type, f, Q);
    if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + attack + decay);
    const g = c.createGain();
    K.perc(g.gain, t, peak, attack, decay);
    if (hp) K.chain(n, fl, K.filter(c, 'highpass', hp), g, dest);
    else K.chain(n, fl, g, dest);
  }

  /** Metal ringing: inharmonic partials [ratio, level, decay s] of a struck tube. */
  function ring(A, dest, t, f, peak, partials = [[1, 1, 1.5], [2.76, 0.55, 0.95], [5.4, 0.32, 0.6], [8.93, 0.18, 0.35]]) {
    const c = A.ctx;
    for (const [r, l, d] of partials) {
      const o = K.osc(c, 'sine', f * r * K.vary(1, 0.004), t, t + d + 0.1);
      const g = c.createGain();
      K.perc(g.gain, t, peak * l, 0.001, d);
      K.chain(o, g, dest);
    }
  }

  /** The leather ball struck by a boot (or a head). */
  function strike(A, t, o, { thumpHz = 140, slapHz = 2400, cavity = 400, boom = 0, level = 1, verb = 0.1 }) {
    const p = K.clamp(o.power ?? 1, 0.2, 1.4) * level;
    const v = K.vary(1, 0.05);
    const out = A.out('sfx', { x: o.x, verb: verb + boom * 0.12 });
    thump(A, out, t, thumpHz * v, 52 * v, 0.11, 0.85 * p); // the boot's thump
    burst(A, out, t, { f: slapHz * v, Q: 0.9, peak: 0.75 * p, decay: 0.03, hp: 700 }); // the leather's slap
    thump(A, out, t, cavity * v, cavity * 0.85 * v, 0.07, 0.25 * p, 'triangle'); // the ball's air "pock"
    if (boom) {
      thump(A, out, t, 82, 36, 0.32, 0.55 * boom * p);
      burst(A, out, t + 0.01, { kind: 'pink', f: 900, Q: 0.5, peak: 0.22 * boom * p, attack: 0.015, decay: 0.22, sweep: 300 }); // the air it moves
    }
  }

  /** A pea whistle: a ~3 kHz tone, warbled in pitch and level by the pea, plus breath. */
  function whistle(A, t, dur, o = {}) {
    const c = A.ctx;
    const out = A.out('sfx', { verb: 0.32, gain: (o.gain ?? 1) * 0.42 });
    const f = (o.f ?? 2950) * K.vary(1, 0.01);
    const end = t + dur;
    const pea = K.osc(c, 'sine', K.vary(36, 0.1), t, end + 0.05);
    const tone = K.osc(c, 'sine', f * 0.94, t, end + 0.05);
    tone.frequency.exponentialRampToValueAtTime(f, t + 0.035); // the blow comes up to pitch
    K.chain(pea, K.gain(c, 120), tone.frequency); // pea → pitch warble
    const over = K.osc(c, 'triangle', f * 2, t, end + 0.05); // a touch of second harmonic
    K.chain(pea, K.gain(c, 240), over.frequency);
    const am = K.gain(c, 0.72); // pea → level flutter
    K.chain(pea, K.gain(c, 0.28), am.gain);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(1, t + 0.014);
    env.gain.setValueAtTime(1, end - 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    K.chain(tone, am, env, out);
    K.chain(over, K.gain(c, 0.12), am);
    const breath = K.noise(c, 'white', t, dur + 0.05);
    K.chain(breath, K.filter(c, 'bandpass', f, 6), K.filter(c, 'highpass', 1500), K.gain(c, 0.22), env);
  }

  /** A stadium air horn blast (fans' horns, the goal horn): stacked detuned saws, brassy. */
  function horn(A, t, notes, dur, { x = null, pan = null, gain = 0.3, bright = 1800, verb = 0.4, vib = 0 } = {}) {
    const c = A.ctx;
    const out = A.out('sfx', { x, pan, verb, gain });
    const lp = K.filter(c, 'lowpass', bright, 1.2);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(1, t + 0.04);
    env.gain.setValueAtTime(0.9, t + dur - 0.12);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    K.chain(lp, env, out);
    for (const hz of notes) {
      for (const d of [-7, 7]) {
        const o = K.osc(c, 'sawtooth', hz, t, t + dur + 0.05);
        o.detune.value = d;
        o.frequency.setValueAtTime(hz * 0.97, t);
        o.frequency.exponentialRampToValueAtTime(hz, t + 0.06);
        if (vib) K.chain(K.osc(c, 'sine', 5.5, t, t + dur), K.gain(c, hz * vib), o.frequency);
        K.chain(o, K.gain(c, 0.16), lp);
      }
    }
  }

  /** FM bell (chimes): carrier + inharmonic modulator, the modulation fading for a pure tail. */
  function bell(A, dest, t, hz, peak, decay = 1.2) {
    const c = A.ctx;
    const car = K.osc(c, 'sine', hz, t, t + decay + 0.1);
    const mod = K.osc(c, 'sine', hz * 3.5, t, t + decay + 0.1);
    const idx = c.createGain();
    K.perc(idx.gain, t, hz * 2, 0.001, decay * 0.5);
    K.chain(mod, idx, car.frequency);
    const g = c.createGain();
    K.perc(g.gain, t, peak, 0.002, decay);
    K.chain(car, g, dest);
  }

  const I = () => KL.Instruments; // music instruments (Music.js), for the stingers

  /* ------------------------------------------------------------------ recipes */

  KL.SFX = {
    /* ---- the ball ---- */
    kick_low: (A, t, o) => strike(A, t, o, { thumpHz: 150, slapHz: 2600, cavity: 430 }), // J: driven, sharp
    kick_long: (A, t, o) => strike(A, t, o, { thumpHz: 125, slapHz: 2000, cavity: 380, boom: 0.8, verb: 0.16 }), // K: deep, airy
    header: (A, t, o) => strike(A, t, o, { thumpHz: 230, slapHz: 1500, cavity: 330, level: 0.7 }),
    kick_clash(A, t, o) {
      // two boots on one touch: a double knock and a dull clunk
      strike(A, t, o, { thumpHz: 160, slapHz: 1900, cavity: 400, level: 0.75 });
      strike(A, t + 0.018, o, { thumpHz: 120, slapHz: 1500, cavity: 360, level: 0.55 });
    },
    kick_super(A, t, o) {
      const c = A.ctx;
      strike(A, t, { ...o, power: 1.4 }, { thumpHz: 120, slapHz: 2200, cavity: 360, boom: 1.2, verb: 0.25 });
      const out = A.out('sfx', { x: o.x, verb: 0.35, gain: 0.9 });
      // the explosion: a saturated sub drop + a fire whoosh tearing away + crackles
      const drive = c.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * 3.5);
      drive.curve = curve;
      const sub = K.osc(c, 'sine', 95, t, t + 0.9);
      sub.frequency.exponentialRampToValueAtTime(30, t + 0.7);
      const sg = c.createGain();
      K.perc(sg.gain, t, 0.7, 0.004, 0.8);
      K.chain(sub, drive, sg, out);
      burst(A, out, t, { kind: 'pink', type: 'bandpass', f: 3400, Q: 0.8, peak: 0.55, attack: 0.02, decay: 0.55, sweep: 260 });
      for (let i = 0; i < 9; i++) burst(A, out, t + 0.05 + Math.random() * 0.5, { f: K.rand(1500, 5000), Q: 2, peak: K.rand(0.08, 0.2), decay: 0.012 });
    },
    /** Ball off the turf; o.dv = impact speed (px/s). */
    ball_bounce(A, t, o) {
      const k = K.clamp(((o.dv ?? 400) - 90) / 900, 0.06, 1);
      const out = A.out('sfx', { x: o.x, verb: 0.05 });
      thump(A, out, t, K.vary(118, 0.08), 58, 0.07, 0.6 * k);
      burst(A, out, t, { type: 'lowpass', f: 700, Q: 0.7, peak: 0.35 * k, decay: 0.05 });
      burst(A, out, t, { type: 'highpass', f: 4200, peak: 0.05 * k, decay: 0.07 }); // grass blades
    },
    /** Ball off a body (chest, back, legs). */
    ball_body(A, t, o) {
      const k = K.clamp(((o.dv ?? 400) - 120) / 800, 0.1, 1);
      const out = A.out('sfx', { x: o.x, verb: 0.05 });
      thump(A, out, t, K.vary(170, 0.08), 85, 0.07, 0.5 * k);
      burst(A, out, t, { f: 1200, Q: 0.8, peak: 0.28 * k, decay: 0.03 });
    },
    /** Ball into the back of the net (the wall behind the goal). */
    net(A, t, o) {
      const c = A.ctx;
      const k = K.clamp(((o.dv ?? 600) - 100) / 900, 0.15, 1.2);
      const out = A.out('sfx', { x: o.x, verb: 0.12 });
      burst(A, out, t, { f: 2600, Q: 0.6, peak: 0.42 * k, attack: 0.012, decay: 0.32, sweep: 1400 }); // mesh swish
      const n = K.noise(c, 'white', t, 0.4);
      const rattle = c.createGain();
      rattle.gain.value = 0;
      K.chain(K.osc(c, 'square', K.vary(24, 0.1), t, t + 0.4), K.gain(c, 0.5), rattle.gain); // ropes slapping
      const g = c.createGain();
      K.perc(g.gain, t, 0.22 * k, 0.005, 0.32);
      K.chain(n, K.filter(c, 'bandpass', 900, 1.2), rattle, g, out);
      thump(A, out, t, 140, 70, 0.08, 0.3 * k);
    },
    /** Off the crossbar: a ringing metal clang. */
    crossbar(A, t, o) {
      const k = K.clamp(((o.dv ?? 600) - 100) / 900, 0.2, 1.2);
      const out = A.out('sfx', { x: o.x, verb: 0.3 });
      ring(A, out, t, K.vary(525, 0.03), 0.3 * k);
      thump(A, out, t, 190, 90, 0.06, 0.45 * k);
      burst(A, out, t, { f: 3800, Q: 1.2, peak: 0.3 * k, decay: 0.02 });
    },
    /** Off the back post. */
    post(A, t, o) {
      const k = K.clamp(((o.dv ?? 600) - 100) / 900, 0.2, 1.2);
      const out = A.out('sfx', { x: o.x, verb: 0.25 });
      ring(A, out, t, K.vary(610, 0.03), 0.22 * k);
      thump(A, out, t, 170, 80, 0.06, 0.4 * k);
    },

    /* ---- the players' bodies ---- */
    step(A, t, o) {
      const s = o.sprint ? 1.5 : 1;
      const out = A.out('sfx', { x: o.x, gain: 0.55 });
      burst(A, out, t, { type: 'lowpass', f: K.vary(850, 0.15), Q: 0.8, peak: 0.16 * s, attack: 0.003, decay: 0.045, hp: 140 });
      burst(A, out, t + 0.008, { f: K.vary(2600, 0.2), Q: 2, peak: 0.035 * s, decay: 0.03 }); // grass crunch
    },
    jump(A, t, o) {
      const out = A.out('sfx', { x: o.x, gain: 0.7 });
      burst(A, out, t, { f: 1100, Q: 1.2, peak: 0.13, attack: 0.025, decay: 0.12, sweep: 2600 }); // kit swish
      burst(A, out, t, { type: 'lowpass', f: 900, peak: 0.1, decay: 0.04 }); // push-off scuff
    },
    land(A, t, o) {
      const k = K.clamp(o.impact ?? 0.7, 0.25, 1.2);
      const out = A.out('sfx', { x: o.x });
      thump(A, out, t, 95, 48, 0.08, 0.38 * k);
      burst(A, out, t, { type: 'lowpass', f: 520, Q: 0.7, peak: 0.28 * k, decay: 0.07 });
      burst(A, out, t + 0.01, { type: 'highpass', f: 3800, peak: 0.04 * k, decay: 0.08 });
    },
    swing(A, t, o) {
      // the leg cutting the air (the strike's sound covers it when the boot finds the ball)
      const out = A.out('sfx', { x: o.x, gain: 0.6 });
      burst(A, out, t, { f: 700, Q: 1.6, peak: o.kind === 'high' ? 0.16 : 0.12, attack: 0.035, decay: 0.08, sweep: 2400 });
    },
    bump(A, t, o) {
      const out = A.out('sfx', { x: o.x });
      thump(A, out, t, 150, 78, 0.07, 0.35);
      burst(A, out, t, { type: 'lowpass', f: 800, peak: 0.25, decay: 0.05 });
    },
    hurt(A, t, o) {
      // knocked flying by a fireball: a heavy thump, a crunch, then the body hitting the turf
      const out = A.out('sfx', { x: o.x, verb: 0.15 });
      thump(A, out, t, 130, 38, 0.28, 0.75);
      burst(A, out, t, { f: 900, Q: 0.9, peak: 0.4, decay: 0.12 });
      thump(A, out, t + 0.32, 90, 45, 0.1, 0.35);
      burst(A, out, t + 0.32, { type: 'lowpass', f: 600, peak: 0.25, decay: 0.08 });
    },

    /* ---- the super skill ---- */
    super_charge(A, t, o) {
      const c = A.ctx;
      const out = A.out('sfx', { x: o.x, verb: 0.25, gain: 0.8 });
      const dur = 0.5;
      const saw = K.osc(c, 'sawtooth', 70, t, t + dur + 0.1);
      saw.frequency.exponentialRampToValueAtTime(300, t + dur);
      const lp = K.filter(c, 'lowpass', 280, 6);
      lp.frequency.exponentialRampToValueAtTime(4200, t + dur);
      const g = c.createGain();
      K.curve(g.gain, t, [[0, 0.0001], [0.05, 0.22], [dur, 0.4], [dur + 0.08, 0.0001]]);
      K.chain(saw, lp, g, out);
      burst(A, out, t, { kind: 'pink', f: 500, Q: 1, peak: 0.35, attack: dur * 0.85, decay: 0.12, sweep: 4000 }); // the flames gather
      const sh = K.osc(c, 'sine', 1200, t, t + dur + 0.1); // the shimmer of power
      sh.frequency.exponentialRampToValueAtTime(2600, t + dur);
      const shg = c.createGain();
      K.curve(shg.gain, t, [[0, 0.0001], [dur * 0.8, 0.08], [dur + 0.06, 0.0001]]);
      K.chain(sh, shg, out);
      K.chain(K.osc(c, 'square', 18, t, t + dur), K.gain(c, 0.05), shg.gain); // tremolo
    },
    super_ready(A, t, o) {
      const out = A.out('sfx', { x: o.x, verb: 0.35, gain: o.cpu ? 0.45 : 0.75 });
      [86, 90, 93, 98].forEach((m, i) => bell(A, out, t + i * 0.065, K.midi(m), 0.16, 1.1));
      burst(A, out, t, { kind: 'pink', type: 'lowpass', f: 900, peak: 0.25, attack: 0.08, decay: 0.3 }); // the flames catch
      for (let i = 0; i < 6; i++) burst(A, out, t + 0.05 + Math.random() * 0.35, { type: 'highpass', f: 6000, peak: 0.06, decay: 0.02 });
    },
    /** One crackle of the flames round a charged-up player. */
    crackle(A, t, o) {
      const out = A.out('sfx', { x: o.x, gain: o.gain ?? 0.35 });
      burst(A, out, t, { f: K.rand(1800, 5200), Q: K.rand(1, 3), peak: K.rand(0.06, 0.2), decay: K.rand(0.006, 0.02) });
    },

    /* ---- the referee & the stadium ---- */
    whistle_kickoff: (A, t) => whistle(A, t, 0.62),
    whistle_goal: (A, t) => whistle(A, t, 0.32),
    whistle_double(A, t) {
      whistle(A, t, 0.17);
      whistle(A, t + 0.26, 0.17);
      whistle(A, t + 0.52, 0.55);
    },
    whistle_final(A, t) {
      // full time: two short, one long
      whistle(A, t, 0.24);
      whistle(A, t + 0.36, 0.24);
      whistle(A, t + 0.72, 1.0);
    },
    whistle: (A, t) => whistle(A, t, 0.45),
    /** The stadium's goal horn: one big brassy chord over the PA, echoing round the stands. */
    goal_horn: (A, t) => horn(A, t, [K.midi(50), K.midi(57), K.midi(62), K.midi(66)], 1.7, { gain: 0.26, bright: 1500, verb: 0.55, vib: 0.004 }),
    /** A fan's air horn: honk-honk-hoooonk. */
    air_horn(A, t, o) {
      const base = K.pick([[466, 587], [440, 554], [494, 622]]);
      const pan = o.pan ?? K.rand(-0.8, 0.8);
      const lens = K.pick([[0.16, 0.16, 0.7], [0.5, 0.5], [0.9]]);
      let at = t;
      for (const d of lens) {
        horn(A, at, base, d, { pan, gain: 0.11, bright: 2400, verb: 0.35 });
        at += d + 0.07;
      }
    },
    /** The last ten seconds: a stadium clock tick, a hair higher every second. */
    clock_tick(A, t, o) {
      const n = o.n ?? 10;
      const out = A.out('sfx', { gain: 0.5, verb: 0.1 });
      const f = 1500 * (1 + (10 - n) * 0.035);
      thump(A, out, t, f, f * 0.8, 0.035, 0.22, 'triangle');
      burst(A, out, t, { f: 3000, Q: 2, peak: 0.12, decay: 0.012 });
    },
    countdown(A, t) {
      const c = A.ctx;
      const out = A.out('sfx', { gain: 0.5, verb: 0.15 });
      const o = K.osc(c, 'square', 880, t, t + 0.2);
      const g = c.createGain();
      K.perc(g.gain, t, 0.22, 0.004, 0.16);
      K.chain(o, K.filter(c, 'lowpass', 2400), g, out);
    },

    /* ---- UI ---- */
    ui_move(A, t) {
      const out = A.out('ui', { gain: 0.5 });
      thump(A, out, t, 1500, 1150, 0.03, 0.22, 'sine');
      burst(A, out, t, { type: 'highpass', f: 5000, peak: 0.05, decay: 0.008 });
    },
    ui_hover(A, t) {
      thump(A, A.out('ui', { gain: 0.35 }), t, 2100, 1900, 0.022, 0.12, 'sine');
    },
    ui_click(A, t) {
      const out = A.out('ui', { gain: 0.55 });
      thump(A, out, t, 620, 1250, 0.06, 0.3, 'sine');
      thump(A, out, t, 170, 120, 0.05, 0.25, 'sine');
      burst(A, out, t, { type: 'highpass', f: 4000, peak: 0.12, decay: 0.01 });
    },
    ui_back(A, t) {
      const out = A.out('ui', { gain: 0.5 });
      thump(A, out, t, 950, 480, 0.08, 0.28, 'sine');
      burst(A, out, t, { type: 'highpass', f: 4000, peak: 0.08, decay: 0.01 });
    },
    ui_toggle(A, t, o) {
      const out = A.out('ui', { gain: 0.5 });
      const [a, b] = o.on === false ? [1100, 650] : [650, 1150];
      thump(A, out, t, a, b, 0.07, 0.26, 'sine');
      burst(A, out, t, { type: 'highpass', f: 4500, peak: 0.1, decay: 0.01 });
    },
    ui_slider(A, t, o) {
      thump(A, A.out('ui', { gain: 0.4 }), t, 500 + (o.value ?? 0.5) * 1100, 450 + (o.value ?? 0.5) * 1000, 0.03, 0.2, 'triangle');
    },
    /** A screen change: a soft airy whoosh. */
    ui_whoosh(A, t) {
      burst(A, A.out('ui', { gain: 0.5 }), t, { kind: 'pink', f: 420, Q: 1.3, peak: 0.16, attack: 0.16, decay: 0.2, sweep: 2600 });
    },
    /** "Press any key": the stadium wakes up — a boom, a whoosh and a bright brass hit. */
    ui_start(A, t) {
      const out = A.out('ui', { gain: 0.8, verb: 0.3 });
      thump(A, out, t, 90, 34, 0.7, 0.6);
      burst(A, out, t, { kind: 'pink', f: 300, Q: 1, peak: 0.25, attack: 0.08, decay: 0.5, sweep: 5000 });
      I().brass(A.ctx, A.out('music', { verb: 0.35 }), t + 0.02, [62, 66, 69, 74], 0.9, 1.1);
      I().crash(A.ctx, A.out('music', { verb: 0.3 }), t + 0.02, 0.6);
    },
    /** A legend locked in: a blade-like shing + a punch. */
    ui_confirm(A, t) {
      const out = A.out('ui', { gain: 0.7, verb: 0.3 });
      bell(A, out, t, 1568, 0.18, 0.9);
      bell(A, out, t + 0.03, 2349, 0.12, 0.7);
      thump(A, out, t, 120, 50, 0.25, 0.5);
      burst(A, out, t, { f: 3000, Q: 0.7, peak: 0.18, attack: 0.005, decay: 0.25, sweep: 8000 });
    },
    card_swish(A, t, o) {
      burst(A, A.out('ui', { gain: 0.45, x: o.x }), t, { kind: 'pink', f: 900, Q: 1.4, peak: 0.16, attack: 0.04, decay: 0.09, sweep: 3200 });
    },
    emote_pop(A, t, o) {
      const out = A.out('sfx', { x: o.x, gain: 0.7 });
      thump(A, out, t, 420, 1350, 0.1, 0.26, 'sine');
      thump(A, out, t + 0.06, 1500, 1700, 0.05, 0.08, 'triangle');
    },

    /* ---- musical stingers (music bus) ---- */
    sting_goal(A, t) {
      const c = A.ctx, out = A.out('music', { verb: 0.3, gain: 0.9 });
      I().crash(c, out, t, 0.9);
      I().tom(c, out, t, 38, 1);
      I().brass(c, out, t, [62, 66, 69, 74], 1.1, 1);
      [69, 74, 78, 81].forEach((m, i) => I().lead(c, out, t + 0.1 + i * 0.09, m, i === 3 ? 0.7 : 0.1, 0.8));
    },
    sting_concede(A, t) {
      const c = A.ctx, out = A.out('music', { verb: 0.3, gain: 0.7 });
      I().tom(c, out, t, 35, 0.8);
      I().brass(c, out, t, [59, 62, 66], 0.9, 0.6);
      [66, 62, 59].forEach((m, i) => I().pluck(c, out, t + 0.12 + i * 0.16, m, 0.7));
    },
    sting_suddendeath(A, t) {
      const c = A.ctx, out = A.out('music', { verb: 0.35 });
      for (let i = 0; i < 12; i++) I().tom(c, out, t + i * 0.055, i % 2 ? 40 : 38, 0.3 + i * 0.06); // a timpani roll building…
      I().brass(c, out, t + 0.7, [47, 54, 59, 62], 1.3, 1.1); // …into a low Bm hit
      I().crash(c, out, t + 0.7, 0.8);
      thump(A, out, t + 0.7, 70, 30, 0.8, 0.6);
    },
    jingle_win(A, t) {
      const c = A.ctx, out = A.out('music', { verb: 0.3 });
      const b = 0.13;
      [[0, 74], [b, 74], [b * 2, 74]].forEach(([dt, m]) => I().brass(c, out, t + dt, [m - 12, m - 5, m], 0.11, 0.9));
      I().brass(c, out, t + b * 3, [62, 69, 74, 78], 1.5, 1.1);
      I().lead(c, out, t + b * 3, 81, 1.4, 0.8);
      I().crash(c, out, t + b * 3, 1);
      for (let i = 0; i < 8; i++) I().tom(c, out, t + b * 3 + 0.5 + i * 0.07, 38, 0.25 + i * 0.05);
      I().tom(c, out, t + b * 3 + 1.1, 38, 1);
    },
    jingle_lose(A, t) {
      const c = A.ctx, out = A.out('music', { verb: 0.35, gain: 0.85 });
      I().pad(c, out, t, [59, 62, 66], 1.2, 0.8);
      I().pad(c, out, t + 1.1, [55, 59, 62], 1.6, 0.7);
      [66, 64, 62, 61, 59].forEach((m, i) => I().pluck(c, out, t + i * 0.32, m, 0.8));
    },
  };

  /** Minimum seconds between two plays of a sound (per key, e.g. per player). Default 25 ms. */
  KL.SFX_COOLDOWN = {
    ball_bounce: 0.06,
    ball_body: 0.09,
    crossbar: 0.15,
    post: 0.15,
    net: 0.2,
    step: 0.06,
    land: 0.08,
    bump: 0.12,
    swing: 0.08,
    ui_hover: 0.06,
    ui_slider: 0.06,
    crackle: 0.025,
    clock_tick: 0.5,
    goal_horn: 1,
    whistle_kickoff: 0.5,
    ui_start: 2,
    ui_whoosh: 0.15,
  };
})();
