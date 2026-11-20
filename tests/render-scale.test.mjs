import { test } from 'node:test';
import assert from 'node:assert/strict';

// HiDPI.js is a classic browser script: give it just enough of a browser (and of Phaser) to load. The
// render-resolution governor's maths (KL.RenderScale.levels / typical / decide) is pure.
globalThis.window = globalThis;
globalThis.KL = { TUNING: { world: { width: 1280, height: 720 } }, View: { touch: false, ui: 1 } };
globalThis.Phaser = { Plugins: { ScenePlugin: class {} } };
globalThis.location = { search: '', protocol: 'http:' };
globalThis.screen = { width: 1512, height: 982 };
globalThis.devicePixelRatio = 2;
await import('../js/core/HiDPI.js');
const { RenderScale, RES, RENDER } = globalThis.KL;
const { levels, typical, decide, RS } = RenderScale;

const state = (res) => ({ level: 0, count: levels(res).length, before: null, locked: false });
const at60 = 1000 / 60, at45 = 1000 / 45, at30 = 1000 / 30;

test('rendering starts at the screen density', () => {
  assert.equal(RENDER, RES);
  assert.ok(RES > 1);
});

test('levels step down in quarter steps, ~25 % fewer pixels each, to 1 px per logical px', () => {
  assert.deepEqual(levels(3), [3, 2.5, 2, 1.5, 1.25, 1]);
  assert.deepEqual(levels(2.25), [2.25, 1.75, 1.5, 1.25, 1]);
  assert.deepEqual(levels(1.75), [1.75, 1.5, 1.25, 1]);
  assert.deepEqual(levels(1.25), [1.25, 1]);
  assert.deepEqual(levels(1), [1]); // nothing to lower
  for (const r of [3, 2.75, 2.5, 2.25, 2, 1.75, 1.5, 1.25]) {
    const l = levels(r);
    for (let i = 1; i < l.length; i++) {
      assert.ok(l[i] < l[i - 1] && l[i] >= 1, `${l}`);
      assert.equal(l[i] * 4, Math.round(l[i] * 4), 'quarter steps keep the canvas whole pixels');
    }
  }
});

test('a typical frame ignores one long load frame, but sees a run that drops every other frame', () => {
  const smooth = Array(80).fill(at60);
  smooth[10] = 400; // a scene loading
  assert.ok(Math.abs(typical(smooth) - at60) < 0.5);
  // GPU-bound on a 60 Hz screen: frames last one or two refreshes (~45 fps). The median would say 60.
  const choppy = Array.from({ length: 90 }, (_, i) => (i % 3 === 2 ? 2 * at60 : at60));
  assert.ok(typical(choppy) > RS.slowMs);
});

test('a device that keeps up is left at full resolution', () => {
  const st = state(2.25);
  for (let i = 0; i < 10; i++) assert.equal(decide(at60 + 0.6, st), null);
  assert.equal(st.level, 0);
});

test('a slow GPU steps down while each step helps, then stays where it keeps up', () => {
  const st = state(2.25); // 2.25 → 1.75 → 1.5 → …
  assert.equal(decide(at30, st), 'down'); // 30 fps
  assert.equal(st.level, 1);
  assert.equal(decide(at45, st), 'down'); // faster, still slow: one more step
  assert.equal(st.level, 2);
  assert.equal(decide(at60, st), null); // keeps up now: kept
  assert.equal(st.level, 2);
  for (let i = 0; i < 5; i++) assert.equal(decide(at60, st), null); // and never hops back up
  assert.equal(st.level, 2);
});

test('a step that does not speed things up is taken back, and the resolution stays put', () => {
  // a phone in low-power mode: 30 fps whatever is drawn
  const st = state(1.75);
  assert.equal(decide(at30, st), 'down');
  assert.equal(decide(at30 - 0.3, st), 'back');
  assert.equal(st.level, 0);
  assert.ok(st.locked);
  assert.equal(decide(at30, st), null);
});

test('at 1 px per logical px there is nowhere lower to go', () => {
  const st = state(1.25);
  assert.equal(decide(at30, st), 'down');
  assert.equal(st.level, 1);
  assert.equal(decide(at45, st), null); // helped, still slow, but this is the floor
  assert.ok(st.locked);
});
