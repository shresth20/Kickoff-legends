/* Character select: split screen, Player 1 left / CPU right, 4 portrait cards each, big idle
 * preview, Ready state per side, night-match toggle top-right. Match starts when both are ready. */
window.KL = window.KL || {};

KL.CharSelectScene = class CharSelectScene extends Phaser.Scene {
  constructor() {
    super('CharSelect');
  }

  init(data) {
    this.cfg = { night: !!data.night, p1Char: data.p1Char || 'char_01', p2Char: data.p2Char || 'char_02' };
    this.instant = !!data.instant; // restarted by the night toggle: no fade
  }

  create() {
    const W = KL.TUNING.world;
    KL.Stadium.build(this, { night: this.cfg.night, parallax: false });
    this.add.rectangle(0, 0, W.width, W.height, 0x0f1230, 0.6).setOrigin(0).setDepth(5);
    KL.displayText(this, W.width / 2, 56, KL.t('select_title'), 56).setDepth(6);
    this.add.rectangle(W.width / 2, W.height / 2 + 30, 6, 560, 0xf5c518).setDepth(6);

    this.cardLooks = { idle: KL.Paint.card(this, 80, 80, 'idle', 14), selected: KL.Paint.card(this, 80, 80, 'selected', 14) };
    this.sides = [this.buildSide(0, 320), this.buildSide(1, W.width - 320)];
    this.ready = [false, false];
    this.ensureAnims();
    this.sides.forEach((s, i) => this.select(i, KL.CHARACTER_IDS.indexOf(i === 0 ? this.cfg.p1Char : this.cfg.p2Char)));

    const kb = this.input.keyboard;
    const c = KL.Save.settings.controls.p1;
    const bind = (name, fn) => kb.on(`keydown-${name}`, fn);
    bind(c.left, () => this.move(0, -1));
    bind(c.right, () => this.move(0, 1));
    bind(c.kickLow, () => this.toggleReady(0));
    bind('ENTER', () => this.toggleReady(0));
    // the CPU browses until Player 1 locks in, then picks a different legend
    this.cpuShuffle = this.time.addEvent({ delay: 170, loop: true, callback: () => this.select(1, this.sides[1].index + 1) });
    bind('ESC', () => KL.goTo(this, 'Menu'));
    new KL.Button(this, 110, 60, KL.t('menu_back'), () => KL.goTo(this, 'Menu'), { kind: 'secondary', width: 160, height: 50, fontSize: 18 }).setDepth(7);

    // night match: the stadium behind the picker switches over straight away, picks are kept
    KL.bodyText(this, W.width - 118, 60, KL.t('night_stadium'), 20, '#ffffff', { originX: 1 }).setDepth(7);
    const night = new KL.Toggle(this, W.width - 66, 60, this.cfg.night, (v) => this.setNight(v)).setDepth(7);
    if (!Object.values(c).includes('N')) bind('N', () => night.toggle());

    if (!this.instant) KL.fadeIn(this);
  }

  setNight(on) {
    if (this._leaving) return;
    this.registry.set('night', on);
    this.scene.restart({ ...this.cfg, night: on, instant: true });
  }

  ensureAnims() {
    for (const def of KL.CHARACTERS) {
      for (const a of KL.CHARACTER_ANIMS) {
        const key = `${def.id}/${a.key}`;
        if (!this.anims.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNames('characters', { prefix: `${def.id}/${a.key}/`, start: 0, end: a.frames - 1, zeroPad: 2 }), frameRate: a.fps, repeat: a.loop ? -1 : 0 });
      }
    }
  }

  buildSide(i, cx) {
    const isCpu = i === 1;
    const side = { i, cx, index: 0, isCpu };
    this.add.ellipse(cx, 448, 150, 26, 0x000000, 0.35).setDepth(6);
    side.preview = this.add.sprite(cx, 462, 'characters', 'char_01/idle/00').setOrigin(0.5, 1).setDisplaySize(330, 330).setDepth(6);
    if (isCpu) side.preview.setFlipX(true);
    else side.preview.setInteractive({ useHandCursor: true }).on('pointerup', () => this.toggleReady(i)); // tap the legend = Ready
    side.name = KL.displayText(this, cx, 480, '', 44).setDepth(6);
    side.flag = this.add.image(cx, 480, 'ui', 'flag_eng').setDisplaySize(34, 34).setDepth(6).setVisible(false);
    side.tag = KL.bodyText(this, cx, 516, '', 18, '#c9cde0').setDepth(6);
    side.cards = KL.CHARACTER_IDS.map((id, k) => {
      const x = cx - 150 + k * 100;
      const card = this.add.container(x, 580).setDepth(6);
      card.bg = KL.Paint.place(this, 0, 0, this.cardLooks.idle);
      card.add(card.bg);
      if (KL.hasUiFrame(this, `${id}_portrait`)) card.add(this.add.image(0, 0, 'ui', `${id}_portrait`).setDisplaySize(70, 70));
      card.setSize(84, 84);
      if (!isCpu) {
        card.setInteractive({ useHandCursor: true }).on('pointerup', () => {
          // touch screens have no J / Enter: tapping the highlighted legend again locks it in
          if (k === side.index) return this.toggleReady(i);
          this.select(i, k);
          KL.audio?.play('ui_move');
        });
      }
      return card;
    });
    side.readyText = KL.displayText(this, cx, 240, KL.t('select_ready'), 54, '#3fbf5a').setDepth(8).setVisible(false).setAngle(-8);
    return side;
  }

  select(i, index) {
    const side = this.sides[i];
    if (this.ready[i] && !side.isCpu) return;
    side.index = (index + KL.CHARACTER_IDS.length) % KL.CHARACTER_IDS.length;
    const def = KL.CHARACTERS[side.index];
    side.preview.play(`${def.id}/idle`, true);
    side.name.setText(def.name);
    if (KL.hasUiFrame(this, `flag_${def.flag}`)) side.flag.setFrame(`flag_${def.flag}`).setDisplaySize(34, 34).setPosition(side.cx - KL.textWidth(side.name) / 2 - 26, 482).setVisible(true);
    side.tag.setText(KL.t(def.tagline));
    side.cards.forEach((c, k) => {
      const on = k === side.index;
      c.bg.setTexture((on ? this.cardLooks.selected : this.cardLooks.idle).key);
      c.setScale(on ? 1.12 : 1);
    });
    if (i === 0) this.cfg.p1Char = def.id;
    else this.cfg.p2Char = def.id;
  }

  move(i, d) {
    if (this.ready[i]) return;
    this.select(i, this.sides[i].index + d);
    KL.audio?.play('ui_move');
  }

  /** Player 1 locks in / backs out (i = 0); the CPU (i = 1, force) only ever locks in after them. */
  toggleReady(i, force) {
    const side = this.sides[i];
    if (side.isCpu && !force) return;
    this.ready[i] = force ? true : !this.ready[i];
    side.readyText.setVisible(this.ready[i]);
    side.preview.play(`${KL.CHARACTERS[side.index].id}/${this.ready[i] ? 'celebrate' : 'idle'}`, true);
    KL.audio?.play(this.ready[i] ? 'ui_click' : 'ui_back');
    if (i === 0) {
      if (this.ready[0]) {
        this.cpuShuffle.paused = true;
        this.time.delayedCall(420, () => {
          if (!this.ready[0]) return;
          const pick = Phaser.Utils.Array.GetRandom(KL.CHARACTER_IDS.map((_, k) => k).filter((k) => k !== side.index));
          this.select(1, pick);
          this.time.delayedCall(380, () => this.ready[0] && !this.ready[1] && this.toggleReady(1, true));
        });
      } else {
        if (this.ready[1]) {
          this.ready[1] = false;
          this.sides[1].readyText.setVisible(false);
          this.sides[1].preview.play(`${KL.CHARACTERS[this.sides[1].index].id}/idle`, true);
        }
        this.cpuShuffle.paused = false;
      }
    }
    if (this.ready[0] && this.ready[1]) {
      this.time.delayedCall(700, () => this.ready[0] && this.ready[1] && KL.goTo(this, 'Match', { ...this.cfg }));
    }
  }
};
