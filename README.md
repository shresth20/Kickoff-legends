# Kickoff Legends

A cel-shaded 1v1 street-football game. Play against a relaxed CPU — it jogs rather than sprints (≈ 78 % of your pace), reacts a beat late, hesitates before it kicks and shoots a little softer (`KL.TUNING.ai.level`). 90-second matches, headers, lobs, sprint, and a charged Super Skill. Built with vendored Phaser 3, plain HTML/CSS/JS — no bundler, no CDN, runs 100 % offline (double-click `index.html`).

## Play

Open `index.html` in a browser, or serve the folder (`npm run serve` → http://localhost:5173).

| Action               | Key      |
| -------------------- | -------- |
| Move                 | A / D    |
| Jump                 | L        |
| Low kick             | J        |
| High kick / Header   | K        |
| Super skill          | I        |
| Sprint (hold)        | Shift    |
| Pause                | Esc      |

Menus also take W/S or arrows + Enter, and the mouse.

**Picking a legend.** Play goes straight to character select: browse with A / D, confirm with J (or Enter), and the CPU then picks a different legend. The *Night match* toggle (top-right, or N) switches the stadium to night straight away and keeps your pick.

**On-screen controller.** During a match the controls are drawn at the bottom of the screen: ← / → bottom-left, Low kick / High kick / Jump bottom-right, the Super button (wearing its charge ring) in the corner and a small Sprint button. Each button prints your current key and lights up while it is held, so it doubles as a live key guide. On a tablet the same buttons are touch targets: hold a direction with one thumb and tap kick with the other; a finger can slide from one button to the next. The pause button (top-right) replaces Esc on touch screens, and in character select tapping the highlighted legend (or its preview) confirms it.

**Reactions.** The chat button (left) opens a drawer with six reactions; the one you pick pops up over your player's head.

### Match rules at a glance

- 90-second match; a draw goes to 30 s of sudden death (next goal wins).
- Players always face the opponent's goal and backpedal; bodies block the ball, heads bounce it.
- Kicks fill the Super meter (conceding fills it faster). A Super shot is a fireball that knocks down anyone it hits.
- Two kicks on the same touch clash and pop the ball straight up; a ball parked on a crossbar rolls off.

## Folder structure

```text
index.html      entry point, root only
assets/         image/ (the 81 source PNGs, git-ignored) · images/ (generated atlases, backgrounds, favicon) · fonts/
css/            stylesheets (page chrome, CSS effects)
js/             all scripts: vendor/ (Phaser), data/, core/, entities/, systems/, ui/, scenes/, main.js
locales/        locales.json (source of truth) + generated locales.js
tools/          node-only build/dev scripts (asset pipeline, locale build, headless smoke test)
tests/          unit tests for the pure game logic
```

## Art pipeline

The game ships with procedural placeholder art and swaps in the studio art automatically when the sliced atlases exist.

1. Generate the images in ChatGPT with the prompt pack from the production plan (81 images, flat `#FF00FF` background). Each download is named after its asset (`char_01_idle.png`, `bg_sky.png`, …).
2. `npm install` (once — only `sharp` is needed, for the tools).
3. Put the PNGs in `assets/image/` — or run `npm run assets:import`, which copies them from `~/Downloads` and lists anything missing.
4. `npm run assets:build` keys out the magenta, detects frames by alpha gaps (or the emptiest column when sprites touch), drops slivers of neighbouring frames, scales each character to one consistent size across all of its sheets on a shared feet baseline, packs `characters` / `props` / `ui` / `fx` atlases into `assets/images/atlases/` (split into ≤4096 px pages when needed — `characters.webp`, `characters-1.webp`), and writes the stadium layers as trimmed strips to `assets/images/backgrounds/` (`js/ui/Stadium.js` stacks them). Output is WebP (q92 colour, lossless alpha). Add `--preview` to get a contact sheet per strip in `assets/images/preview/` for review.
   It then cuts each sky into a clear sky + its clouds (`tools/sky-split.mjs`, also `npm run assets:sky`): `bg_sky*_clear.webp`, `sky_clouds_day|night.webp` and `sky.js` (cloud frames, star spots, moon box) for the living sky.
5. Reload the game. The version tag on the menu reads "studio art" once all four atlases are present.

Frame counts, cell sizes and atlas names live in `tools/manifest.mjs`; animation timing in `js/data/characters.js`; physics/AI tuning in `js/data/tuning.js`.

## Rendering & UI

- **Sharp on any screen.** Game code works in 1280×720 logical px, but the canvas is created at the display's real pixel density (`KL.RES`, up to 3×; 2× from `file://`) and every scene camera is zoomed to match (`js/core/HiDPI.js`). Text is rasterised at the same density. Force a value with `?res=1.5` when testing.
- **UI drawn in code.** Buttons, panels, cards, key caps, the HUD scoreboard and the super meters are painted by `js/ui/Paint.js` with CSS-style primitives (rounded rects, gradients, inset borders, gloss, drop shadows) at device resolution, then cached as textures. Restyle them there; geometry for the HUD plate is `KL.HUD_SCOREBOARD` in `js/ui/HUD.js`. Illustrated art (logo, icons, flags, portraits, GOAL/WIN banners) still comes from the `ui` atlas.
- **On-screen controller.** `js/ui/TouchControls.js` paints the buttons (same "CSS in canvas" approach) and tracks every pointer: whatever button a finger or the mouse is on goes into that player's `KL.VirtualPad` (`js/systems/InputSystem.js`), which `KeyboardInput` merges with the keys. Presses are counted when the finger lands, so a tap shorter than a frame still fires once. Positions and sizes live in `KL.PAD_LAYOUT.solo`. Reactions (drawer + head badge) are in `js/ui/Emotes.js`.
- **Fonts per locale.** Latin locales use Bangers for headlines and Oswald for body text; Hindi uses Teko for both (it has Devanagari). `KL.FONT_SETS` in `js/ui/Widgets.js` picks the set from the current language, including a size boost for Teko. Key names on the controller and key caps are always Oswald.
- **Living sky.** `js/ui/SkyLife.js` puts the painted clouds back as sprites that drift on a slow wind (bigger = nearer = a little faster) and gently swell; small gull flocks cross the day sky now and then, flapping in bursts; at night the stars twinkle and a rare shooting star streaks past the moon. Every position is a pure function of one shared clock, so the sky carries on seamlessly between menu screens and freezes while a match is paused. Speeds and frequencies live in `KL.SKY_LIFE`. The OS "reduce motion" setting keeps the sky still.
- **Stadium depth.** The crowd is two terraces (`KL.STADIUM_LAYOUT.tiers`): the back row is smaller, higher and mixed with more sky haze than the front row, so the fans read as being across the pitch.
- **Living crowd.** Both rows cheer on the same beat (`KL.CROWD`): the front row throws its arms up (calm ↔ arms-up frame) while the back row jumps; the fence rails are pinned copies, so only the fans move. A goal gets a long cheer and a burst of camera flashes; a strike near either goal or a super gets a quick "ooh!"; the odd flash pops in the stands the rest of the time.
- **Goals.** The perspective goals (`goal-net-left/right.png`, `kind: 'goal'` in the manifest) are two layers that sandwich the players and the ball: the far frame and roof behind them, the near side panel in front, so a ball in the goal sits behind the near netting. The near net ripples on a goal and twitches when the ball clatters the frame (frames generated by the slicer, which moves only the net, never the posts). The mouth, crossbar and ground at mid-depth are measured on the art and line up with the goal's physics. Each goalmouth is worn to brown earth (with islands of grass) out past the mouth, with grass tufts where the posts meet the ground — drawn in code from the measured post bases.
- **Layout & scale (matched to the reference).** The field (`field.png` → `bg_pitch`) is shown at the view width on the bottom edge (`fit: 'width'`), covering the bottom half of the screen; its penalty-box corners meet the goals' near posts, and the players stand between its touchlines (`groundY` 490). The touch pad sits on the grass in front of them. A player is about 124 px tall (`KL.TUNING.player.scale` 0.73; body, reach, the CPU's sense of distance and emote badges follow it), the goal opening 255 px (the whole goal ≈ 44 % of the screen), the ball 46 px across. Menu / result screens stand their big characters at `KL.STADIUM_LAYOUT.showcaseY`.
- **Special effects (CSS).** The match effects are built in CSS on a DOM layer laid over the canvas (`js/core/FXLayer.js` + `css/fx.css`): speed lines streaming off a sprinter; the referee's whistle trilling with sound waves (gold at kickoff, red for sudden death, pink at full time); twinkles when a super is ready; and goal confetti in the scorer's kit colours, fired from two corner cannons and falling with a leaf-like swing and flip. The layer works in the same 1280×720 logical px, follows the camera's scroll, shake and fades, runs at the goal slow-mo speed and hides while paused. Randomness comes in through CSS custom properties, so no two bursts look alike; only `transform` and `opacity` animate. `KL.FX` routes the bus events to it; `?cssfx=0` brings back the sprite effects from the `fx` atlas. The super aura is not CSS: it is the hand-drawn fire ring (`fx_super_aura`, 8 frames in the `fx` atlas) drawn behind the player, popping in when the charge starts and swelling out as the shot is released (`showAura` / `hideAura` in `js/entities/Player.js`). Kicks and dust are hand-drawn art too, played by `KL.FX` (`js/core/FX.js`): the `fx_impact` starburst (sparkle → star → burst → flying shards) on every kick, sized by the strike (header smallest, super biggest) and turned / mirrored at random, and the `fx_dust` cloud on landings, low strikes along the turf and — small, drifting back behind the boots — every sprint stride. (The impact row is sliced with `merge: 'nearest'` in `tools/manifest.mjs`, so its tiny first sparkle and its ring of loose shards each stay one whole frame.) The OS "reduce motion" setting spawns fewer pieces and stops the confetti flutter.
- **Shadows.** Players and the ball cast soft ground shadows (`js/entities/Shadow.js`, `KL.SHADOW`) that shrink and fade as they rise — firmer by day, softer under the floodlights.
- **Floodlights.** At night every lamp on the stands glows, with a faint lens flare and a soft cone of light falling over the crowd towards the pitch (`KL.FLOODLIGHT`; lamp spots measured on `bg_stands` in `KL.STADIUM_LAYOUT.floodlights`).
- **Motion.** The pace is tuned so every arc keeps its shape: gravity and all ball / jump speeds are scaled together (`KL.TUNING`, see its header), which only slows the play. Physics steps at the display's refresh rate (60 / 120 / 144 Hz…, measured by `KL.Motion` in `js/core/Motion.js`), so high-refresh screens get a new position every frame instead of judder. The ball (`js/entities/Ball.js`) is drawn by a rig on top of its invisible physics body: it spins for real (rolls at its ground speed, chips carry backspin), squashes along every impact — boot, turf, post, head — and springs back round through a slight stretch like an air-filled ball (held squashed against the boot during a kick's hit-stop), and leaves faint after-images on hard shots; the fireball flies nose-first. Players accelerate and brake instead of snapping to full speed, their run cycle follows their real speed, and a draw-time pose layer adds a stretch on take-off, a landing squash sized by the fall, a lean into starts and stops and a recoil tilt when hit (the hitbox never changes). A goal's slow-mo eases back to full speed. All of it is tuned in `KL.TUNING.motion`; the OS "reduce motion" setting halves the squash and drops the after-images.

## Localisation

`locales/locales.json` is the source of truth (`en` first). After editing it run `npm run locales:build` to regenerate `locales/locales.js`, which the game loads as a plain script so it works from `file://`. The build warns about keys missing from any language.

## Tests

- `npm test` — unit tests for the match-rules state machine (clock, goals, sudden death, winner).
- `node tools/smoke.mjs` — headless Chromium walkthrough of every screen with screenshots in `tools/.smoke/` (needs Playwright; set `PLAYWRIGHT_PATH` if it is installed globally).

## Credits

Design, art direction and code: Shresth Kasera. Character and UI art generated with ChatGPT in a cel-shaded anime style. Engine: Phaser 3 (MIT). Fonts: Bangers, Oswald and Teko (SIL Open Font License), bundled in `assets/fonts/`.
