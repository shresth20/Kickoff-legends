/* AudioManager: synthesised SFX + a looping chiptune-ish bed via WebAudio.
 * No audio files are required, so the game is fully offline and file:// safe.
 * If assets/audio/*.ogg exist and were preloaded, those override the synth. */
window.KL = window.KL || {};

KL.Audio = class AudioManager {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicTimer = null;
    this.musicTrack = null;
    this.crowdNode = null;
    this.unlocked = false;
    this.applySettings();
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.unlocked = true;
    this.applySettings();
    if (this.pendingTrack) this.playMusic(this.pendingTrack);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  applySettings() {
    const s = KL.Save.settings;
    if (!this.ctx) return;
    this.master.gain.value = s.master;
    this.musicGain.gain.value = s.music * 0.5;
    this.sfxGain.gain.value = s.sfx;
  }

  duck(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.linearRampToValueAtTime(KL.Save.settings.music * (on ? 0.2 : 0.5), t + 0.25);
  }

  /* ----------------------------------------------------------------- sfx */
  tone({ freq = 440, to = null, dur = 0.12, type = 'square', vol = 0.3, attack = 0.005, noise = false }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(this.sfxGain);
    if (noise) {
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 0.8;
      src.connect(f).connect(g);
      src.start(t0);
      src.stop(t0 + dur);
    } else {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      o.connect(g);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }
  }

  play(name) {
    switch (name) {
      case 'kick_soft':
        this.tone({ freq: 220, to: 90, dur: 0.1, type: 'triangle', vol: 0.5 });
        this.tone({ freq: 900, dur: 0.05, noise: true, vol: 0.25 });
        break;
      case 'kick_hard': // the straight kick: a sharp, driven thwack
        this.tone({ freq: 200, to: 60, dur: 0.15, type: 'sawtooth', vol: 0.62 });
        this.tone({ freq: 1600, dur: 0.07, noise: true, vol: 0.4 });
        break;
      case 'kick_long': // the long kick: a deep boom with an airy follow-through
        this.tone({ freq: 150, to: 42, dur: 0.24, type: 'sawtooth', vol: 0.62 });
        this.tone({ freq: 70, to: 40, dur: 0.2, type: 'sine', vol: 0.5 });
        this.tone({ freq: 1100, dur: 0.12, noise: true, vol: 0.38 });
        break;
      case 'header':
        this.tone({ freq: 320, to: 140, dur: 0.1, type: 'triangle', vol: 0.45 });
        break;
      case 'jump':
        this.tone({ freq: 300, to: 620, dur: 0.14, type: 'square', vol: 0.18 });
        break;
      case 'land':
        this.tone({ freq: 400, dur: 0.06, noise: true, vol: 0.2 });
        break;
      case 'bump':
        this.tone({ freq: 160, to: 110, dur: 0.07, type: 'triangle', vol: 0.2 });
        break;
      case 'whistle':
        this.tone({ freq: 2200, dur: 0.18, type: 'square', vol: 0.18 });
        setTimeout(() => this.tone({ freq: 2200, dur: 0.32, type: 'square', vol: 0.18 }), 220);
        break;
      case 'goal_horn':
        [0, 0.12, 0.24].forEach((d, i) => setTimeout(() => this.tone({ freq: 330 + i * 110, to: 330 + i * 110, dur: 0.5, type: 'sawtooth', vol: 0.35 }), d * 1000));
        setTimeout(() => this.tone({ freq: 660, dur: 0.9, type: 'sawtooth', vol: 0.3 }), 400);
        break;
      case 'super_charge':
        this.tone({ freq: 200, to: 1600, dur: 0.45, type: 'sawtooth', vol: 0.25 });
        break;
      case 'super_fire':
        this.tone({ freq: 1200, to: 100, dur: 0.4, type: 'sawtooth', vol: 0.5 });
        this.tone({ freq: 2500, dur: 0.25, noise: true, vol: 0.4 });
        break;
      case 'super_ready':
        [0, 0.09, 0.18].forEach((d, i) => setTimeout(() => this.tone({ freq: [660, 880, 1320][i], dur: 0.12, type: 'square', vol: 0.2 }), d * 1000));
        break;
      case 'hurt':
        this.tone({ freq: 500, to: 120, dur: 0.25, type: 'square', vol: 0.3 });
        break;
      case 'ui_click':
        this.tone({ freq: 880, to: 1100, dur: 0.06, type: 'square', vol: 0.15 });
        break;
      case 'ui_move':
        this.tone({ freq: 600, dur: 0.04, type: 'square', vol: 0.1 });
        break;
      case 'ui_back':
        this.tone({ freq: 700, to: 400, dur: 0.08, type: 'square', vol: 0.15 });
        break;
      case 'emote_pop': // a reaction bubbles up over a player's head
        this.tone({ freq: 520, to: 1250, dur: 0.11, type: 'sine', vol: 0.28 });
        this.tone({ freq: 1500, dur: 0.05, type: 'triangle', vol: 0.08 });
        break;
      case 'countdown':
        this.tone({ freq: 740, dur: 0.1, type: 'square', vol: 0.2 });
        break;
      case 'win':
        [0, 0.15, 0.3, 0.45].forEach((d, i) => setTimeout(() => this.tone({ freq: [523, 659, 784, 1047][i], dur: 0.3, type: 'square', vol: 0.25 }), d * 1000));
        break;
      case 'lose':
        [0, 0.2, 0.4].forEach((d, i) => setTimeout(() => this.tone({ freq: [392, 349, 262][i], dur: 0.35, type: 'triangle', vol: 0.3 }), d * 1000));
        break;
      default:
        break;
    }
  }

  /* --------------------------------------------------------------- music */
  playMusic(track) {
    this.pendingTrack = track;
    if (!this.ctx) return;
    if (this.musicTrack === track) return;
    this.stopMusic();
    this.musicTrack = track;
    const bpm = track === 'match' ? 150 : 112;
    const beat = 60 / bpm;
    const menuBass = [0, 0, 7, 7, 5, 5, 3, 3];
    const matchBass = [0, 0, 0, 3, 5, 5, 5, 7];
    const bass = track === 'match' ? matchBass : menuBass;
    const lead = track === 'match' ? [12, 15, 19, 15, 12, 10, 12, 7] : [12, 14, 15, 19, 15, 14, 12, 10];
    const root = track === 'match' ? 55 : 49;
    const hz = (semi) => root * Math.pow(2, semi / 12);
    let step = 0;
    let next = this.ctx.currentTime + 0.05;
    const schedule = () => {
      if (!this.ctx || this.musicTrack !== track) return;
      while (next < this.ctx.currentTime + 0.4) {
        const i = step % 8;
        this.note(hz(bass[i]), next, beat * 0.9, 'triangle', 0.35);
        if (step % 2 === 0) this.note(hz(lead[(step / 2) % 8] + 12), next, beat * 0.5, 'square', 0.08);
        if (i % 2 === 0) this.hat(next, 0.02);
        if (i % 4 === 0) this.kickDrum(next);
        next += beat / 2;
        step++;
      }
    };
    schedule();
    this.musicTimer = setInterval(schedule, 150);
    if (track === 'match') this.startCrowd();
  }

  note(freq, t, dur, type, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  hat(t, vol) {
    const len = Math.floor(this.ctx.sampleRate * 0.04);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.value = vol * 4;
    src.connect(f).connect(g).connect(this.musicGain);
    src.start(t);
  }
  kickDrum(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.15);
  }

  startCrowd() {
    if (this.crowdNode || !this.ctx) return;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099;
      b1 = 0.963 * b1 + w * 0.2965;
      b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.08;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.25;
    src.connect(f).connect(this.crowdGain).connect(this.musicGain);
    src.start();
    this.crowdNode = src;
  }

  crowdSwell() {
    if (!this.crowdGain) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.cancelScheduledValues(t);
    this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, t);
    this.crowdGain.gain.linearRampToValueAtTime(1.0, t + 0.15);
    this.crowdGain.gain.linearRampToValueAtTime(0.25, t + 2.5);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.musicTrack = null;
    this.pendingTrack = null;
    if (this.crowdNode) {
      try {
        this.crowdNode.stop();
      } catch (_) {
        /* already stopped */
      }
      this.crowdNode = null;
      this.crowdGain = null;
    }
  }
};
