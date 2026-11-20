import { test } from 'node:test';
import assert from 'node:assert/strict';

// The audio scripts are classic scripts on window.KL; their data and pure helpers need no WebAudio.
globalThis.window = globalThis;
globalThis.KL = { TUNING: { world: { width: 1280, height: 720 } } };
await import('../locales/locales.js');
await import('../js/core/I18n.js');
await import('../js/audio/Kit.js');
await import('../js/audio/Music.js');
await import('../js/audio/Crowd.js');
await import('../js/audio/Commentary.js');
await import('../js/audio/Director.js');
const { AudioKit: K, SONGS, CHORDS, DRUMS, songAdvance, Crowd, AudioDirector, Commentary, I18n } = globalThis.KL;

test('pitch and panning helpers', () => {
  assert.equal(K.midi(69), 440);
  assert.ok(Math.abs(K.midi(81) - 880) < 1e-9);
  assert.equal(K.panFor(640), 0);
  assert.equal(K.panFor(0), -K.panFor(1280), 'left and right mirror each other');
  assert.ok(K.panFor(-5000) >= -0.72 && K.panFor(5000) <= 0.72, 'never hard-panned, even off screen');
});

test('every vowel has three rising formants', () => {
  for (const [name, v] of Object.entries(K.VOWELS)) {
    assert.equal(v.f.length, 3, name);
    assert.ok(v.f[0] < v.f[1] && v.f[1] < v.f[2], `${name} formants rise`);
    assert.equal(v.g[0], 1, `${name}: F1 is the reference level`);
  }
});

test('applause is a clean, normalised, seamless loop', () => {
  const sr = 8000;
  const [L, R] = K.applause(sr, 2, { rnd: K.seeded(7) });
  assert.equal(L.length, sr * 2);
  let peak = 0, energy = 0;
  for (const ch of [L, R]) for (const x of ch) {
    assert.ok(Number.isFinite(x));
    peak = Math.max(peak, Math.abs(x));
    energy += x * x;
  }
  assert.ok(Math.abs(peak - 0.8) < 1e-6, `peak ${peak}`);
  assert.ok(energy / (L.length * 2) > 1e-3, 'not silent');
  // seamless: clappers keep a whole number of claps in the loop, so its two halves are equally busy
  const half = (a, b) => L.slice(a, b).reduce((s, x) => s + x * x, 0);
  const ratio = half(0, sr) / half(sr, 2 * sr);
  assert.ok(ratio > 0.6 && ratio < 1.6, `even density across the loop (${ratio.toFixed(2)})`);
});

test('a unison clap lands together, at the start', () => {
  const sr = 8000;
  const [L] = K.unisonClap(sr, { rnd: K.seeded(3) });
  let at = 0;
  L.forEach((x, i) => Math.abs(x) > Math.abs(L[at]) && (at = i));
  assert.ok(at / sr < 0.08, `loudest at ${(at / sr).toFixed(3)} s`);
});

test('the songs are well formed', () => {
  for (const [name, song] of Object.entries(SONGS)) {
    assert.ok(song.bpm > 40 && song.bpm < 200, name);
    assert.ok(song.loopTo >= 0 && song.loopTo < song.order.length, `${name} loops back inside the song`);
    for (const secName of song.order) {
      const sec = song.sections[secName];
      assert.ok(sec, `${name}: section ${secName}`);
      for (const ch of sec.chords) assert.ok(CHORDS[ch], `${name}/${secName}: chord ${ch}`);
      if (sec.drums) assert.ok(DRUMS[sec.drums], `${name}/${secName}: drums ${sec.drums}`);
      (sec.lead || []).forEach((bar, i) => {
        if (!bar) return;
        assert.equal(bar.reduce((s, [, len]) => s + len, 0), 16, `${name}/${secName}: melody bar ${i} fills the bar`);
      });
      if (sec.lead) assert.ok(sec.lead.length <= sec.chords.length, `${name}/${secName}: no melody past the last bar`);
    }
  }
});

test('the sequencer walks the whole song, then loops back', () => {
  const song = SONGS.menu;
  const bars = song.order.reduce((s, n) => s + song.sections[n].chords.length, 0);
  let pos = { sec: 0, bar: 0, step: 0 };
  for (let i = 0; i < bars * 16; i++) pos = songAdvance(song, pos);
  assert.deepEqual(pos, { sec: song.loopTo, bar: 0, step: 0 });
});

test('the crowd gets louder and brighter with its mood', () => {
  let prev = Crowd.levels(0, 'match');
  assert.equal(prev.excited, 0, 'a calm stand has no shouting layer');
  for (let l = 0.1; l <= 1.0001; l += 0.1) {
    const L = Crowd.levels(l, 'match');
    assert.ok(L.excited > prev.excited && L.cutoff > prev.cutoff, `level ${l.toFixed(1)}`);
    assert.ok(L.murmur > 0 && L.excited <= 1.2);
    prev = L;
  }
  assert.equal(Crowd.levels(0.5, 'menu').excited, 0, 'the menus only murmur');
  assert.deepEqual(Crowd.levels(1, 'off'), { murmur: 0, excited: 0, cutoff: 800 });
});

test('pressure builds near a goal, as the clock runs down and in sudden death', () => {
  const P = (o) => AudioDirector.pressure({ x: 640, vx: 0, secondsLeft: 60, ...o });
  assert.ok(P({}) < 0.01, 'midfield, mid-match: calm');
  assert.ok(P({ x: 1200, vx: 800 }) > P({ x: 1000, vx: 800 }), 'closer is tenser');
  assert.ok(P({ x: 1200, vx: 800 }) > P({ x: 1200, vx: -800 }), 'heading in is tenser than heading out');
  assert.equal(P({ x: 100, vx: -500 }), P({ x: 1180, vx: 500 }), 'both goals alike');
  assert.ok(P({ secondsLeft: 5 }) > P({ secondsLeft: 14 }), 'the last seconds');
  assert.ok(P({ suddenDeath: true }) > P({}), 'sudden death');
  assert.ok(P({ x: 1270, vx: 900, secondsLeft: 1, suddenDeath: true }) <= 0.7, 'capped');
});

test('every announcer line exists in every language, with the same placeholders', () => {
  const keys = new Set(Object.keys(globalThis.LOCALES.en).filter((k) => k.startsWith('comm_')).map((k) => k.replace(/\.\d+$/, '')));
  assert.ok(keys.size >= 10);
  for (const lang of I18n.available) {
    I18n.set(lang);
    for (const key of keys) {
      const variants = Commentary.variants(key);
      assert.ok(variants.length >= 1, `${lang}: ${key}`);
      for (const i of variants) {
        const en = globalThis.LOCALES.en[`${key}.${i}`] ?? '';
        const here = I18n.t(`${key}.${i}`);
        assert.equal(here.includes('{name}'), en.includes('{name}'), `${lang}: ${key}.${i} placeholders`);
      }
    }
  }
  I18n.set('en');
});
