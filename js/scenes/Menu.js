/* Title / main menu: logo, idle hero on the right, stacked buttons on the left; sound and full-screen
 * buttons in the top-right corner. The logo, buttons and hero keep to the 1280×720 design area; the
 * corner buttons and footer notes keep to the screen's safe edges (KL.View). */
window.KL = window.KL || {};

KL.MenuScene = class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const W = KL.TUNING.world;
    const V = KL.View;
    const u = V.ui;
    KL.audio?.playMusic('menu');
    KL.Stadium.build(this, { night: false, parallax: false });
    V.cover(this, 0x0f1230, 0.35).setDepth(5);

    let logo;
    if (KL.hasUiFrame(this, 'ui_logo')) {
      logo = this.add.image(W.width / 2, 0, 'ui', 'ui_logo').setDisplaySize(620, 248).setDepth(6);
    } else {
      logo = this.add.container(W.width / 2, 0).setDepth(6);
      logo.add([KL.displayText(this, 0, -30, 'KICKOFF', 96), KL.displayText(this, 0, 50, 'LEGENDS', 96, '#e63946')]);
    }

    // hero idling on the right
    const def = KL.CHARACTERS[0];
    const hero = this.add.sprite(W.width - 300, KL.STADIUM_LAYOUT.showcaseY, 'characters', `${def.id}/idle/00`).setOrigin(0.5, 1).setDisplaySize(340, 340).setDepth(6);
    KL.ensureCharacterAnims(this.anims, def.id);
    hero.play(`${def.id}/idle`);
    this.time.addEvent({ delay: 5000, loop: true, callback: () => {
      hero.play(`${def.id}/celebrate`);
      this.time.delayedCall(1800, () => hero.play(`${def.id}/idle`));
    } });

    // stacked on the left; a phone shows them larger (thumb-sized), spaced to match
    const x = 330;
    const items = [
      new KL.Button(this, x, 330, KL.t('menu_play'), () => KL.goTo(this, 'CharSelect', { night: !!this.registry.get('night') }), { icon: 'ui_icons/00' }),
      new KL.Button(this, x, 330 + 90 * u, KL.t('menu_settings'), () => KL.goTo(this, 'Settings', { from: 'Menu' }), { kind: 'secondary', icon: 'ui_icons/03' }),
      new KL.Button(this, x, 330 + 165 * u, KL.t('menu_credits'), () => KL.goTo(this, 'Credits'), { kind: 'secondary', icon: 'ui_icons/10' }),
    ];
    items.forEach((b) => b.setDepth(7).setBaseScale(u));
    this.nav = new KL.MenuNav(this, items);

    // sound toggle top-right
    // speaker-with-waves (ui_icons/04) when sound is on, speaker-with-✕ (ui_icons/05) when muted
    const s = KL.Save.settings;
    const look = (on) => ({ icon: on ? 'ui_icons/04' : 'ui_icons/05', label: on ? '♪' : '✕' }); // label: no-art fallback
    const sndBtn = new KL.Button(this, 0, 0, look(s.master > 0).label, () => {
      const cur = KL.Save.settings.master;
      if (cur > 0) KL.unmuteVolume = cur; // unmuting brings back the volume you had, not a fixed level
      const next = cur > 0 ? 0 : KL.unmuteVolume || 0.8;
      KL.Save.patchSettings({ master: next });
      KL.audio?.applySettings();
      sndBtn.setIcon(look(next > 0).icon).setLabel(look(next > 0).label);
    }, { kind: 'icon', icon: look(s.master > 0).icon }).setDepth(7);
    // full screen on / off, next to it (wherever the browser allows it)
    const fsBtn = KL.fullscreenButton(this);

    const foot = V.font(14);
    const version = KL.bodyText(this, 0, 0, `v${KL.VERSION} · ${KL.artSource === 'placeholder' ? 'placeholder art' : 'studio art'}`, foot, '#9aa1b8', { originX: 0, originY: 1 }).setDepth(7);
    // bottom-right: the keys on a keyboard; on an iPhone (no full-screen API for pages), how to get
    // the full-screen app instead
    const hintKey = !V.touch ? 'controls_hint_p1' : KL.Fullscreen.supported || KL.Fullscreen.standalone || !V.ios ? null : 'fullscreen_hint_ios';
    const hint = hintKey && KL.bodyText(this, 0, 0, KL.t(hintKey), foot, '#c9cde0', { originX: 1, originY: 1, align: 'right' }).setDepth(7);

    V.layout(this, (v) => {
      // the logo sits between the top of the screen and the buttons (higher up on a tall tablet)
      logo.setY((v.top + 260) / 2);
      sndBtn.setPosition(v.right - 50 * u, v.top + 50 * u).setBaseScale(u);
      fsBtn?.setPosition(v.right - 124 * u, v.top + 50 * u).setBaseScale(u);
      version.setPosition(v.left + 16, v.bottom - 14);
      if (hint) {
        hint.setPosition(v.right - 16, v.bottom - 14);
        KL.fitText(hint, v.right - v.left - KL.textWidth(version) - 64);
      }
    });
    KL.fadeIn(this);
  }
};
