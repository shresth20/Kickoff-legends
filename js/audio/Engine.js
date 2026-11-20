/* KL.Audio — the game's sound engine. WebAudio only and no files needed: every sound is synthesised
 * (the crowd baked offline once at start-up), so the game stays offline and file:// safe.
 *
 * Mixer: each sound plays on one of six buses — music · sfx · ui · voice (the announcer) · crowd · amb,
 * each with its own volume (Settings) — summed through a "muffle" low-pass (the pause menu and the
 * goal slow-mo close it), a glue compressor / limiter and the master volume. UI clicks skip the
 * muffle, so the pause menu stays crisp over the muffled match. A stadium reverb (a generated
 * impulse: open-air by day, longer and lusher under the floodlights) is fed by sends from the crowd,
 * whistle, horns, kicks and the announcer.
 *
 * Parts (js/audio/): Kit (DSP helpers), Sfx (one-shot recipes), Crowd (the stand: murmur ↔ roar,
 * reactions, chants), Ambience (day birds, gulls timed to
 * the sky's flocks, wind; night crickets, floodlight hum, shooting-star shimmer), Music (the sequenced
 * theme, stingers), Commentary (the stadium announcer) and Director (reads a match and drives them).
 *
 * Studio samples: recordings in assets/sound/ → `npm run audio:build` → assets/audio/audio.js. Any
 * name there (kick_low, crowd_roar, music_menu, vo_en_comm_goal.0 …) replaces the synthesised sound
 * of that name — the same "procedural first, studio art swaps in" idea as the image pipeline. */
window.KL = window.KL || {};

KL.Audio = class AudioManager {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.buses = {};
    this.bakes = {}; // procedural buffers baked at start-up (crowd)
    this.samples = {}; // studio overrides: name → [AudioBuffer]
    this.last = new Map(); // sound → ctx time it last played (cooldowns)
    this.stadium = { night: false };
    this.pendingTrack = null;
    this.paused = false;
    // Browsers only start audio from a user gesture: try on every gesture until it runs (iOS wants
    // touchend / click; a context suspended by a hidden tab also comes back this way).
    const wake = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) window.addEventListener(ev, wake, { passive: true });
    // the player away (KL.Activity: tab hidden, window not in front, idle): every sound rests with the game
    KL.Activity?.on((active) => {
      if (!this.ctx) return;
      if (active) this.ctx.resume?.().catch?.(() => {});
      else {
        this.ctx.suspend?.();
        KL.Commentary.stop();
      }
    });
  }

  /** The context exists and is running (sounds can be scheduled). */
  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }
  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden && KL.Activity?.active !== false) this.ctx.resume?.().catch?.(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch (_) {
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume?.().catch?.(() => {});
    this.buildMixer();
    this.music = new KL.Music(this);
    this.crowd = new KL.Crowd(this);
    this.ambience = new KL.Ambience(this);
    this.applySettings();
    this.setStadium(this.stadium);
    KL.Commentary.prime();
    if (this.pendingTrack) this.playMusic(this.pendingTrack);
    // studio samples first (they replace bakes), then the crowd bakes in the background
    this.loadSamples().finally(() => this.crowd.bakeAll());
    this.ticker = setInterval(() => this.tick(), 40);
    if (KL.Activity?.active === false) this.ctx.suspend?.();
  }

  buildMixer() {
    const c = this.ctx, K = KL.AudioKit;
    this.master = K.gain(c, 0);
    const L = (this.limiter = c.createDynamicsCompressor());
    L.threshold.value = -10;
    L.knee.value = 6;
    L.ratio.value = 8;
    L.attack.value = 0.003;
    L.release.value = 0.22;
    this.muffle = K.filter(c, 'lowpass', 20000, 0.6);
    this.mix = K.gain(c, 1);
    K.chain(this.mix, this.muffle, this.limiter, this.master, c.destination);
    for (const name of ['music', 'sfx', 'voice', 'crowd', 'amb']) this.buses[name] = K.head(K.gain(c, 0), this.mix);
    this.buses.ui = K.head(K.gain(c, 0), this.limiter); // UI skips the muffle
    this.reverb = c.createConvolver();
    K.chain(this.reverb, K.gain(c, 0.85), this.mix);
  }

  applySettings() {
    if (!this.ctx) return;
    const s = KL.Save.settings, t = this.ctx.currentTime;
    const set = (param, v) => param.setTargetAtTime(v, t, 0.03);
    set(this.master.gain, s.master ?? 0.8);
    set(this.buses.music.gain, (s.music ?? 0.5) * 0.8);
    set(this.buses.sfx.gain, s.sfx ?? 0.9);
    set(this.buses.ui.gain, (s.sfx ?? 0.9) * 0.8);
    set(this.buses.voice.gain, 1); // the announcer: on / off in Settings, at the master volume
    set(this.buses.crowd.gain, s.crowd ?? 0.8);
    set(this.buses.amb.gain, (s.crowd ?? 0.8) * 0.85);
    if (s.master === 0 || s.commentary === false) KL.Commentary.stop();
  }

  /** Every 40 ms: the music sequencer schedules ahead, the crowd and the ambience follow the game. */
  tick() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const dt = Math.min(0.25, t - (this.lastTick ?? t));
    this.lastTick = t;
    this.music.tick(t);
    this.crowd.tick(t, dt);
    this.ambience.tick(t, dt);
  }

  /* ------------------------------------------------------------------ routing */

  /** Design-x → stereo pan. */
  panFor(x) {
    return KL.AudioKit.panFor(x, KL.TUNING?.world?.width ?? 1280);
  }

  /**
   * An input for a one-shot: → gain → [pan] → bus, plus a reverb send. o = { x | pan, verb, gain }.
   * Returns the gain node to connect sources into.
   */
  out(bus = 'sfx', o = {}) {
    const c = this.ctx, K = KL.AudioKit;
    const g = K.gain(c, o.gain ?? 1);
    const pan = o.pan ?? (o.x != null ? this.panFor(o.x) : 0);
    const tail = pan ? K.chain(g, K.panner(c, pan)) : g;
    tail.connect(this.buses[bus] || this.buses.sfx);
    if (o.verb) K.chain(tail, K.gain(c, o.verb), this.reverb);
    return g;
  }

  /** A buffer for `name`: a studio sample (random variant) if there is one, else a procedural bake. */
  buffer(name) {
    const s = this.samples[name];
    if (s?.length) return s[Math.floor(Math.random() * s.length)];
    return this.bakes[name] || null;
  }
  hasSample(name) {
    return !!this.samples[name]?.length;
  }

  /**
   * Play a buffer. o = { bus, x | pan, verb, gain, rate, at, offset, dur, fadeIn, fadeOut, loop,
   * dest (a node of your own instead of bus / pan / verb) }. Returns { src, gain }.
   */
  playBuffer(buf, o = {}) {
    if (!buf || !this.ctx) return null;
    const c = this.ctx;
    const t = o.at ?? c.currentTime;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = !!o.loop;
    src.playbackRate.value = o.rate ?? 1;
    const env = c.createGain();
    const level = o.gain ?? 1;
    if (o.fadeIn) {
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(level, t + o.fadeIn);
    } else env.gain.setValueAtTime(level, t);
    if (o.dur != null && o.fadeOut) {
      env.gain.setValueAtTime(level, t + Math.max(0, o.dur - o.fadeOut));
      env.gain.linearRampToValueAtTime(0.0001, t + o.dur);
    }
    KL.AudioKit.chain(src, env, o.dest || this.out(o.bus || 'sfx', o));
    src.start(t, o.offset ?? 0);
    if (o.dur != null) src.stop(t + o.dur + 0.02);
    return { src, gain: env };
  }

  /* ------------------------------------------------------------------ one-shots */

  /**
   * Play a named sound. o: { x (design px, for panning), power (0…1.4), delay (s), … recipe options }.
   * A studio sample of the same name wins over the recipe. Each name has a cooldown (KL.SFX_COOLDOWN)
   * so a ball buzzing on the bar can't machine-gun.
   */
  play(name, o = {}) {
    if (!this.ready) return;
    name = KL.SFX_ALIAS[name] || name;
    const t = this.ctx.currentTime + (o.delay || 0);
    const key = o.key != null ? `${name}:${o.key}` : name;
    const cd = KL.SFX_COOLDOWN[name] ?? 0.025;
    if (t - (this.last.get(key) ?? -9) < cd) return;
    this.last.set(key, t);
    if (this.hasSample(name)) {
      const bus = name.startsWith('ui_') ? 'ui' : /^(sting|jingle)_/.test(name) ? 'music' : 'sfx';
      this.playBuffer(this.buffer(name), { bus, x: o.x, verb: bus === 'sfx' ? 0.12 : 0.05, gain: o.gain ?? 1, rate: KL.AudioKit.vary(1, bus === 'sfx' ? 0.03 : 0), at: t });
      return;
    }
    try {
      KL.SFX[name]?.(this, t, o);
    } catch (e) {
      console.warn(`[audio] ${name}:`, e);
    }
  }

  /* ------------------------------------------------------------------ music, stadium, pause */

  playMusic(track, o) {
    this.pendingTrack = track;
    if (!this.ctx) return;
    this.music.play(track, o);
  }
  stopMusic() {
    this.pendingTrack = null;
    this.music?.play(null);
  }

  /** The stadium on screen (Stadium.build calls this): day or night ambience and reverb. */
  setStadium({ night = false } = {}) {
    this.stadium = { night };
    if (!this.ctx) return;
    if (this.verbNight !== night) {
      this.verbNight = night;
      this.irs ??= {};
      this.irs[night] ??= KL.AudioKit.impulse(this.ctx, night
        ? { seconds: 2.6, predelay: 0.03, damp: 0.8, early: [[0.11, 0.5], [0.19, 0.3], [0.31, 0.18]] }
        : { seconds: 1.7, predelay: 0.018, damp: 0.9, early: [[0.13, 0.35], [0.24, 0.16]] });
      this.reverb.buffer = this.irs[night];
    }
    this.ambience.set(night ? 'night' : 'day');
    if (this.crowd.mode === 'off') this.crowd.setMode('menu'); // a stadium on screen: a distant murmur (a match turns it up)
  }

  /** The pause menu: the match goes muffled and a bit quieter (UI clicks stay crisp). */
  duck(on) {
    this.paused = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(on ? 620 : 20000, t, on ? 0.07 : 0.15);
    this.mix.gain.setTargetAtTime(on ? 0.55 : 1, t, 0.1);
    if (on) KL.Commentary.stop();
  }

  /** A goal's slow-mo: the world closes in for a beat, then opens up into the roar. */
  slowMoDip(holdS = 0.35, openS = 0.8) {
    if (!this.ready || this.paused) return;
    const t = this.ctx.currentTime, f = this.muffle.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(1400, t + 0.06);
    f.setValueAtTime(1400, t + holdS);
    f.exponentialRampToValueAtTime(20000, t + holdS + openS);
  }

  /** Legacy entry point (the old match wiring): a crowd swell. */
  crowdSwell() {
    this.crowd?.react('cheer');
  }

  /* ------------------------------------------------------------------ studio samples */

  /** Decode window.KL_AUDIO (assets/audio/audio.js: name → [data URI, …]) into this.samples. */
  async loadSamples() {
    const src = window.KL_AUDIO || {};
    const decode = (ab) =>
      new Promise((res, rej) => {
        const p = this.ctx.decodeAudioData(ab, res, rej);
        p?.then?.(res, rej);
      });
    for (const [name, list] of Object.entries(src)) {
      for (const uri of [].concat(list)) {
        try {
          const bin = atob(uri.slice(uri.indexOf(',') + 1));
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          (this.samples[name] ||= []).push(await decode(bytes.buffer));
        } catch (e) {
          console.warn(`[audio] could not decode the sample "${name}" (Safari can't play .ogg — use .mp3 / .m4a)`, e);
        }
      }
    }
  }
};
