/* Credits: scrolling text over the night stadium; any key returns. */
window.KL = window.KL || {};

KL.CreditsScene = class CreditsScene extends Phaser.Scene {
  constructor() {
    super('Credits');
  }
  create() {
    const W = KL.TUNING.world;
    const V = KL.View;
    KL.Stadium.build(this, { night: true, parallax: false });
    V.cover(this, 0x0f1230, 0.5).setDepth(5);
    // rolls up the whole screen, from below its bottom edge to above its top
    const title = KL.displayText(this, W.width / 2, V.bottom + 60, KL.t('credits_title'), 72).setDepth(6);
    const body = KL.bodyText(this, W.width / 2, V.bottom + 160, KL.t('credits_body'), V.font(24), '#ffffff', { originY: 0, lineSpacing: 10 }).setDepth(6);
    const travel = V.bottom - V.top + 420;
    this.tweens.add({ targets: [title, body], y: '-=' + travel, duration: 16000 * (travel / (W.height + 420)), ease: 'Linear', onComplete: () => KL.goTo(this, 'Menu') });
    const hint = KL.bodyText(this, W.width / 2, 0, KL.t(V.touch ? 'credits_hint_touch' : 'credits_hint'), V.font(16), '#9aa1b8').setDepth(6);
    V.layout(this, (v) => hint.setY(v.bottom - 30));
    const go = () => KL.goTo(this, 'Menu');
    this.input.keyboard.once('keydown', go);
    this.input.once('pointerdown', go);
    KL.fadeIn(this);
  }
};
