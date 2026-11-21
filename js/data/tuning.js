/* Kickoff Legends — gameplay tuning. All distances in px at 1280×720.
 *
 * Scale: a player is ~124 px tall (≈ 1.8 m, so ~70 px a metre).
 *
 * Arcade feel (the genre's "heavy players, floaty ball"): the players live under strong gravity, so a
 * jump is quick and snappy, while the ball hangs in the air — every ball path keeps the shape of a
 * proper football strike (a driven shot, a long ball that clears a rival, a header) but plays out
 * BALL_TIME × slower, so there is time to read it, get under it and head or volley it. The ball flies
 * through air (drag, spin) and rolls on turf (js/systems/BallPhysics.js) like before; only its clock is
 * stretched. BALL_TIME = 1 gives back the old real-football pace exactly. */
window.KL = window.KL || {};

KL.TUNING = (() => {
  // How much slower than real the ball plays. Every ball speed is ÷ BALL_TIME (bv), every ball
  // acceleration ÷ BALL_TIME² (ba) and every ball rate (1/s) ÷ BALL_TIME (bv): the same flight, slower.
  // 1.45 makes the ball fall at ~620 px/s² (≈ 5 player heights/s²), the hang of a beach ball in a
  // head-football game, while the players fall at 3100 px/s².
  const BALL_TIME = 1.45;
  const bv = (v) => v / BALL_TIME;
  const ba = (a) => a / (BALL_TIME * BALL_TIME);

  return {
    // groundY: the feet line, two thirds down — the pitch (js/ui/Stadium.js) covers the bottom half of
    // the screen, and the touch pad sits on the grass in front of the players.
    // gravity: the players' (the ball has its own, ball.gravity)
    world: { width: 1280, height: 720, groundY: 490, wallPadding: 24, gravity: 3100 },
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
    // only the height to resize the goals. Balls slower than bumpMin knocking the frame leave the net still;
    // a ball resting on a crossbar rolls off towards the pitch at barRollOff
    goal: { openingHeight: 205, width: 94, crossbarThickness: 14, bumpMin: bv(260), barRollOff: bv(140) },
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
      // a snappy jump: ~140 px (about their own height), up and down in ~0.6 s at world.gravity
      jumpVelocity: -933,
      bodyWidth: 72,
      bodyHeight: 158,
      bumpNudge: bv(52), // a standing body nudges a ball slower than bumpBelow along
      bumpBelow: bv(80),
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
      hurtKnockback: { x: 190, y: -400 }, // a ~25 px hop back under the players' gravity
      // nobody stands on a head: feet that come down on the other player slide off sideways at this
      // speed (px/s) and drop to the turf — clear of a centred head in ~0.2 s
      headSlipSpeed: 300,
    },
    ball: {
      time: BALL_TIME,
      gravity: ba(1300), // ≈ 620 px/s²
      radius: 23, // 46 px across: a bit bigger than a player's head
      bounce: 0.75, // a lively beach ball: a drop from the sky bounces back to ~half its height
      maxSpeed: 1800,
      maxSpin: bv(24), // rad/s, either way
      // Every strike (js/systems/BallPhysics.js launch): speed in px/s (× the kicker's power stat), angle
      // above the turf, spin in rad/s (+ topspin, − backspin). From a standing start on a still ball:
      //  low  — J, the straight kick: a driven shot that skims the turf, dipping on its topspin. Centre
      //         circle → goal (520 px) in ~0.8 s, and it still rolls into the far goal from your own box.
      //  high — K, the long kick: a flatter lofted ball that climbs ~200 px (over a standing rival, about
      //         bar height) and carries ~950 px before landing (~1.7 s in the air), held up by backspin; it
      //         checks when it lands.
      //  header — angle follows where the ball meets the head (below centre: nodded down), within min..max.
      kicks: {
        low: { speed: bv(1050), angleDeg: 15, spin: bv(22) },
        high: { speed: bv(1170), angleDeg: 39, spin: bv(-16) },
        header: { speed: bv(760), spin: bv(6), minDeg: -20, maxDeg: 45 },
        super: { speed: bv(1600), angleDeg: 8, spin: 0 },
      },
      superBurnout: bv(250), // the fireball goes out once it's slower than this
      carry: 0.3, // × the kicker's run-up added to the strike: shoot on the run for extra pace
      clashPop: bv(650),
      clashSpin: bv(10),
      // Flight (js/systems/BallPhysics.js). Drag is quadratic (px/s² = dragQuad·v² + dragLin·v): a hard
      // shot loses pace faster than a floated pass but still carries. Magnus: magnus·spin·speed, at most
      // magnusMax (0.45 g). The fireball (super) cuts through the air with fireballDrag × the drag, no swerve.
      // (dragQuad and magnus keep the flight's shape at any BALL_TIME as they are)
      air: { dragQuad: 1.5e-4, dragLin: bv(0.05), fireballDrag: 0.4, magnus: 0.012, magnusMax: ba(585), spinDecay: bv(0.35) },
      // Turf: rolling resistance roll + rollLin·v (px/s²) — a bv(600) pass rolls ~370 px, a dribble touch
      // ~180 px. spinGrip (1/s): how fast the spin locks onto the roll. Each landing faster than bounceMinVy
      // skids: bounceGrip (0..1) of the slide between ball and turf is taken out (backspin checks, topspin
      // skips on).
      turf: { roll: ba(160), rollLin: bv(0.95), spinGrip: bv(20), bounceGrip: 0.45, bounceMinVy: bv(100) },
      // Restarts: through the countdown the ball waits hidden behind the HUD's timer crest, dropY below
      // the top of the view (× the scoreboard's phone scale, like the crest), and drops out from under it
      // at the whistle — straight down at the first kickoff; after a goal drifting serveVx (± serveJitter)
      // towards the player who conceded, so it comes down on their side of the centre and bounces into
      // them (never over their head and on into their own goal)
      serve: { dropY: 62, serveVx: bv(110), serveJitter: 0.15 },
    },
    super: { perKick: 9, perConceded: 15, max: 100, chargeMs: 450 },
    /** Ball vs player-body collision: restitution, and how much of the player's run is passed to the ball.
     *  The head is lively (headers, juggling the ball along on it); chest and legs deaden it.
     *  dribblePop: a player running onto a ball on the turf pokes it ahead in a little hop (± dribbleJitter)
     *  rather than shoving it flat — the hop-hop-hop dribble of the genre.
     *  squeezePop: a ball pinched between both players pops straight up.
     *  stompMax: the most a player coming down on the ball can drive it at the turf (a stepped-on ball on
     *  the turf squirts out sideways instead).
     *  feelX / feelY: how much of the body's own speed the ball feels on contact — its run in ball time
     *  (÷ BALL_TIME), its jump in part, so a jump into a dropping ball heads it up a couple of player
     *  heights, not out of the stadium; maxLaunch caps what any body contact gives it. */
    body: {
      feelX: 1 / BALL_TIME,
      feelY: 0.3,
      maxLaunch: bv(850),
      restitution: 0.62,
      sideRestitution: 0.2,
      sideMaxSpeed: bv(275),
      carryX: 0.65,
      headPop: bv(200),
      squeezePop: bv(530),
      dribblePop: bv(300),
      dribbleJitter: 0.3,
      stompMax: bv(500),
    },
    /** How things move on screen. Nothing here changes the physics (see js/core/Motion.js). */
    motion: {
      // Playback speed of the look-only animation: sprite cycles (idle, run, landing, celebrations…), the
      // follow-through after a kick, effect sprites, crowd beats and UI transitions. 1 = as authored,
      // 0.85 = 15 % slower and calmer. Anything gameplay reads — a kick's wind-up and contact frames, the
      // header, the super charge, physics, the clock — keeps its exact timing whatever this is.
      animPace: 1,
      ball: {
        // Squash & stretch: every impact (boot, turf, post, head, chest) flattens the ball along the
        // hit by up to squashMax of its diameter, then a damped spring pops it back round through a
        // small stretch — the give of an air-filled ball.
        squashMax: 0.3,
        squashRef: bv(620), // px/s of velocity change that gives ~63 % of squashMax
        minImpact: bv(140), // smaller changes (gravity, drag, dribbling) leave it round
        scrubDv: bv(400), // a knock harder than this scrubs some spin off
        stretchMax: 0.14,
        widen: 0.55, // bulge across the hit per unit of squash
        spring: { hz: 6.5, damping: 0.36 }, // one soft wobble, round again in ~0.3 s
        // (the spin is physics now — it bends the flight: KL.TUNING.ball.kicks / air / turf)
        superSize: 3.6, // fireball frame size in ball radii (so its ball matches the plain one)
        superPivotX: 0.71, // where the ball sits across the studio fireball frame
        // faint after-images on hard shots, spaced in time so they look the same at any refresh rate
        ghosts: { from: bv(700), full: bv(1300), gapMs: 24, alpha: [0.26, 0.15, 0.07] },
      },
      player: {
        // + squash (landing) / − stretch (take-off), about the feet
        spring: { hz: 5, damping: 0.45 },
        jumpStretch: 0.085,
        landSquash: 0.13,
        landRefVy: 930, // fall speed (px/s) that gives the full landing squash (a full jump's)
        kickSquash: 0.035,
        hurtSquash: 0.07,
        widen: 0.5,
        leanDeg: 2.5, // forward lean at sprint speed
        accelLeanDeg: 2.5, // extra lean into a start, back against a stop
        leanRate: 8, // 1/s
        hurtTiltDeg: 10,
        tiltSpring: { hz: 2.2, damping: 0.55 },
        // a strike swings the whole body: it rocks back on the wind-up (kickBackDeg), whips forward
        // through the contact (kickWhipDeg peak) and settles; a header nods into the ball (headerNodDeg)
        kickBackDeg: 4,
        kickWhipDeg: 7,
        headerNodDeg: 9,
        whipSpring: { hz: 4.5, damping: 0.5 },
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
      towardGoalVx: bv(60), // a ball rolling faster than this towards the CPU's goal is a threat
      // A relaxed CPU: it reacts late, misreads the bounce a little, jogs rather than sprints and
      // takes a moment before each kick, so a new player can win the ball off it.
      //  reactionMs: delay before each movement decision is acted on · predictErrPx: ± error on where the ball lands
      //  keeperBias: how much closer the opponent must be to the ball before the CPU drops back to guard (px)
      //  moveSpeed / kickPower: × the CPU legend's run speed / shot speed (its super is unchanged)
      //  sprintPx: sprints to reach a spot this far away · sprintDefendPx: …or this far when the ball heads for its goal
      //  kickChance: chance per decision (20 Hz) to strike a ball in reach, so it hesitates ~0.1 s on average
      //  strikeReactionMs: a strike at a ball in reach (or a header) is swung this long after the CPU decides on it…
      //  strikeWindowMs: …and only when the ball is at the boot; it waits this much longer for it, then lets go
      //  headerChance: chance it goes up for a ball it could head (it times the jump off the ball's flight)
      level: {
        reactionMs: 480,
        predictErrPx: 120,
        headerChance: 0.45,
        // when it fires a charged super (AIBrain.superAllowed). 'late' (only the last 30 s) left the CPU
        // sitting on a full meter most of the match, so its super — and the hurt it deals — was rarely seen
        superPolicy: 'chance',
        keeperBias: 140,
        moveSpeed: 0.78,
        kickPower: 0.85,
        sprintPx: 600,
        sprintDefendPx: 320,
        kickChance: 0.5,
        strikeReactionMs: 170,
        strikeWindowMs: 300,
      },
      // Personality: nothing the CPU does is on a fixed script.
      //  kickoffHoldMs: it stands a moment at the whistle (a random pick in the range) before it goes
      //  plans: each time it wins the ball it picks one, weighted — dribble it up the pitch (hop-touches,
      //    shooting once inside shootRangePx of the goal, a random pick per possession), shoot at once, or
      //    loft it long; a rival planted right in front (blockPx) ends a dribble with a strike
      //  jitterPx / jitterMs: it never stands exactly on its mark — a fresh offset every so often
      //  headerLeadS: it leaves the turf this much before the ball reaches heading height at its jump's top
      //  emote: after a goal it may pop a reaction over its head (KL.EMOTES order: 0 laugh, 1 angry,
      //    2 cry, 3 thumbs up, 4 fire, 5 skull)
      kickoffHoldMs: [250, 900],
      plans: { dribble: 0.5, shoot: 0.3, lob: 0.2 },
      shootRangePx: [280, 520],
      blockPx: 110,
      unstickMs: 300, // pressing into the rival's body this long without getting anywhere: it hops over them
      jitterPx: 28,
      jitterMs: [500, 1100],
      headerLeadS: 0.05,
      emote: { scoreChance: 0.75, concedeChance: 0.3, delayMs: [250, 900], score: [0, 3, 4], concede: [1, 2] },
    },
  };
})();
