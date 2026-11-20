import { test } from 'node:test';
import assert from 'node:assert/strict';

// Motion is a classic script that registers itself on window.KL; its helpers are pure.
globalThis.window = globalThis;
globalThis.KL = {};
await import('../js/core/Motion.js');
const { damp, approach, angleDelta, Spring, snapHz } = globalThis.KL.Motion;

/** Run a spring for `seconds` at a fixed frame rate, recording x each frame. */
const run = (spring, seconds, fps) => {
  const xs = [];
  for (let i = 0; i < Math.round(seconds * fps); i++) xs.push(spring.step(1 / fps));
  return xs;
};

test('a squashed spring overshoots a little, then settles round', () => {
  const s = new Spring(7.5, 0.32); // the ball's tuning
  s.x = 0.3;
  const xs = run(s, 1, 60);
  const minX = Math.min(...xs);
  assert.ok(minX < 0, 'pops through into a stretch');
  assert.ok(minX > -0.3 * 0.5, `stretch stays well under the squash (got ${minX})`);
  assert.equal(s.x, 0, 'fully settled after a second');
  assert.equal(s.v, 0);
});

test('springs look the same at 30, 60 and 144 fps', () => {
  const at = (fps) => {
    const s = new Spring(7.5, 0.32);
    s.x = 0.3;
    run(s, 1 / 6, fps); // a whole number of frames at every rate tested
    return s.x;
  };
  const ref = at(60);
  for (const fps of [30, 144]) assert.ok(Math.abs(at(fps) - ref) < 0.01, `${fps} fps: ${at(fps)} vs ${ref}`);
});

test('a huge frame gap never blows a spring up', () => {
  const s = new Spring(7.5, 0.32);
  s.x = 0.3;
  s.step(5);
  assert.ok(Number.isFinite(s.x) && Math.abs(s.x) <= 0.3);
});

test('damp is frame-rate independent', () => {
  let a = 0, b = 0;
  for (let i = 0; i < 60; i++) a = damp(a, 1, 10, 1 / 60);
  for (let i = 0; i < 144; i++) b = damp(b, 1, 10, 1 / 144);
  assert.ok(Math.abs(a - b) < 1e-9);
});

test('approach accelerates linearly and never overshoots', () => {
  assert.equal(approach(0, 290, 50), 50);
  assert.equal(approach(280, 290, 50), 290);
  assert.equal(approach(0, -290, 50), -50);
  assert.equal(approach(-10, 0, 50), 0);
});

test('angleDelta takes the short way round', () => {
  assert.ok(Math.abs(angleDelta(0.1, -0.1) + 0.2) < 1e-9);
  assert.ok(Math.abs(angleDelta(Math.PI - 0.1, -Math.PI + 0.1) - 0.2) < 1e-9);
});

test('measured frame rates snap to a display refresh (never under 60)', () => {
  assert.equal(snapHz(59.7), 60);
  assert.equal(snapHz(119.2), 120);
  assert.equal(snapHz(143), 144);
  assert.equal(snapHz(38), 60);
  assert.equal(snapHz(NaN), 60);
});
