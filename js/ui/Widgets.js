/* UI toolkit. Flat elements (buttons, panels, key caps) are painted in code by
 * KL.Paint at device resolution, so they stay sharp at any size; illustrated art
 * (icons, flags, logo, banners) still comes from the `ui` atlas. Text is rasterised
 * at KL.RES and padded so slanted display glyphs never get clipped. */
window.KL = window.KL || {};

(() => {
  const PAL = {
    navy: 0x1b1f3b,
    navyLight: 0x2a3060,
    gold: 0xf5c518,
    goldDark: 0xd99a12,
    goldLight: 0xffe24a,
    red: 0xe63946,
    white: 0xffffff,
    grey: 0x8a8fa8,
    panel: 0x242a55,
  };
  KL.PAL = PAL;

  /**
   * Type per locale. Latin locales: Bangers headlines + Oswald body (one bold face).
   * Hindi: Bangers and Oswald have no Devanagari, so Teko sets everything. Teko draws small for
   * its px size, so its text is scaled up (`scale`) to sit in the same boxes.
   * Read KL.FONTS at text-creation time: switching language in Settings restarts the scene.
   */
  const FONT_SETS = {
    latin: { display: '"Bangers", "Impact", sans-serif', displayWeight: 'normal', body: '"Oswald", "Arial Narrow", sans-serif', bodyWeight: '700', heavyWeight: '700', scale: 1, slant: true, padY: 0.1 },
    hi: { display: '"Teko", "Oswald", sans-serif', displayWeight: '700', body: '"Teko", "Oswald", sans-serif', bodyWeight: '600', heavyWeight: '700', scale: 1.28, slant: false, padY: 0.24 },
  };
  KL.FONT_SETS = FONT_SETS;
  KL.FONTS = {
    get set() {
      return FONT_SETS[KL.I18n.locale] || FONT_SETS.latin;
    },
    get display() {
      return this.set.display;
    },
    get body() {
      return this.set.body;
    },
  };

  const hasFrame = (scene, frame) => scene.textures.exists('ui') && scene.textures.get('ui').has(frame);
  KL.hasUiFrame = hasFrame;

  /** Scale an image to fit inside maxW×maxH without distorting it. Returns the scale used. */
  KL.fit = (img, maxW, maxH = Infinity) => {
    const s = Math.min(maxW / img.frame.realWidth, maxH / img.frame.realHeight);
    img.setScale(s);
    return s;
  };

  /** Width of a Text's glyphs, without the canvas padding added below. */
  KL.textWidth = (t) => t.width - t.padding.left - t.padding.right;

  /** Shrink a Text (never grow) so its glyphs fit in maxW logical px. */
  KL.fitText = (t, maxW) => {
    const w = KL.textWidth(t);
    t.fitScale = w > maxW ? maxW / w : 1;
    t.setScale(t.fitScale);
    return t;
  };

  /** Chunky display text with outline + block shadow. */
  KL.displayText = (scene, x, y, text, size = 48, color = '#f5c518', opts = {}) => {
    const F = KL.FONTS.set;
    const px = Math.round(size * F.scale);
    const t = scene.add.text(x, y, text, {
      fontFamily: F.display,
      fontStyle: F.displayWeight,
      fontSize: `${px}px`,
      color,
      stroke: '#1B1F3B',
      strokeThickness: Math.max(4, size * 0.12),
      shadow: { offsetX: 0, offsetY: Math.max(3, size * 0.08), color: '#1B1F3B', fill: true },
      align: opts.align || 'center',
      // Bangers is slanted, so glyphs (and the block shadow) overhang the measured box: pad the
      // text canvas so the last digit is never cut. Symmetric, so centring is unchanged.
      padding: { x: Math.ceil(size * (F.slant ? 0.16 : 0.1)), y: Math.ceil(size * 0.12) },
      resolution: KL.RES,
      ...opts.style,
    });
    t.setOrigin(opts.originX ?? 0.5, opts.originY ?? 0.5);
    return t;
  };

  /** opts.weight: 'heavy' for names/numbers, otherwise the locale's regular bold. */
  KL.bodyText = (scene, x, y, text, size = 20, color = '#ffffff', opts = {}) => {
    const F = KL.FONTS.set;
    const t = scene.add.text(x, y, text, {
      fontFamily: F.body,
      fontSize: `${Math.round(size * F.scale)}px`,
      fontStyle: opts.weight === 'heavy' ? F.heavyWeight : F.bodyWeight,
      color,
      align: opts.align || 'center',
      wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
      lineSpacing: opts.lineSpacing ?? 4,
      // Devanagari matras reach well above and below the Latin box: Teko gets more vertical room
      padding: { x: Math.ceil(size * 0.1), y: Math.ceil(size * F.padY) },
      resolution: KL.RES,
      ...opts.style,
    });
    t.setOrigin(opts.originX ?? 0.5, opts.originY ?? 0.5);
    return t;
  };

  const DIGITS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
  /** Short printable label for a Phaser key name ('NUMPAD_ONE' → 'N1', 'TWO' → '2'). */
  KL.keyLabel = (name) => {
    if (KL.KEY_LABELS[name]) return KL.KEY_LABELS[name];
    const d = DIGITS.indexOf(name.replace('NUMPAD_', ''));
    if (d >= 0) return (name.startsWith('NUMPAD_') ? 'N' : '') + d;
    return name.replace('NUMPAD_', 'N');
  };

  /**
   * Button. kind: 'primary' (gold) | 'secondary' (navy) | 'icon' (square navy).
   * Supports mouse + a `focused` state driven by keyboard navigation.
   */
  KL.Button = class Button extends Phaser.GameObjects.Container {
    constructor(scene, x, y, label, onClick, opts = {}) {
      super(scene, x, y);
      scene.add.existing(this);
      this.kind = opts.kind || 'primary';
      this.w = Math.round(opts.width || (this.kind === 'icon' ? 64 : this.kind === 'secondary' ? 220 : 300));
      this.h = Math.round(opts.height || (this.kind === 'icon' ? 64 : this.kind === 'secondary' ? 60 : 76));
      this.onClick = onClick;
      this.disabled = !!opts.disabled;
      this.focused = false;
      this.hover = false;
      this.pressed = false;

      this.face = scene.add.image(0, 0, '__DEFAULT');
      this.add(this.face);
      if (opts.icon && hasFrame(scene, opts.icon)) {
        this.iconSize = Math.round(this.kind === 'icon' ? this.h * 0.66 : Math.min(36, this.h * 0.58));
        this.icon = scene.add.image(0, 0, 'ui', opts.icon);
        KL.fit(this.icon, this.iconSize, this.iconSize);
        this.add(this.icon);
      }
      if (label && !(this.icon && this.kind === 'icon')) {
        this.label = KL.bodyText(scene, 0, 0, label, opts.fontSize || (this.kind === 'secondary' ? 22 : 26), '#ffffff', { weight: 'heavy' });
        this.add(this.label);
      }
      this.layout();
      this.setSize(this.w, this.h);
      this.setInteractive({ useHandCursor: true });
      this.on('pointerover', () => ((this.hover = true), this.redraw()));
      this.on('pointerout', () => ((this.hover = false), (this.pressed = false), this.redraw()));
      this.on('pointerdown', () => ((this.pressed = true), this.redraw()));
      this.on('pointerup', () => {
        if (this.pressed) this.activate();
        this.pressed = false;
        this.redraw();
      });
      this.redraw();
    }

    setFocused(on) {
      this.focused = on;
      this.redraw();
      return this;
    }
    setDisabled(on) {
      this.disabled = on;
      this.redraw();
      return this;
    }
    setLabel(text) {
      this.label?.setText(text);
      this.layout();
      return this;
    }
    /** Swap the icon art (e.g. sound on ↔ muted). */
    setIcon(frame) {
      if (!this.icon || !hasFrame(this.scene, frame)) return this;
      this.icon.setFrame(frame);
      KL.fit(this.icon, this.iconSize, this.iconSize);
      this.layout();
      return this;
    }

    /** Centre icon + label as one group; shrink the label if it would touch the rounded ends. */
    layout() {
      const pad = this.kind === 'icon' ? 6 : Math.max(16, this.h * 0.36);
      const iconW = this.icon ? this.iconSize : 0;
      const gap = this.icon && this.label ? Math.round(this.h * 0.16) : 0;
      let labelW = 0;
      if (this.label) {
        KL.fitText(this.label, this.w - pad * 2 - iconW - gap);
        labelW = KL.textWidth(this.label) * this.label.scaleX;
      }
      const left = -(iconW + gap + labelW) / 2;
      if (this.icon) this.icon.x = left + iconW / 2;
      if (this.label) this.label.x = left + iconW + gap + labelW / 2;
    }

    activate() {
      if (this.disabled) return;
      KL.audio?.play('ui_click');
      this.scene.tweens.add({ targets: this, scaleX: 0.94, scaleY: 0.94, duration: 60, yoyo: true });
      this.onClick?.();
    }

    redraw() {
      const state = this.disabled ? 3 : this.pressed ? 2 : this.hover || this.focused ? 1 : 0;
      const spec = KL.Paint.button(this.scene, this.kind, state, this.w, this.h);
      this.face.setTexture(spec.key).setOrigin(spec.ox, spec.oy).setScale(1 / KL.RES);
      const dy = state === 2 ? spec.lip - 1 : 0; // contents ride down with the pressed face
      if (this.label) {
        this.label.setY(dy);
        this.label.setColor(state === 3 ? '#4a4f68' : this.kind === 'primary' ? '#1B1F3B' : '#ffffff');
        // a soft ink drop under white labels keeps them legible on the navy gradient
        this.label.setShadow(0, this.kind === 'primary' || state === 3 ? 0 : 2, 'rgba(10,14,50,0.85)', 0, false, this.kind !== 'primary' && state !== 3);
      }
      if (this.icon) this.icon.setY(dy);
    }
  };

  /** Gold-framed navy board painted by KL.Paint.panel. */
  KL.Panel = class Panel extends Phaser.GameObjects.Container {
    constructor(scene, x, y, w, h, opts = {}) {
      super(scene, x, y);
      scene.add.existing(this);
      this.w = w = Math.round(w);
      this.h = h = Math.round(h);
      this.add(KL.Paint.place(scene, 0, 0, KL.Paint.panel(scene, w, h)));
      if (opts.title) {
        this.title = KL.displayText(scene, 0, -h / 2 + 50, opts.title, 44);
        this.add(this.title);
      }
      this.setSize(w, h);
    }
  };

  /** Key-cap badge ('A', '←', 'SHIFT'…), painted with the label printed on the cap. */
  KL.KeyCap = (scene, x, y, keyName, size = 36) => KL.Paint.place(scene, x, y, KL.Paint.keycap(scene, KL.keyLabel(keyName), Math.round(size)));

  /** Horizontal slider 0..1. */
  KL.Slider = class Slider extends Phaser.GameObjects.Container {
    constructor(scene, x, y, width, value, onChange) {
      super(scene, x, y);
      scene.add.existing(this);
      this.width_ = width;
      this.value = Phaser.Math.Clamp(value, 0, 1);
      this.onChange = onChange;
      this.track = scene.add.graphics();
      this.add(this.track);
      this.knob = scene.add.graphics();
      this.add(this.knob);
      this.setSize(width + 30, 40);
      this.setInteractive({ useHandCursor: true });
      const set = (p) => this.set(Phaser.Math.Clamp((KL.worldPoint(scene, p).x - (this.x - width / 2)) / width, 0, 1), true);
      this.on('pointerdown', (p) => {
        this.dragging = true;
        set(p);
      });
      scene.input.on('pointermove', (p) => this.dragging && set(p));
      scene.input.on('pointerup', () => (this.dragging = false));
      this.redraw();
    }
    set(v, fire) {
      this.value = Phaser.Math.Clamp(v, 0, 1);
      this.redraw();
      if (fire) this.onChange?.(this.value);
      return this;
    }
    nudge(d) {
      this.set(this.value + d, true);
    }
    setFocused(on) {
      this.focused = on;
      this.redraw();
    }
    redraw() {
      const w = this.width_;
      const t = this.track;
      const fillW = Math.max(16, w * this.value);
      t.clear();
      t.fillStyle(0x10143a, 1); // recessed groove
      t.fillRoundedRect(-w / 2, -8, w, 16, 8);
      t.fillStyle(0x000000, 0.35);
      t.fillRoundedRect(-w / 2 + 2, -8, w - 4, 6, { tl: 6, tr: 6, bl: 0, br: 0 });
      t.fillStyle(PAL.goldDark, 1);
      t.fillRoundedRect(-w / 2, -8, fillW, 16, 8);
      t.fillStyle(PAL.gold, 1);
      t.fillRoundedRect(-w / 2, -8, fillW, 11, { tl: 8, tr: 8, bl: 4, br: 4 });
      t.fillStyle(0xffffff, 0.35);
      t.fillRoundedRect(-w / 2 + 5, -6, Math.max(0, fillW - 10), 3, 1.5);
      t.lineStyle(3, this.focused ? 0xffffff : PAL.navy, 1);
      t.strokeRoundedRect(-w / 2, -8, w, 16, 8);
      const kx = -w / 2 + w * this.value;
      const k = this.knob;
      k.clear();
      k.fillStyle(0x05071c, 0.35);
      k.fillCircle(kx, 5, 16);
      k.fillStyle(PAL.navy, 1);
      k.fillCircle(kx, 0, 17);
      k.fillStyle(this.focused ? 0xd9dded : PAL.goldDark, 1);
      k.fillCircle(kx, 1.5, 14);
      k.fillStyle(this.focused ? 0xffffff : PAL.goldLight, 1);
      k.fillCircle(kx, -1, 12.5);
      k.fillStyle(0xffffff, 0.6);
      k.fillCircle(kx - 4, -5, 4);
    }
  };

  KL.Toggle = class Toggle extends Phaser.GameObjects.Container {
    constructor(scene, x, y, value, onChange) {
      super(scene, x, y);
      scene.add.existing(this);
      this.value = !!value;
      this.onChange = onChange;
      this.g = scene.add.graphics();
      this.add(this.g);
      this.setSize(76, 40);
      this.setInteractive({ useHandCursor: true });
      this.on('pointerup', () => this.toggle());
      this.redraw();
    }
    toggle() {
      this.value = !this.value;
      this.redraw();
      this.onChange?.(this.value);
      KL.audio?.play('ui_click');
    }
    setFocused(on) {
      this.focused = on;
      this.redraw();
    }
    redraw() {
      const g = this.g;
      g.clear();
      g.fillStyle(this.value ? PAL.goldDark : 0x5d6279, 1);
      g.fillRoundedRect(-38, -18, 76, 36, 18);
      g.fillStyle(this.value ? PAL.gold : PAL.grey, 1);
      g.fillRoundedRect(-38, -18, 76, 30, 16);
      g.fillStyle(0x000000, 0.18);
      g.fillRoundedRect(-34, -16, 68, 7, 4);
      g.lineStyle(3, this.focused ? 0xffffff : PAL.navy, 1);
      g.strokeRoundedRect(-38, -18, 76, 36, 18);
      const kx = this.value ? 20 : -20;
      g.fillStyle(0x05071c, 0.3);
      g.fillCircle(kx, 3, 14);
      g.fillStyle(0xdde1ee, 1);
      g.fillCircle(kx, 0, 13);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(kx, -2, 11);
      g.lineStyle(3, PAL.navy, 1);
      g.strokeCircle(kx, 0, 13);
    }
  };

  /** Fade helpers used by every scene transition. */
  KL.fadeIn = (scene, ms = 250) => scene.cameras.main.fadeIn(ms, 15, 18, 48);
  KL.goTo = (scene, key, data, ms = 250) => {
    if (scene._leaving) return;
    scene._leaving = true;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (scene._leaving = false)); // scene instances are reused
    scene.cameras.main.fadeOut(ms, 15, 18, 48);
    scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
  };

  /** Keyboard list navigation shared by menus: up/down/enter/esc + W/S. */
  KL.MenuNav = class MenuNav {
    constructor(scene, items, { onBack, horizontal = false } = {}) {
      this.scene = scene;
      this.items = items;
      this.index = 0;
      this.onBack = onBack;
      const kb = scene.input.keyboard;
      const prevKeys = horizontal ? ['LEFT', 'A'] : ['UP', 'W'];
      const nextKeys = horizontal ? ['RIGHT', 'D'] : ['DOWN', 'S'];
      this.handlers = [];
      const bind = (names, fn) => names.forEach((n) => {
        const h = () => fn();
        kb.on(`keydown-${n}`, h);
        this.handlers.push([n, h]);
      });
      // ignore keys for a moment after the screen opens so one press can't skip two screens
      const readyAt = scene.time.now + 220;
      const ready = () => scene.time.now >= readyAt;
      bind(prevKeys, () => ready() && this.move(-1));
      bind(nextKeys, () => ready() && this.move(1));
      bind(['ENTER', 'SPACE', 'J', 'NUMPAD_ONE'], () => ready() && this.items[this.index]?.activate?.());
      bind(['ESC', 'BACKSPACE'], () => {
        if (this.onBack && ready()) {
          KL.audio?.play('ui_back');
          this.onBack();
        }
      });
      this.items.forEach((it, i) => {
        it.on?.('pointerover', () => this.focus(i));
      });
      this.focus(0);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    }
    move(d) {
      if (!this.items.length) return;
      this.focus((this.index + d + this.items.length) % this.items.length);
      KL.audio?.play('ui_move');
    }
    focus(i) {
      this.index = i;
      this.items.forEach((it, k) => it.setFocused?.(k === i));
    }
    destroy() {
      const kb = this.scene.input.keyboard;
      this.handlers.forEach(([n, h]) => kb?.off(`keydown-${n}`, h));
    }
  };
})();
