/* Title / main menu: logo, idle hero on the right, stacked buttons on the left. */
window.KL = window.KL || {};

KL.MenuScene = class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const W = KL.TUNING.world;
    KL.audio?.playMusic('menu');
    KL.Stadium.build(this, { night: false, parallax: false });
    const dim = this.add.rectangle(0, 0, W.width, W.height, 0x0f1230, 0.35).setOrigin(0);
    dim.setDepth(5);

    const logoY = 130;
    if (KL.hasUiFrame(this, 'ui_logo')) {
      this.add.image(W.width / 2, logoY, 'ui', 'ui_logo').setDisplaySize(620, 248).setDepth(6);
    } else {
      KL.displayText(this, W.width / 2, logoY - 30, 'KICKOFF', 96).setDepth(6);
      KL.displayText(this, W.width / 2, logoY + 50, 'LEGENDS', 96, '#e63946').setDepth(6);
    }

    // hero idling on the right
    const def = KL.CHARACTERS[0];
    const hero = this.add.sprite(W.width - 300, KL.STADIUM_LAYOUT.showcaseY, 'characters', `${def.id}/idle/00`).setOrigin(0.5, 1).setDisplaySize(340, 340).setDepth(6);
    if (!this.anims.exists(`${def.id}/idle`)) {
      for (const a of KL.CHARACTER_ANIMS) this.anims.create({ key: `${def.id}/${a.key}`, frames: this.anims.generateFrameNames('characters', { prefix: `${def.id}/${a.key}/`, start: 0, end: a.frames - 1, zeroPad: 2 }), frameRate: a.fps, repeat: a.loop ? -1 : 0 });
    }
    hero.play(`${def.id}/idle`);
    this.time.addEvent({ delay: 5000, loop: true, callback: () => {
      hero.play(`${def.id}/celebrate`);
      this.time.delayedCall(1800, () => hero.play(`${def.id}/idle`));
    } });

    const x = 330;
    const items = [
      new KL.Button(this, x, 330, KL.t('menu_play'), () => KL.goTo(this, 'CharSelect', { night: !!this.registry.get('night') }),{ icon: 'ui_icons/00' }),
      new KL.Button(this, x, 420, KL.t('menu_settings'), () => KL.goTo(this, 'Settings', { from: 'Menu' }), { kind: 'secondary', icon: 'ui_icons/03' }),
      new KL.Button(this, x, 495, KL.t('menu_credits'), () => KL.goTo(this, 'Credits'), { kind: 'secondary', icon: 'ui_icons/10' }),
    ];
    items.forEach((b) => b.setDepth(7));
    this.nav = new KL.MenuNav(this, items);

    // sound toggle top-right
    // speaker-with-waves (ui_icons/04) when sound is on, speaker-with-✕ (ui_icons/05) when muted
    const s = KL.Save.settings;
    const look = (on) => ({ icon: on ? 'ui_icons/04' : 'ui_icons/05', label: on ? '♪' : '✕' }); // label: no-art fallback
    const sndBtn = new KL.Button(this, W.width - 50, 50, look(s.master > 0).label, () => {
      const cur = KL.Save.settings.master;
      if (cur > 0) KL.unmuteVolume = cur; // unmuting brings back the volume you had, not a fixed level
      const next = cur > 0 ? 0 : KL.unmuteVolume || 0.8;
      KL.Save.patchSettings({ master: next });
      KL.audio?.applySettings();
      sndBtn.setIcon(look(next > 0).icon).setLabel(look(next > 0).label);
    }, { kind: 'icon', icon: look(s.master > 0).icon }).setDepth(7);

    KL.bodyText(this, 16, W.height - 14, `v${KL.VERSION} · ${KL.artSource === 'placeholder' ? 'placeholder art' : 'studio art'}`, 14, '#9aa1b8', { originX: 0, originY: 1 }).setDepth(7);
    KL.bodyText(this, W.width - 16, W.height - 14, KL.t('controls_hint_p1'), 14, '#c9cde0', { originX: 1, originY: 1, align: 'right' }).setDepth(7);
    KL.fadeIn(this);
  }
};
