/* Intent sources. Keyboard and AI both produce the same Intent shape:
 * { moveX:-1|0|1, jump, kickLow, kickHigh, super (edge-triggered), sprint (held) } */
window.KL = window.KL || {};

KL.PAD_ACTIONS = ['left', 'right', 'jump', 'kickLow', 'kickHigh', 'super', 'sprint'];
const EDGE_ACTIONS = ['jump', 'kickLow', 'kickHigh', 'super'];

/**
 * One player's on-screen controller state. KL.TouchControls (HUD scene) writes which buttons
 * fingers / the mouse are on; KeyboardInput merges it with the keys. A press is counted the moment
 * a pointer lands on a button, so a tap shorter than one frame still fires once (and never twice).
 * KeyboardInput mirrors the keyboard into `keys` so the on-screen buttons light up for key presses too.
 */
KL.VirtualPad = class VirtualPad {
  constructor() {
    this.held = {}; // action → true while a pointer is on its button
    this.presses = {}; // edge action → presses not yet read by the player
    this.keys = {}; // action → key held on the keyboard (button feedback only)
    this.pressedAt = {}; // action → time of the last press (lets a quick tap flash the button)
  }

  /** @param {Set<string>} actions every action that has a pointer on it right now */
  setHeld(actions) {
    const now = performance.now();
    for (const a of actions) {
      if (this.held[a]) continue;
      this.pressedAt[a] = now;
      if (EDGE_ACTIONS.includes(a)) this.presses[a] = (this.presses[a] || 0) + 1;
    }
    this.held = {};
    for (const a of actions) this.held[a] = true;
  }

  /** True once per press since the last call. */
  consume(action) {
    const n = this.presses[action] || 0;
    this.presses[action] = 0;
    return n > 0;
  }

  /** Held by touch or key — what the on-screen button shows. */
  isDown(action) {
    return !!(this.held[action] || this.keys[action]);
  }

  clear() {
    this.held = {};
    this.presses = {};
  }
};

KL.KeyboardInput = class KeyboardInput {
  /**
   * @param {Phaser.Scene} scene @param {object} map action → Phaser KeyCodes name
   * @param {KL.VirtualPad} [pad] on-screen controller merged with the keys
   */
  constructor(scene, map, pad = null) {
    const kb = scene.input.keyboard;
    const k = (name) => kb.addKey(Phaser.Input.Keyboard.KeyCodes[name] ?? name, false, false);
    this.keys = {
      left: k(map.left),
      right: k(map.right),
      jump: k(map.jump),
      kickLow: k(map.kickLow),
      kickHigh: k(map.kickHigh),
      super: k(map.super),
      sprint: k(map.sprint),
    };
    this.pad = pad;
    this.prev = { jump: false, kickLow: false, kickHigh: false, super: false };
  }

  update() {
    const pad = this.pad;
    if (pad) for (const a of KL.PAD_ACTIONS) pad.keys[a] = this.keys[a].isDown;
    const edge = (name) => {
      const down = this.keys[name].isDown;
      const fired = down && !this.prev[name];
      this.prev[name] = down;
      const tapped = pad ? pad.consume(name) : false; // always drain, so a tap never fires late
      return fired || tapped;
    };
    const l = this.keys.left.isDown || !!pad?.held.left;
    const r = this.keys.right.isDown || !!pad?.held.right;
    return {
      moveX: l === r ? 0 : l ? -1 : 1,
      jump: edge('jump'),
      kickLow: edge('kickLow'),
      kickHigh: edge('kickHigh'),
      super: edge('super'),
      sprint: this.keys.sprint.isDown || !!pad?.held.sprint,
    };
  }

  destroy() {
    for (const key of Object.values(this.keys)) key.destroy();
  }
};

KL.NullInput = class NullInput {
  update() {
    return { ...KL.EMPTY_INTENT };
  }
  destroy() {}
};
