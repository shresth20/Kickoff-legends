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
  KL.UI_COLORS = C;

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

  /* --------------------------------------------------------------- keycap */
  const measureCtx = document.createElement('canvas').getContext('2d');
  const KEY_FONT = (px) => `700 ${px}px Oswald, "Arial Narrow", sans-serif`; // key names are Latin in every locale
  /** Light key cap with the key's label printed on it, h logical px tall; width grows with the label. */
  function keycap(scene, label, h) {
    const long = label.length > 2;
    const fontPx = Math.round(h * (long ? 0.42 : 0.58));
    measureCtx.font = KEY_FONT(fontPx);
    const w = Math.max(h, Math.ceil(measureCtx.measureText(label).width + h * 0.55));
    const M = 3, LIP = Math.max(2, Math.round(h * 0.12));
    const tw = w + M * 2, th = h + M * 2 + LIP;
    const key = paint(scene, `kl:key:${label}:${h}`, tw, th, (ctx) => {
      const r = Math.max(5, h * 0.24);
      rr(ctx, M - 1.5, M - 1.5, w + 3, h + LIP + 3, r + 1.5);
      ctx.fillStyle = C.ink;
      ctx.fill();
      rr(ctx, M, M + LIP, w, h, r);
      ctx.fillStyle = C.whiteLip;
      ctx.fill();
      rr(ctx, M, M, w, h, r);
      ctx.fillStyle = vgrad(ctx, M, M + h, C.white);
      ctx.fill();
      ctx.font = KEY_FONT(fontPx);
      ctx.fillStyle = C.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, M + w / 2, M + h / 2 + fontPx * 0.04);
    });
    return { key, ox: (M + w / 2) / tw, oy: (M + h / 2) / th, w };
  }

  /* ----------------------------------------------------------- super ring */
  /** Meter socket: ink disc, gold rim, dark track the fill arc is drawn on (radius r = track centre). */
  function ring(scene, r, track) {
    const outer = r + track / 2 + 6;
    const S = outer + 6;
    const key = paint(scene, `kl:ring:${r}:${track}`, S * 2, S * 2 + 4, (ctx) => {
      ctx.save();
      ctx.shadowColor = 'rgba(5,7,25,0.5)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      circle(ctx, S, S, outer + 2);
      ctx.fillStyle = C.ink;
      ctx.fill();
      ctx.restore();
      const g = ctx.createLinearGradient(0, S - outer, 0, S + outer);
      g.addColorStop(0, '#FFE45C');
      g.addColorStop(1, '#D9930C');
      circle(ctx, S, S, outer);
      ctx.fillStyle = g;
      ctx.fill();
      circle(ctx, S, S, r + track / 2 + 1.5);
      ctx.fillStyle = C.ink;
      ctx.fill();
      circle(ctx, S, S, r);
      ctx.lineWidth = track;
      ctx.strokeStyle = '#2A2F5C';
      ctx.stroke();
      circle(ctx, S, S, r - track / 2 - 0.5);
      ctx.fillStyle = vgrad(ctx, S - r, S + r, C.face);
      ctx.fill();
    });
    return { key, ox: 0.5, oy: S / (S * 2 + 4) };
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
      const t = size * 0.17, ink = size * 0.085, drop = size * 0.07;
      const h = size / 2 - t / 2 - ink;
      const a = exit ? h * 0.24 : h, arm = h * 0.62;
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

  KL.Paint = { C, rr, vgrad, tint, circle, stud, gloss, paint, place, button, panel, card, keycap, ring, glow, fullscreenIcon };
})();
