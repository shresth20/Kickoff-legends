/* Reactions. The chat button (HUD) opens a drawer with all six reactions; the one picked pops
 * up in a badge over that player's head for a couple of seconds, then floats away.
 * Drawer and head badge are the same painted hexagon with the emoji cut out of the ui_emotes
 * speech-bubble art (system emoji when the art is missing). */
window.KL = window.KL || {};

KL.EMOTES = {
  count: 6, // laugh, angry, cry, thumbs up, fire, skull — ui_emotes/00..05
  fallback: ['😂', '😡', '😭', '👍', '🔥', '💀'],
  // the emoji fills the bubble's round interior: its centre and radius as fractions of the frame
  face: { cx: 0.515, cy: 0.455, r: 0.385 },
  drawer: { size: 58, gap: 10, autoCloseMs: 4500 },
  head: { size: 66, lift: 210, behind: 22, holdMs: 2200 }, // lift: feet → badge centre (px)
};

KL.Emotes = {
  /** Hexagon badge with reaction i, `size` logical px across. Returns a KL.Paint spec. */
  badge(scene, i, size) {
    const M = 10, S = size + M * 2;
    const key = KL.Paint.paint(scene, `kl:emote:${i}:${size}`, S, S + 4, (ctx) => {
      const P = KL.Paint;
      const R = size / 2;
      ctx.translate(S / 2, S / 2);
      const hex = (rad) => {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI / 2 + k * (Math.PI / 3) - 0.14; // pointy top, tipped a little
          ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad);
        }
        ctx.closePath();
      };
      ctx.lineJoin = 'round';
      ctx.save();
      ctx.shadowColor = 'rgba(5,7,30,0.45)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      hex(R);
      ctx.lineWidth = 6;
      ctx.strokeStyle = P.C.ink;
      ctx.stroke();
      ctx.restore();
      hex(R);
      ctx.fillStyle = P.vgrad(ctx, -R, R, ['#FFFFFF', '#E9F1FA', '#C9DBEE']);
      ctx.fill();
      hex(R - 5);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#9FC3E6';
      ctx.stroke();
      // the emoji, clipped to a circle
      const d = R * 0.7;
      const name = `ui_emotes/${String(i).padStart(2, '0')}`;
      ctx.save();
      P.circle(ctx, 0, 0, d);
      ctx.clip();
      if (KL.hasUiFrame(scene, name)) {
        const fr = scene.textures.getFrame('ui', name);
        const F = KL.EMOTES.face, rad = F.r * fr.cutWidth;
        const sx = fr.cutX + F.cx * fr.cutWidth - rad, sy = fr.cutY + F.cy * fr.cutHeight - rad;
        ctx.drawImage(fr.source.image, sx, sy, rad * 2, rad * 2, -d, -d, d * 2, d * 2);
      } else {
        ctx.font = `${Math.round(d * 1.45)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(KL.EMOTES.fallback[i], 0, d * 0.08);
      }
      ctx.restore();
    });
    return { key, ox: 0.5, oy: (S / 2) / (S + 4) };
  },
};

/** Chat button + reaction drawer (HUD). dir 1 opens to the right, −1 to the left. */
KL.EmoteDrawer = class EmoteDrawer {
  constructor(scene, { x, y, dir = 1, scale = 1, isLive = () => true, onPick }) {
    this.scene = scene;
    this.isLive = isLive;
    this.onPick = onPick;
    this.dir = dir;
    this.open = false;
    const D = KL.EMOTES.drawer;
    this.button = new KL.Button(scene, x, y, '☺', () => this.toggle(), { kind: 'icon', icon: 'ui_icons/11', width: 58, height: 58 }).setDepth(30);
    this.items = [];
    for (let i = 0; i < KL.EMOTES.count; i++) {
      const img = KL.Paint.place(scene, 0, 0, KL.Emotes.badge(scene, i, D.size)).setDepth(30).setVisible(false);
      img.unit = img.scaleX; // texture scale at UI scale 1
      img.setInteractive({ useHandCursor: true });
      img.on('pointerover', () => this.open && img.setScale(img.baseScale * 1.12));
      img.on('pointerout', () => this.open && img.setScale(img.baseScale));
      img.on('pointerdown', () => this.pick(i));
      this.items.push(img);
    }
    this.setLayout(x, y, scale);
  }

  /** Put the chat button at (x, y), scaled by s (touch screens), with the drawer opening beside it. */
  setLayout(x, y, s = 1) {
    const D = KL.EMOTES.drawer;
    this.button.setPosition(x, y).setBaseScale(s);
    this.items.forEach((img, i) => {
      this.scene.tweens.killTweensOf(img);
      img.baseScale = img.unit * s;
      img.setPosition(x + this.dir * (29 + D.gap + D.size / 2 + 6 + i * (D.size + D.gap)) * s, y);
      img.setScale(img.baseScale).setAlpha(this.open ? 1 : 0).setVisible(this.open);
    });
    return this;
  }

  toggle(force) {
    const open = force ?? !this.open;
    if (open === this.open || (open && !this.isLive())) return;
    this.open = open;
    const tw = this.scene.tweens;
    this.autoClose?.remove();
    this.items.forEach((img, i) => {
      tw.killTweensOf(img);
      if (open) {
        img.setVisible(true).setAlpha(0).setScale(img.baseScale * 0.3);
        tw.add({ targets: img, alpha: 1, scaleX: img.baseScale, scaleY: img.baseScale, duration: KL.paced(200), delay: KL.paced(i * 35), ease: 'Back.out' });
      } else {
        tw.add({ targets: img, alpha: 0, scaleX: img.baseScale * 0.5, scaleY: img.baseScale * 0.5, duration: KL.paced(120), ease: 'Sine.in', onComplete: () => img.setVisible(false) });
      }
    });
    if (open) this.autoClose = this.scene.time.delayedCall(KL.EMOTES.drawer.autoCloseMs, () => this.toggle(false));
  }

  pick(i) {
    if (!this.open) return;
    this.toggle(false);
    this.onPick?.(i);
  }
};

/** The badges over the players' heads (Match scene, world space, follows the player). */
KL.HeadEmotes = class HeadEmotes {
  constructor(scene, players) {
    this.scene = scene;
    this.players = players;
    this.badges = players.map(() => null);
  }

  show(index, i) {
    const s = this.scene, H = KL.EMOTES.head;
    this.drop(index);
    const img = KL.Paint.place(s, 0, 0, KL.Emotes.badge(s, i, H.size)).setDepth(30);
    const base = img.scaleX;
    const b = { img, bob: 0, born: s.time.now };
    this.badges[index] = b;
    this.follow(index);
    img.setScale(base * 0.2).setAlpha(0);
    s.tweens.add({ targets: img, scaleX: base, scaleY: base, alpha: 1, duration: KL.paced(240), ease: 'Back.out' });
    // float up and fade out (alpha follows bob: 0 → −26 px)
    s.tweens.add({
      targets: b,
      bob: -26,
      delay: H.holdMs,
      duration: KL.paced(380),
      ease: 'Sine.in',
      onUpdate: () => img.setAlpha(1 - b.bob / -26),
      onComplete: () => {
        if (this.badges[index] !== b) return;
        img.destroy();
        this.badges[index] = null;
      },
    });
    KL.audio?.play('emote_pop');
  }

  follow(index) {
    const b = this.badges[index];
    if (!b) return;
    const p = this.players[index], H = KL.EMOTES.head;
    const wobble = Math.sin((this.scene.time.now - b.born) / 260) * 3;
    const S = KL.TUNING.player.scale; // lift / behind are measured on a scale-1 player
    b.img.setPosition(p.x - p.facing * H.behind * S, p.y - H.lift * S + b.bob + wobble);
  }

  update() {
    for (let i = 0; i < this.badges.length; i++) this.follow(i);
  }

  drop(index) {
    const b = this.badges[index];
    if (!b) return;
    this.scene.tweens.killTweensOf([b, b.img]);
    b.img.destroy();
    this.badges[index] = null;
  }

  destroy() {
    this.badges.forEach((_, i) => this.drop(i));
  }
};
