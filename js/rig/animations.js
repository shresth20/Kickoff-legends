// Every character animation, as keyframes on the rig in js/rig/parts.js.
//
// Tracks:
//   "<bone>.r"            rotation in degrees. + is clockwise: legs and arms
//                         swing back (toward screen left), torso and head lean
//                         forward (characters face right).
//   "<bone>.x" / ".y"     offsets in rig units (+y is down).
//   "root.sx" / "root.sy" squash and stretch.
//   "ikF" / "ikB"         near/far foot target [x, y] relative to the ground
//                         point; build them with footF/footB. A leg on IK reads
//                         its "boot.r" relative to the ground.
//   "eyes" / "mouth"      face piece names from FC.FACE.
// Keys are [time, value, ease]; ease shapes the motion arriving at that key
// (default "inOut"). Channels an animation leaves out come from FC.STANCE.
(function () {
  const G = FC.ANKLE_Y;
  const hipX = name => FC.SKELETON.find(b => b.name === name).at[0];
  const HIP_F = hipX('thighF');
  const HIP_B = hipX('thighB');
  // dx: foot distance in front of its own hip. lift: ankle height above the ground.
  const footF = (dx, lift = 0) => [HIP_F + dx, G - lift];
  const footB = (dx, lift = 0) => [HIP_B + dx, G - lift];
  const STAND_F = footF(-4);
  const STAND_B = footB(6);

  FC.STANCE = {
    'hip.y': 3,
    ikF: STAND_F,
    ikB: STAND_B,
    'torso.r': 3,
    'head.r': -2,
    'armF.r': 10, 'foreF.r': -16,
    'armB.r': -10, 'foreB.r': -16,
  };

  // Run cycles are generated so run, sprint and backpedal stay consistent.
  function makeRun({ duration, stride, lift, bob, lean, arm, face, reverse = false }) {
    // One foot's path: contact, under the hip, push-off, lift, reach. [phase, dx, lift, boot angle]
    const path = [
      [0.0, 30, 0, -10],
      [0.2, 0, 0, 0],
      [0.4, -33, 3, 30],
      [0.6, -15, 39, 40],
      [0.8, 33, 21, -10],
      [1.0, 30, 0, -10],
    ].map(([p, dx, up, boot]) => [p, dx * stride, up * lift, boot]);

    const at = phase => {
      phase -= Math.floor(phase);
      let i = 1;
      while (path[i][0] < phase) i++;
      const a = path[i - 1], b = path[i];
      const k = (phase - a[0]) / (b[0] - a[0]);
      return [1, 2, 3].map(j => a[j] + (b[j] - a[j]) * k);
    };

    // Sampled densely with linear keys so the cycle never eases to a stop.
    const phases = Array.from({ length: 21 }, (_, i) => i / 20);
    const track = fn => phases.map(p => [p * duration, fn(p), 'linear']);
    const wave = (p, cycles) => Math.cos(p * cycles * 2 * Math.PI);

    const tracks = {
      ikF: track(p => footF(at(p)[0], at(p)[1])),
      ikB: track(p => footB(at(p + 0.5)[0], at(p + 0.5)[1])),
      'bootF.r': track(p => at(p)[2]),
      'bootB.r': track(p => at(p + 0.5)[2]),
      // Lowest just after each foot lands, highest at push-off.
      'hip.y': track(p => bob * (1.5 + 1.5 * wave(p - 0.1, 2))),
      'torso.r': track(p => lean + 2 * wave(p, 2)),
      'head.r': track(() => -lean * 0.5),
      // Arms swing opposite to the legs.
      'armF.r': track(p => 5 + arm * wave(p, 1)),
      'foreF.r': track(p => -55 + 25 * wave(p, 1)),
      'armB.r': track(p => -5 - arm * wave(p, 1)),
      'foreB.r': track(p => -55 - 25 * wave(p, 1)),
    };
    if (face) {
      tracks.eyes = [[0, face[0]]];
      tracks.mouth = [[0, face[1]]];
    }
    if (reverse) {
      for (const key in tracks) {
        tracks[key] = tracks[key].map(([t, v, e]) => [duration - t, v, e]).reverse();
      }
    }
    return { duration, loop: true, tracks };
  }

  FC.ANIMATIONS = {
    idle: { duration: 1, loop: true, tracks: {
      'hip.y': [[0, 3], [0.5, 7], [1, 3]],
      'torso.r': [[0, 3], [0.5, 5], [1, 3]],
      'head.r': [[0, -2], [0.55, 1], [1, -2]],
      'armF.r': [[0, 10], [0.5, 13], [1, 10]],
      'foreF.r': [[0, -16], [0.5, -22], [1, -16]],
      'armB.r': [[0, -10], [0.5, -13], [1, -10]],
      'foreB.r': [[0, -16], [0.5, -22], [1, -16]],
    } },

    run: makeRun({ duration: 0.5, stride: 1, lift: 1, bob: 3, lean: 12, arm: 40 }),
    run_back: makeRun({ duration: 0.5, stride: 0.7, lift: 0.7, bob: 2, lean: -4, arm: 20, reverse: true }),
    sprint: makeRun({ duration: 0.4, stride: 1.3, lift: 1.2, bob: 4, lean: 22, arm: 60, face: ['angry', 'grit'] }),

    jump_start: { duration: 0.12, tracks: {
      'hip.y': [[0, 3], [0.06, 24], [0.12, -9, 'out']],
      'torso.r': [[0, 3], [0.06, 18], [0.12, 0]],
      // Arms swing back, then fling up and out to the sides.
      'armF.r': [[0, 10], [0.06, 40], [0.12, 150, 'out']],
      'armB.r': [[0, -10], [0.06, 20], [0.12, -140, 'out']],
      'root.sx': [[0, 1], [0.06, 1.06], [0.12, 0.95]],
      'root.sy': [[0, 1], [0.06, 0.92], [0.12, 1.06]],
      eyes: [[0, 'angry']],
      mouth: [[0, 'grit']],
    } },

    jump_up: { duration: 0.4, loop: true, tracks: {
      'hip.y': [[0, 0]],
      ikF: [[0, footF(15, 42)], [0.2, footF(18, 48)], [0.4, footF(15, 42)]],
      ikB: [[0, footB(-3, 54)], [0.2, footB(0, 60)], [0.4, footB(-3, 54)]],
      'bootF.r': [[0, 20]],
      'bootB.r': [[0, 30]],
      'torso.r': [[0, 0]],
      'armF.r': [[0, 150], [0.2, 160], [0.4, 150]],
      'foreF.r': [[0, 10]],
      'armB.r': [[0, -140], [0.2, -150], [0.4, -140]],
      'foreB.r': [[0, -10]],
      mouth: [[0, 'smile']],
    } },

    jump_down: { duration: 0.4, loop: true, tracks: {
      'hip.y': [[0, 0]],
      ikF: [[0, footF(12, 9)], [0.2, footF(15, 12)], [0.4, footF(12, 9)]],
      ikB: [[0, footB(-12, 18)], [0.2, footB(-9, 21)], [0.4, footB(-12, 18)]],
      'bootF.r': [[0, -6]],
      'bootB.r': [[0, 10]],
      'torso.r': [[0, 2]],
      'armF.r': [[0, 70], [0.2, 80], [0.4, 70]],
      'foreF.r': [[0, -15]],
      'armB.r': [[0, -70], [0.2, -80], [0.4, -70]],
      'foreB.r': [[0, -15]],
    } },

    land: { duration: 0.15, tracks: {
      'hip.y': [[0, 0], [0.05, 27, 'out'], [0.15, 3]],
      'torso.r': [[0, 2], [0.05, 16, 'out'], [0.15, 3]],
      'armF.r': [[0, 70], [0.05, 30], [0.15, 10]],
      'armB.r': [[0, -70], [0.05, -30], [0.15, -10]],
      'root.sx': [[0, 1.08], [0.05, 1.1], [0.15, 1]],
      'root.sy': [[0, 0.9], [0.05, 0.88], [0.15, 1]],
    } },

    // J: low drive with the near leg.
    kick_low: { duration: 0.3, events: { contact: 0.12 }, tracks: {
      'hip.y': [[0, 3], [0.07, 9], [0.12, 0], [0.3, 3]],
      'thighF.r': [[0, -11], [0.07, 40, 'out'], [0.12, -60, 'in'], [0.18, -75, 'out'], [0.3, -11]],
      'shinF.r': [[0, 26], [0.07, 75, 'out'], [0.12, 10, 'in'], [0.18, 5], [0.3, 26]],
      'bootF.r': [[0, -15], [0.07, 10], [0.12, 20], [0.18, 25], [0.3, -15]],
      'torso.r': [[0, 3], [0.07, -6], [0.12, 10], [0.18, 14], [0.3, 3]],
      'head.r': [[0, -2], [0.12, -8], [0.3, -2]],
      'armF.r': [[0, 10], [0.07, -40], [0.12, 40], [0.3, 10]],
      'foreF.r': [[0, -16], [0.07, -40], [0.3, -16]],
      'armB.r': [[0, -10], [0.07, 40], [0.12, -50], [0.3, -10]],
      'foreB.r': [[0, -16], [0.12, -50], [0.3, -16]],
      eyes: [[0, 'angry'], [0.26, 'open']],
      mouth: [[0, 'grit'], [0.1, 'shout'], [0.24, 'neutral']],
    } },

    // K: scooping kick that lifts the ball.
    kick_high: { duration: 0.33, events: { contact: 0.14 }, tracks: {
      'hip.y': [[0, 3], [0.08, 9], [0.14, -6], [0.33, 3]],
      ikB: [[0, STAND_B], [0.14, footB(6, 9)], [0.33, STAND_B]],
      'bootB.r': [[0, 0], [0.14, 25], [0.33, 0]],
      'thighF.r': [[0, -11], [0.08, 45, 'out'], [0.14, -110, 'in'], [0.2, -130, 'out'], [0.33, -11]],
      'shinF.r': [[0, 26], [0.08, 80, 'out'], [0.14, 15, 'in'], [0.2, 5], [0.33, 26]],
      'bootF.r': [[0, -15], [0.08, 10], [0.14, 25], [0.33, -15]],
      'torso.r': [[0, 3], [0.08, -4], [0.14, -18], [0.2, -22], [0.33, 3]],
      'head.r': [[0, -2], [0.14, -10], [0.33, -2]],
      'armF.r': [[0, 10], [0.08, -40], [0.14, 50], [0.33, 10]],
      'armB.r': [[0, -10], [0.08, 30], [0.14, -70], [0.33, -10]],
      eyes: [[0, 'angry'], [0.28, 'open']],
      mouth: [[0, 'grit'], [0.12, 'shout'], [0.28, 'neutral']],
    } },

    // J/K in the air.
    air_kick: { duration: 0.25, events: { contact: 0.1 }, tracks: {
      'hip.y': [[0, 0]],
      ikB: [[0, footB(-3, 51)]],
      'bootB.r': [[0, 30]],
      'thighF.r': [[0, -40], [0.06, 30, 'out'], [0.1, -95, 'in'], [0.16, -100], [0.25, -35]],
      'shinF.r': [[0, 60], [0.06, 90, 'out'], [0.1, 5, 'in'], [0.16, 5], [0.25, 50]],
      'bootF.r': [[0, 0], [0.1, 25], [0.25, 0]],
      'torso.r': [[0, 0], [0.06, -8], [0.1, -22], [0.16, -24], [0.25, -4]],
      'root.r': [[0, 0], [0.1, -12], [0.25, 0]],
      'armF.r': [[0, 70], [0.06, -40], [0.1, 60], [0.25, 70]],
      'armB.r': [[0, -70], [0.06, -120], [0.1, -150], [0.25, -70]],
      eyes: [[0, 'angry']],
      mouth: [[0, 'grit'], [0.08, 'shout'], [0.2, 'grit']],
    } },

    // Upper body only, so it also works as an overlay while running or jumping.
    header: { duration: 0.2, events: { contact: 0.08 }, tracks: {
      'head.r': [[0, -2], [0.05, -18, 'out'], [0.08, 18, 'in'], [0.12, 20], [0.2, -2]],
      'torso.r': [[0, 3], [0.05, -8], [0.08, 16, 'in'], [0.12, 18], [0.2, 3]],
      'armF.r': [[0, 10], [0.05, 30], [0.08, -10], [0.2, 10]],
      'armB.r': [[0, -10], [0.05, 35], [0.08, 5], [0.2, -10]],
      eyes: [[0, 'angry'], [0.07, 'closed'], [0.14, 'angry']],
      mouth: [[0, 'grit']],
    } },

    // I: charge, wind up, power kick. The game fires the skill on "release".
    skill: { duration: 0.6, events: { release: 0.36 }, tracks: {
      'hip.y': [[0, 3], [0.1, 12], [0.2, 9], [0.3, 9], [0.36, 0], [0.44, 3], [0.6, 3]],
      ikB: [[0, STAND_B], [0.1, footB(-24)], [0.5, footB(-24)], [0.6, STAND_B]],
      'thighF.r': [[0, -11], [0.1, -30], [0.2, -22], [0.3, 55, 'out'], [0.33, 58], [0.36, -85, 'in'], [0.44, -110, 'out'], [0.6, -11]],
      'shinF.r': [[0, 26], [0.1, 50], [0.2, 34], [0.3, 90, 'out'], [0.33, 92], [0.36, 10, 'in'], [0.44, 0], [0.6, 26]],
      'bootF.r': [[0, -15], [0.1, -20], [0.2, -12], [0.3, 10], [0.36, 25], [0.6, -15]],
      'torso.r': [[0, 3], [0.1, 22], [0.2, -12], [0.3, -10], [0.36, 22, 'in'], [0.44, 26], [0.6, 3]],
      'head.r': [[0, -2], [0.1, 10], [0.2, -16], [0.36, -6], [0.6, -2]],
      'armF.r': [[0, 10], [0.1, -35], [0.2, 50], [0.3, 60], [0.36, 75, 'in'], [0.44, 85], [0.6, 10]],
      'foreF.r': [[0, -16], [0.1, -110], [0.2, -40], [0.36, -20], [0.6, -16]],
      'armB.r': [[0, -10], [0.1, -30], [0.2, 60], [0.3, 70], [0.36, -70, 'in'], [0.6, -10]],
      'foreB.r': [[0, -16], [0.1, -110], [0.2, -40], [0.6, -16]],
      'root.sx': [[0, 1], [0.1, 1.06], [0.2, 0.96], [0.3, 0.98], [0.36, 1.04], [0.44, 1], [0.6, 1]],
      'root.sy': [[0, 1], [0.1, 0.94], [0.2, 1.05], [0.3, 1.02], [0.36, 0.96], [0.44, 1], [0.6, 1]],
      eyes: [[0, 'angry'], [0.54, 'open']],
      mouth: [[0, 'grit'], [0.18, 'shout'], [0.3, 'grit'], [0.34, 'shout'], [0.54, 'neutral']],
    } },

    hit: { duration: 0.25, tracks: {
      'root.r': [[0, 0], [0.05, -10, 'out'], [0.25, -3]],
      'hip.y': [[0, 3], [0.05, 9], [0.25, 9]],
      ikF: [[0, STAND_F], [0.05, footF(12)]],
      'torso.r': [[0, 3], [0.05, -24, 'out'], [0.25, -8]],
      'head.r': [[0, -2], [0.05, -20, 'out'], [0.25, -6]],
      'armF.r': [[0, 10], [0.05, 130, 'out'], [0.15, 100], [0.25, 60]],
      'armB.r': [[0, -10], [0.05, -130, 'out'], [0.15, -100], [0.25, -50]],
      'foreF.r': [[0, -16], [0.05, -10]],
      'foreB.r': [[0, -16], [0.05, -10]],
      eyes: [[0, 'shock']],
      mouth: [[0, 'shout']],
    } },

    stunned: { duration: 0.6, loop: true, tracks: {
      'root.r': [[0, -5], [0.3, 5], [0.6, -5]],
      'hip.y': [[0, 9], [0.15, 14], [0.3, 9], [0.45, 14], [0.6, 9]],
      ikF: [[0, footF(-10)]],
      ikB: [[0, footB(12)]],
      'torso.r': [[0, -4], [0.3, 10], [0.6, -4]],
      'head.r': [[0, 10], [0.3, -10], [0.6, 10]],
      'armF.r': [[0, 10], [0.3, 22], [0.6, 10]],
      'foreF.r': [[0, -8]],
      'armB.r': [[0, -10], [0.3, 4], [0.6, -10]],
      'foreB.r': [[0, -8]],
      eyes: [[0, 'dizzy']],
      mouth: [[0, 'tongue']],
    } },

    celebrate: { duration: 0.8, loop: true, tracks: {
      'root.y': [[0, 0], [0.1, 0], [0.3, -180, 'out'], [0.5, 0, 'in'], [0.8, 0]],
      'hip.y': [[0, 6], [0.1, 21, 'out'], [0.18, -6], [0.45, 0], [0.54, 18, 'out'], [0.66, 6], [0.8, 6]],
      ikF: [[0, STAND_F], [0.12, STAND_F], [0.3, footF(15, 39)], [0.48, STAND_F]],
      ikB: [[0, STAND_B], [0.12, STAND_B], [0.3, footB(-3, 51)], [0.48, STAND_B]],
      'bootF.r': [[0, 0], [0.12, 0], [0.3, 20], [0.48, 0]],
      'bootB.r': [[0, 0], [0.12, 0], [0.3, 30], [0.48, 0]],
      'torso.r': [[0, 6], [0.1, 18], [0.3, -6], [0.5, 6], [0.62, 16], [0.8, 6]],
      'head.r': [[0, -6], [0.3, -14], [0.62, 4], [0.8, -6]],
      // Both arms fly up and out, then the near arm pumps a bent-elbow fist.
      'armF.r': [[0, 20], [0.1, 40], [0.3, 165, 'out'], [0.5, 150], [0.62, 60, 'in'], [0.7, 150, 'out'], [0.8, 20]],
      'foreF.r': [[0, -30], [0.3, 10], [0.5, 20], [0.62, 100], [0.7, 20], [0.8, -30]],
      'armB.r': [[0, -20], [0.1, -30], [0.3, -150, 'out'], [0.5, -130], [0.62, -20], [0.8, -20]],
      'foreB.r': [[0, -30], [0.3, -10], [0.62, -30]],
      'root.sx': [[0, 1], [0.1, 1.06], [0.18, 0.95], [0.3, 1], [0.5, 1.06], [0.58, 1]],
      'root.sy': [[0, 1], [0.1, 0.93], [0.18, 1.07], [0.3, 1], [0.5, 0.93], [0.58, 1]],
      eyes: [[0, 'happy']],
      mouth: [[0, 'smile'], [0.1, 'shout'], [0.5, 'smile'], [0.6, 'shout'], [0.76, 'smile']],
    } },

    sad: { duration: 1.2, loop: true, tracks: {
      'hip.y': [[0, 6], [0.6, 9], [1.2, 6]],
      ikF: [[0, footF(2)]],
      ikB: [[0, footB(-2)]],
      'torso.r': [[0, 8], [0.6, 12], [1.2, 8]],
      'head.r': [[0, 14], [0.6, 18], [1.2, 14]],
      'armF.r': [[0, 6], [0.6, 9], [1.2, 6]],
      'foreF.r': [[0, -6]],
      'armB.r': [[0, -6], [0.6, -9], [1.2, -6]],
      'foreB.r': [[0, -6]],
      eyes: [[0, 'sad']],
      mouth: [[0, 'sad']],
    } },

    win: { duration: 0.8, loop: true, tracks: {
      'root.y': [[0, 0], [0.2, -90, 'out'], [0.4, 0, 'in'], [0.6, -90, 'out'], [0.8, 0, 'in']],
      'hip.y': [[0, 12], [0.08, 3], [0.32, 3], [0.4, 12], [0.48, 3], [0.72, 3], [0.8, 12]],
      ikF: [[0, STAND_F], [0.2, footF(12, 18)], [0.4, STAND_F], [0.6, footF(12, 18)], [0.8, STAND_F]],
      ikB: [[0, STAND_B], [0.2, footB(-9, 24)], [0.4, STAND_B], [0.6, footB(-9, 24)], [0.8, STAND_B]],
      'torso.r': [[0, 6], [0.2, -4], [0.4, 6], [0.6, -4], [0.8, 6]],
      'head.r': [[0, -8]],
      'armF.r': [[0, 150], [0.2, 170], [0.4, 150], [0.6, 170], [0.8, 150]],
      'foreF.r': [[0, 30], [0.2, -10], [0.4, 30], [0.6, -10], [0.8, 30]],
      'armB.r': [[0, -160], [0.2, -140], [0.4, -160], [0.6, -140], [0.8, -160]],
      'foreB.r': [[0, 10], [0.2, -30], [0.4, 10], [0.6, -30], [0.8, 10]],
      'root.sy': [[0, 0.94], [0.08, 1.05], [0.2, 1], [0.4, 0.94], [0.48, 1.05], [0.6, 1], [0.8, 0.94]],
      eyes: [[0, 'happy']],
      mouth: [[0, 'shout'], [0.4, 'smile']],
    } },

    // Kneeling on the far knee, near foot planted in front.
    lose: { duration: 1.4, loop: true, tracks: {
      'hip.y': [[0, 70]],
      ikF: [[0, footF(27)]],
      ikB: [[0, [HIP_B - FC.LEG.shin, -12]]],
      'bootB.r': [[0, 165]],
      'torso.r': [[0, 14], [0.7, 18], [1.4, 14]],
      'head.r': [[0, 18], [0.7, 22], [1.4, 18]],
      'armF.r': [[0, -14], [0.7, -8], [1.4, -14]],
      'foreF.r': [[0, -10]],
      'armB.r': [[0, 6], [0.7, 10], [1.4, 6]],
      'foreB.r': [[0, -10]],
      eyes: [[0, 'closed'], [0.9, 'sad']],
      mouth: [[0, 'sad']],
    } },
  };
})();
