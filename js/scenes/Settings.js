/* Settings: a small panel with music / sound-effects volume, screen shake and language.
 * (Master volume is the speaker button on the main menu; keys are fixed, shown on the on-screen pad.) */
window.KL = window.KL || {};

KL.SettingsScene = class SettingsScene extends Phaser.Scene {
  constructor() {
    super('Settings');
  }
  init(data) {
    this.from = data.from || 'Menu';
  }
  create() {
    const W = KL.TUNING.world;
    const overlay = this.from === 'Pause';
    if (!overlay) KL.Stadium.build(this, { night: false, parallax: false });
    this.add.rectangle(0, 0, W.width, W.height, 0x0f1230, overlay ? 0.75 : 0.6).setOrigin(0).setDepth(5);
    const cy = W.height / 2 + 10;
    new KL.Panel(this, W.width / 2, cy, 560, 460, { title: KL.t('settings_title') }).setDepth(6);

    const s = KL.Save.settings;
    const lx = W.width / 2 - 220; // labels
    const wx = W.width / 2 + 20; // left edge of the widgets
    let y = cy - 120;
    const row = (labelKey, widget) => {
      KL.bodyText(this, lx, y, KL.t(labelKey), 22, '#ffffff', { originX: 0 }).setDepth(7);
      widget.setDepth(7);
      y += 62;
      return widget;
    };
    // muted from the menu's speaker button: moving a slider up brings the sound back
    const volume = (key) => (v) => {
      const patch = { [key]: v };
      if (KL.Save.settings.master === 0 && v > 0) patch.master = KL.unmuteVolume || 0.8;
      this.apply(patch);
    };
    const sliders = [
      row('settings_music', new KL.Slider(this, wx + 100, y, 200, s.music, volume('music'))),
      row('settings_sfx', new KL.Slider(this, wx + 100, y, 200, s.sfx, (v) => {
        volume('sfx')(v);
        KL.audio?.play('kick_hard');
      })),
    ];
    const shake = row('settings_shake', new KL.Toggle(this, wx + 38, y, s.screenShake, (v) => this.apply({ screenShake: v })));
    const locales = KL.I18n.available;
    const langBtn = row('settings_language', new KL.Button(this, wx + 60, y, s.locale.toUpperCase(), () => {
      const next = locales[(locales.indexOf(KL.I18n.locale) + 1) % locales.length];
      KL.I18n.set(next);
      this.apply({ locale: next });
      this.scene.restart({ from: this.from });
    }, { kind: 'secondary', width: 120, height: 44, fontSize: 18 }));

    const back = new KL.Button(this, W.width / 2, cy + 160, KL.t('menu_back'), () => this.back(), { width: 240, height: 56, fontSize: 22 }).setDepth(7);

    const nav = new KL.MenuNav(this, [...sliders, shake, langBtn, back], { onBack: () => this.back() });
    this.input.keyboard.on('keydown-LEFT', () => {
      const it = nav.items[nav.index];
      if (it instanceof KL.Slider) it.nudge(-0.1);
    });
    this.input.keyboard.on('keydown-RIGHT', () => {
      const it = nav.items[nav.index];
      if (it instanceof KL.Slider) it.nudge(0.1);
    });
    if (!overlay) KL.fadeIn(this);
  }

  apply(partial) {
    KL.Save.patchSettings(partial);
    KL.audio?.applySettings();
  }

  back() {
    if (this.from === 'Pause') {
      this.scene.stop();
      this.scene.wake('Pause');
    } else {
      KL.goTo(this, this.from);
    }
  }
};
