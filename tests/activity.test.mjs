import { test } from 'node:test';
import assert from 'node:assert/strict';

// Activity is a classic script on window.KL; its decision is pure and its update() only talks to the game.
globalThis.window = globalThis;
globalThis.KL = {};
await import('../js/core/Activity.js');
const { Activity, ACTIVITY } = globalThis.KL;

const here = { hidden: false, focused: true, idleMs: 0, idleLimitMs: 120000 };

test('the player is away when the tab is hidden, the window is not in front, or nothing has moved for a while', () => {
  assert.equal(Activity.reasonFor(here), null);
  assert.equal(Activity.reasonFor({ ...here, hidden: true, focused: false, idleMs: 1e9 }), 'hidden', 'a hidden tab says it all');
  assert.equal(Activity.reasonFor({ ...here, focused: false }), 'blur');
  assert.equal(Activity.reasonFor({ ...here, idleMs: 119999 }), null, 'not quite idle');
  assert.equal(Activity.reasonFor({ ...here, idleMs: 120000 }), 'idle');
});

test('?autopause=0 keeps only the hidden-tab pause', () => {
  const watch = { blur: false, idle: false };
  assert.equal(Activity.reasonFor({ ...here, focused: false, idleMs: 1e9, watch }), null);
  assert.equal(Activity.reasonFor({ ...here, hidden: true, watch }), 'hidden');
});

test('going away pauses the game and a live match; coming back resumes the game only', () => {
  const calls = [];
  const match = { autoPause: () => calls.push('match.autoPause') };
  const menu = {}; // a scene without autoPause is simply left alone
  Activity.game = { pause: () => calls.push('game.pause'), resume: () => calls.push('game.resume'), scene: { getScenes: () => [match, menu] } };
  Activity.card = null;
  Activity.active = true;
  Activity.state = { hidden: false, focused: true, last: performance.now() };
  const heard = [];
  const off = Activity.on((active, reason) => heard.push([active, reason]));

  Activity.state.focused = false; // another window in front
  Activity.update();
  assert.deepEqual(calls, ['match.autoPause', 'game.pause'], 'the match pauses itself before the loop stops');
  assert.equal(Activity.active, false);
  Activity.update(); // nothing changed: nothing happens twice
  assert.equal(calls.length, 2);

  Activity.state.focused = true;
  Activity.state.last = performance.now();
  Activity.update();
  assert.deepEqual(calls, ['match.autoPause', 'game.pause', 'game.resume'], 'the match stays on its pause menu');
  assert.deepEqual(heard, [[false, 'blur'], [true, null]]);

  Activity.state.last = performance.now() - ACTIVITY.idleSec * 1000 - 1; // nobody touched anything
  Activity.update();
  assert.deepEqual(heard.at(-1), [false, 'idle']);
  off();
});
