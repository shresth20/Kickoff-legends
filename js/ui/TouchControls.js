/* On-screen controller, laid out like a mobile head-football pad: two round arrow buttons
 * bottom-left (move), slanted kick / kick-high / jump buttons bottom-right, a round Super
 * button wearing its charge ring, and a small sprint button.
 *
 * Every button prints the player's key and lights up while that key
 * is held, so keyboard players see the controls working. On a tablet the same buttons are
 * touch targets: multi-touch (hold a direction and tap kick), and a finger can slide from one
 * button to the next. The mouse works too. Pointer state goes into each player's
 * KL.VirtualPad, which KeyboardInput merges with the keys.
 *
 * The buttons sit on the grass in front of the players (below groundY), so they never cover
 * the players or a ball on the ground. Faces are painted in code (KL.Paint) at device resolution
 * and cached per label / size / state. */
window.KL = window.KL || {};

/** Button positions in logical px (centre). r: round buttons · w×h: slanted buttons. */
KL.PAD_LAYOUT = {
  version: 1, // bump after changing a painter below so cached textures repaint
  // one full-size controller for Player 1
  solo: [
    { action: 'left', look: 'move', x: 100, y: 664, r: 46 },
    { action: 'right', look: 'move', x: 232, y: 664, r: 46 },
    { action: 'sprint', look: 'sprint', x: 566, y: 672, r: 30 },
    { action: 'kickLow', look: 'kick', x: 704, y: 666, w: 148, h: 70 },
    { action: 'kickHigh', look: 'kick', x: 868, y: 666, w: 148, h: 70 },
    { action: 'jump', look: 'kick', x: 1032, y: 666, w: 148, h: 70 },
    { action: 'super', look: 'super', x: 1196, y: 662, r: 40 },
  ],
  skew: 0.28, // slant of the kick buttons: top edge shifted by skew × h
  meter: { gap: 9, width: 7 }, // super charge ring outside the button
  flashMs: 110, // a quick tap keeps its button lit at least this long
};

(() => {
  const P = () => KL.Paint;
  const INK = '#1B1F3B';
  const GOLD = ['#FFF08A', '#FBCB25', '#E8960C'];
  const FONT = (px) => `700 ${px}px Oswald, "Arial Narrow", sans-serif`; // key names are Latin in every locale

  /* -------------------------------------------------------------- drawing */
  const ARROW_KEYS = { '→': 0, '↓': Math.PI / 2, '←': Math.PI, '↑': -Math.PI / 2 };

  /** Size a key label to fit maxW: { px, w }. Arrow keys are drawn as shapes, about px wide. */
  function fitKey(ctx, text, px, maxW) {
    if (text in ARROW_KEYS) return { px, w: px * 0.9 };
    ctx.font = FONT(px);
    const w = ctx.measureText(text).width;
    if (w <= maxW) return { px, w };
    return { px: Math.floor((px * maxW) / w), w: maxW };
  }

  /** Key label: white, ink outline and a hard ink drop, shrunk to maxW. */
  function keyText(ctx, text, x, y, px, maxW) {
    ({ px } = fitKey(ctx, text, px, maxW));
    ctx.lineJoin = 'round';
    const lw = Math.max(3, px * 0.17);
    ctx.lineWidth = lw;
    ctx.strokeStyle = INK;
    if (text in ARROW_KEYS) {
      // system fonts draw arrows hairline-thin: paint a chunky white arrow in the letters' style
      const path = arrowPath(ctx, -px * 0.42, px * 0.45, px * 0.38, px * 0.15, px * 0.42);
      ctx.save();
      ctx.translate(x, y);
      for (const dy of [px * 0.045, 0]) {
        // hard drop (straight down on screen), then the outline
        ctx.save();
        ctx.translate(0, dy);
        ctx.rotate(ARROW_KEYS[text]);
        path();
        ctx.stroke();
        ctx.restore();
      }
      ctx.rotate(ARROW_KEYS[text]);
      path();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.font = FONT(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cy = y + px * 0.04; // Oswald's caps sit a touch high on the middle baseline
    ctx.strokeText(text, x, cy + px * 0.045); // hard drop under the outline
    ctx.strokeText(text, x, cy);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, x, cy);
  }

  /** Gold shape: ink outline, gold gradient, glossy top band. path() must rebuild the path. */
  function gold(ctx, path, y0, y1, ink = 2.5) {
    ctx.lineJoin = 'round';
    path();
    ctx.lineWidth = ink * 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    path();
    ctx.fillStyle = P().vgrad(ctx, y0, y1, GOLD);
    ctx.fill();
    ctx.save();
    path();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-500, y0 - 2, 1000, (y1 - y0) * 0.3);
    ctx.fillStyle = 'rgba(150,70,0,0.25)';
    ctx.fillRect(-500, y1 - (y1 - y0) * 0.22, 1000, (y1 - y0) * 0.3);
    ctx.restore();
  }

  /** Chunky arrow along +x: tail at x0, tip at x1; head half-height hh, shaft half-height sh, head length hl. */
  const arrowPath = (ctx, x0, x1, hh, sh, hl) => () => {
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

  /** A gold arrow centred at (x, y), `len` long, pointing at `angle` (radians, 0 = right). */
  function goldArrow(ctx, x, y, len, thick, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    gold(ctx, arrowPath(ctx, -len / 2, len / 2, thick, thick * 0.42, thick * 1.15), -thick, thick, Math.max(1.8, thick * 0.22));
    ctx.restore();
  }

  /** Red football boot, toe pointing +x (dir 1) or −x, ~64×40 × s, centred at (x, y). */
  function boot(ctx, x, y, s, dir = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * dir, s);
    ctx.translate(-32, -20);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const upper = () => {
      ctx.beginPath();
      ctx.moveTo(9, 3);
      ctx.quadraticCurveTo(16, 9, 25, 5);
      ctx.quadraticCurveTo(42, 9, 55, 21);
      ctx.quadraticCurveTo(65, 24, 62, 31);
      ctx.lineTo(3, 31);
      ctx.quadraticCurveTo(0, 29, 1, 22);
      ctx.quadraticCurveTo(3, 9, 9, 3);
      ctx.closePath();
    };
    const lw = 2.4 / s;
    // studs + sole, then the upper with its outline
    ctx.fillStyle = INK;
    for (const sx of [10, 22, 43, 54]) {
      ctx.beginPath();
      ctx.moveTo(sx - 3.6, 33);
      ctx.lineTo(sx + 3.6, 33);
      ctx.lineTo(sx + 2.2, 38.5);
      ctx.lineTo(sx - 2.2, 38.5);
      ctx.closePath();
      ctx.fill();
    }
    upper();
    ctx.lineWidth = lw * 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    P().rr(ctx, 0, 28.5, 64, 7.5, 3.7);
    ctx.fill();
    upper();
    ctx.fillStyle = P().vgrad(ctx, 3, 31, ['#FF7272', '#EA3340', '#B81B2B']);
    ctx.fill();
    ctx.save();
    upper();
    ctx.clip();
    ctx.fillStyle = '#F5F7FC'; // white heel counter
    ctx.beginPath();
    ctx.moveTo(0, 13);
    ctx.quadraticCurveTo(11, 12, 15, 32);
    ctx.lineTo(0, 32);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; // gloss on the instep
    ctx.beginPath();
    ctx.ellipse(39, 13, 13, 3.4, 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#FFFFFF'; // laces
    ctx.lineWidth = 2.1 / s + 0.6;
    for (const [lx, ly] of [[29, 8.2], [35, 10.8], [41, 14]]) {
      ctx.beginPath();
      ctx.moveTo(lx - 2.4, ly + 2.4);
      ctx.lineTo(lx + 2.4, ly - 2.4);
      ctx.stroke();
    }
    ctx.fillStyle = '#E9ECF5'; // midsole
    P().rr(ctx, 2.5, 28.6, 59, 2.6, 1.3);
    ctx.fill();
    ctx.restore();
  }

  /** Translucent round socket (outer ring + inner disc), the base of the move and sprint buttons. */
  function socket(ctx, r, ri, lit) {
    const C = P().circle;
    C(ctx, 0, 0, r);
    ctx.fillStyle = 'rgba(6,26,18,0.30)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.stroke();
    C(ctx, 0, 0, ri);
    const g = ctx.createRadialGradient(0, -ri * 0.4, ri * 0.1, 0, 0, ri);
    g.addColorStop(0, lit ? 'rgba(255,248,200,0.55)' : 'rgba(30,60,48,0.40)');
    g.addColorStop(1, lit ? 'rgba(255,214,90,0.45)' : 'rgba(4,16,12,0.45)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = lit ? 3 : 2;
    ctx.strokeStyle = lit ? '#FFE867' : 'rgba(255,255,255,0.42)';
    ctx.stroke();
  }

  /* ------------------------------------------------------------- painters */
  const v = () => KL.PAD_LAYOUT.version;

  /** Round move button: gold arrow (dir −1 left / 1 right) with the key printed on it. */
  function moveLook(scene, b, lit) {
    const r = b.r, S = r + 6;
    const key = P().paint(scene, `kl:pad:move:${v()}:${b.arrow}:${b.label}:${r}:${lit}`, S * 2, S * 2, (ctx) => {
      ctx.translate(S, S);
      const ri = r * 0.74;
      socket(ctx, r, ri, lit);
      // big chunky arrow that overflows the inner disc, the key printed across it
      ctx.save();
      ctx.scale(b.arrow, 1);
      gold(ctx, arrowPath(ctx, -ri * 1.0, ri * 1.2, ri * 0.84, ri * 0.44, ri * 1.08), -ri * 0.84, ri * 0.84, Math.max(2, r * 0.06));
      ctx.restore();
      if (!/^[←→]$/.test(b.label)) keyText(ctx, b.label, b.arrow * ri * 0.02, 0, Math.round(r * 0.98), ri * 1.6);
    });
    return { key, ox: 0.5, oy: 0.5 };
  }

  /** Small round sprint button: gold speed chevrons behind the key. */
  function sprintLook(scene, b, lit) {
    const r = b.r, S = r + 6;
    const key = P().paint(scene, `kl:pad:sprint:${v()}:${b.dir}:${b.label}:${r}:${lit}`, S * 2, S * 2, (ctx) => {
      ctx.translate(S, S);
      socket(ctx, r, r * 0.8, lit);
      ctx.save();
      ctx.scale(b.dir, 1);
      ctx.globalAlpha = 0.95;
      for (const cx of [-r * 0.2, r * 0.22]) {
        const w = r * 0.3, h = r * 0.46, t = r * 0.16;
        gold(ctx, () => {
          ctx.beginPath();
          ctx.moveTo(cx - w, -h);
          ctx.lineTo(cx - w + t, -h);
          ctx.lineTo(cx + w * 0.9, 0);
          ctx.lineTo(cx - w + t, h);
          ctx.lineTo(cx - w, h);
          ctx.lineTo(cx + w * 0.9 - t, 0);
          ctx.closePath();
        }, -h, h, Math.max(1.5, r * 0.05));
      }
      ctx.restore();
      keyText(ctx, b.label, 0, r * 0.02, Math.round(r * (b.label.length > 2 ? 0.5 : 0.8)), r * 1.5);
    });
    return { key, ox: 0.5, oy: 0.5 };
  }

  /** Slanted kick button (parallelogram with a 3D lip): boot + gold arrow icon, key on top. */
  function kickLook(scene, b, lit) {
    const L = KL.PAD_LAYOUT;
    const w = b.w, h = b.h, k = h * L.skew, LIP = Math.round(h * 0.08), M = 8;
    const tw = w + k + M * 2, th = h + LIP + M * 2;
    const key = P().paint(scene, `kl:pad:kick:${v()}:${b.action}:${b.dir}:${b.label}:${w}x${h}:${lit}`, tw, th, (ctx) => {
      ctx.translate(tw / 2, M + h / 2);
      const rad = Math.min(12, h * 0.2);
      // parallelogram leaning forward (towards the opponent's goal), rounded corners
      const shape = (dy = 0, inset = 0) => {
        const x0 = -w / 2 + inset, x1 = w / 2 - inset, y0 = -h / 2 + inset + dy, y1 = h / 2 - inset + dy;
        const pts = [[x0 + k / 2, y0], [x1 + k / 2, y0], [x1 - k / 2, y1], [x0 - k / 2, y1]].map(([px, py]) => [px * b.dir, py]);
        ctx.beginPath();
        ctx.moveTo((pts[0][0] + pts[3][0]) / 2, (pts[0][1] + pts[3][1]) / 2);
        for (let i = 0; i < 4; i++) ctx.arcTo(pts[i][0], pts[i][1], pts[(i + 1) % 4][0], pts[(i + 1) % 4][1], Math.max(2, rad - inset));
        ctx.closePath();
      };
      ctx.save();
      ctx.shadowColor = 'rgba(4,10,20,0.45)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      shape(LIP);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.restore();
      shape(LIP);
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      shape(0);
      ctx.stroke();
      shape(LIP); // the lip
      ctx.fillStyle = lit ? '#7A5A10' : 'rgba(12,30,34,0.95)';
      ctx.fill();
      shape(lit ? LIP * 0.6 : 0); // the face (sinks into the lip when lit)
      ctx.fillStyle = P().vgrad(ctx, -h / 2, h / 2, lit ? ['#8FB9C2', '#5C8B97', '#3F6C78'] : ['rgba(78,112,120,0.94)', 'rgba(44,72,82,0.94)', 'rgba(30,52,62,0.94)']);
      ctx.fill();
      ctx.save();
      shape(lit ? LIP * 0.6 : 0);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(-w, -h / 2, w * 2, h * 0.36);
      ctx.restore();
      shape(lit ? LIP * 0.6 : 0, 3);
      ctx.lineWidth = lit ? 3 : 2;
      ctx.strokeStyle = lit ? '#FFE867' : 'rgba(255,255,255,0.38)';
      ctx.stroke();

      // icon: the boot says "kick", the gold arrow says which kick (or the jump). Both sit either
      // side of the key, pushed out by its width and shrunk to the room left (wide keys like N1).
      const d = b.dir, labelPx = Math.round(h * 0.68), labelMax = w * 0.46;
      const half = fitKey(ctx, b.label, labelPx, labelMax).w / 2;
      const room = w / 2 - half - 2; // free width on each side of the key
      const bootS = Math.min((h / 72) * 0.97, (room + 10) / 64); // the heel may tuck 10 px under the key
      const bootX = half + (64 * bootS) / 2 - 10;
      const thick = h * 0.17;
      const arrow = (side, y, len, angle) => {
        // centre it just clear of the key, but keep it inside the face
        const hx = Math.abs(Math.cos(angle)) * (len / 2) + Math.abs(Math.sin(angle)) * thick;
        const x = Math.min(half + hx + 2, w / 2 - hx - 3);
        goldArrow(ctx, side * x * d, y, len, thick, d > 0 ? angle : Math.PI - angle);
      };
      const len = Math.min(h * 0.52, room + 6);
      ctx.save();
      ctx.translate(0, lit ? LIP * 0.6 : 0);
      if (b.action === 'kickLow') {
        boot(ctx, -bootX * d, -h * 0.1, bootS, d);
        arrow(1, h * 0.06, len, 0);
      } else if (b.action === 'kickHigh') {
        boot(ctx, -bootX * d, h * 0.02, bootS, d);
        arrow(1, -h * 0.05, len, -Math.PI / 4);
      } else {
        // jump: up arrow behind, boot lifting off ahead
        boot(ctx, bootX * d, -h * 0.08, bootS * 0.96, d);
        arrow(-1, -h * 0.02, h * 0.56, -Math.PI / 2);
      }
      keyText(ctx, b.label, 0, h * 0.08, labelPx, labelMax);
      ctx.restore();
    });
    return { key, ox: 0.5, oy: (M + h / 2) / th };
  }

  /** Round Super button: bronze disc, burst emblem, key on top, charge track around it. */
  function superLook(scene, b, lit) {
    const L = KL.PAD_LAYOUT;
    const r = b.r, ring = r + L.meter.gap, S = ring + L.meter.width / 2 + 5;
    const key = P().paint(scene, `kl:pad:super:${v()}:${b.label}:${r}:${lit}`, S * 2, S * 2, (ctx) => {
      ctx.translate(S, S);
      const C = P().circle;
      // charge track
      C(ctx, 0, 0, ring);
      ctx.lineWidth = L.meter.width + 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      C(ctx, 0, 0, ring);
      ctx.lineWidth = L.meter.width;
      ctx.strokeStyle = '#2A2F5C';
      ctx.stroke();
      // disc
      ctx.save();
      ctx.shadowColor = 'rgba(4,8,20,0.5)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      C(ctx, 0, 0, r + 3);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.restore();
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r);
      g.addColorStop(0, lit ? '#F2A050' : '#B7652C');
      g.addColorStop(0.55, lit ? '#B25A1E' : '#6E3214');
      g.addColorStop(1, lit ? '#6A2C0C' : '#341306');
      C(ctx, 0, 0, r);
      ctx.fillStyle = g;
      ctx.fill();
      C(ctx, 0, 0, r - 2.5);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = lit ? '#FFF2A0' : '#E8A93A';
      ctx.stroke();
      // burst emblem: three up arrows fanning out, engraved
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (const [ax, ang, len] of [[-r * 0.42, -Math.PI / 2 - 0.5, r * 0.62], [r * 0.42, -Math.PI / 2 + 0.5, r * 0.62], [0, -Math.PI / 2, r * 0.9]]) {
        goldArrow(ctx, ax, r * 0.05, len, r * 0.17, ang);
      }
      ctx.restore();
      ctx.save(); // gloss
      C(ctx, 0, 0, r - 3);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.55, r * 0.8, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      keyText(ctx, b.label, 0, 0, Math.round(r * 1.05), r * 1.45);
    });
    return { key, ox: 0.5, oy: 0.5 };
  }

  const LOOKS = { move: moveLook, sprint: sprintLook, kick: kickLook, super: superLook };

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
      this.buttons = KL.PAD_LAYOUT.solo.map((spec) =>
        this.build({ ...spec, player: 0, dir: 1, label: KL.keyLabel(keys[spec.action]), arrow: spec.action === 'left' ? -1 : 1 }),
      );

      // pointer id → button under it. Recomputed on every down / move / up, so sliding a finger
      // from ← to → (or from sprint onto a kick) switches buttons without lifting it.
      this.owners = new Map();
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

    build(spec) {
      const s = this.scene;
      const b = { ...spec, lit: false, value: 0, ready: false };
      b.root = s.add.container(spec.x, spec.y).setDepth(20);
      if (spec.look === 'super') {
        b.glow = KL.Paint.place(s, 0, 0, KL.Paint.glow(s, Math.round(spec.r * 1.9), 'rgba(255,140,26,0.9)')).setVisible(false);
        b.root.add(b.glow);
      }
      b.looks = [false, true].map((lit) => LOOKS[spec.look](s, b, lit));
      b.face = KL.Paint.place(s, 0, 0, b.looks[0]);
      b.root.add(b.face);
      if (spec.look === 'super') {
        b.meter = s.add.graphics();
        b.root.add(b.meter);
      }
      return b;
    }

    /** Which button a pointer is on (nearest wins when hit areas overlap), or null. */
    hit(pointer) {
      const w = KL.worldPoint(this.scene, pointer);
      let best = null, bestD = 1;
      for (const b of this.buttons) {
        const dx = w.x - b.x, dy = w.y - b.y;
        // generous targets: fingers are wider than cursors
        const d = b.look === 'kick'
          ? Math.max(Math.abs(dx) / (b.w / 2 + 10), Math.abs(dy) / (b.h / 2 + 14))
          : Math.hypot(dx, dy) / (b.r + (b.look === 'super' ? KL.PAD_LAYOUT.meter.gap + 8 : 12));
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

    /** Per frame: light the buttons that are held (by key or touch) or were just tapped. */
    update() {
      const now = performance.now();
      const flash = KL.PAD_LAYOUT.flashMs;
      for (const b of this.buttons) {
        const pad = this.pads[b.player];
        const lit = !!pad && (pad.isDown(b.action) || now - (pad.pressedAt[b.action] ?? -1e9) < flash);
        if (lit === b.lit) continue;
        b.lit = lit;
        const look = b.looks[lit ? 1 : 0];
        b.face.setTexture(look.key).setOrigin(look.ox, look.oy).setScale((lit ? 0.94 : 1) / KL.RES);
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
        const tw = this.scene.tweens;
        tw.killTweensOf([b.glow, b.root]);
        b.root.setScale(1);
        b.glow.setVisible(ready).setAlpha(0.55);
        if (ready) {
          tw.add({ targets: b.glow, alpha: 1, duration: 320, yoyo: true, repeat: -1 });
          tw.add({ targets: b.root, scaleX: 1.07, scaleY: 1.07, duration: 320, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        }
      }
      const g = b.meter, M = KL.PAD_LAYOUT.meter, R = b.r + M.gap;
      g.clear();
      const p = Phaser.Math.Clamp(value / max, 0, 1);
      if (p > 0) {
        const a0 = -Math.PI / 2, a1 = a0 + Math.PI * 2 * p;
        g.lineStyle(M.width - 1, ready ? 0xff8c1a : KL.PAL.gold, 1);
        g.beginPath();
        g.arc(0, 0, R, a0, a1, false);
        g.strokePath();
        g.lineStyle(1.5, 0xffffff, 0.55); // highlight on the outer edge of the fill
        g.beginPath();
        g.arc(0, 0, R + (M.width - 1) / 2 - 1.2, a0, a1, false);
        g.strokePath();
      }
      return true;
    }

    destroy() {
      const input = this.scene.input;
      input?.off('pointerdown', this.onPointer);
      input?.off('pointermove', this.onPointer);
      input?.off('pointerup', this.onUp);
      input?.off('pointerupoutside', this.onUp);
      this.scene.game?.events.off(Phaser.Core.Events.BLUR, this.onBlur);
      this.releaseAll();
    }
  };
})();
