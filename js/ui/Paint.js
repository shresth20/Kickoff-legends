/* UI painter — "CSS in canvas".
 * Every flat UI element (buttons, panels, cards, key caps, the HUD plate, meter rings) is drawn
 * in code with the same primitives CSS uses — border-radius, linear/radial gradients, inset
 * borders, glossy highlights and blurred drop shadows — straight into a canvas at the screen's real
 * pixel density (KL.UIRES: KL.RES, times the UI scale on phones, whose UI is shown scaled up). Unlike stretched bitmap art they stay razor sharp at any size, and each
 * variant is painted once per session and cached as a texture (keys start with "kl:").
 *
 * Painters return a "spec" { key, ox, oy } — the texture plus the origin that puts the element's
 * face centre on the image position (margins for shadows/focus rings are not symmetric).
 * KL.Paint.place(scene, x, y, spec) adds it as an image at 1 texture px = 1 device px. */
window.KL = window.KL || {};

(() => {
  /** Palette (gradient stops run top → bottom). */
  const C = {
    ink: '#1B1F3B',
    gold: ['#FFEA6E', '#F8CC22', '#EAA912'],
    goldLip: '#B5770B',
    navy: ['#3A5AD4', '#2740A6', '#1D2E84'],
    navyLip: '#121A50',
    face: ['#2D3C9F', '#212D80', '#1A2366'],
    grey: ['#B9BED0', '#9DA3BA', '#858BA3'],
    greyLip: '#5D6279',
    purple: ['#9466F5', '#6E43D6', '#5531B5'],
    white: ['#FFFFFF', '#F2F4FA', '#DDE1EE'],
    whiteLip: '#99A0B9',
  };

  /* ------------------------------------------------------------ primitives */
  const rr = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  };
  const vgrad = (ctx, y0, y1, stops) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach((c, i) => g.addColorStop(i / Math.max(1, stops.length - 1), c));
    return g;
  };
  /** Mix a #rrggbb colour toward white (amt > 0) or black (amt < 0), amt in -1..1. */
  const tint = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    const to = amt > 0 ? 255 : 0, a = Math.abs(amt);
    const ch = (v) => Math.round(v + (to - v) * a);
    return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  };
  const circle = (ctx, x, y, r) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  };
  /** Gold rivet with a specular highlight (radial-gradient). */
  const stud = (ctx, x, y, r) => {
    circle(ctx, x, y + 1.5, r + 2);
    ctx.fillStyle = 'rgba(8,10,35,0.45)';
    ctx.fill();
    circle(ctx, x, y, r + 1.5);
    ctx.fillStyle = C.ink;
    ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#FFF8C8');
    g.addColorStop(0.45, '#F8CF2A');
    g.addColorStop(1, '#C3850B');
    circle(ctx, x, y, r);
    ctx.fillStyle = g;
    ctx.fill();
  };
  /** Top gloss band clipped to the current path's interior (the "glass" highlight on buttons). */
  const gloss = (ctx, x, y, w, h, alpha = 0.5) => {
    rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = vgrad(ctx, y, y + h, [`rgba(255,255,255,${alpha})`, 'rgba(255,255,255,0.04)']);
    ctx.fill();
  };

  /** Paint once into a canvas texture at device resolution (w×h in logical px). Returns the key. */
  function paint(scene, key, w, h, draw) {
    const tm = scene.textures;
    if (tm.exists(key)) return key;
    const R = KL.UIRES;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * R);
    canvas.height = Math.ceil(h * R);
    const ctx = canvas.getContext('2d');
    ctx.scale(R, R);
    draw(ctx, w, h);
    tm.addImage(key, canvas); // static: no CanvasTexture (it would keep a CPU copy of every pixel)
    return key;
  }

  /** Add a painted spec as an image whose (x, y) is the element's face centre. */
  const place = (scene, x, y, spec) => scene.add.image(x, y, spec.key).setOrigin(spec.ox, spec.oy).setScale(1 / KL.UIRES);

  /* --------------------------------------------------------------- button */
  const BTN_M = 10; // room for the focus ring and drop shadow
  const BTN_LIP = 5; // the 3D underside
  /**
   * kind 'primary' (gold) | 'secondary' (navy, gold inner border) | 'icon' (square navy)
   * state 0 idle · 1 hover/focus · 2 pressed · 3 disabled
   */
  function button(scene, kind, state, w, h) {
    const M = BTN_M, LIP = BTN_LIP;
    const tw = w + M * 2, th = h + M * 2 + LIP;
    const key = paint(scene, `kl:btn:${kind}:${state}:${w}x${h}`, tw, th, (ctx) => {
      const r = kind === 'icon' ? Math.min(16, h * 0.3) : h * 0.46;
      const pressed = state === 2, hot = state === 1;
      const pal = state === 3 ? 'grey' : kind === 'primary' ? 'gold' : 'navy';
      const fy = M + (pressed ? LIP - 1 : 0); // the face sinks into the lip when pressed
      const bottom = M + LIP + h;
      if (!pressed) {
        ctx.save();
        ctx.shadowColor = 'rgba(6,8,30,0.5)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;
        rr(ctx, M, M + LIP, w, h, r);
        ctx.fillStyle = C.ink;
        ctx.fill();
        ctx.restore();
      }
      // ink outline around face + lip, then the lip, then the face
      rr(ctx, M - 2.5, fy - 2.5, w + 5, bottom - fy + 5, r + 2.5);
      ctx.fillStyle = C.ink;
      ctx.fill();
      rr(ctx, M, M + LIP, w, h, r);
      ctx.fillStyle = C[`${pal}Lip`];
      ctx.fill();
      rr(ctx, M, fy, w, h, r);
      ctx.fillStyle = vgrad(ctx, fy, fy + h, hot ? C[pal].map((c) => tint(c, 0.16)) : C[pal]);
      ctx.fill();
      ctx.save();
      rr(ctx, M, fy, w, h, r);
      ctx.clip();
      if (pal === 'navy') {
        rr(ctx, M + 1.5, fy + 1.5, w - 3, h - 3, r - 1.5);
        ctx.lineWidth = 3;
        ctx.strokeStyle = hot ? '#FFE867' : '#F5C518';
        ctx.stroke();
      } else {
        rr(ctx, M + 1, fy + 1, w - 2, h - 2, r - 1);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.stroke();
      }
      const gi = pal === 'navy' ? 5 : 4;
      gloss(ctx, M + gi + r * 0.35, fy + gi, w - gi * 2 - r * 0.7, h * 0.36, pal === 'navy' ? 0.38 : 0.6);
      ctx.restore();
      if (hot) {
        // focus ring: outline 3px + 3px offset, with an ink edge so it reads on any background
        rr(ctx, M - 7, fy - 7, w + 14, bottom - fy + 14, r + 7);
        ctx.lineWidth = 5;
        ctx.strokeStyle = C.ink;
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.strokeStyle = pal === 'gold' ? '#FFFFFF' : '#FFE867';
        ctx.stroke();
      }
    });
    return { key, ox: (M + w / 2) / tw, oy: (M + h / 2) / th, lip: LIP };
  }

  /* ----------------------------------------------------------------- pill */
  /**
   * The welcome screen's pill buttons, drawn to match its art: a soft ink drop, a white rim, an ink
   * outline, then a glossy face (orange-gold for Play, blue for the others) with its ends shaded, a
   * light streak along the top, a glint in the top-left curve and a lip along the bottom.
   * kind 'play' | 'blue'; state as button(): 0 idle · 1 hover/focus (brighter, glowing) · 2 pressed.
   * w×h is the outer size, white rim included.
   */
  const PILL = {
    play: {
      face: [[0, '#FFD733'], [0.14, '#FECB14'], [0.45, '#FEB405'], [0.8, '#FD9502'], [0.86, '#FDB803'], [0.92, '#FD8E01'], [1, '#FB8500']],
      lipLine: '#FDCF01', lip: '#D14902', ends: 'rgba(236,104,0,0.6)', streak: 'rgba(255,250,205,0.9)', glint: '#FFFFFF', halo: 'rgba(255,236,140,0.95)',
    },
    blue: {
      face: [[0, '#2B7DF0'], [0.3, '#1A5DCC'], [0.7, '#0E3EA6'], [1, '#0A2A90']],
      lipLine: '#0B2A92', lip: '#0D2FB2', ends: 'rgba(5,28,110,0.55)', streak: 'rgba(120,225,255,0.55)', glint: '#7FE6FF', halo: 'rgba(160,220,255,0.95)',
    },
  };
  const clear = (rgba) => rgba.replace(/[\d.]+\)$/, '0)');
  function pill(scene, kind, state, w, h) {
    const M = 16; // room for the drop and the focus glow
    const tw = w + M * 2, th = h + M * 2;
    const key = paint(scene, `kl:pill:${kind}:${state}:${w}x${h}`, tw, th, (ctx) => {
      const P = PILL[kind] || PILL.blue;
      const pressed = state === 2, hot = state === 1;
      const shade = (c) => (hot ? tint(c, 0.12) : pressed ? tint(c, -0.06) : c);
      const x = M, y = M + (pressed ? 2 : 0), r = h / 2;
      const edge = 1.5, rim = Math.max(3.5, h * 0.045), ink = Math.max(3, h * 0.034);
      // a glow when focused, else a soft ink drop (none while pressed: the button is pushed in)
      ctx.save();
      if (hot) {
        ctx.shadowColor = P.halo;
        ctx.shadowBlur = 16;
      } else if (!pressed) {
        ctx.shadowColor = 'rgba(4,8,40,0.55)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
      }
      rr(ctx, x, y, w, h, r);
      ctx.fillStyle = '#0B1240';
      ctx.fill();
      if (hot) ctx.fill(); // twice: a glow that reads on the grass
      ctx.restore();
      // white rim inside a hairline of ink, then the ink outline
      rr(ctx, x + edge, y + edge, w - edge * 2, h - edge * 2, r - edge);
      ctx.fillStyle = vgrad(ctx, y, y + h, ['#FFFFFF', '#F4F5FA', '#E3E5F2']);
      ctx.fill();
      const o = edge + rim;
      rr(ctx, x + o, y + o, w - o * 2, h - o * 2, r - o);
      ctx.fillStyle = C.ink;
      ctx.fill();
      // the face: lip colour underneath, a bright line, then the face proper, whose rounded bottom
      // leaves the lip showing as a crescent
      const f = o + ink;
      const fx = x + f, fy = y + f, fw = w - f * 2, fh = h - f * 2, fr = fh / 2;
      const top = fh - Math.max(2, fh * 0.075);
      ctx.save();
      rr(ctx, fx, fy, fw, fh, fr);
      ctx.clip();
      ctx.fillStyle = shade(P.lip);
      ctx.fillRect(fx, fy, fw, fh);
      rr(ctx, fx, fy, fw, top + Math.max(1, fh * 0.025), fr);
      ctx.fillStyle = shade(P.lipLine);
      ctx.fill();
      const g = ctx.createLinearGradient(0, fy, 0, fy + top);
      for (const [at, c] of P.face) g.addColorStop(at, shade(c));
      rr(ctx, fx, fy, fw, top, fr);
      ctx.fillStyle = g;
      ctx.fill();
      // the rounded ends darken towards the outline
      const e = Math.min(0.2, (fr * 0.55) / fw);
      const eg = ctx.createLinearGradient(fx, 0, fx + fw, 0);
      eg.addColorStop(0, P.ends);
      eg.addColorStop(e, clear(P.ends));
      eg.addColorStop(1 - e, clear(P.ends));
      eg.addColorStop(1, P.ends);
      ctx.fillStyle = eg;
      ctx.fill();
      // light streak along the top, glint in the top-left curve
      const sh = Math.max(2, fh * 0.1), sy = fy + fh * 0.09;
      rr(ctx, fx + fr * 0.75, sy, fw - fr * 1.5, sh, sh / 2);
      ctx.fillStyle = vgrad(ctx, sy, sy + sh, [P.streak, P.streak.replace(/[\d.]+\)$/, '0.15)')]);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(fx + fr, fy + fr, fr * 0.72, Math.PI * 1.08, Math.PI * 1.42);
      ctx.lineWidth = Math.max(2, fh * 0.075);
      ctx.lineCap = 'round';
      ctx.strokeStyle = P.glint;
      ctx.stroke();
      ctx.restore();
    });
    return { key, ox: 0.5, oy: (M + h / 2) / th, lip: 3 };
  }

  /** The Play button's glyph: an ink-blue rounded triangle pointing right with a white rim, `size` px tall. */
  function playIcon(scene, size) {
    const M = Math.ceil(size * 0.06), S = size + M * 2;
    const key = paint(scene, `kl:icon:play:${size}`, S, S, (ctx) => {
      const corner = size * 0.1, rim = Math.max(2, size * 0.055);
      const pad = corner + rim; // the polygon sits inside the rounding and the rim
      const ph = size - pad * 2, pw = ph * 0.88;
      const x0 = S / 2 - pw / 2 - size * 0.02, y0 = M + pad; // nudged left: a triangle's weight is on its flat side
      const tri = () => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + pw, y0 + ph / 2);
        ctx.lineTo(x0, y0 + ph);
        ctx.closePath();
      };
      ctx.lineJoin = 'round';
      tri();
      ctx.fillStyle = ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = pad * 2;
      ctx.fill();
      ctx.stroke();
      tri();
      ctx.fillStyle = ctx.strokeStyle = vgrad(ctx, y0 - corner, y0 + ph + corner, ['#1C3784', '#0B2468', '#061654']);
      ctx.lineWidth = corner * 2;
      ctx.fill();
      ctx.stroke();
    });
    return { key, ox: 0.5, oy: 0.5 };
  }

  /* ------------------------------------------------------------- football */
  /**
   * A football's panels seen from the front, on the unit sphere: the 12 pentagons and 30 seams of a
   * truncated icosahedron (pentagon centres = icosahedron vertices, corners a third of the way along
   * its edges), turned so one pentagon faces you, tipped a little to look round.
   */
  const FOOTBALL = (() => {
    const phi = (1 + Math.sqrt(5)) / 2;
    const norm = (v) => {
      const l = Math.hypot(...v);
      return v.map((c) => c / l);
    };
    const rotX = ([x, y, z], a) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
    const rotY = ([x, y, z], a) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const lerp = (a, b, t) => norm(a.map((c, i) => c + (b[i] - c) * t));
    let V = [];
    for (const s of [-1, 1]) for (const p of [-phi, phi]) V.push([0, s, p], [s, p, 0], [p, 0, s]);
    // (0, 1, φ) to the front, then a small tilt
    V = V.map((v) => rotY(rotX(rotX(norm(v), Math.atan2(1, phi)), -0.32), 0.22));
    const near = (i) => V.map((_, j) => j).filter((j) => j !== i && dot(V[i], V[j]) > 0.4);
    const pentagons = V.map((v, i) => {
      // corners in order round the centre: sort by angle in a tangent basis at v
      const e1 = norm(Math.abs(v[0]) < 0.9 ? [0, -v[2], v[1]] : [-v[1], v[0], 0]);
      const e2 = [v[1] * e1[2] - v[2] * e1[1], v[2] * e1[0] - v[0] * e1[2], v[0] * e1[1] - v[1] * e1[0]];
      const corners = near(i).map((j) => lerp(v, V[j], 1 / 3));
      corners.sort((a, b) => Math.atan2(dot(a, e2), dot(a, e1)) - Math.atan2(dot(b, e2), dot(b, e1)));
      return { centre: v, corners };
    });
    const seams = [];
    V.forEach((v, i) => near(i).forEach((j) => j > i && seams.push([lerp(v, V[j], 1 / 3), lerp(v, V[j], 2 / 3)])));
    return { pentagons, seams };
  })();

  /** The ball's white body with its ink pentagons and seams, r px in radius, centred on (cx, cy). */
  function ballPanels(ctx, cx, cy, r) {
    // a point on the sphere → canvas; a point round the back is pushed out to the rim
    const at = ([x, y, z]) => {
      const k = z < 0 ? 1 / Math.max(1e-6, Math.hypot(x, y)) : 1;
      return [cx + x * k * r, cy - y * k * r];
    };
    circle(ctx, cx, cy, r);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.save();
    circle(ctx, cx, cy, r);
    ctx.clip();
    ctx.strokeStyle = ctx.fillStyle = C.ink;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, r * 0.07);
    for (const [a, b] of FOOTBALL.seams) {
      if (a[2] + b[2] <= 0) continue;
      ctx.beginPath();
      ctx.moveTo(...at(a));
      ctx.lineTo(...at(b));
      ctx.stroke();
    }
    for (const p of FOOTBALL.pentagons) {
      if (p.centre[2] < -0.25) continue;
      ctx.beginPath();
      p.corners.forEach((q, k) => (k ? ctx.lineTo(...at(q)) : ctx.moveTo(...at(q))));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The ball's highlight and round shading over its panels (no outline). */
  function ballLight(ctx, cx, cy, r) {
    const g = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.05, cx, cy, r * 1.02);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.32, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(20,24,70,0)');
    g.addColorStop(1, 'rgba(20,24,70,0.5)');
    circle(ctx, cx, cy, r);
    ctx.fillStyle = g;
    ctx.fill();
  }

  /** A whole ball (panels + light) drawn straight into ctx, for icons. Outline it yourself. */
  const ball = (ctx, cx, cy, r) => (ballPanels(ctx, cx, cy, r), ballLight(ctx, cx, cy, r));

  /**
   * The loading line's ball, r px in radius, in two layers so it can roll: `panels` (white ball, ink
   * pentagons and seams: rotate this one) and `light` (highlight, shading and outline, which stay put).
   */
  function football(scene, r) {
    const S = Math.ceil(r * 2 + 6), c = S / 2;
    const panels = paint(scene, `kl:football:${r}`, S, S, (ctx) => ballPanels(ctx, c, c, r));
    const light = paint(scene, `kl:football-light:${r}`, S, S, (ctx) => {
      ballLight(ctx, c, c, r);
      circle(ctx, c, c, r);
      ctx.lineWidth = Math.max(1.5, r * 0.09);
      ctx.strokeStyle = C.ink;
      ctx.stroke();
    });
    return { panels: { key: panels, ox: 0.5, oy: 0.5 }, light: { key: light, ox: 0.5, oy: 0.5 } };
  }

  /* ---------------------------------------------------------------- panel */
  /** The gold-framed navy board used for dialogs (Pause, Settings, Result). */
  function panel(scene, w, h) {
    const P = 18, B = 14, R0 = 30;
    const tw = w + P * 2, th = h + P * 2 + 8;
    const key = paint(scene, `kl:panel:${w}x${h}`, tw, th, (ctx) => {
      const x = P, y = P;
      ctx.save();
      ctx.shadowColor = 'rgba(5,7,25,0.55)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
      rr(ctx, x, y, w, h, R0);
      ctx.fillStyle = C.ink;
      ctx.fill();
      ctx.restore();
      rr(ctx, x - 3, y - 3, w + 6, h + 6, R0 + 3);
      ctx.fillStyle = C.ink;
      ctx.fill();
      // gold frame with a bevel and two diagonal glints
      rr(ctx, x, y, w, h, R0);
      ctx.fillStyle = vgrad(ctx, y, y + h, ['#FFE45C', '#F7C81C', '#E39C0E']);
      ctx.fill();
      ctx.save();
      rr(ctx, x, y, w, h, R0);
      ctx.clip();
      rr(ctx, x + 2, y + 2, w - 4, h - 4, R0 - 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      for (const [gx, gw] of [[0.12, 46], [0.2, 16], [0.78, 34]]) {
        ctx.beginPath();
        ctx.moveTo(x + w * gx, y);
        ctx.lineTo(x + w * gx + gw, y);
        ctx.lineTo(x + w * gx + gw - B * 1.4, y + B);
        ctx.lineTo(x + w * gx - B * 1.4, y + B);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // inner ink line + navy face
      const fx = x + B, fy = y + B, fw = w - B * 2, fh = h - B * 2, fr = Math.max(10, R0 - B + 2);
      rr(ctx, fx - 3, fy - 3, fw + 6, fh + 6, fr + 3);
      ctx.fillStyle = C.ink;
      ctx.fill();
      rr(ctx, fx, fy, fw, fh, fr);
      ctx.fillStyle = vgrad(ctx, fy, fy + fh, C.face);
      ctx.fill();
      ctx.save();
      rr(ctx, fx, fy, fw, fh, fr);
      ctx.clip();
      ctx.beginPath(); // light wedge from the top-left corner
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.min(fw * 0.45, 420), fy);
      ctx.lineTo(fx, fy + Math.min(fh * 0.6, 300));
      ctx.closePath();
      ctx.fillStyle = 'rgba(130,160,255,0.10)';
      ctx.fill();
      ctx.fillStyle = vgrad(ctx, fy, fy + 16, ['rgba(4,6,28,0.5)', 'rgba(4,6,28,0)']); // inset shadow
      ctx.fillRect(fx, fy, fw, 16);
      ctx.restore();
      const s = B + 13;
      for (const [sx, sy] of [[x + s, y + s], [x + w - s, y + s], [x + s, y + h - s], [x + w - s, y + h - s]]) stud(ctx, sx, sy, 7);
    });
    return { key, ox: (P + w / 2) / tw, oy: (P + h / 2) / th };
  }

  /* ----------------------------------------------------------------- card */
  /** Selectable tile. variant 'idle' (navy, gold rim) | 'focus' (navy, glowing white rim) | 'selected' (gold, white rim). */
  function card(scene, w, h, variant, r = 18) {
    const M = 14, LIP = 6;
    const tw = w + M * 2, th = h + M * 2 + LIP;
    const key = paint(scene, `kl:card:${variant}:${w}x${h}:${r}`, tw, th, (ctx) => {
      const x = M, y = M;
      const bw = variant === 'idle' ? 4 : 5;
      ctx.save();
      ctx.shadowColor = variant === 'focus' ? 'rgba(255,233,120,0.85)' : 'rgba(5,7,25,0.5)';
      ctx.shadowBlur = variant === 'focus' ? 16 : 10;
      ctx.shadowOffsetY = variant === 'focus' ? 0 : 4;
      rr(ctx, x - 2.5, y - 2.5, w + 5, h + LIP + 5, r + 2.5);
      ctx.fillStyle = C.ink;
      ctx.fill();
      ctx.restore();
      rr(ctx, x, y + LIP, w, h, r); // lip
      ctx.fillStyle = variant === 'selected' ? C.goldLip : C.navyLip;
      ctx.fill();
      rr(ctx, x, y, w, h, r); // rim
      ctx.fillStyle = vgrad(ctx, y, y + h, variant === 'idle' ? ['#FFE45C', '#E9A912'] : ['#FFFFFF', '#DCE0EC']);
      ctx.fill();
      rr(ctx, x + bw, y + bw, w - bw * 2, h - bw * 2, r - bw);
      ctx.fillStyle = vgrad(ctx, y + bw, y + h - bw, variant === 'selected' ? C.gold : variant === 'focus' ? C.face.map((c) => tint(c, 0.08)) : C.face);
      ctx.fill();
      ctx.save();
      rr(ctx, x + bw, y + bw, w - bw * 2, h - bw * 2, r - bw);
      ctx.clip();
      ctx.fillStyle = vgrad(ctx, y + bw, y + bw + h * 0.45, [`rgba(255,255,255,${variant === 'selected' ? 0.35 : 0.1})`, 'rgba(255,255,255,0)']);
      ctx.fillRect(x, y, w, h * 0.45 + bw);
      ctx.restore();
    });
    return { key, ox: (M + w / 2) / tw, oy: (M + h / 2) / th };
  }

  /** Soft radial glow (box-shadow-like halo), e.g. behind a ready super meter. */
  function glow(scene, r, color) {
    const key = paint(scene, `kl:glow:${r}:${color}`, r * 2, r * 2, (ctx) => {
      const g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, color);
      g.addColorStop(0.55, color.replace(/[\d.]+\)$/, '0.35)'));
      g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, r * 2, r * 2);
    });
    return { key, ox: 0.5, oy: 0.5 };
  }

  /**
   * Full-screen glyph in the style of the ui_icons art (white, thick ink outline, hard ink drop),
   * `size` px across: four corner brackets pointing out (enter) or in (exit).
   */
  function fullscreenIcon(scene, size, exit) {
    const M = Math.ceil(size * 0.16), S = size + M * 2;
    const key = paint(scene, `kl:icon:fullscreen:${size}:${exit ? 1 : 0}`, S, S, (ctx) => {
      ctx.translate(S / 2, S / 2 - size * 0.03);
      // enter: corners at the edge, arms in · exit: corners a third of the way in, arms out to the
      // edge, a little thinner so the four brackets stay apart and read as brackets (not a blob)
      const t = size * (exit ? 0.13 : 0.17), ink = size * 0.085, drop = size * 0.07;
      const h = size / 2 - t / 2 - ink;
      const a = exit ? h * 0.34 : h, arm = exit ? h * 0.66 : h * 0.62;
      const brackets = () => {
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const cx = sx * a, cy = sy * a, d = exit ? 1 : -1; // arms run out from the corner (exit) or in (enter)
          ctx.moveTo(cx, cy + d * sy * arm);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx + d * sx * arm, cy);
        }
      };
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = t + ink * 2;
      ctx.save();
      ctx.translate(0, drop);
      brackets();
      ctx.stroke();
      ctx.restore();
      brackets();
      ctx.stroke();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = t;
      brackets();
      ctx.stroke();
    });
    return { key, ox: 0.5, oy: 0.5 };
  }

  KL.Paint = { C, rr, vgrad, tint, circle, stud, gloss, paint, place, button, pill, playIcon, ball, football, panel, card, glow, fullscreenIcon };
})();
