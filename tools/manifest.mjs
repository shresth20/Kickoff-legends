/**
 * Asset manifest — single source of truth for the art pipeline.
 * Every raw ChatGPT image is listed with how tools/slice-sheet.mjs should cut it.
 *
 * kind:
 *   strip      one row of `cols` equal frames → atlas frames `<out>/00..`
 *   rows       several rows; each row is its own strip (rowSpec)
 *   grid       `rows` × `cols` frames (stacked vertically) → `<out>/00..`
 *   single     one image → one atlas frame `<out>`
 *   goal       perspective goal → `<out>/back` + `<out>/near/00..04` (near net + ripple), see emitGoal
 *   background layer strip: magenta keyed (except skies), trimmed to its content (or cut to `crop`),
 *              aspect kept (max 2560 wide), written as a loose WebP. js/ui/Stadium.js stacks the strips.
 *   fans       a line-up of `cols` fans + the same line-up arms-up (`cheer`) → one calm + one cheer
 *              frame per fan, `fan/<out><nn>` and `fan/<out><nn>_cheer` (see emitFans)
 *
 * Raw files are looked up as assets/image/<name>.png, then in its sub-folders (e.g. new2/), where a
 * browser's "<name> (1).png" duplicate also counts.
 *
 * atlas: characters | props | ui | fx | crowd
 * cell:  square output cell for sprite frames (pivot bottom-centre unless pivot:'center')
 * keepAspect: UI pieces keep their own aspect instead of a square cell
 * merge: 'nearest' (strip / rowSpec) — fold loose pieces into frames across the narrowest gaps
 *        instead of merging the smallest piece away (for frames drawn as scattered bits)
 * skip:  frame indices of a strip that are cut but not packed (drawn on the sheet, unused by the game);
 *        the other frames keep their names
 */

/**
 * [state, frames, sizeRef, pivot]
 * sizeRef tells the slicer how to find the character's scale in that sheet, because the source
 * sheets draw the character at different sizes (run is ~25 % smaller than idle, super ~20 %…):
 *   'height' — the strip contains an upright frame: tallest frame ≈ standing height
 *   'area'   — no upright frame (crouch / stretch / aura): use the smallest frame's pixel area,
 *              calibrated against the same character's idle sheet
 * pivot 'feet-each' anchors every frame by its own feet (the art's jump arc is dropped; physics moves the body).
 */
export const CHAR_STATES = [
  ['idle', 6, 'height'], ['run', 8, 'height'], ['jump', 5, 'area', 'feet-each'], ['land', 3, 'height'],
  ['kick_low', 6, 'height'], ['kick_high', 6, 'height'], ['header', 5, 'area'], ['super', 6, 'area'],
  ['hurt', 3, 'height'], ['celebrate', 6, 'area'], ['lose', 4, 'height'],
];

/**
 * Character frame cell, and the standing height of every character inside it (the rest is headroom
 * for arms-up / stretch frames). The raw sheets draw characters ~650 px tall; 512/368 keeps enough
 * detail to stay sharp on 2–3× displays (the game shows them ~170–245 logical px tall), and the
 * characters atlas is split into several ≤4096 px pages by the slicer.
 */
export const CHAR_CELL = 512;
export const CHAR_STAND_PX = 368;

/**
 * Fan frames (crowd atlas): every fan stands FAN_STAND_PX tall (head to the bottom of its ground
 * shadow) in a FAN_CELL_W × FAN_CELL_H cell, the middle of its legs at the cell's centre line and its
 * feet on the line FAN_FEET_Y — calm and cheer frames alike. The game shows fans ≤ ~70 logical px tall,
 * so this stays sharp on 3× screens. Stadium.js reads the numbers back from frame.customData.fan.
 */
export const FAN_STAND_PX = 240;
export const FAN_CELL_W = 208;
export const FAN_CELL_H = 320;
export const FAN_FEET_Y = 312;

// The raw <id>_turnaround and <id>_kit_mask sheets are not sliced: the game never shows them (no
// animation in KL.CHARACTER_ANIMS uses them). List them here again if it ever does.
function character(id) {
  return [
    { name: `${id}_portrait`, kind: 'single', atlas: 'ui', keepAspect: true, out: `${id}_portrait`, maxSize: 256 },
    ...CHAR_STATES.map(([state, frames, sizeRef, pivot]) => ({ name: `${id}_${state}`, kind: 'strip', atlas: 'characters', cols: frames, cell: CHAR_CELL, out: `${id}/${state}`, charId: id, sizeRef, pivot })),
  ];
}

export const ASSETS = [
  ...character('char_01'),
  ...character('char_02'),
  ...character('char_03'),
  ...character('char_04'),

  { name: 'ball_sheet', kind: 'strip', atlas: 'props', cols: 9, cell: 128, pivot: 'center', out: 'ball' },
  { name: 'ball_super', kind: 'strip', atlas: 'props', cols: 6, cell: 192, pivot: 'center', out: 'ball_super' },
  // perspective goals, one per side (mouth facing the pitch). Measured on the 948×1659 art, source px:
  // near = the near side panel; mouthX / barY / groundY = mouth, crossbar top and ground at mid-depth
  // (halfway between the near and far posts: where the ball and players are); posts = where each
  // visible post meets the grass [x, y, 'near' | 'far'] (Goal.js plants tufts there and wears the turf)
  { name: 'goal-net-left', kind: 'goal', atlas: 'props', out: 'goal_left', maxSize: 720, goal: { mouth: 'right', near: [104, 378, 674, 1539], mouthX: 713, barY: 260, groundY: 1452, posts: [[626, 1528, 'near'], [146, 1528, 'near'], [800, 1376, 'far']] } },
  { name: 'goal-net-right', kind: 'goal', atlas: 'props', out: 'goal_right', maxSize: 720, goal: { mouth: 'left', near: [286, 378, 846, 1539], mouthX: 238, barY: 260, groundY: 1452, posts: [[326, 1528, 'near'], [802, 1528, 'near'], [150, 1376, 'far']] } },

  { name: 'bg_sky', kind: 'background' },
  { name: 'bg_stands', kind: 'background' },
  // the one fence between the crowd and the pitch. crop (source px) = from the middle of the left
  // post to the middle of the right one, so the tile repeats seamlessly (the two half posts meet).
  // key 'unmix': its thin wires are blended with the magenta; take it back out exactly (unmixMagenta)
  { name: 'bg_fence_only', kind: 'background', outs: ['bg_fence'], crop: [58, 223, 1613, 714], key: 'unmix' },
  // the crowd: three line-ups of 9 fans, each drawn calm and arms-up (`cheer`). Every fan becomes its
  // own pair of frames in the crowd atlas (fan/a00 + fan/a00_cheer …), see emitFans
  { name: 'bg_crowd_anime_a', kind: 'fans', atlas: 'crowd', cols: 9, cheer: 'bg_crowd_anime_a_cheer', out: 'a' },
  { name: 'bg_crowd_anime_b', kind: 'fans', atlas: 'crowd', cols: 9, cheer: 'bg_crowd_anime_b_cheer', out: 'b' },
  { name: 'bg_crowd_anime_c', kind: 'fans', atlas: 'crowd', cols: 9, cheer: 'bg_crowd_anime_c_cheer', out: 'c' },
  // the pitch: red barrier + striped grass + markings. new-pitch is the old field.png redrawn wider
  // (same box and perspective, more grass each side), so a wide phone sees real grass to its edges
  { name: 'new-pitch', kind: 'background', outs: ['bg_pitch'] },
  { name: 'bg_sky_night', kind: 'background' },

  // Buttons, panels, cards and key caps are NOT sliced from art any more: js/ui/Paint.js draws them in
  // code at screen resolution (the raw ui_buttons, ui_panel_and_cards and ui_keycaps sheets are unused).
  { name: 'ui_logo', kind: 'single', atlas: 'ui', keepAspect: true, out: 'ui_logo', maxSize: 1600 },
  // the match HUD's scoreboard plate (js/ui/HUD.js places the flags, names, scores and clock on it
  // from slots measured on this art: KL.HUD_SCOREBOARD.art). Kept near full size: it is shown
  // ~740 logical px wide, ~2200 device px on a 3× screen.
  { name: 'ui_hud_scoreboard', kind: 'single', atlas: 'ui', keepAspect: true, out: 'ui_hud_scoreboard', maxSize: 2040 },
  // the Super button's charge ring (00) and its charged coin (02), one shared scale and centre so they
  // swap in place (js/ui/TouchControls.js). The plain filled coin (01) is never shown.
  // key 'glow': the charged coin's soft orange glow is blended with the magenta (keyGlow)
  { name: 'ui_super_ring', kind: 'strip', atlas: 'ui', cols: 3, cell: 640, pivot: 'center', out: 'ui_super_ring', skip: [1], key: 'glow' },
  // icons 01, 02 and 06 are never shown; only the four characters' flags are (KL.CHARACTERS[].flag)
  { name: 'ui_icons', kind: 'strip', atlas: 'ui', cols: 12, cell: 192, pivot: 'center', out: 'ui_icons', skip: [1, 2, 6] },
  { name: 'ui_flags', kind: 'strip', atlas: 'ui', cols: 8, cell: 160, pivot: 'center', out: 'ui_flags', names: ['flag_eng', 'flag_bra', 'flag_esp', 'flag_ger', 'flag_ind', 'flag_jpn', 'flag_arg', 'flag_fra'], skip: [3, 4, 6, 7] },
  { name: 'ui_banners', kind: 'grid', atlas: 'ui', cols: 1, rows: 4, keepAspect: true, maxSize: 1122, out: 'ui_banners' },
  { name: 'ui_emotes', kind: 'strip', atlas: 'ui', cols: 6, cell: 192, pivot: 'center', out: 'ui_emotes' },

  // impact: the last frame is a ring of loose shards around an empty middle, and the first a tiny
  // sparkle — merge: 'nearest' keeps both whole (see bands() in slice-sheet.mjs)
  { name: 'fx_impact_dust', kind: 'rows', atlas: 'fx', cell: 192, pivot: 'center', rowSpec: [{ out: 'fx_impact', cols: 5, merge: 'nearest' }, { out: 'fx_dust', cols: 6 }] },
  { name: 'fx_misc', kind: 'rows', atlas: 'fx', cell: 128, pivot: 'center', rowSpec: [{ out: 'fx_speedlines', cols: 4, cellW: 256 }, { out: 'fx_confetti', cols: 8, cell: 48 }, { out: 'fx_whistle', cols: 3 }] },
  { name: 'fx_super_aura', kind: 'strip', atlas: 'fx', cols: 8, cell: 320, cellH: 340, pivot: 'center', out: 'fx_super_aura' },
];

export const RAW_DIR = 'assets/image'; // source PNGs (flat magenta background)
export const ATLAS_DIR = 'assets/images/atlases';
export const BG_DIR = 'assets/images/backgrounds';
export const PREVIEW_DIR = 'assets/images/preview';
