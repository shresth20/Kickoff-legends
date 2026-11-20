import { test } from 'node:test';
import assert from 'node:assert/strict';

// Viewport.js is a classic browser script: give it just enough of a browser to load. Its view maths
// (KL.View.compute / uiScale) is pure.
globalThis.window = globalThis;
globalThis.KL = { TUNING: { world: { width: 1280, height: 720 } } };
globalThis.Phaser = { Events: { EventEmitter: class { on() {} off() {} emit() {} } } };
globalThis.document = {
  documentElement: { classList: { toggle() {} } },
  body: { appendChild() {} },
  getElementById: () => null,
  createElement: () => ({}),
  querySelector: () => null,
};
globalThis.getComputedStyle = () => ({});
Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 0, userAgent: 'node', platform: 'node' }, configurable: true });
globalThis.screen = { width: 1280, height: 720 };
globalThis.location = { search: '' };
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
await import('../js/core/Viewport.js');
const { View } = globalThis.KL;
const W = 1280, H = 720;

const contains = (v) => v.x <= 0 && v.y <= 0 && v.x + v.w >= W && v.y + v.h >= H;

test('16:9 is exactly the design area', () => {
  const v = View.compute({ cssW: 1920, cssH: 1080 });
  assert.deepEqual([v.w, v.h, v.x, v.y, v.left, v.right, v.top, v.bottom], [1280, 720, 0, 0, 0, 1280, 0, 720]);
  assert.equal(v.fills, true);
  assert.equal(v.css, 1.5);
});

test('a wide phone sees more stadium at the sides, the design area centred', () => {
  const v = View.compute({ cssW: 844, cssH: 390 }); // iPhone 14, landscape
  assert.equal(v.h, 720);
  assert.ok(Math.abs(v.w / v.h - 844 / 390) < 0.01, 'same shape as the screen');
  assert.equal(v.w % 4, 0, 'whole canvas pixels at every quarter-step resolution');
  assert.equal(v.x, (W - v.w) / 2);
  assert.ok(contains(v));
});

test('a tablet sees more sky: the design area stands on the bottom edge', () => {
  const v = View.compute({ cssW: 1024, cssH: 768 }); // iPad, 4:3
  assert.deepEqual([v.w, v.h, v.x, v.y], [1280, 960, 0, -240]);
  assert.equal(v.bottom, 720, 'the pitch and the pad keep the bottom edge');
  assert.ok(contains(v));
});

test('safe-area insets move the UI edges in, in logical px', () => {
  const v = View.compute({ cssW: 844, cssH: 390, safe: { l: 47, r: 47, b: 21 } });
  // the view is rounded to multiples of 4 px, so the canvas overhangs the screen by up to ~1 logical px
  const near = (a, b) => Math.abs(a - b) < 1.5;
  assert.ok(near(v.left, v.x + 47 / v.css));
  assert.ok(near(v.right, v.x + v.w - 47 / v.css));
  assert.ok(near(v.bottom, H - 21 / v.css));
  assert.ok(near(v.top, 0));
  assert.equal(v.cx, (v.left + v.right) / 2);
});

test('shapes beyond the limits letterbox, and a letterbox bar absorbs the inset', () => {
  const tall = View.compute({ cssW: 600, cssH: 900, safe: { t: 40 } }); // portrait desktop window
  assert.equal(tall.fills, false);
  assert.deepEqual([tall.w, tall.h], [1280, 960]); // clamped to 4:3
  assert.equal(tall.top, tall.y, 'the bar above the canvas is taller than the inset');
  const ultra = View.compute({ cssW: 3600, cssH: 1000 });
  assert.equal(ultra.fills, false);
  assert.equal(ultra.w, Math.round((720 * View.LIMITS.maxAspect) / 4) * 4);
});

test('the widest view stays inside the stadium (margin 280, ±32 px parallax drift)', () => {
  const widest = View.compute({ cssW: 2400, cssH: 1000 });
  assert.ok(-widest.x + 32 <= 280);
  const tallest = View.compute({ cssW: 1000, cssH: 1000 });
  assert.ok(tallest.y >= -300, 'the sky reaches up to -300 (KL.STADIUM_LAYOUT.sky.capTo)');
});

test('UI scale: thumb-sized on phones, unchanged on tablets and desktops', () => {
  assert.equal(View.uiScale(false, 844, 390), 1);
  assert.equal(View.uiScale(true, 844, 390), 1.35); // iPhone 14
  assert.equal(View.uiScale(true, 667, 375), 1.4); // iPhone SE: capped
  assert.equal(View.uiScale(true, 1080, 810), 1); // iPad
  assert.equal(View.uiScale(true, 1280, 800), 1); // 16:10 tablet
});
