import { test } from 'node:test';
import assert from 'node:assert/strict';

// Stadium is a classic script that registers itself on window.KL; its crowd line-up is pure.
globalThis.window = globalThis;
globalThis.KL = { TUNING: { world: { width: 1280, height: 720 } } };
await import('../js/ui/Stadium.js');
const { Stadium } = globalThis.KL;

/** Small seeded PRNG (mulberry32), so every run checks the same line-ups. */
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const types = Array.from({ length: 27 }, (_, i) => `fan/${'abc'[Math.floor(i / 9)]}${String(i % 9).padStart(2, '0')}`);
const rows = Array.from({ length: 200 }, (_, s) => Stadium.lineup({ x0: -217, x1: 1497, gap: 17 + (s % 2) * 4, types, flags: 0.1, rand: seeded(s + 1) }));

test('the crowd is split about half and half between the two players', () => {
  let total = 0, home = 0;
  for (const row of rows) {
    const n0 = row.filter((f) => f.team === 0).length;
    assert.ok(Math.abs(n0 - (row.length - n0)) <= 2, `the sides never more than 2 fans apart (${n0} vs ${row.length - n0})`);
    total += row.length;
    home += n0;
  }
  assert.ok(Math.abs(home / total - 0.5) < 0.02, `overall ${(home / total * 100).toFixed(1)} % for player 1`);
});

test('the two sides stand mixed, in little groups of 1–3', () => {
  for (const row of rows) {
    let run = 1, changes = 0;
    for (let i = 1; i < row.length; i++) {
      if (row[i].team === row[i - 1].team) run++;
      else (run = 1), changes++;
      assert.ok(run <= 3, `a group of ${run}`);
    }
    assert.ok(changes > row.length / 3, 'the sides take turns all along the stand');
  }
});

test('the row spans the whole stand, neighbours a gap apart', () => {
  for (const row of rows) {
    assert.ok(row[0].x <= -217 + 1e-9 && row.at(-1).x >= 1497 - 25, 'covers both margins');
    for (let i = 1; i < row.length; i++) {
      const d = row[i].x - row[i - 1].x;
      assert.ok(d > 0 && d <= 21 * 1.15 + 1e-9, `gap ${d}`);
    }
  }
});

test('nobody stands near their double', () => {
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      for (let j = i + 1; j < Math.min(row.length, i + 7); j++) assert.notEqual(row[i].type, row[j].type, `${row[i].type} at ${i} and ${j}`);
    }
  }
});

test('some fans of each side wave flags', () => {
  const flags = rows.flat().filter((f) => f.flag);
  const share = flags.length / rows.flat().length;
  assert.ok(share > 0.07 && share < 0.13, `${(share * 100).toFixed(1)} % with flags`);
  assert.ok(flags.some((f) => f.team === 0) && flags.some((f) => f.team === 1));
});
