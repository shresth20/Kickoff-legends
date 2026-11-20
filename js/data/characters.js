/* Kickoff Legends — playable roster. Stats 1..5, each sums to 9 for balance. */
window.KL = window.KL || {};

KL.CHARACTERS = [
  {
    id: 'char_01',
    name: 'Rio',
    flag: 'eng',
    tagline: 'char_01_tagline',
    stats: { speed: 3, jump: 3, power: 3 },
    kit: { primary: '#E63946', secondary: '#FFFFFF' },
    hair: '#1a1a24',
    superColor: '#FF8C1A',
  },
  {
    id: 'char_02',
    name: 'Mika',
    flag: 'jpn',
    tagline: 'char_02_tagline',
    stats: { speed: 4, jump: 2, power: 3 },
    kit: { primary: '#2B6CF2', secondary: '#FFFFFF' },
    hair: '#2b6cf2',
    superColor: '#3BC9FF',
  },
  {
    id: 'char_03',
    name: 'Bruno',
    flag: 'bra',
    tagline: 'char_03_tagline',
    stats: { speed: 2, jump: 4, power: 3 },
    kit: { primary: '#F5C518', secondary: '#111111' },
    hair: '#3dd36a',
    superColor: '#7CFF4A',
  },
  {
    id: 'char_04',
    name: 'Ace',
    flag: 'esp',
    tagline: 'char_04_tagline',
    stats: { speed: 3, jump: 2, power: 4 },
    kit: { primary: '#FFFFFF', secondary: '#7B3FE4' },
    hair: '#f2e7c9',
    superColor: '#C56CFF',
  },
];

KL.CHARACTER_IDS = KL.CHARACTERS.map((c) => c.id);

/** Mirrors the sprite-sheet spec: one row per state. hitFrames = 0-based frame indices with a live hit-box. */
KL.CHARACTER_ANIMS = [
  { key: 'idle', frames: 6, fps: 8, loop: true },
  { key: 'run', frames: 8, fps: 14, loop: true },
  { key: 'jump', frames: 5, fps: 12, loop: false },
  { key: 'land', frames: 3, fps: 14, loop: false },
  { key: 'kick_low', frames: 6, fps: 16, loop: false, hitFrames: [2, 3] },
  { key: 'kick_high', frames: 6, fps: 16, loop: false, hitFrames: [2, 3] },
  { key: 'header', frames: 5, fps: 16, loop: false, hitFrames: [1, 2] },
  { key: 'super', frames: 6, fps: 12, loop: false, hitFrames: [3, 4] },
  { key: 'hurt', frames: 3, fps: 10, loop: false },
  { key: 'celebrate', frames: 6, fps: 10, loop: true },
  { key: 'lose', frames: 4, fps: 8, loop: false },
];

/** Default key bindings (Phaser KeyCodes names). */
KL.DEFAULT_CONTROLS = {
  p1: { left: 'A', right: 'D', jump: 'L', kickLow: 'J', kickHigh: 'K', super: 'I', sprint: 'SHIFT' },
};

/** Pretty labels for key names in the hint badges. */
KL.KEY_LABELS = {
  LEFT: '←', RIGHT: '→', UP: '↑', DOWN: '↓', SHIFT: 'SHIFT', CTRL: 'CTRL', ESC: 'ESC', SPACE: 'SPACE', ENTER: '⏎',
  NUMPAD_ONE: 'N1', NUMPAD_TWO: 'N2', NUMPAD_THREE: 'N3', NUMPAD_ZERO: 'N0',
};
