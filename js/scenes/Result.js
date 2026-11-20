/* Result: WIN/LOSE/DRAW banner, both characters posed, final score, stats, Rematch/Change/Home. */
window.KL = window.KL || {};

KL.ResultScene = class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }
  init(data) {
    this.result = data;
  }
  create() {
    const W = KL.TUNING.world;
    const r = this.result;
    const cfg = r.config;
    KL.Stadium.build(this, { night: cfg.night, parallax: false });
    this.add.rectangle(0, 0, W.width, W.height, 0x0f1230, 0.55).setOrigin(0).setDepth(5);
    KL.audio?.playMusic('menu');

    const defs = [KL.CHARACTERS.find((c) => c.id === cfg.p1Char), KL.CHARACTERS.find((c) => c.id === cfg.p2Char)];
    for (const def of defs) for (const a of KL.CHARACTER_ANIMS) {
      const key = `${def.id}/${a.key}`;
      if (!this.anims.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNames('characters', { prefix: `${def.id}/${a.key}/`, start: 0, end: a.frames - 1, zeroPad: 2 }), frameRate: a.fps, repeat: a.loop ? -1 : 0 });
    }
    const floorY = KL.STADIUM_LAYOUT.showcaseY; // big characters stand on the grass, not the match's feet line
    for (const x of [175, W.width - 175]) this.add.ellipse(x, floorY + 6, 170, 26, 0x000000, 0.3).setDepth(6);
    const p1 = this.add.sprite(175, floorY + 14, 'characters', `${defs[0].id}/idle/00`).setOrigin(0.5, 1).setDisplaySize(340, 340).setDepth(6);
    const p2 = this.add.sprite(W.width - 175, floorY + 14, 'characters', `${defs[1].id}/idle/00`).setOrigin(0.5, 1).setDisplaySize(340, 340).setDepth(6).setFlipX(true);
    const w = r.winner;
    p1.play(`${defs[0].id}/${w === 0 ? 'celebrate' : w === 1 ? 'lose' : 'idle'}`);
    p2.play(`${defs[1].id}/${w === 1 ? 'celebrate' : w === 0 ? 'lose' : 'idle'}`);

    // banner
    const bannerKey = w === null ? 'draw' : w === 0 ? 'win' : 'lose';
    const bannerFrame = { win: '01', lose: '02', draw: '03' }[bannerKey];
    if (KL.hasUiFrame(this, `ui_banners/${bannerFrame}`)) {
      const b = this.add.image(W.width / 2, 120, 'ui', `ui_banners/${bannerFrame}`).setDepth(7);
      const s = KL.fit(b, 560, 190);
      b.setScale(s * 0.4);
      this.tweens.add({ targets: b, scaleX: s, scaleY: s, duration: 260, ease: 'Back.out' });
    }
    else KL.displayText(this, W.width / 2, 150, KL.t(`result_${bannerKey}`), 120, bannerKey === 'win' ? '#f5c518' : bannerKey === 'lose' ? '#8a8fa8' : '#9fd7ff').setDepth(7);

    const sub = KL.t(w === null ? 'result_draw_text' : w === 0 ? 'result_you_win' : 'result_cpu_wins');
    // score card so the numbers read over the crowd
    const cx = W.width / 2;
    new KL.Panel(this, cx, 374, 540, 324).setDepth(6);
    KL.fitText(KL.bodyText(this, cx, 262, sub, 24, '#ffffff', { weight: 'heavy' }), 420).setDepth(7);
    const flagFr = (d) => `flag_${d.flag}`;
    defs.forEach((d, i) => {
      const x = cx + (i === 0 ? -178 : 178);
      if (KL.hasUiFrame(this, flagFr(d))) this.add.image(x, 318, 'ui', flagFr(d)).setDisplaySize(50, 50).setDepth(7);
      KL.fitText(KL.bodyText(this, x, 356, d.name, 18, '#c9cde0', { weight: 'heavy' }), 110).setDepth(7);
    });
    // left score grows leftwards, right score rightwards, so 2-digit scores never hit the dash or flags
    KL.fitText(KL.displayText(this, cx - 34, 332, String(r.score[0]), 84, '#ffffff', { originX: 1 }), 104).setDepth(7);
    KL.displayText(this, cx, 332, '–', 64, '#ffffff').setDepth(7);
    KL.fitText(KL.displayText(this, cx + 34, 332, String(r.score[1]), 84, '#ffffff', { originX: 0 }), 104).setDepth(7);

    // stats table
    const rows = [['result_shots', r.stats.shots], ['result_headers', r.stats.headers], ['result_supers', r.stats.supers]];
    rows.forEach(([k, v], i) => {
      const y = 410 + i * 30;
      KL.bodyText(this, cx - 150, y, String(v[0]), 22, '#ffffff', { weight: 'heavy' }).setDepth(7);
      KL.fitText(KL.bodyText(this, cx, y, KL.t(k), 18, '#c9cde0'), 170).setDepth(7);
      KL.bodyText(this, cx + 150, y, String(v[1]), 22, '#ffffff', { weight: 'heavy' }).setDepth(7);
    });

    const items = [
      new KL.Button(this, W.width / 2 - 250, 620, KL.t('result_rematch'), () => KL.goTo(this, 'Match', { ...cfg }), { width: 240, height: 64, icon: 'ui_icons/09' }),
      new KL.Button(this, W.width / 2, 620, KL.t('result_change'), () => KL.goTo(this, 'CharSelect', { ...cfg }), { kind: 'secondary', width: 230 }),
      new KL.Button(this, W.width / 2 + 250, 620, KL.t('result_home'), () => KL.goTo(this, 'Menu'), { kind: 'secondary', width: 200, icon: 'ui_icons/08' }),
    ].map((b) => b.setDepth(8));
    new KL.MenuNav(this, items, { horizontal: true, onBack: () => KL.goTo(this, 'Menu') });
    KL.audio?.play(bannerKey === 'lose' ? 'lose' : 'win');
    KL.fadeIn(this);
  }
};
