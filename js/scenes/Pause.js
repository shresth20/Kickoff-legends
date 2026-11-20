/* Pause overlay: dimmed field + panel with Resume / Restart / Settings / Quit. */
window.KL = window.KL || {};

KL.PauseScene = class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }
  init(data) {
    this.match = data.match;
  }
  create() {
    KL.View.cover(this, 0x0f1230, 0.6);
    // the panel group, laid out around the screen centre; centred in the safe area and scaled for touch
    const ui = this.add.container(0, 0);
    ui.add(new KL.Panel(this, 0, 14, 460, 476, { title: KL.t('pause_title') }));
    const resume = () => this.match.togglePause();
    const items = [
      new KL.Button(this, 0, -60, KL.t('pause_resume'), resume, { width: 300, height: 64 }),
      new KL.Button(this, 0, 15, KL.t('pause_restart'), () => {
        const cfg = { ...this.match.cfg };
        this.match.scene.stop('HUD');
        this.scene.stop();
        this.match.scene.restart(cfg);
      }, { kind: 'secondary', width: 300 }),
      new KL.Button(this, 0, 85, KL.t('menu_settings'), () => {
        this.scene.sleep();
        this.scene.launch('Settings', { from: 'Pause' });
        this.scene.bringToTop('Settings');
      }, { kind: 'secondary', width: 300 }),
      new KL.Button(this, 0, 155, KL.t('pause_quit'), () => {
        this.scene.stop();
        this.match.scene.stop('HUD');
        this.match.scene.start('Menu');
      }, { kind: 'secondary', width: 300 }),
    ];
    ui.add(items);
    new KL.MenuNav(this, items); // ESC is handled by MatchScene.togglePause
    // full screen on / off in the top-right corner (where the HUD's pause button was)
    const fsBtn = KL.fullscreenButton(this);
    KL.View.layout(this, (V) => {
      const k = Math.min(V.ui, (V.bottom - V.top - 20) / 500, (V.right - V.left - 20) / 480);
      ui.setPosition(V.cx, V.cy).setScale(k);
      fsBtn?.setPosition(V.right - 46 * V.ui, V.top + 46 * V.ui).setBaseScale(V.ui);
    });
    this.events.on(Phaser.Scenes.Events.WAKE, () => KL.audio?.applySettings());
  }
};
