/*
 * Credits: a column of text rolls up over the night stadium; any key or tap returns. The LinkedIn
 * and GitHub lines are links: clicking or tapping one opens the developer's profile in a new tab.
 * While the mouse is over a link (or a finger is on one) the roll eases to a stop, so the link holds
 * still to be clicked instead of being chased up the screen; it rolls on when the pointer leaves.
 */
window.KL = window.KL || {};

KL.CREDITS = {
  links: ['https://www.linkedin.com/in/shresth-kasera/', 'https://github.com/shresth20/'],
  linkColor: '#7cc8ff',
  linkHover: '#c4e6ff',
  wrap: 760, // design px: width of the bio paragraph
  holdMs: 70, // how quickly the roll eases to a stop under a link, and back up to speed (time constant)
};

KL.CreditsScene = class CreditsScene extends Phaser.Scene {
  constructor() {
    super('Credits');
  }
  create() {
    const W = KL.TUNING.world;
    const V = KL.View;
    const C = KL.CREDITS;
    KL.Stadium.build(this, { night: true, parallax: false });
    V.cover(this, 0x0f1230, 0.5).setDepth(5);

    // one centred column, stacked from just below the screen's bottom edge
    let y = V.bottom + 24;
    const column = [];
    const put = (t, gap) => {
      t.setOrigin(0.5, 0).setPosition(W.width / 2, y).setDepth(6);
      y += t.displayHeight + gap;
      column.push(t);
      return t;
    };
    put(KL.displayText(this, 0, 0, KL.t('credits_title'), 72), 28);
    put(KL.bodyText(this, 0, 0, KL.t('credits_by'), V.font(24), '#ffffff', { lineSpacing: 10 }), 2);
    put(KL.displayText(this, 0, 0, KL.t('credits_name'), 52), 22);
    put(KL.bodyText(this, 0, 0, KL.t('credits_about'), V.font(22), '#d8dcf0', { wrap: C.wrap, lineSpacing: 8 }), 6);
    const links = (this.links = C.links.map((url, k) => {
      const shown = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
      const link = put(KL.bodyText(this, 0, 0, shown, V.font(24), C.linkColor, { weight: 'heavy' }), k === C.links.length - 1 ? 40 : 6);
      // pointerup is still inside the click/tap gesture, so the browser lets the new tab open
      return link.setInteractive({ useHandCursor: true }).on('pointerup', () => window.open(url, '_blank', 'noopener'));
    }));
    put(KL.bodyText(this, 0, 0, KL.t('credits_body'), V.font(24), '#ffffff', { lineSpacing: 10 }), 0);

    // roll until the last line has left the top edge, at the same speed as ever
    const travel = y - V.top + 20;
    const speed = (W.height + 420) / 16000; // design px per ms
    this.roll = this.tweens.add({ targets: column, y: '-=' + travel, duration: travel / speed, ease: 'Linear', onComplete: () => KL.goTo(this, 'Menu') });
    // Phaser only hit-tests when the mouse moves: poll every frame so a link that rolls up under a
    // still cursor gets the hand cursor too
    this.input.setPollAlways();

    const hint = KL.bodyText(this, W.width / 2, 0, KL.t(V.touch ? 'credits_hint_touch' : 'credits_hint'), V.font(16), '#9aa1b8').setDepth(6);
    V.layout(this, (v) => hint.setY(v.bottom - 30));

    const go = () => KL.goTo(this, 'Menu');
    this.input.keyboard.once('keydown', go);
    this.input.on('pointerdown', (pointer, over) => {
      if (!over.some((o) => links.includes(o))) go();
    });
    KL.fadeIn(this);
  }

  /**
   * A link is held while the mouse is on it (and over the game), or a finger is down on it. Not with
   * Phaser's over/out events: those also count a lifted finger, still parked where it last touched.
   */
  heldLinks() {
    const im = this.input.manager;
    const cam = this.cameras.main;
    const boxes = this.links.map((l) => l.getBounds());
    const held = new Set();
    for (const p of im.pointers) {
      if (p.wasTouch ? !p.isDown : p !== im.mousePointer || !im.isOver) continue;
      const w = cam.getWorldPoint(p.x, p.y);
      boxes.forEach((b, k) => b.contains(w.x, w.y) && held.add(this.links[k]));
    }
    return held;
  }

  /** Ease the roll's speed towards a stop while a link is held, and back to full speed after. */
  update(time, dt) {
    const C = KL.CREDITS;
    const held = this.heldLinks();
    for (const l of this.links) {
      if (l.hot === held.has(l)) continue; // (setColor re-renders the text: only on a change)
      l.hot = held.has(l);
      l.setColor(l.hot ? C.linkHover : C.linkColor);
    }
    const want = held.size ? 0 : 1;
    const roll = this.roll;
    roll.timeScale += (want - roll.timeScale) * Math.min(1, dt / C.holdMs);
    if (Math.abs(want - roll.timeScale) < 0.01) roll.timeScale = want;
  }
};
