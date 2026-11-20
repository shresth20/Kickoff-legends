/* Commentary: the stadium announcer calls the big moments — the kickoff, every goal (by kind and by
 * what it does to the score), the woodwork, a fireball knockdown, the last ten seconds, sudden
 * death and full time. Lines are locale keys (locales.json: comm_goal.0, comm_goal.1 … one key per
 * spoken variant, {name} = the legend), spoken by the browser's speech synthesis in the game's
 * language. Only voices on the device are used (it's an offline game); if none speaks the language,
 * the announcer stays quiet rather than mispronounce it. Recorded voice-over named
 * vo_<locale>_<key> (e.g. vo_en_comm_goal.0) in assets/audio/audio.js plays instead, through the
 * stadium reverb. The crowd drops back while the announcer talks; a bigger moment cuts a smaller
 * one off, never the other way round. Settings: "Commentary" on / off; it speaks at the master volume. */
window.KL = window.KL || {};

(() => {
  const synth = () => globalThis.speechSynthesis;
  // voices known to sound good for sport, best first (any local voice of the language will do)
  const PREFERRED = {
    en: [/Daniel/, /Arthur/, /Oliver/, /George/, /Ryan/, /Rishi/, /Alex\b/, /Samantha/],
    hi: [/Lekha/, /Kiyara/, /Madhur/, /Swara/],
  };
  const REGION = { en: ['en-GB', 'en-AU', 'en-IE', 'en-IN', 'en-US'], hi: ['hi-IN'] };

  KL.Commentary = {
    voice: null,
    voiceLocale: null,
    priority: 0,

    get supported() {
      return !!synth() && typeof globalThis.SpeechSynthesisUtterance === 'function';
    },
    get on() {
      const s = KL.Save?.settings || {};
      return s.commentary !== false && (s.master ?? 0.8) > 0 && KL.Activity?.active !== false;
    },

    /** From the unlocking gesture: load the voice list, and say nothing once (iOS lets later lines speak). */
    prime() {
      if (!this.supported) return;
      this.pick();
      synth().addEventListener?.('voiceschanged', () => this.pick());
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        synth().speak(u);
      } catch (_) {
        /* ignore */
      }
    },

    /** The best voice for the current language: on the device, by region, then by name. */
    pick() {
      const lang = KL.I18n?.locale || 'en';
      this.voiceLocale = lang;
      const all = synth()?.getVoices?.() || [];
      const mine = all.filter((v) => v.lang?.toLowerCase().startsWith(lang));
      const local = mine.filter((v) => v.localService);
      // a voice in the cloud only helps when we're online (and it's an offline game)
      const pool = local.length ? local : globalThis.navigator?.onLine ? mine : [];
      const score = (v) => {
        const name = (PREFERRED[lang] || []).findIndex((re) => re.test(v.name));
        const region = (REGION[lang] || []).indexOf(v.lang.replace('_', '-'));
        return (name < 0 ? 50 : name) + (region < 0 ? 10 : region) * 2 + (v.default ? -1 : 0);
      };
      this.voice = pool.sort((a, b) => score(a) - score(b))[0] || null;
      return this.voice;
    },

    /** The variants of a line in the current language: key.0, key.1 … (pure). */
    variants(key) {
      const out = [];
      for (let i = 0; i < 12; i++) {
        const k = `${key}.${i}`;
        const s = KL.t(k);
        if (s === k) break;
        out.push(i);
      }
      return out;
    },

    /**
     * Say line `key` ({vars} filled in). o = { priority (higher cuts lower off), delay (s), rate, pitch,
     * excited (faster and higher: a goal), then: { key, vars } (a follow-up line once this one ends) }.
     */
    say(key, vars = {}, o = {}) {
      if (!this.on) return;
      const variants = this.variants(key);
      if (!variants.length) return;
      const prio = o.priority ?? 1;
      if (this.busy() && prio <= this.priority) return; // don't talk over a bigger moment
      const i = variants[Math.floor(Math.random() * variants.length)];
      const lang = KL.I18n?.locale || 'en';
      const A = KL.audio;
      const vo = `vo_${lang}_${key}.${i}`;
      if (A?.hasSample(vo)) {
        this.stop();
        this.priority = prio;
        const t = A.now + (o.delay || 0);
        const buf = A.buffer(vo);
        A.playBuffer(buf, { bus: 'voice', at: t, verb: 0.3, gain: 1.1 });
        A.crowd?.duck(true);
        this.until = performance.now() + (o.delay || 0) * 1000 + buf.duration * 1000;
        clearTimeout(this.voTimer);
        this.voTimer = setTimeout(() => this.finished(o, prio), (o.delay || 0) * 1000 + buf.duration * 1000);
        return;
      }
      if (!this.supported) return;
      if (this.voiceLocale !== lang || !this.voice) this.pick();
      if (!this.voice) return;
      const text = KL.t(`${key}.${i}`, vars);
      const u = new SpeechSynthesisUtterance(text);
      u.voice = this.voice;
      u.lang = this.voice.lang;
      u.rate = o.rate ?? (o.excited ? 1.14 : 1.04);
      u.pitch = o.pitch ?? (o.excited ? 1.12 : 1);
      const s = KL.Save.settings;
      u.volume = Math.min(1, (s.master ?? 0.8) * 1.05);
      u.onstart = () => KL.audio?.crowd?.duck(true);
      u.onend = u.onerror = () => {
        if (this.utterance === u) this.finished(o, prio);
      };
      this.stop();
      this.priority = prio;
      this.utterance = u;
      const go = () => {
        if (this.utterance !== u || KL.audio?.paused || KL.Activity?.active === false) return;
        synth().speak(u);
      };
      clearTimeout(this.timer);
      if (o.delay) this.timer = setTimeout(go, o.delay * 1000);
      else go();
    },

    busy() {
      return !!this.utterance || performance.now() < (this.until || 0);
    },

    done() {
      this.priority = 0;
      this.utterance = null;
      this.until = 0;
      KL.audio?.crowd?.duck(false);
    },

    /** A line ran to its end: its follow-up, if it has one, comes straight after. */
    finished(o, prio) {
      this.done();
      if (o.then && !KL.audio?.paused) this.say(o.then.key, o.then.vars, { priority: prio, delay: 0.15 });
    },

    /** Stop talking (pause, a hidden tab, muted). Cancelled lines never run their follow-ups. */
    stop() {
      clearTimeout(this.timer);
      clearTimeout(this.voTimer);
      const talking = this.utterance || this.until;
      this.utterance = null; // first, so a cancel that fires its end event at once is ignored
      this.until = 0;
      if (this.supported && (synth().speaking || synth().pending)) synth().cancel();
      if (talking) this.done();
    },
  };
})();
