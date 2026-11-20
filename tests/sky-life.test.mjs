import { test } from 'node:test';
import assert from 'node:assert/strict';

// SkyLife is a classic script that registers itself on window.KL; its motion functions are pure.
globalThis.window = globalThis;
globalThis.KL = { TUNING: { world: { width: 1280, height: 720 } } };
await import('../js/ui/SkyLife.js');
const { SkyLife, SKY_LIFE } = globalThis.KL;
const W = 1280;
const SLOTS = 400;

test('bird flocks never overlap: each lands before the next takes off', () => {
  const flocks = [];
  for (let k = 0; k < SLOTS; k++) if (SkyLife.flock(k)) flocks.push(SkyLife.flock(k));
  assert.ok(flocks.length > SLOTS * 0.4, 'flocks should be a regular sight');
  for (let i = 1; i < flocks.length; i++) assert.ok(flocks[i - 1].start + flocks[i - 1].duration <= flocks[i].start, `flock ${flocks[i - 1].k} still flying when ${flocks[i].k} starts`);
});

test('flockAt follows a flock for its whole flight, even past the end of its slot', () => {
  for (let k = 0; k < 60; k++) {
    const f = SkyLife.flock(k);
    if (!f) continue;
    for (const t of [f.start, f.start + f.duration / 2, f.start + f.duration - 0.01]) {
      const now = SkyLife.flockAt(t);
      assert.equal(now?.f.k, k, `t=${t}`);
      assert.ok(Math.abs(now.tau - (t - f.start)) < 1e-9);
    }
    assert.notEqual(SkyLife.flockAt(f.start + f.duration)?.f.k, k);
  }
});

test('birds enter and leave out of view, and stay in the sky', () => {
  for (let k = 0; k < SLOTS; k++) {
    const f = SkyLife.flock(k);
    if (!f) continue;
    for (let i = 0; i < f.size; i++) {
      for (const tau of [0, f.duration - 1e-6]) {
        const b = SkyLife.bird(f, i, tau);
        assert.ok(b.x + b.span / 2 < 0 || b.x - b.span / 2 > W, `flock ${k} bird ${i} visible at tau=${tau} (x=${b.x})`);
      }
      for (let tau = 0; tau < f.duration; tau += 0.5) {
        const b = SkyLife.bird(f, i, tau);
        assert.ok(b.y > -20 && b.y < 280, `flock ${k} bird ${i} at y=${b.y}`); // above the stands (y 290)
        assert.ok(b.h >= -0.9 && b.h <= 0.4);
      }
    }
  }
});

test('the same moment always shows the same sky', () => {
  const t = 1234.5;
  const a = SkyLife.flockAt(t), b = SkyLife.flockAt(t);
  assert.deepEqual(a, b);
});

test('shooting stars are rare, quick, inside their slot and above the stands', () => {
  const M = SKY_LIFE.meteor;
  let n = 0;
  for (let k = 0; k < SLOTS; k++) {
    const m = SkyLife.meteor(k);
    if (!m) continue;
    n++;
    assert.ok(m.start >= k * M.slot && m.start + m.duration <= (k + 1) * M.slot);
    const endX = m.x + m.dx * m.travel, endY = m.y + m.dy * m.travel;
    assert.ok(endY < 290 && endX > 0 && endX < W, `meteor ${k} ends at ${endX},${endY}`);
  }
  assert.ok(n > SLOTS * 0.3 && n < SLOTS * 0.8);
});
