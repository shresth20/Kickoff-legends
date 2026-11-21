/* On-screen controller: one family of round arcade buttons in the HUD's colours (navy face, gold rim,
 * dark outline), each standing on a 3D lip and carrying a single white icon:
 *   bottom-left    ←  →              move
 *   bottom-right   I · J · K · L     Super (a fireball, framed by its gold charge ring) · straight kick
 *                                    (ball + speed lines) · long kick (ball on a lofted arc) · jump (↑)
 * The right hand's four run in key order, the Super at the inner end, out of the way of the thumb's
 * everyday kicks. On a keyboard screen they stand in one row (a key guide); on a phone or tablet they
 * zigzag (KL.PAD_LAYOUT.touch): Shoot and Jump high where the thumb rests, the Super and Long kick
 * low between them, so the whole hand's cluster stays within the thumb's reach. Sprint has no button
 * (hold its key).
 *
 * The buttons are the illustrated art (assets/images/pad/pad.webp, cut by tools/make-pad.mjs), drawn once
 * per session into textures at the screen's real pixel density (KL.UIRES), so they stay crisp on any
 * screen. Without the art (placeholder art) the same buttons are painted in code instead.
 *
 * Pressing a button (finger, mouse or its key): it sinks onto its lip and shrinks a touch, its face
 * brightens and a ring ripples out from it; letting go springs it back up with a little overshoot. The
 * Super keeps one look all match: while it charges its fireball is dimmed and its ring fills with gold,
 * clockwise from the top; when it is ready the face turns orange, it pops, then glows and breathes.
 * Pressed before it is ready, it gives a short "not yet" wiggle. Under "reduce motion" there is no
 * ripple, overshoot, wiggle or breathing: just the press.
 *
 * Keyboard players read their key off a keycap at the bottom of each button (where the art has it),
 * and the button presses in while that key is held. On a tablet the same buttons are touch targets:
 * multi-touch (hold a direction and tap kick), and a finger can slide from one button to the next. The
 * mouse works too. Pointer state goes into each player's KL.VirtualPad, which KeyboardInput merges with
 * the keys. Touch screens show the icons only (no keycaps).
 *
 * The buttons sit on the grass in front of the players (below groundY), so they never cover the players
 * or a ball on the ground. Like a native game's pad, each hand's cluster keeps to its corner of the
 * screen on any screen shape. On a keyboard screen it keeps inside the safe area, scaled with the
 * view; on a touch screen it is placed and sized in CSS px from the screen's edges, so it sits under
 * the thumbs at the same physical spot and size on every phone (and on every tablet). */
window.KL = window.KL || {};

/**
 * solo: button positions and sizes on a keyboard / mouse screen, in logical px at UI scale 1.
 * anchor: the screen side the button keeps to · dx: px in from that side's safe edge to its centre ·
 * dy: px up from the bottom safe edge · r: face radius (the outline adds `outline` round it).
 * Phones and tablets use `touch` below instead.
 */
KL.PAD_LAYOUT = {
  version: 5, // bump after changing a painter below so cached textures repaint
  // one full-size controller for Player 1
  solo: [
    { action: 'left', icon: 'left', anchor: 'left', dx: 94, dy: 72, r: 46 },
    { action: 'right', icon: 'right', anchor: 'left', dx: 218, dy: 72, r: 46 },
    // right hand, in key order I · J · K · L: the ringed Super, straight kick, long kick, jump
    { action: 'super', icon: 'super', anchor: 'right', dx: 426, dy: 72, r: 42 },
    { action: 'kickLow', icon: 'shoot', anchor: 'right', dx: 308, dy: 72, r: 42 },
    { action: 'kickHigh', icon: 'lob', anchor: 'right', dx: 198, dy: 72, r: 42 },
    { action: 'jump', icon: 'jump', anchor: 'right', dx: 88, dy: 72, r: 42 },
  ],
  // the width both clusters need side by side (outer margins + a thumb's gap between them): on a
  // narrow screen the pad scale is capped so the hands never meet
  span: 900,
  /**
   * Phones and tablets (KL.View.touch): each hand's buttons sit where that thumb rests, the same size
   * and the same distance from the screen's edges on every phone (and on every tablet), whatever the
   * screen's shape or the view's scale. Lengths are in units of `unit` CSS px (a CSS px is roughly a
   * fixed physical size: ~0.16 mm on a phone). dx: from the screen's side edge to the button's centre.
   * row: 'high' buttons stand topGap under the players' feet, at thumb height; 'low' ones sit `rise`
   * lower, but no lower than bottomGap above the screen's bottom edge, so on a short screen the
   * zigzag flattens instead of covering the pitch. dx is where a button would like to be: it moves
   * further in if it would come within `space` of a neighbour (a flatter zigzag spreads wider). If
   * even minRise doesn't fit (or the two hands would come within `gap` of each other), the whole
   * pad shrinks to fit.
   * The right hand zigzags in key order (I · J · K · L), the everyday Shoot and Jump high where the
   * thumb rests, the Super and Long kick low; two rows pull the far end ~15 mm nearer the edge than
   * one row would. Tablets are held by their sides: bigger buttons, nearer the edges, a taller zigzag.
   */
  touch: {
    phone: {
      unit: 0.72, topGap: 6, bottomGap: 14, rise: 64, minRise: 30, space: 6, gap: 60,
      buttons: [
        { action: 'left', icon: 'left', anchor: 'left', dx: 150, row: 'high', r: 46 },
        { action: 'right', icon: 'right', anchor: 'left', dx: 268, row: 'high', r: 46 },
        { action: 'super', icon: 'super', anchor: 'right', dx: 370, row: 'low', r: 35 },
        { action: 'kickLow', icon: 'shoot', anchor: 'right', dx: 276, row: 'high', r: 42 },
        { action: 'kickHigh', icon: 'lob', anchor: 'right', dx: 196, row: 'low', r: 42 },
        { action: 'jump', icon: 'jump', anchor: 'right', dx: 116, row: 'high', r: 42 },
      ],
    },
    tablet: {
      unit: 0.9, topGap: 12, bottomGap: 14, rise: 84, minRise: 30, space: 10, gap: 80,
      buttons: [
        { action: 'left', icon: 'left', anchor: 'left', dx: 132, row: 'high', r: 46 },
        { action: 'right', icon: 'right', anchor: 'left', dx: 240, row: 'high', r: 46 },
        { action: 'super', icon: 'super', anchor: 'right', dx: 316, row: 'low', r: 38 },
        { action: 'kickLow', icon: 'shoot', anchor: 'right', dx: 238, row: 'high', r: 42 },
        { action: 'kickHigh', icon: 'lob', anchor: 'right', dx: 172, row: 'low', r: 42 },
        { action: 'jump', icon: 'jump', anchor: 'right', dx: 106, row: 'high', r: 42 },
      ],
    },
  },
  lip: 5, // the 3D underside every button stands on (and sinks onto when pressed)
  outline: 3, // dark outline round face and lip
  // the Super's charge ring, flush outside its outline (a bezel): a gap, then ink · band · ink
  ring: { gap: 0, ink: 2.5, band: 7.5 },
  // the keycap, as shares of the button's outer radius: centre below the middle, width, height.
  // Measured on the art (KL_PAD_ART.keycap) when it is there; these are the painted buttons'.
  keycap: { y: 0.868, w: 0.691, h: 0.595 },
  // the press: how far the button shrinks, how bright its face flashes, and the timings (ms)
  press: { scale: 0.93, shine: 0.3, held: 0.14, downMs: 55, upMs: 300, overshoot: 2.6, rippleMs: 340, rippleTo: 1.45 },
  flashMs: 110, // a quick tap keeps its button pressed at least this long
};

(() => {
  const P = () => KL.Paint;
  const L = () => KL.PAD_LAYOUT;
  const INK = '#1B1F3B';
  const GOLD = ['#FFEA6E', '#F8CC22', '#EAA912'];
  const FACES = {
    // the pause button's navy (KL.Paint.C.navy) and lip
    navy: { face: ['#3A5AD4', '#2740A6', '#1D2E84'], lip: '#121A50' },
    // the Super once it is ready
    fire: { face: ['#FFB547', '#F7701E', '#C93A10'], lip: '#6E1A06' },
  };
  const FONT = (px) => `700 ${px}px Oswald, "Arial Narrow", sans-serif`; // key names are Latin in every locale
  const v = () => L().version;
  /** The button art (tools/make-pad.mjs), or null when it is missing (the buttons are painted then). */
  const artOf = (scene) => {
    const A = window.KL_PAD_ART;
    return A && scene.textures.exists('pad_art') ? A : null;
  };

  /* -------------------------------------------------------------- drawing */
  /** Chunky arrow along +x: tail at x0, tip at x1; head half-height hh, shaft half-height sh, head length hl. */
  const arrowPath = (ctx, x0, x1, hh, sh, hl) => {
    const hb = x1 - hl;
    ctx.beginPath();
    ctx.moveTo(x1, 0);
    ctx.lineTo(hb, -hh);
    ctx.lineTo(hb, -sh);
    ctx.lineTo(x0, -sh);
    ctx.lineTo(x0, sh);
    ctx.lineTo(hb, sh);
    ctx.lineTo(hb, hh);
    ctx.closePath();
  };

  /** Icon style shared with the ui_icons art: a hard ink drop, a thick ink outline, then the fill.
   * shape() must rebuild the path each call (it runs three times). */
  function inked(ctx, shape, fill, ink, drop) {
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.lineWidth = ink * 2;
    ctx.strokeStyle = INK;
    ctx.save();
    ctx.translate(0, drop);
    shape();
    ctx.stroke();
    ctx.restore();
    shape();
    ctx.stroke();
    ctx.fillStyle = fill;
    shape();
    ctx.fill();
  }

  /** An inked ball: outline + drop, then the panels and shading (KL.Paint.ball). */
  function inkedBall(ctx, x, y, br, ink, drop) {
    inked(ctx, () => P().circle(ctx, x, y, br), '#FFFFFF', ink, drop);
    P().ball(ctx, x, y, br);
  }

  /* --------------------------------------------- icons (painted buttons) */
  // Each draws centred on (0, 0) inside a face of radius r, in the icon style above.
  const inkOf = (r) => Math.max(2, r * 0.062);
  const dropOf = (r) => r * 0.05;

  /** A bold arrow pointing at `angle` (0 = right), its weight balanced on the centre. */
  const arrowIcon = (angle) => (ctx, r) => {
    const len = r * 1.04, hh = r * 0.44, sh = r * 0.17, hl = r * 0.5;
    const shift = len * 0.04; // the head carries the weight: nudge it back a hair
    inked(
      ctx,
      () => {
        ctx.save();
        ctx.rotate(angle);
        arrowPath(ctx, -len / 2 - shift, len / 2 - shift, hh, sh, hl);
        ctx.restore();
      },
      '#FFFFFF',
      inkOf(r),
      dropOf(r),
    );
  };

  /** Straight kick: the ball driven right, three speed lines behind it. */
  function shootIcon(ctx, r) {
    const ink = inkOf(r), drop = dropOf(r);
    const br = r * 0.33, bx = r * 0.27, t = r * 0.13;
    const x1 = bx - br - r * 0.1; // the lines stop short of the ball
    for (const [y, len] of [[-0.24, 0.3], [0, 0.48], [0.24, 0.3]]) {
      inked(ctx, () => P().rr(ctx, x1 - len * r, y * r - t / 2, len * r, t, t / 2), '#FFFFFF', ink, drop);
    }
    inkedBall(ctx, bx, 0, br, ink, drop);
  }

  /** Long kick: the ball up at the top right, a dotted lofted path rising to it from the lower left. */
  function lobIcon(ctx, r) {
    const ink = inkOf(r), drop = dropOf(r);
    const br = r * 0.3, bx = r * 0.3, by = -r * 0.24;
    // quadratic path from the kick to the ball
    const p0 = [-0.6 * r, 0.56 * r], c = [-0.5 * r, -0.24 * r], p1 = [bx, by];
    const at = (u) => [0, 1].map((i) => (1 - u) ** 2 * p0[i] + 2 * (1 - u) * u * c[i] + u * u * p1[i]);
    for (const [u, s] of [[0.1, 0.085], [0.36, 0.1], [0.62, 0.115]]) {
      const [x, y] = at(u);
      inked(ctx, () => P().circle(ctx, x, y, s * r), '#FFFFFF', ink, drop);
    }
    inkedBall(ctx, bx, by, br, ink, drop);
  }

  /** Stylised fire tongues as [centre x, bottom radius, tip lean] in units of the half-width w, then
   * [tip height, foot lift] in units of h. The wide middle tongue's bowl is the fire's foot. */
  const FIRE = [
    [0, 0.74, 0.08, 1, 0],
    [-0.5, 0.36, -0.22, 0.7, 0.14],
    [0.52, 0.32, 0.2, 0.62, 0.16],
  ];
  /** One tongue: round bottom, sides sweeping in to a pointed, leaning tip. */
  function tongue(ctx, cx, rb, lean, ht, lift) {
    const cy = -lift - rb, tx = cx + lean, ty = -ht, rise = ht - lift - rb;
    ctx.moveTo(cx + rb, cy);
    ctx.arc(cx, cy, rb, 0, Math.PI); // clockwise from the right, through the bottom
    ctx.bezierCurveTo(cx - rb, cy - rise * 0.5, tx - rb * 0.3, ty + rise * 0.3, tx, ty);
    ctx.bezierCurveTo(tx + rb * 0.45, ty + rise * 0.35, cx + rb, cy - rise * 0.45, cx + rb, cy);
    ctx.closePath();
  }
  /** All the tongues of a fire of half-width w and height h as one path, foot on (0, 0), tips up. */
  const firePath = (ctx, w, h, tongues = FIRE) => () => {
    ctx.beginPath();
    for (const t of tongues) tongue(ctx, t[0] * w, t[1] * w, t[2] * w, t[3] * h, t[4] * h);
  };

  /** Super: a fireball streaking down-right, its flames trailing up-left. */
  function superIcon(ctx, r) {
    const ink = inkOf(r), drop = dropOf(r);
    const br = r * 0.29, bx = r * 0.21, by = r * 0.21;
    const w = br * 1.75, rb = FIRE[0][1] * w, h = rb + r * 0.95;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(-Math.PI / 4); // tips point up-left
    ctx.translate(0, rb); // the middle tongue's bowl wraps the ball
    // the drop falls straight down the screen, so un-rotate it
    const d = drop / Math.SQRT2;
    ctx.save();
    ctx.translate(-d, d);
    ctx.lineJoin = 'round';
    ctx.lineWidth = ink * 2;
    ctx.strokeStyle = INK;
    firePath(ctx, w, h)();
    ctx.stroke();
    ctx.restore();
    firePath(ctx, w, h)();
    ctx.stroke();
    ctx.fillStyle = P().vgrad(ctx, -h, 0, ['#FFB020', '#FFD23F', '#FFF1A8']);
    ctx.fill();
    firePath(ctx, w * 0.62, h * 0.74, FIRE.slice(0, 2))();
    ctx.fillStyle = P().vgrad(ctx, -h * 0.74, 0, ['#FFF3B8', '#FFFFFF']);
    ctx.fill();
    ctx.restore();
    inkedBall(ctx, bx, by, br, ink, drop);
  }

  const ICONS = { left: arrowIcon(Math.PI), right: arrowIcon(0), jump: arrowIcon(-Math.PI / 2), shoot: shootIcon, lob: lobIcon, super: superIcon };

  /* ------------------------------------------------------------- painters */
  // Every look is centred on the button's face centre (origin 0.5, 0.5) unless it says otherwise.
  const rOut = (b) => b.r + L().outline; // the button's outer radius, outline included
  const DIM = 'rgba(20,30,96,0.5)'; // laid over a charging Super's fireball

  /**
   * The face from the art: its cell drawn at the button's size into a texture at device resolution
   * (the browser's high-quality resampling, once). hot: the ready Super's orange cell. dim: a charging
   * Super, its fireball sunk back into the navy.
   */
  function artFace(scene, b, hot, dim) {
    const A = artOf(scene), R = rOut(b);
    const name = hot ? 'super_hot' : b.icon;
    const i = A.frames.indexOf(name), half = (A.cell / 2) * (R / A.r);
    const key = P().paint(scene, `kl:pad:art:${v()}:${name}:${b.r}:${+dim}`, half * 2, half * 2, (ctx) => {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(scene.textures.get('pad_art').getSourceImage(), i * A.cell, 0, A.cell, A.cell, 0, 0, half * 2, half * 2);
      if (dim) {
        P().circle(ctx, half, half, R * (A.superFace || A.face));
        ctx.fillStyle = DIM;
        ctx.fill();
      }
    });
    return { key, ox: 0.5, oy: 0.5 };
  }

  /** The face painted in code (no art): outline, face gradient, icon, gold rim, gloss. */
  function paintedFace(scene, b, hot, dim) {
    const r = b.r, R = rOut(b), S = R + 2;
    const key = P().paint(scene, `kl:pad:face:${v()}:${b.icon}:${r}:${+hot}:${+dim}`, S * 2, S * 2, (ctx) => {
      ctx.translate(S, S);
      const C = P().circle, pal = hot ? FACES.fire : FACES.navy;
      C(ctx, 0, 0, R);
      ctx.fillStyle = INK;
      ctx.fill();
      C(ctx, 0, 0, r);
      ctx.fillStyle = P().vgrad(ctx, -r, r, pal.face);
      ctx.fill();
      ICONS[b.icon](ctx, r);
      if (dim) {
        C(ctx, 0, 0, r);
        ctx.fillStyle = DIM;
        ctx.fill();
      }
      C(ctx, 0, 0, r - 2.25); // gold rim inside the edge, as on the pause button
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = P().vgrad(ctx, -r, r, GOLD);
      ctx.stroke();
      ctx.beginPath(); // gloss across the top
      ctx.ellipse(0, -r * 0.52, r * 0.66, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = P().vgrad(ctx, -r * 0.82, -r * 0.22, ['rgba(255,255,255,0.34)', 'rgba(255,255,255,0.03)']);
      ctx.fill();
    });
    return { key, ox: 0.5, oy: 0.5 };
  }

  /** What the button stands on: a soft drop shadow, then the lip (outline + dark side) LIP px down.
   * It stays put while the face sinks onto it. Its origin is the face centre at rest. */
  function baseLook(scene, b, hot) {
    const { lip: LIP, outline: OUT } = L(), R = rOut(b), M = 10, S = R + M, th = S * 2 + LIP;
    const side = hot ? FACES.fire.lip : FACES.navy.lip;
    const key = P().paint(scene, `kl:pad:base:${v()}:${b.r}:${side}`, S * 2, th, (ctx) => {
      ctx.translate(S, S);
      const C = P().circle;
      ctx.save();
      ctx.shadowColor = 'rgba(6,8,30,0.5)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      C(ctx, 0, LIP, R);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.restore();
      C(ctx, 0, LIP, R - OUT);
      ctx.fillStyle = side;
      ctx.fill();
    });
    return { key, ox: 0.5, oy: S / th };
  }

  /** A white disc over the face, faded in while the button is pressed (its face brightens). */
  function shineLook(scene, b) {
    const R = rOut(b) - 1.5, S = R + 1;
    const key = P().paint(scene, `kl:pad:shine:${v()}:${b.r}`, S * 2, S * 2, (ctx) => {
      const g = ctx.createRadialGradient(S, S - R * 0.35, R * 0.1, S, S, R);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,248,214,0.7)');
      P().circle(ctx, S, S, R);
      ctx.fillStyle = g;
      ctx.fill();
    });
    return { key, ox: 0.5, oy: 0.5 };
  }

  /** The ring that ripples out from a press (gold-white) or from the Super coming ready (orange). */
  function rippleLook(scene, b, color) {
    const R = rOut(b), S = R + 8;
    const key = P().paint(scene, `kl:pad:ripple:${v()}:${b.r}:${color}`, S * 2, S * 2, (ctx) => {
      ctx.translate(S, S);
      P().circle(ctx, 0, 0, R + 1);
      ctx.lineWidth = 9;
      ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.3)');
      ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = color;
      ctx.stroke();
    });
    return { key, ox: 0.5, oy: 0.5 };
  }

  /** The Super's ring radii, centred on the middle of face + lip (LIP / 2 below the face centre). */
  function ringOf(b) {
    const { lip: LIP, ring: G } = L();
    const r0 = rOut(b) + LIP / 2 + G.gap; // clear of the face top and the lip bottom
    return { y: LIP / 2, r0, b0: r0 + G.ink, b1: r0 + G.ink + G.band, r1: r0 + G.ink * 2 + G.band };
  }

  /** The charge ring: `track` is the ink socket with the ring's dark band, `gold` the band that fills it. */
  function ringLook(scene, b, kind) {
    const R = ringOf(b), S = R.r1 + 2;
    const key = P().paint(scene, `kl:pad:ring:${v()}:${kind}:${b.r}`, S * 2, S * 2, (ctx) => {
      ctx.translate(S, S);
      const band = (r0, r1, style) => {
        P().circle(ctx, 0, 0, (r0 + r1) / 2);
        ctx.lineWidth = r1 - r0;
        ctx.strokeStyle = style;
        ctx.stroke();
      };
      if (kind === 'track') {
        // an ink socket the button sits in (the ring is centred LIP / 2 lower than the face, so
        // the face alone leaves a sliver at its sides), then the ring's dark band
        P().circle(ctx, 0, 0, R.r1);
        ctx.fillStyle = INK;
        ctx.fill();
        band(R.b0, R.b1, '#262D66');
        return;
      }
      band(R.b0, R.b1, P().vgrad(ctx, -R.b1, R.b1, GOLD));
      band(R.b1 - 1.6, R.b1, 'rgba(255,255,255,0.55)'); // light on its outer edge
    });
    return { key, ox: 0.5, oy: 0.5 };
  }

  /** The keycap: a white key with the player's key printed in navy, w × h (min width) logical px. */
  function keycapLook(scene, label, w0, h) {
    const LIP = Math.max(2, Math.round(h * 0.12)), M = 6, px = Math.round(h * 0.66);
    const ARROWS = { '→': 0, '↓': Math.PI / 2, '←': Math.PI, '↑': -Math.PI / 2 };
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = FONT(px);
    const w = label in ARROWS ? w0 : Math.max(w0, Math.ceil(probe.measureText(label).width + h * 0.55));
    const tw = w + M * 2, th = h + LIP + M * 2;
    const key = P().paint(scene, `kl:pad:keycap:${v()}:${label}:${w0.toFixed(1)}x${h.toFixed(1)}`, tw, th, (ctx) => {
      const x = M, y = M, rad = h * 0.26, rr = P().rr;
      ctx.save();
      ctx.shadowColor = 'rgba(6,8,30,0.45)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      rr(ctx, x - 2, y - 2, w + 4, h + LIP + 4, rad + 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.restore();
      rr(ctx, x, y + LIP, w, h, rad);
      ctx.fillStyle = P().C.whiteLip;
      ctx.fill();
      rr(ctx, x, y, w, h, rad);
      ctx.fillStyle = P().vgrad(ctx, y, y + h, P().C.white);
      ctx.fill();
      ctx.save(); // a soft light along the top
      rr(ctx, x, y, w, h, rad);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x, y, w, h * 0.3);
      ctx.restore();
      ctx.fillStyle = INK;
      const cx = x + w / 2, cy = y + h / 2;
      if (label in ARROWS) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ARROWS[label]);
        arrowPath(ctx, -h * 0.3, h * 0.3, h * 0.26, h * 0.1, h * 0.28);
        ctx.fill();
        ctx.restore();
        return;
      }
      ctx.font = FONT(px);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy + h * 0.04);
    });
    return { key, ox: (M + w / 2) / tw, oy: (M + h / 2) / th };
  }

  /* ----------------------------------------------------------- controller */
  KL.TouchControls = class TouchControls {
    /**
     * @param {Phaser.Scene} scene the HUD scene
     * @param {{ pads: KL.VirtualPad[], isLive: () => boolean }} opts  pads[0]: Player 1's
     *   isLive: false while the match is paused / over (touches are ignored then)
     */
    constructor(scene, { pads, isLive }) {
      this.scene = scene;
      this.pads = pads;
      this.isLive = isLive;
      const keys = KL.Save.settings.controls.p1;
      // keyboard players read their keys off the keycaps; a touch screen shows icons only
      const label = (action) => (KL.View.touch ? '' : KL.keyLabel(keys[action]));
      // a touch screen gets the thumb layout for its kind (KL.View.touch / phone are fixed per session)
      this.thumbs = KL.View.touch ? L().touch[KL.View.phone ? 'phone' : 'tablet'] : null;
      const specs = this.thumbs ? this.thumbs.buttons : L().solo;
      this.buttons = specs.map((spec) => this.build({ ...spec, player: 0, label: label(spec.action) }));

      // pointer id → button under it. Recomputed on every down / move / up, so sliding a finger
      // from ← to → (or from one kick onto the next) switches buttons without lifting it.
      this.owners = new Map();
      this.layout(KL.View); // the HUD re-runs it when the view changes
      const input = scene.input;
      this.onPointer = (p) => this.track(p);
      this.onUp = (p) => this.release(p);
      this.onBlur = () => this.releaseAll();
      input.on('pointerdown', this.onPointer);
      input.on('pointermove', this.onPointer);
      input.on('pointerup', this.onUp);
      input.on('pointerupoutside', this.onUp);
      scene.game.events.on(Phaser.Core.Events.BLUR, this.onBlur);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    }

    /**
     * Place the pad on the view (KL.View): each cluster in its bottom corner, inside the safe area,
     * scaled to the UI scale (capped so both hands fit side by side). Re-run when the view changes.
     */
    layout(V) {
      if (this.thumbs) this.placeThumbs(V, this.thumbs);
      else {
        const k = Math.min(V.ui, (V.right - V.left) / L().span);
        for (const b of this.buttons) {
          b.s = k;
          b.x = b.anchor === 'left' ? V.left + b.dx * k : V.right - b.dx * k;
          b.y = V.bottom - b.dy * k;
        }
      }
      for (const b of this.buttons) {
        b.root.setPosition(b.x, b.y);
        this.scene.tweens.killTweensOf(b.root);
        b.root.setScale(b.s);
        if (b.ready) this.pulse(b);
      }
      this.releaseAll(); // a finger on a button that just moved lets go
    }

    /**
     * Touch layout (KL.PAD_LAYOUT.touch): sets each button's x, y and scale s. Distances are measured
     * from the canvas's own edges, in CSS px (T.unit per unit), so the buttons land under the thumbs
     * at the same physical spot on every screen. The safe area only pushes a button in as far as half
     * its inset: the pad sits in the bottom corners, below a notch or island, where the rest of the
     * inset is just the screen's rounded corner.
     */
    placeThumbs(V, T) {
      const LIP = L().lip, groundY = KL.TUNING.world.groundY;
      const x0 = V.x, x1 = V.x + V.w, y1 = V.y + V.h;
      const inset = { left: (V.left - x0) / 2, right: (x1 - V.right) / 2, bottom: (y1 - V.bottom) / 2 };
      // a button's reach (units) above, below and to the side of its face centre: the Super's ring
      // is centred LIP / 2 below its face, every other button stands on its lip
      const up = (b) => (b.ringR ? b.ringR.r1 - b.ringR.y : rOut(b));
      const down = (b) => (b.ringR ? b.ringR.r1 + b.ringR.y : rOut(b) + LIP);
      const side = (b) => (b.ringR ? b.ringR.r1 : rOut(b));
      // as a circle round the middle of face + lip (LIP / 2 below the face centre), for the gaps
      const body = (b) => (b.ringR ? b.ringR.r1 : rOut(b) + LIP / 2);
      const max = (list, f) => Math.max(0, ...list.map(f));
      const highs = this.buttons.filter((b) => b.row === 'high'), lows = this.buttons.filter((b) => b.row === 'low');

      // logical px per unit, capped so the pad fits the grass and both hands keep apart
      let k = T.unit / V.css;
      const tall = T.topGap + max(highs, up) + (lows.length ? T.minRise + max(lows, down) : max(highs, down)) + T.bottomGap;
      k = Math.min(k, (y1 - inset.bottom - groundY) / tall);
      const reach = (anchor) => max(this.buttons.filter((b) => b.anchor === anchor), (b) => b.dx + side(b));
      k = Math.min(k, (x1 - x0 - inset.left - inset.right) / (reach('left') + reach('right') + T.gap));

      for (const anchor of ['left', 'right']) {
        // outermost first: each button keeps `space` clear of the ones already placed, so a zigzag
        // flattened by a short screen spreads sideways instead of overlapping
        const mine = this.buttons.filter((b) => b.anchor === anchor).sort((a, b) => a.dx - b.dx);
        // the high row's tops line up topGap under the players' feet; the low row hangs from it
        const top = groundY + T.topGap * k;
        const ref = top + max(mine.filter((b) => b.row === 'high'), up) * k;
        const placed = [];
        for (const b of mine) {
          b.s = k;
          b.y = b.row === 'high' ? top + up(b) * k : Math.max(ref, Math.min(ref + T.rise * k, y1 - inset.bottom - (T.bottomGap + down(b)) * k));
          let fromEdge = Math.max(b.dx * k, inset[anchor] + side(b) * k);
          for (const p of placed) {
            const d = (body(p.b) + body(b) + T.space) * k, dy = b.y - p.b.y;
            fromEdge = Math.max(fromEdge, p.fromEdge + Math.sqrt(Math.max(0, d * d - dy * dy)));
          }
          placed.push({ b, fromEdge });
          b.x = anchor === 'left' ? x0 + fromEdge : x1 - fromEdge;
        }
      }
    }

    /**
     * One button: root (placed and scaled by layout; the ready Super breathes on it) holds the Super's
     * glow and ring, the base, the ripple and `btn`, the part that moves when pressed: face, shine and
     * keycap.
     */
    build(spec) {
      const s = this.scene, Pt = KL.Paint, A = artOf(s);
      const b = { ...spec, lit: false, value: 0, ready: false, s: 1, x: 0, y: 0 };
      b.root = s.add.container(0, 0).setDepth(20);
      const isSuper = spec.icon === 'super';
      const face = (hot) => (A ? artFace : paintedFace)(s, b, hot, isSuper && !hot);
      // [charging / plain, ready]: only the Super has the ready pair
      b.looks = isSuper ? [face(false), face(true)] : [face(false)];
      b.bases = isSuper ? [baseLook(s, b, false), baseLook(s, b, true)] : [baseLook(s, b, false)];
      if (isSuper) {
        const R = (b.ringR = ringOf(b));
        b.glow = Pt.place(s, 0, R.y, Pt.glow(s, Math.round(R.r1 * 1.45), 'rgba(255,140,26,0.85)')).setVisible(false);
        b.track = Pt.place(s, 0, R.y, ringLook(s, b, 'track'));
        b.gold = Pt.place(s, 0, R.y, ringLook(s, b, 'gold'));
        // the gold shows as far round as the Super has charged: a pie mask, redrawn by setSuper. Not on
        // the display list (a mask is drawn in world space), so update() keeps it on the button.
        b.ringMask = s.make.graphics({}, false);
        b.gold.setMask(b.ringMask.createGeometryMask());
        b.root.add([b.glow, b.track, b.gold]);
        b.burstRing = Pt.place(s, 0, 0, rippleLook(s, b, 'rgba(255,150,40,1)')).setVisible(false);
      }
      b.base = Pt.place(s, 0, 0, b.bases[0]);
      b.ripple = Pt.place(s, 0, 0, rippleLook(s, b, 'rgba(255,238,160,1)')).setVisible(false);
      b.btn = s.add.container(0, 0);
      b.face = Pt.place(s, 0, 0, b.looks[0]);
      b.shine = Pt.place(s, 0, 0, shineLook(s, b)).setAlpha(0);
      b.btn.add([b.face, b.shine]);
      if (spec.label) {
        const K = (A && A.keycap) || L().keycap, R = rOut(b);
        b.btn.add(Pt.place(s, 0, K.y * R, keycapLook(s, spec.label, K.w * R, K.h * R)));
      }
      b.root.add([b.base, b.ripple, b.btn]);
      if (b.burstRing) b.root.add(b.burstRing);
      return b;
    }

    /** Which button a pointer is on (nearest wins when hit areas overlap), or null. */
    hit(pointer) {
      const w = KL.worldPoint(this.scene, pointer);
      const LIP = L().lip;
      let best = null, bestD = 1;
      for (const b of this.buttons) {
        const dx = (w.x - b.x) / b.s, dy = (w.y - b.y) / b.s - LIP / 2;
        // generous targets: fingers are wider than cursors, and ← / → meet with no dead strip
        // between them, so a thumb sliding across never lets go of the direction
        const d = Math.hypot(dx, dy) / (b.ringR ? b.ringR.r1 + 6 : b.r + 16);
        if (d <= bestD) {
          bestD = d;
          best = b;
        }
      }
      return best;
    }

    track(pointer) {
      const b = pointer.isDown && this.isLive() ? this.hit(pointer) : null;
      if (b) this.owners.set(pointer.id, b);
      else if (!this.owners.delete(pointer.id)) return;
      this.sync();
    }

    release(pointer) {
      if (this.owners.delete(pointer.id)) this.sync();
    }

    releaseAll() {
      this.owners.clear();
      this.pads.forEach((p) => p?.clear());
    }

    sync() {
      const held = this.pads.map(() => new Set());
      for (const b of this.owners.values()) held[b.player].add(b.action);
      this.pads.forEach((pad, i) => pad?.setHeld(held[i]));
    }

    /* ------------------------------------------------------------ motion */
    /** Down: the button sinks onto its lip and shrinks a touch, its face flashes bright, a ring ripples out. */
    pressIn(b) {
      const tw = this.scene.tweens, M = L().press, calm = KL.Motion?.reduced;
      tw.killTweensOf([b.btn, b.shine]);
      tw.add({ targets: b.btn, y: L().lip - 1, scaleX: M.scale, scaleY: M.scale, duration: KL.paced(M.downMs), ease: 'Quad.easeOut' });
      b.shine.setAlpha(M.shine);
      tw.add({ targets: b.shine, alpha: M.held, duration: KL.paced(180), ease: 'Quad.easeOut' });
      if (!calm) this.ring(b.ripple, M.rippleTo, M.rippleMs, 0.85);
      if (b.action === 'super' && !b.ready && !calm) this.notYet(b);
    }

    /** Up: it springs back, overshooting a little before it settles; the flash fades. */
    pressOut(b) {
      const tw = this.scene.tweens, M = L().press, calm = KL.Motion?.reduced;
      tw.killTweensOf([b.btn, b.shine]);
      tw.add({
        targets: b.btn,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        duration: KL.paced(calm ? 120 : M.upMs),
        ease: calm ? 'Quad.easeOut' : 'Back.easeOut',
        easeParams: calm ? undefined : [M.overshoot],
      });
      tw.add({ targets: b.shine, alpha: 0, duration: KL.paced(200), ease: 'Quad.easeOut' });
    }

    /** A ring grows out from the button and fades. */
    ring(img, to, ms, alpha) {
      const tw = this.scene.tweens;
      tw.killTweensOf(img);
      img.setVisible(true).setAlpha(alpha).setScale(1 / KL.UIRES);
      tw.add({
        targets: img,
        scaleX: to / KL.UIRES,
        scaleY: to / KL.UIRES,
        alpha: 0,
        duration: KL.paced(ms),
        ease: 'Cubic.easeOut',
        onComplete: () => img.setVisible(false),
      });
    }

    /** The Super pressed before it is ready: a quick, fading side-to-side wiggle ("not yet"). */
    notYet(b) {
      b.wiggle?.stop();
      b.wiggle = this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: KL.paced(300),
        onUpdate: (t) => b.btn.setX(Math.sin(t.getValue() * Math.PI * 5) * 3.5 * (1 - t.getValue())),
        onComplete: () => b.btn.setX(0),
      });
    }

    /** The Super just came ready: it pops (bigger, then back with a bounce) and an orange ring bursts out. */
    burst(b) {
      if (KL.Motion?.reduced) return;
      const tw = this.scene.tweens;
      tw.killTweensOf(b.btn);
      b.btn.setScale(1.22).setY(0);
      tw.add({ targets: b.btn, scaleX: 1, scaleY: 1, duration: KL.paced(420), ease: 'Back.easeOut', easeParams: [3] });
      this.ring(b.burstRing, 1.7, 520, 1);
    }

    /** Show the Super's face and lip for its state: charging (fireball dimmed) or ready (orange). */
    paintFace(b) {
      const look = b.looks[b.ready ? 1 : 0], base = b.bases[b.ready ? 1 : 0];
      b.face.setTexture(look.key).setOrigin(look.ox, look.oy);
      b.base.setTexture(base.key).setOrigin(base.ox, base.oy);
    }

    /** Per frame: press in the buttons that are held (by key or touch) or were just tapped. */
    update() {
      const now = performance.now();
      const flash = L().flashMs;
      for (const b of this.buttons) {
        const pad = this.pads[b.player];
        const lit = !!pad && (pad.isDown(b.action) || now - (pad.pressedAt[b.action] ?? -1e9) < flash);
        if (lit !== b.lit) {
          b.lit = lit;
          if (lit) this.pressIn(b);
          else this.pressOut(b);
        }
        b.ringMask?.setPosition(b.root.x, b.root.y + b.ringR.y * b.root.scaleY).setScale(b.root.scaleX);
      }
    }

    /** Charge ring on a player's Super button. Returns false if that player has no button (CPU). */
    setSuper(player, value) {
      const b = this.buttons.find((x) => x.player === player && x.action === 'super');
      if (!b) return false;
      const max = KL.TUNING.super.max;
      const ready = value >= max;
      b.value = value;
      if (ready !== b.ready) {
        b.ready = ready;
        this.paintFace(b);
        this.pulse(b);
        if (ready) this.burst(b);
      }
      // reveal the ring's gold clockwise from the top
      const p = Phaser.Math.Clamp(value / max, 0, 1);
      const g = b.ringMask, R = b.ringR.r1 + 2;
      g.clear().fillStyle(0xffffff, 1);
      if (p >= 1) g.fillCircle(0, 0, R);
      else if (p > 0) g.slice(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p, false).fillPath();
      return true;
    }

    /** The Super button glows and breathes while the Super is ready (relative to the pad scale). */
    pulse(b) {
      const tw = this.scene.tweens;
      tw.killTweensOf([b.glow, b.root]);
      b.root.setScale(b.s);
      b.glow.setVisible(b.ready).setAlpha(0.5);
      if (!b.ready) return;
      tw.add({ targets: b.glow, alpha: 1, duration: KL.paced(420), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      if (KL.Motion?.reduced) return;
      tw.add({ targets: b.root, scaleX: b.s * 1.05, scaleY: b.s * 1.05, duration: KL.paced(420), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }

    destroy() {
      const input = this.scene.input;
      input?.off('pointerdown', this.onPointer);
      input?.off('pointermove', this.onPointer);
      input?.off('pointerup', this.onUp);
      input?.off('pointerupoutside', this.onUp);
      this.scene.game?.events.off(Phaser.Core.Events.BLUR, this.onBlur);
      this.releaseAll();
      for (const b of this.buttons) {
        b.wiggle?.stop();
        b.ringMask?.destroy(); // off the display list: the scene won't free it
      }
    }
  };
})();
