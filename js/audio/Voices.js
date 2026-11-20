/* The legends' voices: efforts on a strike, a "hup" on a jump or header, a cry when a fireball knocks
 * them flat, a "YEAAH!" when they score, a groan when they concede. Formant-synthesised
 * (KL.AudioKit.voice): each legend has their own pitch and timbre (`voice` in js/data/characters.js),
 * and every call varies a little so no two shouts match. A studio recording named
 * voice_<charId>_<kind> (or voice_<kind> for everyone) replaces the synthesised one. */
window.KL = window.KL || {};

(() => {
  const K = KL.AudioKit;

  /** Vocalisations: f (the speaker's base pitch, Hz) → KL.AudioKit.voice options (minus t / shift). */
  KL.VOCALS = {
    // a strike: "hah!"
    effort: (f) => ({ dur: 0.2, f0: [[0, f * 1.25], [0.05, f * 1.38], [0.2, f * 0.95]], vowels: [[0, 'uh'], [0.06, 'a'], [0.2, 'uh']], amp: [[0, 0], [0.018, 0.9], [0.09, 0.7], [0.2, 0]], breath: 0.45, bright: 4200 }),
    // a long ball / the super: "hyaaah!"
    big: (f) => ({ dur: 0.5, f0: [[0, f * 1.2], [0.12, f * 1.6], [0.35, f * 1.5], [0.5, f * 1.05]], vowels: [[0, 'i'], [0.07, 'ae'], [0.2, 'a'], [0.5, 'a']], amp: [[0, 0], [0.03, 0.8], [0.15, 1], [0.38, 0.85], [0.5, 0]], breath: 0.4, vib: { rate: 6, depth: 0.02 }, bright: 5000 }),
    // a jump / a header: "hup"
    hup: (f) => ({ dur: 0.13, f0: [[0, f * 1.3], [0.13, f * 1.15]], vowels: [[0, 'uh'], [0.13, 'u']], amp: [[0, 0], [0.015, 0.7], [0.08, 0.5], [0.13, 0]], breath: 0.5, bright: 3600 }),
    // knocked down: "ugh!"
    hurt: (f) => ({ dur: 0.42, f0: [[0, f * 1.65], [0.06, f * 1.75], [0.42, f * 0.82]], vowels: [[0, 'u'], [0.08, 'uh'], [0.42, 'o']], amp: [[0, 0], [0.02, 1], [0.15, 0.75], [0.42, 0]], breath: 0.6, vib: { rate: 22, depth: 0.03 }, bright: 4000 }),
    // a goal: "YEAAAH!"
    cheer: (f) => ({ dur: 0.95, f0: [[0, f * 1.25], [0.22, f * 1.75], [0.6, f * 1.65], [0.95, f * 1.15]], vowels: [[0, 'i'], [0.1, 'e'], [0.28, 'ae'], [0.6, 'a'], [0.95, 'a']], amp: [[0, 0], [0.04, 0.8], [0.25, 1], [0.7, 0.85], [0.95, 0]], breath: 0.3, vib: { rate: 5.5, depth: 0.025 }, bright: 5200 }),
    // conceded: "ohh…"
    groan: (f) => ({ dur: 0.75, f0: [[0, f * 1.1], [0.2, f * 1.15], [0.75, f * 0.78]], vowels: [[0, 'o'], [0.4, 'o'], [0.75, 'u']], amp: [[0, 0], [0.08, 0.55], [0.45, 0.45], [0.75, 0]], breath: 0.55, bright: 2800 }),
    // picked on the select screen: "yeah!"
    ready: (f) => ({ dur: 0.5, f0: [[0, f * 1.2], [0.12, f * 1.55], [0.5, f * 1.1]], vowels: [[0, 'i'], [0.06, 'e'], [0.2, 'ae'], [0.5, 'a']], amp: [[0, 0], [0.03, 0.9], [0.3, 0.8], [0.5, 0]], breath: 0.3, bright: 5000 }),
  };

  KL.Voices = class Voices {
    constructor(A) {
      this.A = A;
    }

    /** The voice of legend `id` ({ f0, shift }; js/data/characters.js). */
    profile(id) {
      return KL.CHARACTERS?.find((c) => c.id === id)?.voice || { f0: 140, shift: 1 };
    }

    /** Legend `id` says `kind` (KL.VOCALS). o = { x (design px), delay (s), gain }. */
    say(id, kind, o = {}) {
      const A = this.A;
      if (!A.ready || !KL.VOCALS[kind]) return;
      const t = A.now + (o.delay || 0);
      for (const name of [`voice_${id}_${kind}`, `voice_${kind}`]) {
        if (!A.hasSample(name)) continue;
        A.playBuffer(A.buffer(name), { bus: 'voice', x: o.x, verb: 0.1, gain: o.gain ?? 1, at: t, rate: K.vary(1, 0.03) });
        return;
      }
      const P = this.profile(id);
      const dest = A.out('voice', { x: o.x, verb: 0.1, gain: (o.gain ?? 1) * 0.8 });
      K.voice(A.ctx, dest, { t, shift: P.shift * K.vary(1, 0.02), ...KL.VOCALS[kind](P.f0 * K.vary(1, 0.04)) });
    }
  };
})();
