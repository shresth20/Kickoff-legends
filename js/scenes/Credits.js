/* Credits: scrolling text over the night stadium; any key returns. */
window.KL = window.KL || {};

KL.CreditsScene = class CreditsScene extends Phaser.Scene {
  constructor() {
    super('Credits');
  }
  create() {
    const W = KL.TUNING.world;
    KL.Stadium.build(this, { night: true, parallax: false });
    this.add.rectangle(0, 0, W.width, W.height, 0x0f1230, 0.5).setOrigin(0).setDepth(5);
    const title = KL.displayText(this, W.width / 2, W.height + 60, KL.t('credits_title'), 72).setDepth(6);
    const body = KL.bodyText(this, W.width / 2, W.height + 160, KL.t('credits_body'), 24, '#ffffff', { originY: 0, lineSpacing: 10 }).setDepth(6);
    this.tweens.add({ targets: [title, body], y: '-=' + (W.height + 420), duration: 16000, ease: 'Linear', onComplete: () => KL.goTo(this, 'Menu') });
    KL.bodyText(this, W.width / 2, W.height - 30, KL.t('credits_hint'), 16, '#9aa1b8').setDepth(6);
    const go = () => KL.goTo(this, 'Menu');
    this.input.keyboard.once('keydown', go);
    this.input.once('pointerdown', go);
    KL.fadeIn(this);
  }
};
