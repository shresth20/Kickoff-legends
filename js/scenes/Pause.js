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
    const W = KL.TUNING.world;
    this.add.rectangle(0, 0, W.width, W.height, 0x0f1230, 0.6).setOrigin(0);
    new KL.Panel(this, W.width / 2, W.height / 2 + 14, 460, 476, { title: KL.t('pause_title') });
    const resume = () => this.match.togglePause();
    const items = [
      new KL.Button(this, W.width / 2, W.height / 2 - 60, KL.t('pause_resume'), resume, { width: 300, height: 64 }),
      new KL.Button(this, W.width / 2, W.height / 2 + 15, KL.t('pause_restart'), () => {
        const cfg = { ...this.match.cfg };
        this.match.scene.stop('HUD');
        this.scene.stop();
        this.match.scene.restart(cfg);
      }, { kind: 'secondary', width: 300 }),
      new KL.Button(this, W.width / 2, W.height / 2 + 85, KL.t('menu_settings'), () => {
        this.scene.sleep();
        this.scene.launch('Settings', { from: 'Pause' });
        this.scene.bringToTop('Settings');
      }, { kind: 'secondary', width: 300 }),
      new KL.Button(this, W.width / 2, W.height / 2 + 155, KL.t('pause_quit'), () => {
        this.scene.stop();
        this.match.scene.stop('HUD');
        this.match.scene.start('Menu');
      }, { kind: 'secondary', width: 300 }),
    ];
    new KL.MenuNav(this, items); // ESC is handled by MatchScene.togglePause
    this.events.on(Phaser.Scenes.Events.WAKE, () => KL.audio?.applySettings());
  }
};
