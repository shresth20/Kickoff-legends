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
    const V = KL.View;
    const u = V.ui;
    const r = this.result;
    const cfg = r.config;
    KL.Stadium.build(this, { night: cfg.night, parallax: false });
    V.cover(this, 0x0f1230, 0.55).setDepth(5);

    const defs = [KL.CHARACTERS.find((c) => c.id === cfg.p1Char), KL.CHARACTERS.find((c) => c.id === cfg.p2Char)];
    for (const def of defs) KL.ensureCharacterAnims(this.anims, def.id);
    const floorY = KL.STADIUM_LAYOUT.showcaseY; // big characters stand on the grass, not the match's feet line
    const shadows = [175, W.width - 175].map((x) => this.add.ellipse(x, floorY + 6, 170, 26, 0x000000, 0.3).setDepth(6));
    const p1 = this.add.sprite(175, floorY + 14, 'characters', `${defs[0].id}/idle/00`).setOrigin(0.5, 1).setDisplaySize(340, 340).setDepth(6);
    const p2 = this.add.sprite(W.width - 175, floorY + 14, 'characters', `${defs[1].id}/idle/00`).setOrigin(0.5, 1).setDisplaySize(340, 340).setDepth(6).setFlipX(true);
    const w = r.winner;
    p1.play(`${defs[0].id}/${w === 0 ? 'celebrate' : w === 1 ? 'lose' : 'idle'}`);
    p2.play(`${defs[1].id}/${w === 1 ? 'celebrate' : w === 0 ? 'lose' : 'idle'}`);

    // banner
    const bannerKey = w === null ? 'draw' : w === 0 ? 'win' : 'lose';
    const bannerFrame = { win: '01', lose: '02', draw: '03' }[bannerKey];
    let banner, bannerH;
    if (KL.hasUiFrame(this, `ui_banners/${bannerFrame}`)) {
      banner = this.add.image(W.width / 2, 120, 'ui', `ui_banners/${bannerFrame}`).setDepth(7);
      // a phone's height is precious: a slightly smaller banner leaves the score card more room
      const s = KL.fit(banner, V.phone ? 480 : 560, V.phone ? 160 : 190);
      bannerH = banner.frame.realHeight * s;
      banner.setScale(s * 0.4);
      this.tweens.add({ targets: banner, scaleX: s, scaleY: s, duration: KL.paced(260), ease: 'Back.out' });
    } else {
      banner = KL.displayText(this, W.width / 2, 150, KL.t(`result_${bannerKey}`), 120, bannerKey === 'win' ? '#f5c518' : bannerKey === 'lose' ? '#8a8fa8' : '#9fd7ff').setDepth(7);
      bannerH = 150;
    }

    const sub = KL.t(w === null ? 'result_draw_text' : w === 0 ? 'result_you_win' : 'result_cpu_wins');
    // score card so the numbers read over the crowd: one group laid out around its centre
    const card = this.add.container(W.width / 2, 374).setDepth(6);
    card.add(new KL.Panel(this, 0, 0, 540, 324));
    // small print grows on a phone (V.font) so the stats stay readable
    card.add(KL.fitText(KL.bodyText(this, 0, -112, sub, V.font(24), '#ffffff', { weight: 'heavy' }), 420));
    const flagFr = (d) => `flag_${d.flag}`;
    defs.forEach((d, i) => {
      const x = i === 0 ? -178 : 178;
      if (KL.hasUiFrame(this, flagFr(d))) card.add(this.add.image(x, -56, 'ui', flagFr(d)).setDisplaySize(50, 50));
      card.add(KL.fitText(KL.bodyText(this, x, V.phone ? -14 : -18, d.name, V.font(18), '#c9cde0', { weight: 'heavy' }), 110));
    });
    // left score grows leftwards, right score rightwards, so 2-digit scores never hit the dash or flags
    card.add([
      KL.fitText(KL.displayText(this, -34, -42, String(r.score[0]), 84, '#ffffff', { originX: 1 }), 104),
      KL.displayText(this, 0, -42, '–', 64, '#ffffff'),
      KL.fitText(KL.displayText(this, 34, -42, String(r.score[1]), 84, '#ffffff', { originX: 0 }), 104),
    ]);

    // stats table
    const rows = [['result_shots', r.stats.shots], ['result_headers', r.stats.headers], ['result_supers', r.stats.supers]];
    const rowH = V.phone ? 34 : 30;
    rows.forEach(([k, v], i) => {
      const y = (V.phone ? 32 : 36) + i * rowH;
      card.add([
        KL.bodyText(this, -150, y, String(v[0]), V.font(22), '#ffffff', { weight: 'heavy' }),
        KL.fitText(KL.bodyText(this, 0, y, KL.t(k), V.font(18), '#c9cde0'), 200),
        KL.bodyText(this, 150, y, String(v[1]), V.font(22), '#ffffff', { weight: 'heavy' }),
      ]);
    });

    // one row of buttons along the bottom; a phone shows them thumb-sized
    const items = [
      new KL.Button(this, -250, 0, KL.t('result_rematch'), () => KL.goTo(this, 'Match', { ...cfg }), { width: 240, height: 64, icon: 'ui_icons/09' }),
      new KL.Button(this, 0, 0, KL.t('result_change'), () => KL.goTo(this, 'CharSelect', { ...cfg }), { kind: 'secondary', width: 230 }),
      new KL.Button(this, 250, 0, KL.t('result_home'), () => KL.goTo(this, 'Menu'), { kind: 'secondary', width: 200, icon: 'ui_icons/08' }),
    ];
    const row = this.add.container(W.width / 2, 620).setDepth(8).add(items);
    new KL.MenuNav(this, items, { horizontal: true, onBack: () => KL.goTo(this, 'Menu') });

    V.layout(this, (v) => {
      // the legends stand out at the screen's sides (inside the safe area)
      const side = 175 + Math.min(0, v.left);
      [p1, shadows[0]].forEach((o) => o.setX(side));
      [p2, shadows[1]].forEach((o) => o.setX(W.width - side));
      // buttons on the bottom safe edge (as wide as fits); banner from the top (a little higher on a
      // tall tablet); the score card scaled into the room between them
      const k = Math.min(u, (v.right - v.left - 40) / 780);
      const rowY = Math.min(620, v.bottom - 44 * k - 18);
      row.setPosition(W.width / 2, rowY).setScale(k);
      const bannerY = (V.phone ? 104 : 120) + Math.min(0, v.top) * 0.35 + Math.max(0, v.top);
      banner.setY(bannerY);
      const top = bannerY + bannerH * 0.42, bottom = rowY - 38 * k;
      const ck = Phaser.Math.Clamp((bottom - top - 8) / 324, 0.85, u);
      card.setPosition(W.width / 2, Math.min(374, (top + bottom) / 2 + 6)).setScale(ck);
    });
    // a fanfare for a win (a gentle fall for a loss), then that mood's take on the theme; the stand
    // applauds the legends off
    const A = KL.audio;
    if (bannerKey !== 'draw') A?.play(bannerKey === 'win' ? 'jingle_win' : 'jingle_lose');
    A?.playMusic({ win: 'victory', lose: 'defeat', draw: 'menu' }[bannerKey], { delay: bannerKey === 'draw' ? 0.3 : 2.3 });
    A?.crowd?.react('applause', { dur: 6, gain: 0.5 });
    if (w !== null) A?.voices?.say(defs[w].id, w === 0 ? 'cheer' : 'ready', { x: w === 0 ? 175 : W.width - 175, delay: 0.5, gain: 0.8 });
    KL.fadeIn(this);
  }
};
