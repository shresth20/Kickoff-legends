/* Procedural stand-in art, generated at runtime when the sliced atlases are
 * missing (before `npm run assets:build`). Produces the SAME texture keys and
 * frame names as the real atlases, so game code never branches on art source.
 * Characters are cel-shaded chibis with per-state poses so timing can be tuned
 * before the ChatGPT art lands. */
window.KL = window.KL || {};

(() => {
  const CELL = 256;
  const INK = '#1B1F3B';
  const T = () => KL.TUNING;

  const makeCanvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const rr = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
  };
  const shade = (hex, amt) => {
    const n = parseInt(hex.replace('#', ''), 16);
    const cl = (v) => Math.max(0, Math.min(255, v));
    const r = cl((n >> 16) + amt), g = cl(((n >> 8) & 0xff) + amt), b = cl((n & 0xff) + amt);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };
  const pad2 = (i) => String(i).padStart(2, '0');

  /* ------------------------------------------------------------ characters */
  const base = { bodyDy: 0, lean: 0, frontLeg: 0, backLeg: 0, frontArm: 0, backArm: 0, headTilt: 0, squash: 1, mouth: 'smile', eyes: 'open' };

  function pose(state, i, n) {
    const t = n > 1 ? i / (n - 1) : 0;
    const s = Math.sin(t * Math.PI);
    switch (state) {
      case 'idle':
        return { ...base, bodyDy: -3 * Math.sin((i / n) * Math.PI * 2), eyes: i === 3 ? 'closed' : 'open' };
      case 'run': {
        const ph = (i / n) * Math.PI * 2;
        return { ...base, lean: 0.18, frontLeg: Math.sin(ph) * 0.9, backLeg: -Math.sin(ph) * 0.9, frontArm: -Math.sin(ph) * 0.8, backArm: Math.sin(ph) * 0.8, bodyDy: -4 * Math.abs(Math.sin(ph)) };
      }
      case 'jump':
        return [
          { ...base, squash: 0.85, frontArm: 0.6, backArm: 0.6 },
          { ...base, bodyDy: -40, frontArm: -1.2, backArm: -1.2, frontLeg: 0.3 },
          { ...base, bodyDy: -70, frontLeg: 1.0, backLeg: 1.0, frontArm: -1.6, backArm: -1.6 },
          { ...base, bodyDy: -70, frontLeg: 0.6, backLeg: 0.6, frontArm: -2.4, backArm: -2.4, mouth: 'open' },
          { ...base, bodyDy: -30, frontLeg: -0.2, backLeg: 0.2, frontArm: -1.0, backArm: -1.0 },
        ][i];
      case 'land':
        return [{ ...base, squash: 0.72, frontArm: 1.1, backArm: 1.1 }, { ...base, squash: 0.9, frontArm: 0.5, backArm: 0.5 }, base][i];
      case 'kick_low':
        return { ...base, lean: 0.25 * s, frontLeg: i < 2 ? -0.9 : i < 4 ? 1.5 : 0.5, backLeg: -0.2, frontArm: -0.6, backArm: 0.9, mouth: 'grit', smear: i === 2 || i === 3 };
      case 'kick_high':
        return { ...base, lean: -0.3 * s, frontLeg: i < 2 ? -0.7 : i < 4 ? 2.6 : 1.2, backLeg: -0.2, frontArm: 1.2, backArm: -0.8, mouth: 'grit', smear: i === 2 || i === 3 };
      case 'header':
        return { ...base, lean: i < 2 ? -0.35 : i < 4 ? 0.45 : 0, headTilt: i < 2 ? -0.4 : 0.5, frontArm: 0.8, backArm: -0.8, mouth: 'grit', smear: i === 2 };
      case 'super':
        return i < 3
          ? { ...base, squash: 0.85, frontArm: 1.4, backArm: 1.4, mouth: 'grit', aura: 0.4 + 0.3 * i }
          : { ...base, lean: 0.3, frontLeg: 1.6, backLeg: -0.3, frontArm: -0.8, backArm: 1.0, mouth: 'open', aura: 1, smear: true };
      case 'hurt':
        return { ...base, lean: -0.5 + 0.2 * i, frontArm: -1.5, backArm: -1.2, frontLeg: 0.6, eyes: 'squint', mouth: 'open', stars: true };
      case 'celebrate':
        return [
          { ...base, squash: 0.85, frontArm: 0.8, backArm: 0.8, mouth: 'open' },
          { ...base, bodyDy: -40, frontArm: -2.6, backArm: 0.5, mouth: 'open' },
          { ...base, bodyDy: -60, frontArm: -2.6, backArm: -2.6, mouth: 'open' },
          { ...base, bodyDy: -10, frontArm: -1.0, backArm: -1.0, mouth: 'open' },
          { ...base, frontArm: -2.0, backArm: 0.4, mouth: 'open' },
          { ...base, frontArm: 0.6, backArm: 0.6, mouth: 'smile' },
        ][i];
      case 'lose':
        return { ...base, lean: 0.25 * t, headTilt: 0.6 * t, frontArm: 0.3, backArm: 0.3, mouth: 'sad', eyes: t > 0.6 ? 'closed' : 'open' };
      default:
        return base;
    }
  }

  function drawChibi(ctx, cx, floorY, p, def) {
    const { primary, secondary } = def.kit;
    const hair = def.hair || '#222';
    const skin = '#F2C9A0';
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const H = 150 * p.squash;
    const hipY = floorY + p.bodyDy - H * 0.42;

    if (p.aura) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = def.superColor;
      ctx.beginPath();
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const r = (H * 0.75 + (k % 2 ? 26 : 0)) * p.aura;
        ctx.lineTo(cx + Math.cos(a) * r * 0.8, floorY - H * 0.5 + p.bodyDy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    const leg = (ang, side, dark) => {
      ctx.save();
      ctx.translate(cx + side * 12, hipY);
      ctx.rotate(ang);
      ctx.fillStyle = dark ? shade(secondary, -40) : secondary;
      rr(ctx, -11, 0, 22, H * 0.34, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = dark ? shade(primary, -50) : primary;
      rr(ctx, -14, H * 0.3, 32, 16, 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    const arm = (ang, side, dark) => {
      ctx.save();
      ctx.translate(cx + side * 26, hipY - H * 0.3);
      ctx.rotate(ang + side * 0.25);
      ctx.fillStyle = dark ? shade(skin, -40) : skin;
      rr(ctx, -9, 0, 18, H * 0.3, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    leg(p.backLeg, -1, true);
    arm(p.backArm, -1, true);

    ctx.save();
    ctx.translate(cx, hipY);
    ctx.rotate(p.lean);
    ctx.fillStyle = primary;
    rr(ctx, -30, -H * 0.36, 60, H * 0.38, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = secondary;
    ctx.fillRect(-30, -H * 0.36 + 10, 10, H * 0.3);
    ctx.fillRect(-8, -H * 0.36 + 10, 10, H * 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(10, -H * 0.36, 20, H * 0.38);
    ctx.translate(0, -H * 0.36);
    ctx.rotate(p.headTilt);
    const R = 44;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -R + 6, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.arc(0, -R + 6, R, -0.3, 1.3);
    ctx.lineTo(0, -R + 6);
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(-R, -R - 2);
    for (let k = 0; k <= 6; k++) ctx.lineTo(-R + (k / 6) * R * 2, -R - 30 - (k % 2 ? 26 : 6));
    ctx.lineTo(R, -R - 2);
    ctx.quadraticCurveTo(0, -R - 18, -R, -R - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const ey = -R + 4;
    if (p.eyes === 'open') {
      for (const ex of [10, 30]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 8, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.ellipse(ex + 2, ey + 2, 4, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex + 1, ey - 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      for (const ex of [10, 30]) {
        ctx.moveTo(ex - 7, ey);
        ctx.lineTo(ex + 7, ey + (p.eyes === 'squint' ? -4 : 2));
      }
      ctx.stroke();
    }
    ctx.beginPath();
    const my = -R + 28;
    if (p.mouth === 'smile') ctx.arc(22, my - 6, 9, 0.2, Math.PI - 0.4);
    else if (p.mouth === 'sad') ctx.arc(22, my + 6, 9, Math.PI + 0.4, Math.PI * 2 - 0.4);
    else if (p.mouth === 'open') {
      ctx.ellipse(24, my, 7, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7a1f2b';
      ctx.fill();
    } else if (p.mouth === 'grit') {
      ctx.rect(14, my - 4, 18, 8);
      ctx.fillStyle = '#fff';
      ctx.fill();
    } else {
      ctx.moveTo(14, my);
      ctx.lineTo(32, my);
    }
    ctx.stroke();
    ctx.restore();

    arm(p.frontArm, 1, false);
    leg(p.frontLeg, 1, false);

    if (p.smear) {
      ctx.save();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 6;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(cx + 40 + k * 10, hipY + 10 + k * 14);
        ctx.lineTo(cx + 90 + k * 10, hipY - 6 + k * 14);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (p.stars) {
      ctx.save();
      ctx.fillStyle = '#fff';
      for (let k = 0; k < 3; k++) {
        const sx = cx - 30 + k * 30, sy = floorY - H - 30 + (k % 2) * 16;
        ctx.beginPath();
        for (let q = 0; q < 10; q++) {
          const a = (q / 10) * Math.PI * 2, r = q % 2 ? 4 : 10;
          ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function makeCharacterAtlas(scene) {
    if (scene.textures.exists('characters')) return;
    const perChar = KL.CHARACTER_ANIMS.reduce((a, d) => a + d.frames, 0) + 1;
    const total = KL.CHARACTERS.length * perChar;
    const cols = 16;
    const rows = Math.ceil(total / cols);
    const canvas = makeCanvas(cols * CELL, rows * CELL);
    const ctx = canvas.getContext('2d');
    const frames = [];
    let idx = 0;
    for (const def of KL.CHARACTERS) {
      const put = (name, p) => {
        const x = (idx % cols) * CELL, y = Math.floor(idx / cols) * CELL;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, CELL, CELL);
        ctx.clip();
        ctx.translate(x + CELL / 2, y + CELL - 6);
        ctx.scale(0.72, 0.72); // standing height ≈ 156 px of the 256 cell, same as the sliced studio art
        drawChibi(ctx, 0, 0, p, def);
        ctx.restore();
        frames.push({ name, x, y });
        idx++;
      };
      for (const a of KL.CHARACTER_ANIMS) for (let i = 0; i < a.frames; i++) put(`${def.id}/${a.key}/${pad2(i)}`, pose(a.key, i, a.frames));
      put(`${def.id}/turnaround/00`, base);
    }
    const tex = scene.textures.addCanvas('characters', canvas);
    for (const f of frames) tex.add(f.name, 0, f.x, f.y, CELL, CELL);
  }

  /* ----------------------------------------------------------------- props */
  function makePropsAtlas(scene) {
    if (scene.textures.exists('props')) return;
    const canvas = makeCanvas(2048, 1024);
    const ctx = canvas.getContext('2d');
    const tex = scene.textures.addCanvas('props', canvas);
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    for (let i = 0; i < 9; i++) {
      const x = i * 128;
      ctx.save();
      ctx.translate(x + 64, 64 + (i === 8 ? 16 : 0));
      ctx.scale(1, i === 8 ? 0.7 : 1);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      const rot = (i / 8) * Math.PI * 2;
      for (let k = 0; k < 5; k++) {
        const a = rot + (k / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 30, Math.sin(a) * 30, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0.4, 2.2);
      ctx.lineTo(0, 0);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-18, -22, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      tex.add(`ball/${pad2(i)}`, 0, x, 0, 128, 128);
    }
    for (let i = 0; i < 6; i++) {
      const x = i * 192, y = 128;
      ctx.save();
      ctx.translate(x + 96, y + 96);
      ctx.fillStyle = '#ff9a1f';
      ctx.beginPath();
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const r = 70 + (k % 2 ? 18 + 8 * Math.sin(i + k) : 0);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.9);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffe24a';
      ctx.beginPath();
      ctx.arc(0, 0, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      for (let k = 0; k < 5; k++) {
        const a = (i / 6) * Math.PI * 2 + (k / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 26, Math.sin(a) * 26, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      tex.add(`ball_super/${pad2(i)}`, 0, x, y, 192, 192);
    }
    const goal = (gx, gy, bulge) => {
      ctx.save();
      ctx.translate(gx, gy);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = 0; k <= 10; k++) {
        ctx.moveTo(30 + k * 20 + bulge * 0.5, 40);
        ctx.lineTo(30 + k * 20 + bulge, 400);
      }
      for (let k = 0; k <= 12; k++) {
        ctx.moveTo(30, 40 + k * 30);
        ctx.lineTo(230, 40 + k * 30 + bulge * 0.2);
      }
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5;
      ctx.fillStyle = '#2f8cff';
      for (const [x, y, w, h] of [[20, 30, 20, 380], [20, 30, 210, 20], [210, 30, 20, 380], [10, 396, 220, 16]]) {
        rr(ctx, x, y, w, h, 8);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    };
    goal(0, 400, 0);
    tex.add('goal_right', 0, 0, 400, 240, 420);
    [26, 14, -6, 0].forEach((b, i) => {
      goal(260 + i * 250, 400, b);
      tex.add(`goal_net_shake/${pad2(i)}`, 0, 260 + i * 250, 400, 240, 420);
    });
  }

  /* ----------------------------------------------------------- backgrounds */
  function makeBackgrounds(scene) {
    const W = 2560, H = 720;
    const add = (key, draw) => {
      if (scene.textures.exists(key)) return;
      const c = makeCanvas(W, H);
      draw(c.getContext('2d'));
      scene.textures.addCanvas(key, c);
    };
    const sky = (night) => (ctx) => {
      const bands = night ? ['#0d1140', '#161c5a', '#232a73', '#2f388a'] : ['#8FD3FF', '#A6DDFF', '#BFE7FF', '#D7F1FF'];
      bands.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, (i * H) / 4, W, H / 4 + 2);
      });
      if (night) {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 90; i++) ctx.fillRect((i * 331) % W, (i * 197) % 400, 3, 3);
        ctx.fillStyle = '#f3f1d8';
        ctx.beginPath();
        ctx.arc(2100, 140, 60, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = night ? '#1a2160' : '#4C6FB8';
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 160) ctx.lineTo(x, 470 - 120 * Math.abs(Math.sin(x / 300)) - 40 * Math.abs(Math.sin(x / 90)));
      ctx.lineTo(W, H);
      ctx.fill();
      ctx.fillStyle = night ? '#2c347d' : '#ffffff';
      for (let i = 0; i < 5; i++) {
        const cx = 200 + i * 520, cy = 120 + (i % 2) * 70;
        for (const [dx, r] of [[0, 40], [45, 52], [95, 38]]) {
          ctx.beginPath();
          ctx.arc(cx + dx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    add('bg_sky', sky(false));
    add('bg_sky_night', sky(true));
    add('bg_stands', (ctx) => {
      ctx.fillStyle = '#3a3f7a';
      ctx.fillRect(0, 300, W, H - 300);
      ctx.fillStyle = '#2f3468';
      for (let x = 0; x < W; x += 320) ctx.fillRect(x, 300, 4, 420);
      ctx.fillStyle = '#9aa1b8';
      ctx.fillRect(0, 290, W, 14);
      for (let x = 60; x < W; x += 220) {
        ctx.fillRect(x, 240, 10, 60);
        ctx.fillRect(x - 10, 236, 30, 8);
      }
    });
    const crowd = (seed, armsUp) => (ctx) => {
      for (let i = 0; i < 40; i++) {
        const x = 40 + i * 64 + ((seed * 37 + i * 13) % 20);
        const y = 440 + ((seed + i * 7) % 3) * 18 - (armsUp ? 10 : 0);
        ctx.fillStyle = ['#e63946', '#2b6cf2', '#f5c518', '#7b3fe4', '#3dd36a'][(i + seed) % 5];
        rr(ctx, x - 24, y, 48, 90, 10);
        ctx.fill();
        ctx.fillStyle = '#F2C9A0';
        ctx.beginPath();
        ctx.arc(x, y - 20, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(x, y - 34, 24, Math.PI, 0);
        ctx.fill();
        if (armsUp) {
          ctx.fillStyle = '#F2C9A0';
          ctx.fillRect(x - 36, y - 50, 10, 50);
          ctx.fillRect(x + 26, y - 50, 10, 50);
        }
      }
      ctx.strokeStyle = 'rgba(200,205,225,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -720; x < W; x += 28) {
        ctx.moveTo(x, 380);
        ctx.lineTo(x + 340, 720);
        ctx.moveTo(x + 340, 380);
        ctx.lineTo(x, 720);
      }
      ctx.stroke();
      ctx.fillStyle = '#4c527f';
      ctx.fillRect(0, 372, W, 12);
      ctx.fillRect(0, 590, W, 12);
    };
    add('bg_fence_crowd_a', crowd(1, false));
    add('bg_fence_crowd_b', crowd(2, false));
    add('bg_fence_crowd_c', crowd(3, false));
    add('bg_crowd_cheer', crowd(1, true));
    add('bg_pitch', (ctx) => {
      ctx.fillStyle = '#8a4a2f';
      ctx.fillRect(0, 0, W, 24);
      for (let x = 0; x < W; x += 160) {
        ctx.fillStyle = (x / 160) % 2 ? '#2E9E47' : '#3FBF5A';
        ctx.fillRect(x, 24, 160, H);
      }
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(W / 2, 160, 120, 0, Math.PI * 2);
      ctx.moveTo(W / 2, 24);
      ctx.lineTo(W / 2, H);
      ctx.moveTo(200, 160);
      ctx.arc(0, 160, 200, -Math.PI / 2, Math.PI / 2);
      ctx.moveTo(W - 200, 160);
      ctx.arc(W, 160, 200, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.stroke();
    });
  }

  /* -------------------------------------------------------------------- fx */
  function makeFxAtlas(scene) {
    if (scene.textures.exists('fx')) return;
    const canvas = makeCanvas(2560, 1024);
    const ctx = canvas.getContext('2d');
    const tex = scene.textures.addCanvas('fx', canvas);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    const star = (cx, cy, r, color, pts = 10) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let q = 0; q < pts * 2; q++) {
        const a = (q / (pts * 2)) * Math.PI * 2;
        const rr2 = q % 2 ? r * 0.45 : r;
        ctx.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    for (let i = 0; i < 5; i++) {
      star(i * 192 + 96, 96, [18, 50, 80, 70, 40][i], i < 3 ? '#fff' : '#ffe24a');
      tex.add(`fx_impact/${pad2(i)}`, 0, i * 192, 0, 192, 192);
    }
    for (let i = 0; i < 6; i++) {
      const x = i * 192, y = 192;
      ctx.save();
      ctx.globalAlpha = 1 - i * 0.14;
      ctx.fillStyle = '#e8e8f0';
      const r = 20 + i * 12;
      for (const [dx, dy] of [[0, 0], [r, -r * 0.4], [-r, -r * 0.3]]) {
        ctx.beginPath();
        ctx.arc(x + 96 + dx, y + 110 + dy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      tex.add(`fx_dust/${pad2(i)}`, 0, x, y, 192, 192);
    }
    for (let i = 0; i < 4; i++) {
      const x = i * 256, y = 400;
      ctx.fillStyle = '#fff';
      for (let k = 0; k < 4; k++) {
        const ly = y + 30 + k * 24 + (i % 2) * 8;
        ctx.beginPath();
        ctx.moveTo(x + 20 + k * 10, ly);
        ctx.lineTo(x + 230 - k * 20, ly - 4);
        ctx.lineTo(x + 230 - k * 20, ly + 4);
        ctx.closePath();
        ctx.fill();
      }
      tex.add(`fx_speedlines/${pad2(i)}`, 0, x, y, 256, 128);
    }
    const confCols = ['#e63946', '#f5c518'];
    for (let i = 0; i < 8; i++) {
      const x = 1100 + i * 48, y = 400;
      ctx.fillStyle = confCols[Math.floor(i / 4)];
      ctx.beginPath();
      if (i % 4 === 0) ctx.arc(x + 24, y + 24, 14, 0, Math.PI * 2);
      else if (i % 4 === 1) ctx.rect(x + 8, y + 18, 32, 12);
      else if (i % 4 === 2) for (let q = 0; q < 10; q++) {
        const a = (q / 10) * Math.PI * 2, r = q % 2 ? 6 : 15;
        ctx.lineTo(x + 24 + Math.cos(a) * r, y + 24 + Math.sin(a) * r);
      } else {
        ctx.moveTo(x + 24, y + 8);
        ctx.lineTo(x + 40, y + 40);
        ctx.lineTo(x + 8, y + 40);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      tex.add(`fx_confetti/${pad2(i)}`, 0, x, y, 48, 48);
    }
    for (let i = 0; i < 3; i++) {
      const x = 1600 + i * 128, y = 400;
      ctx.save();
      ctx.globalAlpha = i === 2 ? 0.5 : 1;
      ctx.fillStyle = '#f5c518';
      ctx.font = `bold ${[40, 80, 80][i]}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('!', x + 64, y + 100);
      ctx.strokeText('!', x + 64, y + 100);
      ctx.restore();
      tex.add(`fx_whistle/${pad2(i)}`, 0, x, y, 128, 128);
    }
    for (let i = 0; i < 8; i++) {
      const x = i * 320, y = 640;
      ctx.save();
      ctx.translate(x + 160, y + 170);
      ctx.fillStyle = '#ff9a1f';
      ctx.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const r = 120 + (k % 2 ? 30 : 0) + 14 * Math.sin(i * 0.8 + k);
        ctx.lineTo(Math.cos(a) * r * 0.75, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.ellipse(0, 0, 70, 110, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      tex.add(`fx_super_aura/${pad2(i)}`, 0, x, y, 320, 340);
    }
  }

  /* ------------------------------------------------------------------- ui */
  function makeUiAtlas(scene) {
    if (scene.textures.exists('ui')) return;
    const canvas = makeCanvas(2048, 512);
    const ctx = canvas.getContext('2d');
    const tex = scene.textures.addCanvas('ui', canvas);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    KL.CHARACTERS.forEach((def, i) => {
      const x = i * 256;
      ctx.fillStyle = def.kit.primary;
      ctx.fillRect(x, 0, 256, 256);
      ctx.fillStyle = '#F2C9A0';
      ctx.beginPath();
      ctx.arc(x + 128, 130, 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = def.hair;
      ctx.beginPath();
      ctx.arc(x + 128, 110, 86, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(x + 104, 140, 8, 12, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 152, 140, 8, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 128, 160, 22, 0.3, Math.PI - 0.3);
      ctx.stroke();
      tex.add(`${def.id}_portrait`, 0, x, 0, 256, 256);
    });
    const flags = { eng: ['#fff', '#d00'], bra: ['#1a9b3c', '#ffd500'], esp: ['#c60b1e', '#ffc400'], ger: ['#000', '#dd0000'], ind: ['#ff9933', '#138808'], jpn: ['#fff', '#bc002d'], arg: ['#74acdf', '#fff'], fra: ['#0055a4', '#ef4135'] };
    Object.entries(flags).forEach(([k, [a, b]], i) => {
      const x = i * 96, y = 300;
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.arc(x + 48, y + 48, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = b;
      ctx.beginPath();
      ctx.arc(x + 48, y + 48, 40, 0, Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 48, y + 48, 40, 0, Math.PI * 2);
      ctx.stroke();
      tex.add(`flag_${k}`, 0, x, y, 96, 96);
    });
  }

  KL.Placeholders = {
    makeAll(scene) {
      makeCharacterAtlas(scene);
      makePropsAtlas(scene);
      makeBackgrounds(scene);
      makeFxAtlas(scene);
      makeUiAtlas(scene);
    },
    makeCharacterAtlas,
    makePropsAtlas,
    makeBackgrounds,
    makeFxAtlas,
    makeUiAtlas,
    _T: T,
  };
})();
