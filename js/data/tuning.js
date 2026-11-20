/* Kickoff Legends — gameplay tuning. All distances in px at 1280×720.
 *
 * Scale: a player is ~124 px tall (≈ 1.8 m, so ~70 px a metre) and gravity is 1300 px/s². The jump
 * and the bounces were tuned for readable play; the strikes are proper football strikes on top of it —
 * a driven shot crosses half the pitch in about half a second, a long ball hangs ~1.2 s and carries
 * two thirds of the pitch — and the ball flies through real air (drag, spin) and rolls on real turf
 * (js/systems/BallPhysics.js). */
window.KL = window.KL || {};

KL.TUNING = {
  // groundY: the feet line, two thirds down — the pitch (js/ui/Stadium.js) covers the bottom half of
  // the screen, and the touch pad sits on the grass in front of the players
  world: { width: 1280, height: 720, groundY: 490, wallPadding: 24, gravity: 1300 },
  match: {
    durationSec: 90,
    suddenDeathSec: 30,
    kickoffCountdownMs: 1200,
    goalFreezeMs: 1500,
    goalSlowMoMs: 380, // real ms held at goalSlowMoScale…
    goalSlowMoRampMs: 520, // …then eased back to full speed (no snap)
    goalSlowMoScale: 0.3,
  },
  // the goal is a bit over 1.5× a player's height: a keeper still has to jump for the top corners.
  // openingHeight also sizes the goal art (js/entities/Goal.js scales the net to it). width puts the
  // mouth where the field's markings meet the goal (the near post on the penalty-box corner), so change
  // only the height to resize the goals
  goal: { openingHeight: 205, width: 94, crossbarThickness: 14 },
  player: {
    // On-screen size of the footballers. 1 = the 240 px sprite their bodies, reach and the CPU's sense
    // of distance are authored for (bodyWidth, bodyHeight, reach below are at scale 1); 0.73 ≈ 124 px
    // tall, a sixth of the screen. Jump height and speeds don't scale: players clear about their own height.
    scale: 0.73,
    runSpeed: 290,
    sprintSpeed: 395,
    // px/s²: standing → run speed in ~0.1 s, run → stop in ~0.07 s (no instant 0 ↔ full speed);
    // the run cycle plays at the real ground speed so the boots never skate
    runAccel: 3000,
    runDecel: 4000,
    plantDecel: 2600, // planting the standing foot for a kick: a short skid, not a dead stop
    airControl: 0.7,
    sprintStaminaSec: 1.5,
    sprintRechargeSec: 2.0,
    jumpVelocity: -612, // the same 144 px jump, with a little more hang time
    bodyWidth: 72,
    bodyHeight: 158,
    bumpNudge: 52,
    // Where each strike meets the ball, from the feet in 240-px sprite units (× scale): x ahead, y up,
    // r = reach radius around that point. The long kick's boot swings higher than the straight kick's.
    reach: {
      kick_low: { x: 55, y: 40, r: 70 },
      kick_high: { x: 58, y: 62, r: 80 },
      header: { x: 55, y: 150, r: 90 },
      super: { x: 55, y: 40, r: 200 },
    },
    // a kick on the move: the standing foot plants and the body carries through the strike at this
    // fraction of run speed (no dead stop), then the run picks up again
    kickMove: 0.35,
    // a kick or jump pressed up to this early (still landing, still in a kick's recovery) happens the
    // moment the player is free instead of being swallowed
    inputBufferMs: 130,
    kickerPassMs: 120, // a struck ball leaves through the kicker's own body for this long
    hurtDurationMs: 450,
    hurtKnockback: { x: 190, y: -220 },
    // nobody stands on a head: feet that come down on the other player slide off sideways at this
    // speed (px/s) and drop to the turf — clear of a centred head in ~0.2 s
    headSlipSpeed: 300,
  },
  ball: {
    radius: 23, // 46 px across: a bit bigger than a player's head
    bounce: 0.72,
    maxSpeed: 1800,
    maxSpin: 24, // rad/s, either way (any faster and the panels strobe)
    // Every strike (js/systems/BallPhysics.js launch): speed in px/s (× the kicker's power stat), angle
    // above the turf, spin in rad/s (+ topspin, − backspin). From a standing start on a still ball:
    //  low  — J, the straight kick: a driven shot that skims the turf, dipping on its topspin. Centre
    //         circle → goal (520 px) in ~0.55 s, and it still rolls into the far goal from your own box.
    //  high — K, the long kick: a flatter lofted ball that climbs ~200 px (over a standing rival, about
    //         bar height) and carries ~950 px before landing, held up by backspin; it checks when it lands.
    //  header — angle follows where the ball meets the head (below centre: nodded down), within min..max.
    kicks: {
      low: { speed: 1050, angleDeg: 15, spin: 22 },
      high: { speed: 1170, angleDeg: 38, spin: -16 },
      header: { speed: 760, spin: 6, minDeg: -20, maxDeg: 45 },
      super: { speed: 1600, angleDeg: 8, spin: 0 },
    },
    carry: 0.3, // × the kicker's run-up added to the strike: shoot on the run for extra pace
    clashPop: 650,
    clashSpin: 10,
    // Flight (js/systems/BallPhysics.js). Drag is quadratic (px/s² = dragQuad·v² + dragLin·v): a hard
    // shot loses pace faster than a floated pass but still carries. Magnus: magnus·spin·speed, at most
    // magnusMax (0.45 g). The fireball (super) cuts through the air with fireballDrag × the drag, no swerve.
    air: { dragQuad: 1.5e-4, dragLin: 0.05, fireballDrag: 0.4, magnus: 0.012, magnusMax: 585, spinDecay: 0.35 },
    // Turf: rolling resistance roll + rollLin·v (px/s²) — a 600 px/s pass rolls ~370 px, a dribble touch
    // ~180 px. spinGrip (1/s): how fast the spin locks onto the roll. Each landing faster than bounceMinVy
    // skids: bounceGrip (0..1) of the slide between ball and turf is taken out (backspin checks, topspin
    // skips on).
    turf: { roll: 160, rollLin: 0.95, spinGrip: 20, bounceGrip: 0.45, bounceMinVy: 100 },
  },
  super: { perKick: 9, perConceded: 15, max: 100, chargeMs: 450 },
  /** Ball vs player-body collision: restitution, and how much of the player's run is passed to the ball. */
  body: { restitution: 0.55, sideRestitution: 0.2, sideMaxSpeed: 275, carryX: 0.65, headPop: 120, squeezePop: 530 }, // squeezePop: a ball pinched between both players pops straight up
  /** How things move on screen. Nothing here changes the physics (see js/core/Motion.js). */
  motion: {
    // Playback speed of the look-only animation: sprite cycles (idle, run, landing, celebrations…), the
    // follow-through after a kick, effect sprites, crowd beats and UI transitions. 1 = as authored,
    // 0.85 = 15 % slower and calmer. Anything gameplay reads — a kick's wind-up and contact frames, the
    // header, the super charge, physics, the clock — keeps its exact timing whatever this is.
    animPace: 0.85,
    ball: {
      // Squash & stretch: every impact (boot, turf, post, head, chest) flattens the ball along the
      // hit by up to squashMax of its diameter, then a damped spring pops it back round through a
      // small stretch — the give of an air-filled ball.
      squashMax: 0.3,
      squashRef: 620, // px/s of velocity change that gives ~63 % of squashMax
      minImpact: 140, // smaller changes (gravity, drag, dribbling) leave it round
      stretchMax: 0.14,
      widen: 0.55, // bulge across the hit per unit of squash
      spring: { hz: 6.5, damping: 0.36 }, // one soft wobble, round again in ~0.3 s
      // (the spin is physics now — it bends the flight: KL.TUNING.ball.kicks / air / turf)
      superSize: 3.6, // fireball frame size in ball radii (so its ball matches the plain one)
      superPivotX: 0.71, // where the ball sits across the studio fireball frame
      // faint after-images on hard shots, spaced in time so they look the same at any refresh rate
      ghosts: { from: 700, full: 1300, gapMs: 18, alpha: [0.26, 0.15, 0.07] },
    },
    player: {
      // + squash (landing) / − stretch (take-off), about the feet
      spring: { hz: 5, damping: 0.45 },
      jumpStretch: 0.085,
      landSquash: 0.13,
      landRefVy: 700, // fall speed (px/s) that gives the full landing squash
      kickSquash: 0.035,
      hurtSquash: 0.07,
      widen: 0.5,
      leanDeg: 2.5, // forward lean at sprint speed
      accelLeanDeg: 2.5, // extra lean into a start, back against a stop
      leanRate: 8, // 1/s
      hurtTiltDeg: 10,
      tiltSpring: { hz: 2.2, damping: 0.55 },
    },
  },
  /** Two kicks on the same touch within this window clash: the ball pops straight up (no first-processed advantage). */
  clashMs: 90,
  // per strike: on contact the world dips to hitSlowFloor × speed (the ball seen squashed on the boot)
  // and eases back to full speed, costing hitStopMs of game time in all — the weight of a hit-stop
  // without freezing the picture. The camera kicks by kickShakePx — a long kick lands heavier than a header
  juice: {
    hitStopMs: { low: 55, high: 65, header: 40, clash: 50, super: 110 },
    hitSlowFloor: 0.2,
    kickShakePx: { low: 2.5, high: 3, header: 1.5, clash: 2, super: 6 },
    goalShakePx: 6,
    confettiMs: 2000,
  },
  ai: {
    tickHz: 20,
    // A relaxed CPU: it reacts late, misreads the bounce a little, jogs rather than sprints and
    // takes a moment before each kick, so a new player can win the ball off it.
    //  reactionMs: delay before each movement decision is acted on · predictErrPx: ± error on where the ball lands
    //  keeperBias: how much closer the opponent must be to the ball before the CPU drops back to guard (px)
    //  moveSpeed / kickPower: × the CPU legend's run speed / shot speed (its super is unchanged)
    //  sprintPx: sprints to reach a spot this far away · sprintDefendPx: …or this far when the ball heads for its goal
    //  kickChance: chance per decision (20 Hz) to strike a ball in reach, so it hesitates ~0.1 s on average
    //  strikeReactionMs: a strike at a ball in reach (or a header) is swung this long after the CPU decides on it…
    //  strikeWindowMs: …and only when the ball is at the boot; it waits this much longer for it, then lets go
    level: {
      reactionMs: 480,
      predictErrPx: 120,
      headerChance: 0.2,
      superPolicy: 'late',
      keeperBias: 140,
      moveSpeed: 0.78,
      kickPower: 0.85,
      sprintPx: 600,
      sprintDefendPx: 320,
      kickChance: 0.5,
      strikeReactionMs: 170,
      strikeWindowMs: 300,
    },
  },
};
