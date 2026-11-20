import { test } from 'node:test';
import assert from 'node:assert/strict';

// tuning.js and BallPhysics.js are classic scripts that register on window.KL; both are pure.
globalThis.window = globalThis;
globalThis.KL = {};
await import('../js/data/tuning.js');
await import('../js/systems/BallPhysics.js');
const { launch, simulate, step, matchWorld } = globalThis.KL.BallPhysics;
const T = globalThis.KL.TUNING;
const B = T.ball;
const world = matchWorld(T);
const ground = T.world.groundY - B.radius; // a ball's centre resting on the turf

/** A strike on a still ball at x = 0 (walls far away), run until `until` or it stops. */
const strike = (kind, opts = {}) => {
  const shot = launch(kind, 1, opts.power ?? 1, opts.carry ?? 0, B, opts.angle);
  const wide = { ...world, minX: -1e6, maxX: 1e6 };
  let apex = 0;
  const marks = {};
  const end = simulate({ x: 0, y: ground, ...shot }, B, wide, (s, t) => {
    apex = Math.max(apex, ground - s.y);
    for (const m of opts.marks || []) if (!(m in marks) && s.x >= m) marks[m] = { t, height: ground - s.y };
    return opts.until?.(s, t);
  }, { maxT: opts.maxT ?? 6, hz: opts.hz });
  return { end, apex, marks, landed: end.landed };
};

test('J — the straight kick is a fast, low drive', () => {
  const { apex, marks, landed } = strike('low', { marks: [520] });
  assert.ok(marks[520].t < 0.65, `centre circle to goal in ${marks[520].t.toFixed(2)} s`);
  assert.ok(apex < 60, `stays low (apex ${apex.toFixed(0)} px), well under the bar`);
  assert.ok(landed.x > 220, `skims a long way before the first bounce (${landed.x.toFixed(0)} px)`);
});

test('J from your own box still rolls into the far goal', () => {
  const { end } = strike('low');
  assert.ok(end.x > 950, `rolled ${end.x.toFixed(0)} px`);
});

test('K — the long kick climbs high and carries far, fast', () => {
  const { apex, landed, marks } = strike('high', { marks: [400] });
  assert.ok(apex > 210 && apex < 320, `apex ${apex.toFixed(0)} px: over a jumping player and the bar`);
  assert.ok(landed.x > 750 && landed.x < 1000, `first lands ${landed.x.toFixed(0)} px away`);
  assert.ok(landed.t < 1.4, `in the air ${landed.t.toFixed(2)} s`);
  assert.ok(marks[400].t < 0.6, `400 px out in ${marks[400].t.toFixed(2)} s`);
});

test('K is a genuinely longer kick than J in the air, and J is the quicker one to the goal', () => {
  const j = strike('low', { marks: [520] });
  const k = strike('high', { marks: [520] });
  assert.ok(k.landed.x > j.landed.x * 2, `K first bounce ${k.landed.x.toFixed(0)} vs J ${j.landed.x.toFixed(0)}`);
  assert.ok(j.marks[520].t < k.marks[520].t, 'J gets there first');
});

test('the long kick clears a rival standing 220 px away', () => {
  const S = T.player.scale;
  const head = T.player.bodyHeight * S; // top of the head above the turf
  const near = 220 - (T.player.bodyWidth * S) / 2 - B.radius; // ball centre where its edge reaches their body
  const { marks } = strike('high', { marks: [near] });
  // `height` is how far the centre has risen from resting on the turf = the ball's underside above the turf
  assert.ok(marks[near].height > head, `ball underside ${marks[near].height.toFixed(0)} px up vs head ${head.toFixed(0)} px`);
});

test('spin bends the flight: backspin floats a long ball, topspin dips a drive', () => {
  const k = launch('high', 1, 1, 0, B);
  const wide = { ...world, minX: -1e6, maxX: 1e6 };
  const run = (omega) => simulate({ x: 0, y: ground, ...k, omega }, B, wide, (s) => s.landed).landed;
  // (on a steep ball the lift mostly buys hang time: on the way up it leans back against the flight)
  assert.ok(run(k.omega).x > run(0).x + 20, 'backspin carries further');
  assert.ok(run(k.omega).t > run(0).t + 0.05, 'and hangs longer');
  const j = launch('low', 1, 1, 0, B);
  const runJ = (omega) => simulate({ x: 0, y: ground, ...j, omega }, B, wide, (s) => s.landed).landed.x;
  assert.ok(runJ(j.omega) < runJ(0), 'topspin brings the drive down sooner');
});

test('a backspun ball checks up when it lands; a topspun one skips on', () => {
  const land = (omega) => {
    const s = { vx: 500, vy: 400, omega };
    step(s, 1 / 60, 'bounce', B, B.radius);
    return s.vx;
  };
  assert.ok(land(-16) < land(0), 'backspin bites');
  assert.ok(land(500 / B.radius) > land(0), 'topspin keeps its pace');
  assert.ok(Math.abs(land(500 / B.radius) - 500) < 1, 'a ball already rolling loses nothing to the skid');
});

test('rolling: a dribble touch stops within ~200 px, a still ball stays still', () => {
  const r = simulate({ x: 0, y: ground, vx: 350, vy: 0, omega: 350 / B.radius }, B, { ...world, minX: -1e6, maxX: 1e6 }, null, { maxT: 6 });
  assert.ok(r.x > 120 && r.x < 240, `rolled ${r.x.toFixed(0)} px`);
  assert.equal(r.vx, 0);
  const still = { vx: 0, vy: 0, omega: 0 };
  step(still, 1 / 60, 'roll', B, B.radius);
  assert.equal(still.vx, 0);
});

test('run-up and power go into the strike', () => {
  const base = strike('low', { marks: [520] }).marks[520].t;
  assert.ok(strike('low', { marks: [520], carry: 395 * B.carry }).marks[520].t < base, 'sprinting into it hits harder');
  assert.ok(strike('high', { power: 1.075 }).landed.x > strike('high', { power: 0.925 }).landed.x, 'a power legend kicks further');
});

test('a header aims by contact: nodded down goes down, under the ball loops up', () => {
  const down = launch('header', 1, 1, 0, B, -15), up = launch('header', 1, 1, 0, B, 30);
  assert.ok(down.vy > 0 && up.vy < 0);
  assert.ok(Math.abs(Math.hypot(down.vx, down.vy) - B.kicks.header.speed) < 1e-6);
});

test('the same flight at 60, 120 and 144 Hz (physics steps at the display rate)', () => {
  const at = (hz) => strike('high', { hz }).landed.x;
  const ref = at(60);
  for (const hz of [120, 144]) assert.ok(Math.abs(at(hz) - ref) < ref * 0.03, `${hz} Hz lands at ${at(hz).toFixed(0)} vs ${ref.toFixed(0)}`);
});

test('the side walls bounce the ball back into play', () => {
  const s = simulate({ x: world.maxX - 10, y: ground, vx: 800, vy: 0, omega: 0 }, B, world, (st, t) => t > 0.2);
  assert.ok(s.x < world.maxX && s.vx < 0);
});
