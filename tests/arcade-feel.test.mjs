import { test } from 'node:test';
import assert from 'node:assert/strict';

// The arcade feel: heavy players, a floaty ball, restarts from the sky, a CPU with a mind of its own.
// tuning.js, BallPhysics.js and AIBrain.js are classic scripts that register on window.KL.
globalThis.window = globalThis;
globalThis.KL = {};
await import('../js/data/tuning.js');
await import('../js/systems/BallPhysics.js');
await import('../js/systems/AIBrain.js');
const { launch, simulate, matchWorld } = globalThis.KL.BallPhysics;
const T = globalThis.KL.TUNING;
const B = T.ball;
const world = matchWorld(T);
const wide = { ...world, minX: -1e6, maxX: 1e6 };
const ground = T.world.groundY - B.radius;

test('the ball hangs while the players drop', () => {
  assert.equal(world.gravity, B.gravity, 'the ball flies under its own gravity');
  assert.ok(B.gravity > 350 && B.gravity < 700, `ball gravity ${B.gravity.toFixed(0)} px/s²`);
  assert.ok(T.world.gravity > 5 * B.gravity, 'players fall far faster than the ball');
});

test('a jump is snappy: about their own height, up and down in ~0.6 s', () => {
  const v = -T.player.jumpVelocity, g = T.world.gravity;
  const height = (v * v) / (2 * g), air = (2 * v) / g;
  assert.ok(height > 125 && height < 160, `jumps ${height.toFixed(0)} px`);
  assert.ok(air > 0.5 && air < 0.7, `in the air ${air.toFixed(2)} s`);
});

test('BALL_TIME only stretches the clock: a long ball lands on the same spot, later', () => {
  const k = B.time;
  // the same ball played at real pace: speeds and rates × k, accelerations × k²
  const real = structuredClone(B);
  real.gravity *= k * k;
  for (const K of Object.values(real.kicks)) (K.speed *= k), (K.spin *= k);
  real.maxSpin *= k;
  Object.assign(real.air, { dragLin: B.air.dragLin * k, magnusMax: B.air.magnusMax * k * k, spinDecay: B.air.spinDecay * k });
  Object.assign(real.turf, { roll: B.turf.roll * k * k, rollLin: B.turf.rollLin * k, spinGrip: B.turf.spinGrip * k, bounceMinVy: B.turf.bounceMinVy * k });
  const fly = (cfg, g) => simulate({ x: 0, y: ground, ...launch('high', 1, 1, 0, cfg) }, cfg, { ...wide, gravity: g }, (s) => s.landed, { maxT: 8 }).landed;
  const slow = fly(B, B.gravity), fast = fly(real, real.gravity);
  assert.ok(Math.abs(slow.x - fast.x) < fast.x * 0.02, `lands ${slow.x.toFixed(0)} vs ${fast.x.toFixed(0)} px`);
  assert.ok(Math.abs(slow.t / fast.t - k) < k * 0.03, `${(slow.t / fast.t).toFixed(2)}× the time`);
});

test('a ball dropped from the sky bounces back to about half its height', () => {
  const drop = 450;
  let fell = false, apex = Infinity;
  simulate({ x: 0, y: ground - drop, vx: 0, vy: 0, omega: 0 }, B, wide, (s) => {
    if (s.landed) fell = true;
    if (fell) apex = Math.min(apex, s.y);
    return fell && s.vy > 0; // past the top of the first bounce
  }, { maxT: 6 });
  const ratio = (ground - apex) / drop;
  assert.ok(ratio > 0.45 && ratio < 0.62, `bounces back to ${(ratio * 100).toFixed(0)} % of the drop`);
});

test('the kickoff ball drops in from above the stadium onto the centre spot', () => {
  const S = B.serve;
  const s = simulate({ x: T.world.width / 2, y: S.dropY, vx: 0, vy: 0, omega: 0 }, B, world, (st) => st.landed, { maxT: 4 });
  assert.ok(s.landed.t > 1.0 && s.landed.t < 1.9, `lands after ${s.landed.t.toFixed(2)} s`);
  assert.equal(Math.round(s.landed.x), T.world.width / 2);
});

test('after a goal the serve comes down just in front of whoever conceded', () => {
  const S = B.serve, W = T.world.width;
  const spot = W * 0.3, body = (T.player.bodyWidth * T.player.scale) / 2; // player 0's kickoff spot (Match.kickoff)
  for (const jitter of [1 - S.serveJitter, 1, 1 + S.serveJitter]) {
    // conceded by player 0 (defends the left goal): served leftwards, landing between them and the centre
    const s = simulate({ x: W / 2, y: S.dropY, vx: -S.serveVx * jitter, vy: 0, omega: 0 }, B, world, (st) => st.landed, { maxT: 4 });
    assert.ok(s.landed.x > spot + body + B.radius && s.landed.x < W / 2 - 40, `lands at ${s.landed.x.toFixed(0)} px`);
    // and if they just stand there, it bounces into them — not over their head and on into their goal
    const front = spot + body + B.radius;
    const at = simulate({ x: W / 2, y: S.dropY, vx: -S.serveVx * jitter, vy: 0, omega: 0 }, B, world, (st) => st.x <= front, { maxT: 15 });
    const height = ground - at.y, head = T.player.bodyHeight * T.player.scale;
    assert.ok(at.x <= front + 0.5 && height < head - B.radius, `meets them ${height.toFixed(0)} px up (head ${head.toFixed(0)})`);
  }
});

test('a dribble touch hops the ball along about knee high', () => {
  const hop = (vy) => {
    let top = 0;
    simulate({ x: 0, y: ground, vx: T.player.runSpeed * 1.2, vy: -vy, omega: 0 }, B, wide, (s) => {
      top = Math.max(top, ground - s.y);
      return s.landed;
    }, { maxT: 3 });
    return top;
  };
  const P = T.body;
  const lo = hop(P.dribblePop * (1 - P.dribbleJitter)), mid = hop(P.dribblePop), hi = hop(P.dribblePop * (1 + P.dribbleJitter));
  assert.ok(mid > 25 && mid < 45, `a full-pace touch hops ${mid.toFixed(0)} px`);
  assert.ok(lo > 12 && hi < 65, `never the same twice: ${lo.toFixed(0)}–${hi.toFixed(0)} px`);
});

test('the CPU picks a plan for each possession by weight', () => {
  const pick = globalThis.KL.AIBrain.pickWeighted;
  const w = { dribble: 0.5, shoot: 0.3, lob: 0.2 };
  assert.deepEqual([0, 0.49, 0.5, 0.79, 0.8, 0.999].map((r) => pick(w, r)), ['dribble', 'dribble', 'shoot', 'shoot', 'lob', 'lob']);
  const n = { dribble: 0, shoot: 0, lob: 0 };
  for (let i = 0; i < 20000; i++) n[pick(w)]++;
  for (const k of Object.keys(w)) assert.ok(Math.abs(n[k] / 20000 - w[k]) < 0.02, `${k}: ${(n[k] / 200).toFixed(1)} %`);
  assert.equal(pick({ a: 0, b: 1 }, 0), 'b', 'a zero weight is never picked');
});
