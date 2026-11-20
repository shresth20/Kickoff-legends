import { test } from 'node:test';
import assert from 'node:assert/strict';

// MatchRules is a classic script that registers itself on window.KL; give it a minimal global.
globalThis.window = globalThis;
globalThis.KL = { TUNING: { match: { durationSec: 90, suddenDeathSec: 30, kickoffCountdownMs: 1000, goalFreezeMs: 1500 } } };
await import('../js/systems/MatchRules.js');
const { MatchRules } = globalThis.KL;

const run = (rules, ms, step = 16) => {
  const events = [];
  for (let t = 0; t < ms; t += step) events.push(...rules.tick(step));
  return events;
};

test('countdown leads to kickoff, clock then counts down', () => {
  const r = new MatchRules();
  const ev = run(r, 1100);
  assert.ok(ev.some((e) => e.type === 'kickoff'));
  assert.equal(r.state.phase, 'play');
  run(r, 5000);
  assert.ok(r.secondsLeft <= 85 && r.secondsLeft >= 84);
});

test('goal freezes, then resets to a kickoff countdown', () => {
  const r = new MatchRules();
  run(r, 1100);
  assert.equal(r.goal(0), true);
  assert.deepEqual(r.state.score, [1, 0]);
  assert.equal(r.state.phase, 'goal');
  const ev = run(r, 1600);
  assert.ok(ev.some((e) => e.type === 'reset'));
  assert.equal(r.state.phase, 'countdown');
  assert.equal(r.goal(1), false, 'no goals during countdown');
});

test('draw at full time goes to sudden death; first goal wins', () => {
  const r = new MatchRules({ durationSec: 2, suddenDeathSec: 30 });
  run(r, 1100);
  const ev = run(r, 2100);
  assert.ok(ev.some((e) => e.type === 'suddendeath'));
  assert.equal(r.state.suddenDeath, true);
  run(r, 1100); // sudden death kickoff
  assert.equal(r.state.phase, 'suddendeath');
  r.goal(1);
  const end = run(r, 1600);
  assert.ok(end.some((e) => e.type === 'fulltime'));
  assert.equal(r.state.winner, 1);
});

test('sudden death with no goal ends in a draw', () => {
  const r = new MatchRules({ durationSec: 1, suddenDeathSec: 1 });
  run(r, 1100);
  run(r, 1100); // full time → sudden death countdown
  run(r, 1100); // kickoff
  const ev = run(r, 1200);
  assert.ok(ev.some((e) => e.type === 'fulltime'));
  assert.equal(r.state.winner, null);
});

test('leader at full time wins', () => {
  const r = new MatchRules({ durationSec: 1 });
  run(r, 1100);
  r.goal(0);
  run(r, 1600); // freeze
  run(r, 1100); // countdown
  const ev = run(r, 1200);
  assert.ok(ev.some((e) => e.type === 'fulltime'));
  assert.equal(r.state.winner, 0);
});
