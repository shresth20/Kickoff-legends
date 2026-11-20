/* Settings: a panel in two columns — the volumes (music, sound effects, crowd & ambience, voices) on
 * the left, the announcer on / off, screen shake and language on the right. Each audio row plays a
 * taste of what it controls. Wide and short, so a phone shows it at full thumb size.
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
    ui.add(new KL.Panel(this, 0, 0, 900, 440, { title: KL.t('settings_title') }));

    const s = KL.Save.settings;
    // two columns: labels at lx, widgets from wx; each column fills from the top
    const COLS = [{ lx: -410, wx: -190 }, { lx: 70, wx: 250 }];
    const ROW0 = -98, ROW_H = 62;
    const next = [0, 0];
    const row = (col, labelKey, make) => {
      const { lx, wx } = COLS[col];
      const y = ROW0 + next[col]++ * ROW_H;
      const widget = make(wx, y);
      ui.add([KL.fitText(KL.bodyText(this, lx, y, KL.t(labelKey), 22, '#ffffff', { originX: 0 }), wx - lx - 16), widget]);
      return widget;
    };
    // a taste of what a slider controls, now and then while it moves
    const taste = (fn, gap = 900) => {
      let at = 0;
      return () => {
        if (this.time.now - at < gap) return;
        at = this.time.now;
        fn();
      };
    };
    const sfxTaste = taste(() => KL.audio?.play('kick_low'), 260);
    const crowdTaste = taste(() => KL.audio?.crowd?.react('cheer', { gain: 0.5 }));
    const voiceTaste = taste(() => KL.audio?.voices?.say(KL.CHARACTERS[Math.floor(Math.random() * KL.CHARACTERS.length)].id, 'cheer'));
    // muted from the menu's speaker button: moving a slider up brings the sound back
    const volume = (key) => (v) => {
      const patch = { [key]: v };
      if (KL.Save.settings.master === 0 && v > 0) patch.master = KL.unmuteVolume || 0.8;
      this.apply(patch);
    };
    const slider = (value, onChange) => (wx, y) => new KL.Slider(this, wx + 100, y, 200, value, onChange);
    const sliders = [
      row(0, 'settings_music', slider(s.music, volume('music'))),
      row(0, 'settings_sfx', slider(s.sfx, (v) => {
        volume('sfx')(v);
        sfxTaste();
      })),
      row(0, 'settings_crowd', slider(s.crowd ?? 0.8, (v) => {
        volume('crowd')(v);
        crowdTaste();
      })),
      row(0, 'settings_voice', slider(s.voice ?? 0.9, (v) => {
        volume('voice')(v);
        voiceTaste();
      })),
    ];
    const commentary = row(1, 'settings_commentary', (wx, y) => new KL.Toggle(this, wx + 38, y, s.commentary !== false, (v) => {
      this.apply({ commentary: v });
      if (v) KL.Commentary?.say('comm_kickoff', {}, { priority: 1 });
    }));
    const shake = row(1, 'settings_shake', (wx, y) => new KL.Toggle(this, wx + 38, y, s.screenShake, (v) => this.apply({ screenShake: v })));
    const locales = KL.I18n.available;
    const langBtn = row(1, 'settings_language', (wx, y) => new KL.Button(this, wx + 60, y, s.locale.toUpperCase(), () => {
      const next = locales[(locales.indexOf(KL.I18n.locale) + 1) % locales.length];
      KL.I18n.set(next);
      KL.View.localize();
      this.apply({ locale: next });
      this.scene.restart({ from: this.from });
    }, { kind: 'secondary', width: 120, height: 44, fontSize: 18 }));

    const back = new KL.Button(this, 0, 166, KL.t('menu_back'), () => this.back(), { width: 240, height: 56, fontSize: 22 });
    ui.add(back);
    KL.View.layout(this, (V) => {
      const k = Math.min(V.ui, (V.bottom - V.top - 20) / 450, (V.right - V.left - 20) / 910);
      ui.setPosition(V.cx, V.cy + 6 * k).setScale(k);
    });

    const nav = new KL.MenuNav(this, [...sliders, commentary, shake, langBtn, back], { onBack: () => this.back() });
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
