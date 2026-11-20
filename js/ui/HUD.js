/* Match HUD: scoreboard plate (flag + name + score each side, gold timer crest), the on-screen
 * controller (KL.TouchControls — its Super button carries the charge ring), the CPU's super bar,
 * reactions drawer, pause button, goal/kickoff banners.
 * Lives in its own scene layered over Match so pausing never touches game objects.
 * Like a native game's HUD it is anchored to the screen, not the pitch (KL.View): the scoreboard to
 * the top centre, pause to the top-right corner, reactions to the left edge, the pad to the bottom
 * corners — all inside the safe area — and a phone shows it all scaled up (KL.View.ui). */
window.KL = window.KL || {};

/** Scoreboard geometry in logical px, relative to the plate centre (x = screen centre, y below the
 * top safe edge). The numbers at the top level are the plate painted in code, used when the atlas
 * has no scoreboard art. */
KL.HUD_SCOREBOARD = {
  version: 1, // bump to repaint after changing the numbers below
  y: 62,
  // a phone scales the plate by this share of its UI scale (the header stays compact: it is read,
  // not touched)
  phoneScale: 0.6,
  shieldW: 100, shieldTop: -58, shieldTip: 56, // timer crest
  boxX: 96, boxW: 64, boxH: 54, // score boxes (centre x)
  plateIn: 142, plateOut: 318, plateH: 42, // name bars
  flagX: 346, flagR: 31, // flag sockets
  /**
   * The scoreboard art (ui:ui_hud_scoreboard): shown `w` logical px wide, its centre `y` below the
   * top safe edge. Its slots are measured on the source art, `src` px wide, in source px from its
   * centre (x: the right-hand slot, mirrored on the left; y: down).
   */
  art: {
    w: 740, y: 73, src: 2145,
    flag: { x: 941, y: 3, r: 92 }, // white sockets
    name: { x: 620, y: 4, w: 340 }, // navy bars, inside the slant
    score: { x: 254, y: -14, w: 150 }, // purple boxes, on the face above the lip
    clock: { y: -32, w: 250 }, labelY: 84, labelW: 150, // gold shield
    barY: 155, // CPU super bar, under the right-hand name bar
  },
};

KL.HUDScene = class HUDScene extends Phaser.Scene {
  constructor() {
    super('HUD');
  }

  init(data) {
    this.bus = data.bus;
    this.cfg = data.cfg;
    this.defs = data.defs;
    this.pads = data.pads || [];
  }

  create() {
    const W = KL.TUNING.world;
    const cx = W.width / 2;
    this.offs = [];

    // Scoreboard plate: the art, or painted in code (see paintScoreboard) when the atlas lacks it.
    // Every slot below has a fixed, measured size, and the text placed in it is shrunk to fit so
    // nothing spills or gets cut. One container, laid out around the plate centre, so it can be
    // anchored and scaled as a whole.
    const S = (this.slots = this.scoreboardSlots());
    const sb = (this.scoreboard = this.add.container(cx, S.y));
    const add = (o) => (sb.add(o), o);
    if (S.art) {
      const plate = add(this.add.image(0, 0, 'ui', 'ui_hud_scoreboard'));
      plate.setScale(KL.HUD_SCOREBOARD.art.w / plate.frame.cutWidth);
    } else add(KL.Paint.place(this, 0, 0, this.paintScoreboard()));
    for (const [i, sgn] of [[0, -1], [1, 1]]) {
      const fr = `flag_${this.defs[i].flag}`;
      if (KL.hasUiFrame(this, fr)) KL.fit(add(this.add.image(sgn * S.flagX, S.flagY, 'ui', fr)), S.flagD, S.flagD);
    }
    add(KL.fitText(KL.bodyText(this, -S.nameX, S.nameY, this.defs[0].name, 19, '#ffffff', { weight: 'heavy' }), S.nameW));
    add(KL.fitText(KL.bodyText(this, S.nameX, S.nameY, `CPU ${this.defs[1].name}`, 19, '#ffffff', { weight: 'heavy' }), S.nameW));
    this.scoreL = add(KL.displayText(this, -S.scoreX, S.scoreY, '0', 40, '#ffffff'));
    this.scoreR = add(KL.displayText(this, S.scoreX, S.scoreY, '0', 40, '#ffffff'));
    this.clock = add(KL.displayText(this, 0, S.clockY, String(KL.TUNING.match.durationSec), 46, '#1B1F3B', { style: { stroke: '#ffffff', strokeThickness: 5, shadow: { offsetX: 0, offsetY: 0 } } }));
    this.clockLabel = add(KL.fitText(KL.bodyText(this, 0, S.labelY, KL.t('hud_time'), 11, '#1B1F3B', { weight: 'heavy' }), S.labelW));

    // on-screen controller (keys shown on every button; touch / mouse playable)
    this.match = this.scene.get('Match');
    const live = () => !this.match.paused && !this.match.ended;
    this.controls = new KL.TouchControls(this, { pads: this.pads, isLive: live });
    // the CPU has no buttons: its super charge is a slim bar under its name plate
    this.cpuBar = this.buildCpuBar(S.nameX - 6, S.barY, S.nameW + 6);

    // reactions drawer + pause for touch screens
    this.drawers = [new KL.EmoteDrawer(this, { x: 46, y: 160, dir: 1, isLive: live, onPick: (index) => this.bus.emit('EMOTE', { player: 0, index }) })];
    this.pauseButton = new KL.Button(this, W.width - 46, 46, 'II', () => live() && this.match.togglePause(), { kind: 'icon', icon: 'ui_icons/07', width: 58, height: 58 }).setDepth(30);

    this.banner = KL.displayText(this, cx, 280, '', 110, '#f5c518').setAlpha(0).setDepth(5);

    // anchor everything to the screen; re-run on every resize / rotation
    KL.View.layout(this, (V) => this.layout(V));

    const b = this.bus;
    this.offs.push(
      b.on('CLOCK', (e) => this.setClock(e.secondsLeft, e.suddenDeath)),
      b.on('GOAL', (e) => {
        this.setScore(this.scoreL, e.score[0]);
        this.setScore(this.scoreR, e.score[1]);
        this.pop(e.scorer === 0 ? this.scoreL : this.scoreR);
        this.showBanner(KL.t('goal'), '#f5c518', 'goal');
      }),
      b.on('WHISTLE', (e) => {
        if (e.reason === 'kickoff') this.showBanner(KL.t('kickoff'), '#ffffff');
        if (e.reason === 'suddendeath') this.showBanner(KL.t('sudden_death'), '#e63946');
        if (e.reason === 'fulltime') this.showBanner(KL.t('full_time'), '#ffffff');
      }),
      b.on('SUPER_METER', (e) => this.setMeter(e.player, e.value)),
      b.on('SUPER_READY', (e) => this.setMeter(e.player, KL.TUNING.super.max)),
      b.on('PAUSE', () => {
        this.controls.releaseAll();
        this.drawers.forEach((d) => d.toggle(false));
      }),
      b.on('MATCH_END', () => {
        this.controls.releaseAll();
        this.drawers.forEach((d) => d.toggle(false));
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offs.forEach((o) => o()));
  }

  /**
   * Screen anchors: the scoreboard hangs from the top safe edge, centred; pause sits in the top-right
   * corner and the reactions button on the left edge, below the plate; the pad in the bottom corners.
   */
  layout(V) {
    const SB = KL.HUD_SCOREBOARD;
    const u = V.ui;
    const hs = 1 + (u - 1) * SB.phoneScale; // scoreboard scale
    this.scoreboard.setPosition(KL.TUNING.world.width / 2, V.top + this.slots.y * hs).setScale(hs);
    this.pauseButton.setPosition(V.right - 46 * u, V.top + 46 * u).setBaseScale(u);
    this.drawers[0].setLayout(V.left + 46 * u, V.top + 160 * hs, u);
    this.controls.layout(V);
  }

  /**
   * Where the flags, names, scores, clock and CPU bar go on the plate (logical px from its centre;
   * x of the right-hand slot, mirrored on the left): measured on the art (KL.HUD_SCOREBOARD.art)
   * when the atlas has it, else the painted plate's.
   */
  scoreboardSlots() {
    const SB = KL.HUD_SCOREBOARD;
    if (KL.hasUiFrame(this, 'ui_hud_scoreboard')) {
      const A = SB.art, k = A.w / A.src;
      return {
        art: true, y: A.y,
        flagX: A.flag.x * k, flagY: A.flag.y * k, flagD: (A.flag.r * 2 - 10) * k,
        nameX: A.name.x * k, nameY: A.name.y * k, nameW: A.name.w * k,
        scoreX: A.score.x * k, scoreY: A.score.y * k, scoreW: A.score.w * k,
        clockY: A.clock.y * k, clockW: A.clock.w * k, labelY: A.labelY * k, labelW: A.labelW * k,
        barY: A.barY * k,
      };
    }
    return {
      art: false, y: SB.y,
      flagX: SB.flagX, flagY: 0, flagD: SB.flagR * 2 - 6,
      nameX: (SB.plateIn + SB.plateOut) / 2 + 4, nameY: 0, nameW: SB.plateOut - SB.plateIn - 34,
      scoreX: SB.boxX, scoreY: 0, scoreW: SB.boxW - 12,
      clockY: -9, clockW: SB.shieldW - 16, labelY: 29, labelW: SB.shieldW * 0.5,
      barY: SB.plateH / 2 + 13,
    };
  }

  /** One texture for the whole plate: flag sockets, slanted name bars, score boxes, timer shield. */
  paintScoreboard() {
    const SB = KL.HUD_SCOREBOARD;
    const P = KL.Paint, C = P.C;
    const half = SB.flagX + SB.flagR + 4;
    const top = SB.shieldTop - 6, bottom = SB.shieldTip + 10;
    const tw = (half + 8) * 2, th = bottom - top;
    const ox = tw / 2, oy = -top; // plate centre inside the texture
    const key = P.paint(this, `kl:scoreboard:${SB.version}`, tw, th, (ctx) => {
      ctx.translate(ox, oy);
      ctx.lineJoin = 'round';
      const outline = (w) => {
        ctx.lineWidth = w;
        ctx.strokeStyle = C.ink;
        ctx.stroke();
      };
      ctx.save(); // soft drop shadow under the whole plate
      ctx.shadowColor = 'rgba(5,7,30,0.45)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      for (const sgn of [-1, 1]) {
        P.rr(ctx, sgn < 0 ? -SB.plateOut : SB.plateIn - 10, -SB.plateH / 2, SB.plateOut - SB.plateIn + 10, SB.plateH, 8);
        ctx.fillStyle = C.ink;
        ctx.fill();
      }
      ctx.restore();
      for (const sgn of [-1, 1]) {
        // name bar: navy, gold rim, inner end slanted toward the centre
        const a = sgn * SB.plateOut, b = sgn * SB.plateIn, h2 = SB.plateH / 2;
        const bar = () => {
          ctx.beginPath();
          ctx.moveTo(a, -h2);
          ctx.lineTo(b + sgn * 6, -h2);
          ctx.lineTo(b - sgn * 12, h2);
          ctx.lineTo(a, h2);
          ctx.closePath();
        };
        bar();
        outline(7);
        ctx.fillStyle = P.vgrad(ctx, -h2, h2, ['#F8D23A', '#E5A812']);
        ctx.fill();
        ctx.save();
        ctx.translate(0, 0);
        ctx.beginPath();
        ctx.moveTo(a, -h2 + 4);
        ctx.lineTo(b + sgn * 2, -h2 + 4);
        ctx.lineTo(b - sgn * 14, h2 - 4);
        ctx.lineTo(a, h2 - 4);
        ctx.closePath();
        ctx.fillStyle = P.vgrad(ctx, -h2, h2, C.navy);
        ctx.fill();
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(Math.min(a, b) - 20, -h2 + 4, Math.abs(a - b) + 40, SB.plateH * 0.3);
        ctx.restore();
        // flag socket
        const fx = sgn * SB.flagX;
        P.circle(ctx, fx, 0, SB.flagR + 3.5);
        ctx.fillStyle = C.ink;
        ctx.fill();
        P.circle(ctx, fx, 0, SB.flagR);
        ctx.fillStyle = P.vgrad(ctx, -SB.flagR, SB.flagR, ['#FFE45C', '#D9930C']);
        ctx.fill();
        P.circle(ctx, fx, 0, SB.flagR - 4);
        ctx.fillStyle = C.ink;
        ctx.fill();
        // score box
        const bx = sgn * SB.boxX - SB.boxW / 2, by = -SB.boxH / 2;
        P.rr(ctx, bx, by, SB.boxW, SB.boxH, 13);
        outline(7);
        ctx.fillStyle = P.vgrad(ctx, by, by + SB.boxH, C.purple);
        ctx.fill();
        ctx.save();
        P.rr(ctx, bx, by, SB.boxW, SB.boxH, 13);
        ctx.clip();
        P.rr(ctx, bx + 1, by + 1, SB.boxW - 2, SB.boxH - 2, 12);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.stroke();
        P.gloss(ctx, bx + 6, by + 4, SB.boxW - 12, SB.boxH * 0.34, 0.4);
        ctx.restore();
      }
      // timer shield
      const w2 = SB.shieldW / 2, t = SB.shieldTop, tip = SB.shieldTip, side = 14, cr = 14;
      const shield = (inset) => {
        const l = -w2 + inset, r = w2 - inset, tt = t + inset;
        ctx.beginPath();
        ctx.moveTo(l, tt + cr);
        ctx.arcTo(l, tt, l + cr, tt, cr - inset * 0.5);
        ctx.lineTo(r - cr, tt);
        ctx.arcTo(r, tt, r, tt + cr, cr - inset * 0.5);
        ctx.lineTo(r, side);
        ctx.quadraticCurveTo(r, tip - 22 - inset * 0.4, 0, tip - inset * 1.4);
        ctx.quadraticCurveTo(l, tip - 22 - inset * 0.4, l, side);
        ctx.closePath();
      };
      ctx.save();
      ctx.shadowColor = 'rgba(5,7,30,0.5)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      shield(0);
      ctx.fillStyle = C.ink;
      ctx.fill();
      ctx.restore();
      shield(0);
      outline(7);
      ctx.fillStyle = P.vgrad(ctx, t, tip, ['#FFF08A', '#F8CC22', '#E39C0E']);
      ctx.fill();
      shield(7);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(160,98,8,0.85)';
      ctx.stroke();
      ctx.save();
      shield(7);
      ctx.clip();
      ctx.beginPath(); // left-half sheen
      ctx.moveTo(-w2, t);
      ctx.lineTo(-4, t);
      ctx.lineTo(-w2 + 6, tip);
      ctx.lineTo(-w2, tip);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
      ctx.restore();
    });
    return { key, ox: ox / tw, oy: oy / th };
  }

  update() {
    this.controls.update();
  }

  /** Charge for player i: their Super button's ring, or the CPU bar. */
  setMeter(i, value) {
    if (!this.controls.setSuper(i, value)) this.setCpuBar(value);
  }

  /** Slim charge bar (CPU) centred at x, y on the scoreboard. */
  buildCpuBar(x, y, w) {
    const h = 10;
    const track = KL.Paint.paint(this, `kl:cpubar:${w}`, w + 8, h + 8, (ctx) => {
      KL.Paint.rr(ctx, 1, 1, w + 6, h + 6, (h + 6) / 2);
      ctx.fillStyle = KL.Paint.C.ink;
      ctx.fill();
      KL.Paint.rr(ctx, 4, 4, w, h, h / 2);
      ctx.fillStyle = '#2A2F5C';
      ctx.fill();
    });
    const bar = { x, y, w, h, value: 0, ready: false };
    bar.glow = KL.Paint.place(this, x, y, KL.Paint.glow(this, Math.round(w * 0.36), 'rgba(255,140,26,0.8)')).setScale(1 / KL.UIRES, 0.3 / KL.UIRES).setVisible(false);
    bar.fill = this.add.graphics();
    this.scoreboard.add([bar.glow, this.add.image(x, y, track).setScale(1 / KL.UIRES), bar.fill]);
    return bar;
  }

  setCpuBar(value) {
    const bar = this.cpuBar;
    if (!bar) return;
    const max = KL.TUNING.super.max;
    const ready = value >= max;
    if (ready !== bar.ready) {
      bar.ready = ready;
      this.tweens.killTweensOf([bar.glow, bar.fill]);
      bar.fill.setAlpha(1);
      bar.glow.setVisible(ready).setAlpha(0.5);
      if (ready) {
        this.tweens.add({ targets: bar.glow, alpha: 1, duration: KL.paced(360), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        this.tweens.add({ targets: bar.fill, alpha: 0.6, duration: KL.paced(360), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    }
    const g = bar.fill, fw = Math.max(0, Math.min(1, value / max)) * bar.w;
    g.clear();
    if (fw <= 0) return;
    const x0 = bar.x - bar.w / 2, y0 = bar.y - bar.h / 2;
    g.fillStyle(ready ? 0xff8c1a : KL.PAL.goldDark, 1);
    g.fillRoundedRect(x0, y0, Math.max(bar.h, fw), bar.h, bar.h / 2);
    g.fillStyle(ready ? 0xffb35a : KL.PAL.gold, 1);
    g.fillRoundedRect(x0, y0, Math.max(bar.h, fw), bar.h * 0.65, { tl: bar.h / 2, tr: bar.h / 2, bl: 2, br: 2 });
  }

  setScore(t, v) {
    t.setText(String(v));
    KL.fitText(t, this.slots.scoreW);
  }

  setClock(sec, sudden) {
    this.clock.setText(String(sec));
    KL.fitText(this.clock, this.slots.clockW);
    this.clock.setColor(sudden ? '#e63946' : sec <= 10 ? '#e63946' : '#1B1F3B');
    if (sec <= 10 && sec > 0) this.pop(this.clock, 1.15);
  }

  pop(obj, s = 1.4) {
    this.tweens.killTweensOf(obj);
    const base = obj.fitScale ?? 1; // relative to the shrink-to-fit scale, so a pop never overflows for good
    obj.setScale(base);
    this.tweens.add({ targets: obj, scaleX: base * s, scaleY: base * s, duration: KL.paced(100), yoyo: true, ease: 'Sine.inOut' });
  }

  showBanner(text, color, frame) {
    const W = KL.TUNING.world;
    const useArt = frame && KL.hasUiFrame(this, `ui_banners/${{ goal: '00', win: '01', lose: '02', draw: '03' }[frame]}`);
    if (useArt) {
      const img = this.add.image(W.width / 2, 290, 'ui', `ui_banners/${{ goal: '00', win: '01', lose: '02', draw: '03' }[frame]}`).setAlpha(0).setDepth(5);
      const s = KL.fit(img, 640, 220);
      img.setScale(s * 0.3);
      this.tweens.add({ targets: img, alpha: 1, scaleX: s, scaleY: s, duration: KL.paced(220), ease: 'Back.out' });
      this.tweens.add({ targets: img, alpha: 0, delay: 1300, duration: KL.paced(300), ease: 'Sine.in', onComplete: () => img.destroy() });
      return;
    }
    this.banner.setText(text).setColor(color).setAlpha(0).setScale(0.4).setAngle(-4);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, alpha: 1, scaleX: 1, scaleY: 1, duration: KL.paced(220), ease: 'Back.out' });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1300, duration: KL.paced(300), ease: 'Sine.in' });
  }
};
