/* Kickoff Legends — playable roster. Stats 1..5, each sums to 9 for balance. */
window.KL = window.KL || {};

KL.CHARACTERS = [
  {
    id: 'char_01',
    name: 'Rio',
    flag: 'eng',
    stats: { speed: 3, jump: 3, power: 3 },
    kit: { primary: '#E63946', secondary: '#FFFFFF' },
    hair: '#1a1a24',
    superColor: '#FF8C1A',
  },
  {
    id: 'char_02',
    name: 'Mika',
    flag: 'jpn',
    stats: { speed: 4, jump: 2, power: 3 },
    kit: { primary: '#2B6CF2', secondary: '#FFFFFF' },
    hair: '#2b6cf2',
    superColor: '#3BC9FF',
  },
  {
    id: 'char_03',
    name: 'Bruno',
    flag: 'bra',
    stats: { speed: 2, jump: 4, power: 3 },
    kit: { primary: '#F5C518', secondary: '#111111' },
    hair: '#3dd36a',
    superColor: '#7CFF4A',
  },
  {
    id: 'char_04',
    name: 'Ace',
    flag: 'esp',
    stats: { speed: 3, jump: 2, power: 4 },
    kit: { primary: '#FFFFFF', secondary: '#7B3FE4' },
    hair: '#f2e7c9',
    superColor: '#C56CFF',
  },
];

KL.CHARACTER_IDS = KL.CHARACTERS.map((c) => c.id);

/**
 * Mirrors the sprite-sheet spec: one row per state. hitFrames = 0-based frame indices with a live hit-box.
 * frameMs (optional) times each frame on its own instead of fps. The kicks use it to snap through the
 * wind-up (frames 0–1), hold the boot on the ball (2, the contact, and 3, the follow-through) and ease
 * out: the boot meets the ball 4 display frames (~67 ms) after the key, not 125 ms. Keep the wind-up a
 * hair under a whole number of 60 Hz frames (16.7 ms) or it rounds up a frame. From recoverFrame on, the
 * pose gives way to the next run, jump or kick the player asks for.
 *
 * KL.TUNING.motion.animPace slows the look-only playback (the fps of every state, and a kick's frames
 * from recoverFrame on). exact: gameplay reads the frames' timing (the header's contact window, the super
 * charge), so they always play as authored — as do a kick's wind-up and contact frames. How long each
 * state lasts for gameplay (KL.charAnimMs) never changes with the pace.
 */
KL.CHARACTER_ANIMS = [
  { key: 'idle', frames: 6, fps: 8, loop: true },
  { key: 'run', frames: 8, fps: 14, loop: true },
  { key: 'jump', frames: 5, fps: 12, loop: false },
  { key: 'land', frames: 3, fps: 14, loop: false },
  { key: 'kick_low', frames: 6, fps: 16, frameMs: [32, 33, 75, 70, 60, 55], loop: false, hitFrames: [2, 3], recoverFrame: 4 },
  { key: 'kick_high', frames: 6, fps: 16, frameMs: [33, 34, 80, 75, 65, 55], loop: false, hitFrames: [2, 3], recoverFrame: 4 },
  { key: 'header', frames: 5, fps: 16, frameMs: [33, 60, 70, 70, 70], loop: false, hitFrames: [1, 2], exact: true },
  // the super: stance, crouch into the aura, full aura (the charge), leap, the flying kick, land. The frames
  // before releaseFrame fill the charge (KL.TUNING.super.chargeMs, see KL.charFrameMs), so the kick frame is
  // on screen the moment the shot is released, and it is the frame that strikes (it used to strike on the
  // leap, mid-charge, and the 12 fps strip had the player standing back up when the ball left)
  { key: 'super', frames: 6, fps: 12, frameMs: [70, 120, 160, 100, 140, 160], releaseFrame: 4, loop: false, hitFrames: [4], exact: true },
  { key: 'hurt', frames: 3, fps: 10, loop: false },
  { key: 'celebrate', frames: 6, fps: 10, loop: true },
  { key: 'lose', frames: 4, fps: 8, loop: false },
];

/** A state's per-frame durations in ms as played (frameMs states), with the pace applied where it may be.
 * releaseFrame (the super): the frames before it are scaled to add up to the super's charge exactly. */
KL.charFrameMs = (a) => {
  const pace = a.exact ? 1 : KL.animPace();
  const ms = a.frameMs.map((v, i) => (a.recoverFrame !== undefined && i >= a.recoverFrame ? v / pace : v));
  const charge = KL.TUNING?.super?.chargeMs;
  if (a.releaseFrame === undefined || !charge) return ms;
  const before = ms.slice(0, a.releaseFrame).reduce((s, v) => s + v, 0);
  return ms.map((v, i) => (i < a.releaseFrame ? (v * charge) / before : v));
};
/** A state's frame rate as played. */
KL.charFps = (a) => (a.exact || a.frameMs ? a.fps : a.fps * KL.animPace());

/** How long a state lasts for gameplay, in ms: one play as authored. Deliberately not paced — the action
 * clocks, the recovery and the CPU's timing stay exactly as tuned; a slower look-only playback just has
 * its last frame cut a little short when the state ends. */
KL.charAnimMs = (a) => (a.frameMs ? a.frameMs.reduce((sum, ms) => sum + ms, 0) : (a.frames / a.fps) * 1000);

/** Create every animation of a character that the (game-wide) animation manager doesn't have yet.
 * The one place they're built, so the menu, the picker, the match and the result screen all agree. */
KL.ensureCharacterAnims = (anims, id) => {
  for (const a of KL.CHARACTER_ANIMS) {
    const key = `${id}/${a.key}`;
    if (anims.exists(key)) continue;
    const frames = anims.generateFrameNames('characters', { prefix: `${id}/${a.key}/`, start: 0, end: a.frames - 1, zeroPad: 2 });
    if (a.frameMs) {
      const ms = KL.charFrameMs(a);
      frames.forEach((f, i) => (f.duration = ms[i])); // Phaser 3.90: a frame's whole duration
    }
    anims.create({ key, frames, frameRate: KL.charFps(a), repeat: a.loop ? -1 : 0 });
  }
};

/** Default key bindings (Phaser KeyCodes names). */
KL.DEFAULT_CONTROLS = {
  p1: { left: 'A', right: 'D', jump: 'L', kickLow: 'J', kickHigh: 'K', super: 'I', sprint: 'SHIFT' },
};

/** Pretty labels for key names in the hint badges. */
KL.KEY_LABELS = {
  LEFT: '←', RIGHT: '→', UP: '↑', DOWN: '↓', SHIFT: 'SHIFT', CTRL: 'CTRL', ESC: 'ESC', SPACE: 'SPACE', ENTER: '⏎',
  NUMPAD_ONE: 'N1', NUMPAD_TWO: 'N2', NUMPAD_THREE: 'N3', NUMPAD_ZERO: 'N0',
};
