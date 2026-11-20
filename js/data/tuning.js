/* Kickoff Legends — gameplay tuning. All distances in px at 1280×720.
 *
 * Pace: gravity and every ball / jump speed are scaled together (speeds × s, gravity × s²). That
 * keeps every arc the same shape — same jump height, same lob, same bounce — and only slows the
 * play down. s = 0.85 against the original 1800 px/s² world: shots, lobs and bounces take ~18 %
 * longer and are easier to follow. */
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
    // of distance are authored for (bodyWidth, bodyHeight, kickRadius below are at scale 1); 0.73 ≈ 124 px
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
    kickRadius: 70,
    hurtDurationMs: 450,
    hurtKnockback: { x: 190, y: -220 },
  },
  ball: {
    radius: 23, // 46 px across: a bit bigger than a player's head
    bounce: 0.72,
    airDrag: 0.9872, // per 1/60 s
    groundDrag: 0.966,
    maxSpeed: 1300,
    kickLow: { speed: 665, angleDeg: 17, carry: 0.3 },
    kickHigh: { speed: 645, angleDeg: 55, carry: 0.3 },
    header: { speed: 530 },
    super: { speed: 1200, angleDeg: 10 },
    clashPop: 650,
  },
  super: { perKick: 9, perConceded: 15, max: 100, chargeMs: 450 },
  /** Ball vs player-body collision: restitution, and how much of the player's run is passed to the ball. */
  body: { restitution: 0.55, sideRestitution: 0.2, sideMaxSpeed: 275, carryX: 0.65, headPop: 120, squeezePop: 530 }, // squeezePop: a ball pinched between both players pops straight up
  /** How things move on screen. Nothing here changes the physics (see js/core/Motion.js). */
  motion: {
    ball: {
      // Squash & stretch: every impact (boot, turf, post, head, chest) flattens the ball along the
      // hit by up to squashMax of its diameter, then a damped spring pops it back round through a
      // small stretch — the give of an air-filled ball.
      squashMax: 0.3,
      squashRef: 620, // px/s of velocity change that gives ~63 % of squashMax
      minImpact: 140, // smaller changes (gravity, drag, dribbling) leave it round
      stretchMax: 0.14,
      widen: 0.55, // bulge across the hit per unit of squash
      spring: { hz: 7.5, damping: 0.32 }, // one visible wobble, round again in ~0.25 s
      // Spin: on the turf the ball rolls at its ground speed; in the air it keeps the spin it was given
      grip: 20, // 1/s: how fast turf contact locks the spin to the roll
      airSpinDecay: 0.35,
      maxSpin: 24, // rad/s; any faster and the panels strobe
      kickSpin: { low: 0.55, high: -16, header: 7, clash: 10 }, // low: × the rolling rate · high: backspin
      superSize: 3.6, // fireball frame size in ball radii (so its ball matches the plain one)
      superPivotX: 0.71, // where the ball sits across the studio fireball frame
      // faint after-images on hard shots, spaced in time so they look the same at any refresh rate
      ghosts: { from: 480, full: 1050, gapMs: 18, alpha: [0.24, 0.14, 0.07] },
    },
    player: {
      // + squash (landing) / − stretch (take-off), about the feet
      spring: { hz: 6, damping: 0.42 },
      jumpStretch: 0.085,
      landSquash: 0.13,
      landRefVy: 700, // fall speed (px/s) that gives the full landing squash
      kickSquash: 0.035,
      hurtSquash: 0.07,
      widen: 0.5,
      leanDeg: 2.5, // forward lean at sprint speed
      accelLeanDeg: 2.5, // extra lean into a start, back against a stop
      leanRate: 10, // 1/s
      hurtTiltDeg: 10,
      tiltSpring: { hz: 2.6, damping: 0.55 },
    },
  },
  /** Two kicks on the same touch within this window clash: the ball pops straight up (no first-processed advantage). */
  clashMs: 90,
  juice: { hitStopMs: 50, goalShakePx: 6, kickShakePx: 2, confettiMs: 2000 },
  ai: {
    tickHz: 20,
    // A relaxed CPU: it reacts late, misreads the bounce a little, jogs rather than sprints and
    // takes a moment before each kick, so a new player can win the ball off it.
    //  reactionMs: delay before each decision is acted on · predictErrPx: ± error on where the ball lands
    //  keeperBias: how much closer the opponent must be to the ball before the CPU drops back to guard (px)
    //  moveSpeed / kickPower: × the CPU legend's run speed / shot speed (its super is unchanged)
    //  sprintPx: sprints to reach a spot this far away · sprintDefendPx: …or this far when the ball heads for its goal
    //  kickChance: chance per decision (20 Hz) to strike a ball in reach, so it hesitates ~0.1 s on average
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
    },
  },
};
