/* Settings: a small panel with music / sound-effects volume, screen shake and language.
 * (Master volume is the speaker button on the main menu; keys are fixed, shown on the on-screen pad.)
 * The panel and everything on it is one group, centred in the screen's safe area and scaled to the
 * UI scale (thumb-sized sliders and toggles on a phone), never past what fits. */
window.KL = window.KL || {};

KL.SettingsScene = class SettingsScene extends Phaser.Scene {
  constructor() {
    super('Settings');
  }
  init(data) {
    this.from = data.from || 'Menu';
  }
  create() {
    const overlay = this.from === 'Pause';
    if (!overlay) KL.Stadium.build(this, { night: false, parallax: false });
    KL.View.cover(this, 0x0f1230, overlay ? 0.75 : 0.6).setDepth(5);
    // the panel group, laid out around its centre
    const ui = this.add.container(0, 0).setDepth(6);
    ui.add(new KL.Panel(this, 0, 0, 560, 460, { title: KL.t('settings_title') }));

    const s = KL.Save.settings;
    const lx = -220; // labels
    const wx = 20; // left edge of the widgets
    let y = -120;
    const row = (labelKey, widget) => {
      ui.add([KL.fitText(KL.bodyText(this, lx, y, KL.t(labelKey), 22, '#ffffff', { originX: 0 }), wx - lx - 16), widget]);
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
      KL.View.localize();
      this.apply({ locale: next });
      this.scene.restart({ from: this.from });
    }, { kind: 'secondary', width: 120, height: 44, fontSize: 18 }));

    const back = new KL.Button(this, 0, 160, KL.t('menu_back'), () => this.back(), { width: 240, height: 56, fontSize: 22 });
    ui.add(back);
    KL.View.layout(this, (V) => {
      const k = Math.min(V.ui, (V.bottom - V.top - 20) / 470, (V.right - V.left - 20) / 570);
      ui.setPosition(V.cx, V.cy + 10 * k).setScale(k);
    });

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
