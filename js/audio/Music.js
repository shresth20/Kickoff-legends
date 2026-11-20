/* Music: the Kickoff Legends theme and its variations, played live by a step sequencer on synthesised
 * instruments (no files). A stadium anthem in D major at 124 bpm — four-on-the-floor drums, a
 * driving bass, a supersaw pad, plucked arpeggios, a brass section, a lead hook the crowd could sing
 * and the crowd itself shouting "HEY!" on the chorus.
 *
 * Tracks: menu (the theme; carries on through character select), victory, defeat, tension (the last
 * ten seconds and sudden death). The match itself has no score: like a real broadcast, the crowd is
 * its soundtrack. A studio recording named music_<track> (assets/audio/audio.js) replaces a track.
 *
 * Songs are data (KL.SONGS): sections of bars, a chord per bar, and which parts play; the sequencer
 * schedules 16th-note steps a few hundred ms ahead on the audio clock, so timing never drifts. */
window.KL = window.KL || {};

(() => {
  const K = KL.AudioKit;
  const hz = K.midi;

  /* ------------------------------------------------------------------ instruments */
  // (c: any AudioContext, dest: node, t: start, midi note numbers, v: velocity 0…1+)

  KL.Instruments = {
    kick(c, dest, t, v = 1) {
      const o = K.osc(c, 'sine', 165, t, t + 0.45);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.1);
      const g = c.createGain();
      K.perc(g.gain, t, 0.95 * v, 0.002, 0.34);
      K.chain(o, g, dest);
      const n = K.noise(c, 'white', t, 0.03); // beater click
      const ng = c.createGain();
      K.perc(ng.gain, t, 0.18 * v, 0.001, 0.012);
      K.chain(n, K.filter(c, 'highpass', 3500), ng, dest);
    },
    snare(c, dest, t, v = 1) {
      const o = K.osc(c, 'triangle', 200, t, t + 0.15);
      o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
      const g = c.createGain();
      K.perc(g.gain, t, 0.32 * v, 0.001, 0.09);
      K.chain(o, g, dest);
      const n = K.noise(c, 'white', t, 0.25);
      const ng = c.createGain();
      K.perc(ng.gain, t, 0.42 * v, 0.001, 0.17);
      K.chain(n, K.filter(c, 'bandpass', 1900, 0.7), K.filter(c, 'highpass', 900), ng, dest);
    },
    clap(c, dest, t, v = 1) {
      const n = K.noise(c, 'white', t, 0.25);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      for (const dt of [0, 0.011, 0.022]) {
        g.gain.setValueAtTime(0.5 * v, t + dt);
        g.gain.exponentialRampToValueAtTime(0.06 * v, t + dt + 0.009);
      }
      g.gain.setValueAtTime(0.4 * v, t + 0.033);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      K.chain(n, K.filter(c, 'bandpass', 1150, 1.3), g, dest);
    },
    hat(c, dest, t, v = 1, open = false) {
      const n = K.noise(c, 'white', t, open ? 0.32 : 0.06);
      const g = c.createGain();
      K.perc(g.gain, t, 0.16 * v, 0.001, open ? 0.24 : 0.035);
      K.chain(n, K.filter(c, 'highpass', 7200), K.filter(c, 'peaking', 10500, 1, 6), g, dest);
    },
    crash(c, dest, t, v = 1) {
      const n = K.noise(c, 'white', t, 2);
      const g = c.createGain();
      K.perc(g.gain, t, 0.3 * v, 0.002, 1.7);
      K.chain(n, K.filter(c, 'highpass', 4200), K.filter(c, 'peaking', 6800, 2, 5), g, dest);
    },
    tom(c, dest, t, m, v = 1) {
      const f = hz(m);
      const o = K.osc(c, 'sine', f * 1.7, t, t + 0.5);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      const g = c.createGain();
      K.perc(g.gain, t, 0.6 * v, 0.002, 0.4);
      K.chain(o, g, dest);
      const n = K.noise(c, 'pink', t, 0.1);
      const ng = c.createGain();
      K.perc(ng.gain, t, 0.15 * v, 0.001, 0.05);
      K.chain(n, K.filter(c, 'lowpass', 1800), ng, dest);
    },
    bass(c, dest, t, m, dur, v = 1) {
      const f = hz(m);
      const lp = K.filter(c, 'lowpass', 1500, 5);
      lp.frequency.setValueAtTime(1500, t);
      lp.frequency.exponentialRampToValueAtTime(360, t + 0.16);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.32 * v, t + 0.006);
      g.gain.setValueAtTime(0.28 * v, t + Math.max(0.01, dur - 0.04));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      K.chain(lp, g, dest);
      K.chain(K.osc(c, 'sawtooth', f, t, t + dur + 0.02), lp);
      const sub = K.osc(c, 'sine', f, t, t + dur + 0.02); // the fundamental, solid on big speakers
      K.chain(sub, K.gain(c, 0.8), g);
    },
    pad(c, dest, t, notes, dur, v = 1) {
      const lp = K.filter(c, 'lowpass', 900, 0.8);
      lp.frequency.linearRampToValueAtTime(2000, t + Math.min(0.5, dur * 0.5));
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.06 * v, t + Math.min(0.28, dur * 0.3));
      g.gain.setValueAtTime(0.06 * v, t + dur * 0.8);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
      K.chain(lp, g, dest);
      for (const m of notes) {
        for (const d of [-11, 0, 11]) {
          const o = K.osc(c, 'sawtooth', hz(m), t, t + dur + 0.3);
          o.detune.value = d;
          o.connect(lp);
        }
      }
    },
    pluck(c, dest, t, m, v = 1) {
      const lp = K.filter(c, 'lowpass', 4500, 4);
      lp.frequency.setValueAtTime(4500, t);
      lp.frequency.exponentialRampToValueAtTime(520, t + 0.16);
      const g = c.createGain();
      K.perc(g.gain, t, 0.13 * v, 0.002, 0.24);
      K.chain(K.osc(c, 'sawtooth', hz(m), t, t + 0.3), lp, g, dest);
      const sq = K.osc(c, 'square', hz(m) * 2, t, t + 0.12);
      const sg = c.createGain();
      K.perc(sg.gain, t, 0.025 * v, 0.001, 0.08);
      K.chain(sq, sg, dest);
    },
    lead(c, dest, t, m, dur, v = 1, from = null) {
      const f = hz(m), end = t + dur;
      const lp = K.filter(c, 'lowpass', 3400, 1.4);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.11 * v, t + 0.016);
      g.gain.setValueAtTime(0.095 * v, Math.max(t + 0.02, end - 0.05));
      g.gain.exponentialRampToValueAtTime(0.0001, end + 0.1);
      K.chain(lp, g, dest);
      const vib = c.createGain(); // a sung vibrato, coming in on held notes
      vib.gain.setValueAtTime(0, t);
      vib.gain.linearRampToValueAtTime(dur > 0.3 ? 14 : 0, t + Math.min(dur, 0.35));
      K.chain(K.osc(c, 'sine', 5.6, t, end + 0.12), vib);
      for (const [type, det, lvl] of [['sawtooth', -6, 0.5], ['sawtooth', 6, 0.5], ['square', -1200, 0.3]]) {
        const o = K.osc(c, type, from ? hz(from) : f, t, end + 0.12);
        if (from) o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
        o.detune.value = det;
        vib.connect(o.detune);
        K.chain(o, K.gain(c, lvl), lp);
      }
    },
    brass(c, dest, t, notes, dur, v = 1) {
      const lp = K.filter(c, 'lowpass', 300, 2);
      lp.frequency.setValueAtTime(300, t);
      lp.frequency.exponentialRampToValueAtTime(2800, t + 0.05);
      lp.frequency.exponentialRampToValueAtTime(1500, t + 0.3);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.085 * v, t + 0.03);
      g.gain.setValueAtTime(0.075 * v, t + Math.max(0.04, dur - 0.06));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
      K.chain(lp, g, dest);
      for (const m of notes) {
        for (const d of [-8, 0, 8]) {
          const o = K.osc(c, 'sawtooth', hz(m), t, t + dur + 0.15);
          o.detune.value = d;
          o.connect(lp);
        }
      }
    },
    riser(c, dest, t, dur, v = 1) {
      const n = K.noise(c, 'white', t, dur + 0.05);
      const bp = K.filter(c, 'bandpass', 300, 2.5);
      bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16 * v, t + dur);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
      K.chain(n, bp, g, dest);
    },
  };

  /* ------------------------------------------------------------------ the songs (data) */

  // pad voicing (close, smooth voice-leading) + bass root for every chord the songs use
  const CHORDS = {
    D: { pad: [57, 62, 66], root: 38 },
    A: { pad: [57, 61, 64], root: 45 },
    Bm: { pad: [59, 62, 66], root: 47 },
    G: { pad: [59, 62, 67], root: 43 },
    Em: { pad: [59, 64, 67], root: 40 },
    'F#': { pad: [58, 61, 66], root: 42 },
  };

  // drum patterns: the 16th steps each piece plays on (and its velocity)
  const DRUMS = {
    intro: { kick: [0, 8], hat: [4, 12] },
    groove: { kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14], open: [] },
    full: { kick: [0, 4, 8, 12], clap: [4, 12], snare: [4, 12], hat: [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15], open: [2, 6, 10, 14] },
    hats: { hat: [2, 6, 10, 14], kick: [0] },
    heartbeat: { kick: [0, 3], hat: [8] },
  };

  // melodies: per bar, [midi | null (rest), length in 16ths] — each bar sums to 16
  const R = null;
  const HOOK = [
    [[69, 4], [69, 2], [71, 2], [69, 4], [66, 4]], // D
    [[64, 4], [64, 2], [66, 2], [69, 8]], // A
    [[66, 4], [66, 2], [69, 2], [71, 4], [74, 4]], // Bm
    [[74, 6], [71, 2], [69, 8]], // G
    [[69, 4], [69, 2], [71, 2], [69, 4], [74, 4]], // D
    [[76, 4], [74, 2], [73, 2], [69, 8]], // A
    [[71, 4], [74, 4], [76, 4], [78, 4]], // G
    [[76, 12], [R, 4]], // A — hangs on the 5th, back to the top
  ];
  const VERSE = [
    null, null, null, null,
    [[R, 8], [66, 2], [69, 2], [71, 4]], // Bm
    [[74, 4], [71, 4], [R, 8]], // G
    [[R, 8], [66, 2], [69, 2], [74, 4]], // D
    [[73, 4], [76, 4], [73, 8]], // A
  ];
  const SAD = [
    [[66, 6], [64, 2], [62, 8]], // Bm
    [[62, 6], [59, 2], [62, 8]], // G
    [[64, 6], [62, 2], [59, 8]], // Em
    [[61, 8], [58, 4], [61, 4]], // F#
  ];

  KL.SONGS = {
    menu: {
      bpm: 124,
      sections: {
        intro: { chords: ['Bm', 'G', 'D', 'A'], drums: 'intro', pad: true, arp: 'soft', riser: 3 },
        verse: { chords: ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'D', 'A'], drums: 'groove', bass: 'eighths', pad: true, arp: 'full', lead: VERSE, crash: 0 },
        chorus: { chords: ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A'], drums: 'full', bass: 'drive', pad: true, brass: true, lead: HOOK, hey: [1, 3, 5], crash: 0, fill: 7 },
        bridge: { chords: ['G', 'A', 'Bm', 'Bm'], drums: 'hats', bass: 'long', pad: true, arp: 'soft', riser: 3 },
      },
      order: ['intro', 'verse', 'chorus', 'bridge', 'chorus'],
      loopTo: 1,
    },
    victory: {
      bpm: 132,
      sections: {
        chorus: { chords: ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A'], drums: 'full', bass: 'drive', pad: true, brass: true, lead: HOOK, hey: [1, 3, 5, 7], crash: 0, fill: 7 },
        groove: { chords: ['D', 'A', 'Bm', 'G'], drums: 'groove', bass: 'eighths', pad: true, arp: 'full', crash: 0 },
      },
      order: ['chorus', 'groove'],
      loopTo: 0,
    },
    defeat: {
      bpm: 78,
      sections: { sad: { chords: ['Bm', 'G', 'Em', 'F#'], bass: 'long', pad: true, arp: 'slow', lead: SAD, level: 0.8 } },
      order: ['sad'],
      loopTo: 0,
    },
    tension: {
      bpm: 120,
      sections: { pulse: { chords: ['Bm', 'Bm', 'G', 'A'], drums: 'heartbeat', bass: 'pulse', arp: 'tick', level: 0.75 } },
      order: ['pulse'],
      loopTo: 0,
    },
  };
  KL.CHORDS = CHORDS;
  KL.DRUMS = DRUMS;

  /** Next sequencer position after `pos` ({ sec, bar, step }) in `song` (pure). */
  KL.songAdvance = (song, pos) => {
    let { sec, bar, step } = pos;
    if (++step < 16) return { sec, bar, step };
    step = 0;
    if (++bar < song.sections[song.order[sec]].chords.length) return { sec, bar, step };
    bar = 0;
    if (++sec >= song.order.length) sec = song.loopTo;
    return { sec, bar, step };
  };

  /** Bar of a melody → Map(step → { m, len }) of the notes starting there. */
  const notesOf = (bar) => {
    const map = new Map();
    let s = 0;
    for (const [m, len] of bar || []) {
      if (m != null) map.set(s, { m, len });
      s += len;
    }
    return map;
  };

  /* ------------------------------------------------------------------ the sequencer */

  KL.Music = class Music {
    constructor(A) {
      this.A = A;
      const c = A.ctx;
      this.out = K.head(K.gain(c, 1), A.buses.music);
      K.chain(this.out, K.gain(c, 0.16), A.reverb);
      // a dotted-eighth echo for the lead and plucks, damped as it repeats
      this.echo = c.createDelay(1.5);
      this.echoIn = K.gain(c, 0.24);
      const fb = K.gain(c, 0.32);
      const dark = K.filter(c, 'lowpass', 2600);
      K.chain(this.echoIn, this.echo, dark, fb, this.echo);
      dark.connect(this.out);
      this.track = null;
    }

    /** Start `name` (or stop the music with null / 'match'), cross-fading from what was playing. */
    play(name, { delay = 0 } = {}) {
      if (name === 'match') name = null; // the match has no score: the crowd is its soundtrack
      if ((this.track?.name ?? null) === name) return;
      const c = this.A.ctx, t = c.currentTime;
      const old = this.track;
      if (old) {
        old.stopped = true;
        for (const g of [old.group.gain, old.send.gain]) {
          g.cancelScheduledValues(t);
          g.setValueAtTime(g.value, t);
          g.linearRampToValueAtTime(0.0001, t + 0.9);
        }
        old.src?.stop(t + 1);
        setTimeout(() => [old.group, old.echo, old.send].forEach((n) => n.disconnect()), 1400);
      }
      this.track = null;
      if (!name || !KL.SONGS[name]) return;
      const song = KL.SONGS[name];
      const group = K.head(K.gain(c, 0.0001), this.out);
      const start = t + 0.08 + delay;
      group.gain.setValueAtTime(0.0001, start);
      group.gain.linearRampToValueAtTime(1, start + 0.5);
      const tr = { name, song, group, next: start, pos: { sec: 0, bar: 0, step: 0 } };
      tr.echo = K.gain(c, 1); // parts that ring through the echo: dry into the track…
      tr.echo.connect(group);
      tr.send = K.gain(c, 1); // …and into the shared echo
      K.chain(tr.echo, tr.send, this.echoIn);
      const studio = this.A.buffer(`music_${name}`);
      if (studio && this.A.hasSample(`music_${name}`)) {
        tr.src = c.createBufferSource();
        tr.src.buffer = studio;
        tr.src.loop = true;
        K.chain(tr.src, group);
        tr.src.start(start);
      }
      for (const sec of Object.values(song.sections)) sec._lead ??= (sec.lead || []).map(notesOf);
      this.track = tr;
    }

    /** Schedule every step that starts within `ahead` s (the engine calls this every 40 ms). */
    tick(now, ahead = 0.3) {
      const tr = this.track;
      if (!tr || tr.src || tr.stopped) return;
      const stepDur = 60 / tr.song.bpm / 4;
      while (tr.next < now + ahead) {
        if (tr.next > now - 0.05) this.step(tr, tr.next, stepDur); // after a stall, skip the lost steps
        tr.next += stepDur;
        tr.pos = KL.songAdvance(tr.song, tr.pos);
      }
    }

    step(tr, t, sd) {
      const c = this.A.ctx, I = KL.Instruments, song = tr.song;
      const sec = song.sections[song.order[tr.pos.sec]];
      const { bar, step } = tr.pos;
      const chord = CHORDS[sec.chords[bar]];
      const out = tr.group, wet = tr.echo;
      const lv = sec.level ?? 1;
      const hum = () => lv * K.vary(1, 0.06); // a human hand on every hit
      const barLen = sd * 16;

      // drums
      const dr = DRUMS[sec.drums];
      if (dr) {
        if (dr.kick?.includes(step)) I.kick(c, out, t, (sec.drums === 'heartbeat' && step === 3 ? 0.6 : 0.95) * lv);
        if (dr.snare?.includes(step)) I.snare(c, out, t, (step === 14 ? 0.5 : 0.8) * hum());
        if (dr.clap?.includes(step)) I.clap(c, out, t, 0.7 * hum());
        if (dr.hat?.includes(step)) I.hat(c, out, t, (step % 4 === 2 ? 0.9 : 0.55) * hum());
        if (dr.open?.includes(step)) I.hat(c, out, t, 0.6 * hum(), true);
      }
      if (sec.fill === bar && step >= 12) I.snare(c, out, t, (0.45 + (step - 12) * 0.15) * lv); // a roll into the next section
      if (sec.fill === bar && step === 14) I.tom(c, out, t, 45, 0.6 * lv);
      if (sec.crash === bar && step === 0) I.crash(c, out, t, 0.8 * lv);
      if (sec.riser === bar && step === 0) I.riser(c, out, t, barLen, lv);

      // bass
      const root = chord.root;
      if (sec.bass === 'eighths' && step % 2 === 0) I.bass(c, out, t, step === 6 || step === 14 ? root + 12 : root, sd * 1.8, (step % 4 === 0 ? 0.8 : 1) * lv);
      if (sec.bass === 'drive' && step % 2 === 0) I.bass(c, out, t, step % 4 === 2 ? root + 12 : root, sd * 1.7, lv);
      if (sec.bass === 'pulse' && step % 2 === 0) I.bass(c, out, t, root, sd * 1.2, (step % 8 === 0 ? 0.9 : 0.55) * lv);
      if (sec.bass === 'long' && step === 0) I.bass(c, out, t, root, barLen * 0.95, 0.8 * lv);

      // harmony
      if (sec.pad && step === 0) I.pad(c, out, t, chord.pad, barLen * 0.98, lv);
      if (sec.brass && (step === 0 || step === 6 || step === 10)) I.brass(c, out, t, chord.pad.map((m) => m + 12), step === 0 ? sd * 4 : sd * 2.5, (step === 0 ? 0.95 : 0.7) * lv);

      // arpeggio: the chord + its octave, up and down
      const tones = [...chord.pad.map((m) => m + 12), chord.pad[0] + 24];
      const updown = [0, 1, 2, 3, 2, 1];
      const at = (i) => tones[updown[i % updown.length]];
      if (sec.arp === 'full') I.pluck(c, wet, t, at(step), (step % 4 === 0 ? 0.9 : 0.6) * hum());
      if (sec.arp === 'soft' && step % 2 === 0) I.pluck(c, wet, t, at(step / 2), 0.55 * hum());
      if (sec.arp === 'slow' && step % 4 === 0) I.pluck(c, wet, t, at(step / 4), 0.7 * hum());
      if (sec.arp === 'tick') I.pluck(c, out, t, chord.pad[2] + 24, (step % 4 === 0 ? 0.5 : 0.25) * lv);

      // the lead
      const note = sec._lead?.[bar]?.get(step);
      if (note) I.lead(c, wet, t, note.m, note.len * sd * 0.92, 0.9 * lv);

      // the crowd sings along: "HEY!" on the fourth beat
      if (sec.hey?.includes(bar) && step === 12) this.A.crowd?.hey(t, out);
    }
  };
})();
