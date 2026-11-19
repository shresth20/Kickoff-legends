# Football Club — Art & Asset Spec

An original 2D "head soccer" style game: 1v1, side view, chibi players, kicks, headers, jumps and super skills.

> **Keep it original.** Don't copy any existing game's characters, art or names. Don't use real footballers' names or faces, real club kits, or brand logos (Nike, adidas, real sponsors).

> **Update: characters use approach A (cut-out rig).** Character style, parts and prompts are in **[RIG_SPEC.md](RIG_SPEC.md)**. Your reference screenshots show a 3/4 view with the head at about 45% of height, so the chibi and side-view guidance in §1–§4 below no longer applies to characters. Those frame-by-frame rules still apply to **FX** sprite sheets (§6).

---

## 0. Read first: why games like this look so smooth

Smooth games in this genre are usually animated with **skeletal ("cut-out") animation**, not frame-by-frame sprite sheets. The character is split into parts (head, torso, arms, legs, boots). The engine moves and rotates those parts and fills in the motion at the game's full 60 fps. That is why every frame keeps exactly the same face, colors and line thickness.

GPT-style image models draw every frame from scratch. Across 8 frames the face, hair, jersey number and outline drift slightly, and the animation "boils" or jitters. You **can** get usable sprite sheets from GPT, but plan on cleaning up every sheet.

| Approach | Smoothness | GPT images per character | Notes |
|---|---|---|---|
| **A. Skeletal / cut-out** (recommended) | Perfect, 60 fps | ~2 (parts sheet + faces) | You rig and animate once. Every character with the same part sizes reuses all animations, so a new character only needs a new parts sheet. See §5. |
| **B. Frame-by-frame sprite sheets** (what you asked for) | Good if cleaned up | ~16–20 | About 120 frames per character, and every sheet needs alignment and drift fixes. §1–§4. |
| **C. Hybrid** | Very good | ~10 | Frame-by-frame for the big actions (kicks, skill, celebrations). Subtle motion is done in code: idle breathing, squash and stretch, landing squash, hit flash and the shadow. |

---

## 1. Global sprite rules (every character sheet)

| Rule | Value |
|---|---|
| Game design resolution | 1280×720 landscape (an @2x set covers 1920×1080+) |
| Character height on screen | ~200 px (about 28% of screen height) |
| Frame cell size | **256×256 px** (@1x) and **512×512 px** (@2x/HD). Generate larger, then downscale. Downscaling also hides small AI wobble. |
| Pivot / anchor | **Bottom-center.** The feet baseline sits at **y = 240** in every 256 cell (16 px margin). The body and standing foot stay horizontally centered. A kicking leg may extend toward the right edge. |
| In-air frames | Draw them on the **same baseline** as the other frames. The game moves the sprite up; the drawing doesn't move. |
| Facing | Always **RIGHT**. The engine mirrors the sprite for the player on the right side. |
| Proportions | Chibi "big head": the head is ~50–55% of total height, with a small body, short legs and big boots. |
| Style | 2D cartoon, thick dark outline (~4 px at 512 px), flat cel shading (base color + 1 shadow + optional highlight). No gradients or textures inside the character, which keeps frames consistent and makes recoloring easy. |
| Background | Transparent PNG. If the tool refuses, use flat **magenta #FF00FF**. Never use green, which clashes with grass and green jerseys. |
| Never include | Ground lines, shadows (the engine draws a shadow blob), motion blur, speed lines, glow or effects (FX are separate sprites, §6), text, frame numbers, cell borders. |
| Texture atlas | Max **2048×2048** per texture (safe on mobile), with 2 px padding and 1 px extrude. |
| File naming | Frames: `char_<id>_<anim>_<NN>.png`, e.g. `char_blaze_kick_low_04.png`. Atlas: `char_blaze.png` + `char_blaze.json`. |

---

## 2. Frame rate & frame count: how many frames make it smooth?

- The **game** runs at 60 fps. A frame-by-frame **animation** plays at its own, lower rate:
  - **10–12 fps**: classic cartoon timing. Fine for idle, sad and celebrations.
  - **16–20 fps**: smooth. Use for running.
  - **24 fps**: very smooth. Use for fast actions (kicks, headers, skills).
- **Smoothness comes from the fps, not the total frame count.** Formula: `frames = duration (seconds) × fps`. Example: a 0.33 s kick at 24 fps = **8 frames**.
- Keep fast actions short (0.2–0.4 s) or the controls will feel laggy. The **contact frame** should arrive within ~0.15 s of the key press.
- Free smoothness tricks in code:
  - Movement itself already runs at 60 fps.
  - Squash and stretch (scale tween) on jump and land.
  - **Hit-stop**: freeze ~50 ms on strong kicks.
  - Screen shake on goals.
  - Short blends between animations.

### Character animation list

| # | Animation key | Trigger | Loop | Frames (smooth) | Min frames | FPS | Duration | Gameplay event |
|---|---|---|---|---|---|---|---|---|
| 1 | `idle` | No input | ✔ | **8** | 4 | 10 | 0.8 s | — |
| 2 | `run` | A/D toward the opponent | ✔ | **8** | 6 | 16 | 0.5 s | Footstep dust on frames 1 and 5 |
| 3 | `run_back` | Moving backward (still facing right) | ✔ | **8** | 6 | 16 | 0.5 s | Can reuse `run` played in reverse |
| 4 | `sprint` | Sprint/dash | ✔ | **8** | 6 | 20 | 0.4 s | Speed lines FX |
| 5 | `jump_start` | L | ✘ | **3** | 2 | 24 | 0.125 s | Leaves the ground on frame 3 |
| 6 | `jump_up` | Rising | ✔ | **2** | 1 | 10 | — | — |
| 7 | `jump_down` | Falling | ✔ | **2** | 1 | 10 | — | — |
| 8 | `land` | Touches the ground | ✘ | **3** | 2 | 24 | 0.125 s | Land dust on frame 1 |
| 9 | `kick_low` | J (ground shot) | ✘ | **8** | 5 | 24 | 0.33 s | **Contact on frame 4** |
| 10 | `kick_high` | K (lob/volley) | ✘ | **8** | 5 | 24 | 0.33 s | **Contact on frame 4** |
| 11 | `air_kick` | J/K while in the air | ✘ | **6** | 4 | 24 | 0.25 s | **Contact on frame 3** |
| 12 | `header` | Ball near the head | ✘ | **5** | 3 | 24 | 0.2 s | **Contact on frame 3** |
| 13 | `skill` | I (super skill) | ✘ | **12** (2 images × 6) | 8 | 20 | 0.6 s | **Skill fires on frame 8** |
| 14 | `hit` | Hit by a ball or skill | ✘ | **4** | 2 | 16 | 0.25 s | — |
| 15 | `stunned` | After a hit | ✔ | **6** | 4 | 12 | 0.5 s | Stun stars FX |
| 16 | `celebrate` | Scored a goal | ✔ | **8** | 6 | 12 | 0.67 s | — |
| 17 | `sad` | Conceded a goal | ✔ | **6** | 4 | 10 | 0.6 s | — |
| 18 | `win` | Match won | ✔ | **8** | 6 | 12 | 0.67 s | Can reuse `celebrate` |
| 19 | `lose` | Match lost | ✔ | **6** | 4 | 10 | 0.6 s | Can reuse `sad` |

**Totals per character**
- **Full set:** ≈ 120 frames, which fits in two 2048×2048 atlases at 256 cells (64 cells each).
- **Lean set:** ≈ 98 frames. `run_back` reuses `run`, `win` reuses `celebrate`, `lose` reuses `sad`.
- **MVP set (build this first):** ≈ 73 frames. It includes `idle`, `run`, `jump_start`/`jump_up`/`jump_down`/`land`, `kick_low`, `kick_high`, `header`, `skill`, `celebrate` and `sad`.

**For the programmer:** turn the foot hitbox on only during the contact frame (±1 frame). Turn the head hitbox on all the time; the `header` animation is only for looks. These values go in the animation JSON (see §4).

---

## 3. GPT prompts

### 3.1 Workflow

1. **Make the character reference sheet first** (§3.2) and regenerate it until you love it. That image is the source of truth for everything after.
2. **Make each animation as its own request in the same chat.** Attach the reference image, then paste the template (§3.3) and that animation's pose list (§3.4).
3. **Put at most 8 frames in one image.** Suggested layouts:

   | Frames | Grid | Image size |
   |---|---|---|
   | 7–8 | 4 columns × 2 rows | 1536×1024 |
   | 5–6 | 3 × 2 | 1536×1024 |
   | 2–4 | 2 × 2 | 1024×1024 |

   Use whatever sizes your GPT tool offers; these are the common ones. For 12-frame animations, generate frames 1–6 first. Then generate frames 7–12 and attach both the reference and the first half.
4. **If one frame drifts** (wrong color, different face, extra finger), redraw only that frame: *"Redraw only frame 5, keep everything else identical."*
5. **Clean up and export** (§4).

### 3.2 Prompt: character reference sheet

```
Design an ORIGINAL 2D cartoon soccer player character for a browser/mobile sports game in the "big head" style.

Style: chibi proportions — the head is about 55% of total height, small body, short legs, big boots. Big expressive eyes, clear readable silhouette. Thick dark outline (#1B1B1B), flat cel shading with one shadow tone, bright saturated colors, no gradients, no textures, clean vector-like look.

Character: [NAME] — [personality]. [hair style + color], [face details], [skin tone]. Wears a [jersey color + hex] jersey with a white number [N], [shorts color] shorts, [sock color] socks, [boot color] boots. Accessory: [headband / wristband / none]. No real brand logos, no real team kits, not based on any real person.

Show a model sheet:
1) full body, side view facing RIGHT, idle stance (main in-game view)
2) full body, front view
3) full body, back view
4) head close-ups with 4 expressions: neutral, effort/angry, happy shouting, dizzy

Same character, identical proportions and colors in every view. Transparent background (if not possible: solid flat #FF00FF magenta). No text, no labels, no ground, no shadow. Image size 1536×1024.
```

**Starter character ideas** (all original). Each one's skill also decides which FX you need:

| ID | Concept | Colors | Skill (I) | FX needed |
|---|---|---|---|---|
| `blaze` | Cocky striker, spiky red hair | Red #E53935 / black | Fire shot: the ball becomes a fireball | fire aura, fire trail, fire burst |
| `frost` | Calm defender, white-blue hair | Ice blue #4FC3F7 / white | Ice shot: freezes the opponent for 1.5 s | ice aura, ice trail, ice block |
| `volt` | Hyper speedster, yellow headband | Yellow #FDD835 / purple | Lightning dash plus a fast shot | lightning aura, trail, speed lines |
| `titan` | Big, strong, buzz cut | Green #43A047 / orange | Ground stomp: stuns the opponent if grounded | shockwave, dust, stun stars |

### 3.3 Prompt template: animation sheet

```
Use the attached image as the exact character reference. Keep the SAME character: same face, hair, skin tone, jersey design and number, colors, boots, proportions and outline thickness. Do not redesign anything.

Create a 2D game sprite sheet of this character performing: [ANIMATION NAME] — [one-line description].

Layout: [N] frames in a grid of [C] columns × [R] rows, read left-to-right, top-to-bottom in playback order. All cells are the same size. Image size [1536×1024].

Rules for every frame:
- side view, character facing RIGHT
- same scale in every frame; the character never gets bigger or smaller
- feet on the same baseline (same height) in every cell, body centered in its cell
- empty margin around the character inside each cell; nothing touches or crosses the cell edges
- flat 2D cartoon style, thick dark outline, flat cel shading — exactly like the reference
- transparent background (if not possible: solid flat #FF00FF magenta)
- no ground, no shadow, no motion blur, no speed lines, no glow or effects, no text, no numbers, no grid lines

Frames:
[PASTE THE POSE LIST FROM SECTION 3.4]
```

### 3.4 Pose lists (paste into `[PASTE THE POSE LIST…]`)

**idle** — 8 frames, 4×2 grid, seamless loop
```
1 neutral stance, knees slightly bent, arms relaxed, weight centered, eyes forward
2 body sinks slightly (breathing in begins)
3 lowest point: knees bent a little more, shoulders down
4 rising back up
5 neutral (same as 1)
6 slight rise: chest up, head tilts up a tiny bit
7 highest point
8 settling down toward frame 1 so the loop is seamless
The movement is very small (2–4% of body height). Nothing else changes.
```

**run** — 8 frames, 4×2, loop
```
Classic run cycle, body leaning slightly forward, arms swinging opposite to legs.
1 contact: front foot touches the ground ahead, back leg extended behind
2 down: body lowest, front knee bent absorbing weight
3 passing: back leg swings forward past the standing leg
4 up: push-off, body highest, both feet just off the ground
5 contact: the OTHER foot touches the ground ahead (mirror of 1)
6 down (mirror of 2)
7 passing (mirror of 3)
8 up (mirror of 4), flows back into frame 1
```

**run_back** — 8 frames, 4×2, loop
```
Backpedal: moving backward (to the LEFT) while still facing RIGHT. Short quick steps, upper body upright or leaning back slightly, arms out to the sides for balance, eyes on the ball. Same 8 phases as a run cycle but with the feet stepping backward.
```

**sprint** — 8 frames, 4×2, loop
```
Same 8-phase run cycle as a normal run but much more intense: strong forward lean (~20°), longer strides, knees driving high, arms pumping hard, determined gritted-teeth face.
```

**jump** — 10 frames as two images (frames 1–5, then 6–10). Split them into `jump_start` 1–3, `jump_up` 4–5, `jump_down` 6–7, `land` 8–10.
```
1 anticipation: knees start to bend, arms move back
2 deep crouch, arms swung down and back
3 takeoff: legs extending, arms swinging up, toes leaving the ground
4 rising: knees tucked slightly, arms up
5 rising variant (tiny arm change; loops with 4)
6 falling: legs extending downward, arms out to the sides
7 falling variant (tiny arm change; loops with 6)
8 touchdown: feet hit the ground, knees start to bend
9 landing squash: deepest knee bend absorbing the impact
10 recovering to the normal idle stance
All frames drawn on the same baseline — do not move the character up in the cell.
```

**kick_low** (J) — 8 frames, 4×2
```
Powerful low ground shot with the front leg.
1 anticipation: weight shifts to the standing leg, kicking leg starts pulling back, arms out
2 maximum wind-up: kicking leg bent far back, body leaning back slightly
3 leg swinging forward low, foot near the ground
4 CONTACT: kicking leg fully extended forward at ankle height, toe pointed, effort face
5 follow-through: foot continues up to knee height
6 follow-through hold, slight forward lean
7 kicking leg coming back down
8 back to idle stance
```

**kick_high** (K) — 8 frames, 4×2
```
High kick / volley that lifts the ball.
1 anticipation: weight on the back leg, arms out
2 maximum wind-up: kicking leg bent back, body leaning back
3 leg swinging upward, knee rising
4 CONTACT: leg extended forward and up to head height, toe pointed, body leaning back ~20°, arms flung back for balance
5 follow-through: leg goes slightly higher
6 leg coming down
7 foot back near the ground
8 back to idle stance
```

**air_kick** — 6 frames, 3×2
```
Mid-air volley while jumping.
1 in the air, legs tucked, arms up
2 kicking leg pulls back, body twists
3 CONTACT: kicking leg snaps forward horizontally, body tilted back strongly
4 follow-through
5 legs return under the body
6 falling pose with legs down, arms out (matches the jump falling pose)
```

**header** — 5 frames, 3×2 (one empty cell)
```
1 neutral, eyes looking up at the ball
2 head and neck pull back, chest out, eyes focused
3 CONTACT: head snaps forward, forehead leading, eyes squeezed shut, teeth gritted
4 slight overshoot forward
5 back to neutral
```

**skill** (I) — 12 frames as two images of 6 (3×2 each)
```
Image 1:
1 plants feet wide, fists clench
2 crouches lower, determined face
3 charging: body tense, arms pulled in tight
4 charging peak: leans back, chest out, mouth open shouting
5 wind-up for the power move: kicking leg pulled far back
6 hold of the wind-up (anticipation)
Image 2:
7 explosive start of the release
8 RELEASE: full-power kick, leg fully extended, huge effort face (the skill fires on this frame)
9 big follow-through
10 follow-through relaxing
11 recovering
12 back to idle stance
Do not draw any glow, aura, fire or energy — effects are added separately by the game.
```

**hit** — 4 frames, 2×2
```
1 impact: body jolts backward, eyes wide, mouth open in shock
2 head thrown back, arms flailing
3 stagger, knees wobbly
4 recovering toward a standing pose
```

**stunned** — 6 frames, 3×2, loop
```
Dizzy: eyes are spirals, tongue slightly out, wobbly knees, body swaying.
1–3 sway to the left, back to center
4–6 sway to the right, back to center (loops into frame 1)
No stars — stars are a separate effect.
```

**celebrate** — 8 frames, 4×2, loop (give every character its own celebration for personality)
```
1 crouch, big grin
2 jump up, one fist raised
3 peak of the jump, both arms up, huge smile, eyes closed happily
4 coming down
5 land
6 strong fist pump downward ("YES!")
7 fist up again
8 settle, flows back into frame 1
```

**sad** — 6 frames, 3×2, loop
```
Head down, shoulders slumped, one hand on the back of the head.
1–3 slowly slumping lower with a sigh
4–6 slowly rising slightly, flows back into frame 1
```

**win / lose** (optional; otherwise reuse `celebrate` and `sad`)
```
win (8, loop): arms raised, small happy hops, pointing at the camera on frames 5–6
lose (6, loop): kneeling on one knee, fist on the ground, head down, shoulders shaking slightly
```

### 3.5 Extra images per character

| Asset | Size | Prompt idea |
|---|---|---|
| Portrait (select screen, VS screen) | 512×512 → 256×256 | "Head and shoulders, 3/4 view, confident expression, same character, transparent background" |
| HUD icon | 96×96 | Downscaled portrait, cropped to the head |
| Select-screen hero pose | 768×1024 | "Full body, dynamic pose with one foot on a ball, same character" |
| Skill icon | 128×128 | "Round game icon showing [skill], bold cartoon, thick outline" |

---

## 4. Cleanup & export pipeline

1. **Remove the background.** If you used magenta, use Magic Wand or Color Range in Photopea or Aseprite, then check the edges for pink fringe.
2. **Slice the grid into frames.** Aseprite: File → Import Sprite Sheet. In Photopea, use slices.
3. **Normalize the size.** Use `idle` frame 1 as the height reference: ~200 px tall in a 256 cell @1x, or ~400 px in a 512 cell @2x.
4. **Align every frame.** Put the standing foot on baseline y = 240 and center the body. Turn on **onion skin** in Aseprite: the head should never jump around unless the pose is meant to.
5. **Fix drift.** Lock a palette taken from the reference sheet and repaint off-colors. Fix the jersey number, hair, hands and boots.
6. **Preview at the target fps** using these Aseprite frame durations:

   | FPS | Frame duration |
   |---|---|
   | 24 | 42 ms |
   | 20 | 50 ms |
   | 16 | 63 ms |
   | 12 | 83 ms |
   | 10 | 100 ms |

   If a frame jitters, fix it or drop it.
7. **Export** frames as `char_<id>_<anim>_<NN>.png`.
8. **Pack an atlas** with free-tex-packer or TexturePacker. Settings: Phaser 3 "JSON Hash" (or a Cocos plist), max 2048×2048, padding 2, extrude 1. Trimming is OK, because the format stores the original cell size and keeps the pivot.
9. **Write the animation data** in a small JSON per character:

```json
{
  "kick_low":  { "frames": 8,  "fps": 24, "loop": false, "events": { "contact": 4 } },
  "header":    { "frames": 5,  "fps": 24, "loop": false, "events": { "contact": 3 } },
  "skill":     { "frames": 12, "fps": 20, "loop": false, "events": { "release": 8 } },
  "idle":      { "frames": 8,  "fps": 10, "loop": true }
}
```

---

## 5. Skeletal / cut-out approach (chosen)

The full spec now lives in **[RIG_SPEC.md](RIG_SPEC.md)**. It covers the exact part sizes and joints, the GPT prompts, how to fit each part, and the 19 animations, which are already built in code. You can preview them in `rig-lab.html`.

---

## 6. FX sprite sheets

| FX key | Cell size | Frames | FPS | Loop | MVP? |
|---|---|---|---|---|---|
| `fx_kick_impact` | 256×256 | 6 | 24 | ✘ | ✔ |
| `fx_header_impact` | 192×192 | 5 | 24 | ✘ | |
| `fx_dust_run` | 128×128 | 5 | 20 | ✘ | ✔ |
| `fx_dust_land` | 256×128 | 6 | 24 | ✘ | ✔ |
| `fx_jump_puff` | 128×128 | 5 | 24 | ✘ | |
| `fx_ball_trail_<element>` (fire / ice / lightning / wind) | 256×128 | 6 | 20 | ✔ | ✔ (1 element) |
| `fx_skill_aura_<element>` | 384×384 | 8 | 16 | ✔ | ✔ (1 element) |
| `fx_skill_burst_<element>` | 512×512 | 8 | 24 | ✘ | |
| `fx_ice_block` (frozen player) | 256×256 | 5 in + 1 hold + 5 shatter | 24 | ✘ | |
| `fx_shockwave` (stomp) | 512×128 | 6 | 24 | ✘ | |
| `fx_stun_stars` | 128×64 | 6 | 12 | ✔ | ✔ |
| `fx_speed_lines` | 256×256 | 4 | 16 | ✔ | |
| `fx_goal_burst` | 512×512 | 10 | 24 | ✘ | ✔ |
| `fx_net_ripple` | goal size | 6 | 24 | ✘ | |
| `fx_smoke_puff` | 256×256 | 8 | 24 | ✘ | |

**Single particle textures** (64×64, used by the engine's particle system): soft circle, spark, star, 4 confetti shapes, smoke puff.

**FX prompt template**
```
2D cartoon game VFX sprite sheet: [EFFECT, e.g. "a fiery impact burst when a soccer ball is kicked hard"]. [N] frames in a [C]×[R] grid, playback order left-to-right, top-to-bottom, equal cells, effect centered at the same spot in every cell. Animation: [starts small → bursts outward → breaks apart and fades]. Style: bold chunky cartoon shapes, thick dark outline on the main shapes, flat colors [#FFD54F, #FF7043, #E53935], matches a chibi soccer game. Transparent background (if not possible: flat #FF00FF). No character, no ball, no text.
```

---

## 7. Full asset list

Tags: **MVP** = needed for the first playable version. **Later** = polish or extra content.

### 7.1 Per character
| Asset | Size | Tag |
|---|---|---|
| Reference / model sheet (source only) | 1536×1024 | MVP |
| Body parts (7 PNGs) + face pieces (13 PNGs), see RIG_SPEC.md | template sizes | MVP |
| Portrait | 256×256 | MVP |
| HUD icon | 96×96 | MVP |
| Select-screen hero pose | 512×768 | Later |
| Skill icon | 128×128 | MVP |
| Skill FX set (aura, trail, burst) | §6 | MVP (1 character) |
| Unique celebration | §3.4 | Later |

Plan **2 characters for the MVP** and **6–10 later**.

### 7.2 Ball
| Asset | Size | Tag |
|---|---|---|
| `ball_default` | 128×128 (shown ~56 px) | MVP |
| Ball skins (classic, street, beach, fire, gold, …) | 128×128 | Later |
| Shadow blob (shared by ball and players) | 128×32 soft ellipse | MVP |

Do **not** animate ball rotation as frames. The engine rotates the ball image, and squash on impact is a scale tween.

### 7.3 Environment / stadiums
| Asset | Size | Tag |
|---|---|---|
| Sky layer | 2560×720 | MVP |
| Far layer (city skyline / upper stands) | 2560×720, transparent | MVP |
| Crowd layer: 3-frame cheer loop @ 8 fps, or 6–8 single fans that bob in code | 1024×256 tileable | MVP (static first) |
| Front wall / ad boards with **fictional** sponsors | 2560×160 | MVP |
| Ground / pitch strip, tileable | 512×160 | MVP |
| Goal **back** layer (back post + back net) | ~180×320 | MVP |
| Goal **front** layer (front post + crossbar + front net) | ~180×320 | MVP |
| Scoreboard / jumbotron frame | 600×200 | Later |
| More themes: street cage, city rooftop, beach, night stadium, snowy park | same layer set | Later |
| Weather particles (rain, snow) | 64×64 | Later |

Notes:
- Make only the left goal; mirror it for the right side. The two layers let the ball and players go "inside" the goal, between the nets.
- **The pitch surface must be a flat, straight horizontal line** at a fixed height (e.g. y = 620 at 720p), because the physics floor is flat.
- Background prompt tip: ask for **each layer separately**, e.g. *"only the crowd and stands, transparent background, side view, 2D cartoon, wide panorama"*.

### 7.4 UI
| Asset | Size @1x | Tag |
|---|---|---|
| Game logo | 800×400 | MVP |
| Loading screen bg + progress bar (frame + fill, 9-slice) | 1280×720 / 400×40 | MVP |
| Main menu background | 1280×720 | MVP |
| Buttons, large / medium (normal, pressed, disabled) | 360×110 / 240×90 | MVP |
| Popup panel (9-slice) | 128×128 source | MVP |
| Round icons (96×96): play, settings, back, close, pause, resume, restart, home, sound on/off, music on/off, fullscreen, lock | 96×96 | MVP |
| More icons: shop, coin, gem, trophy, star, info, vibration, plus, check | 96×96 | Later |
| Character select card (normal / selected / locked) | 220×300 | MVP |
| Stat icons + bars (speed, power, jump, skill) | 48×48 / 200×20 | Later |
| HUD score panel (top center) | 400×90 | MVP |
| Timer panel | 160×70 | MVP |
| Player name plates ×2 | 260×50 | MVP |
| Skill meter: frame, fill, full-glow, "READY" label | 220×36 | MVP |
| Banners: 3 · 2 · 1 · GO! · GOAL! · TIME UP · YOU WIN · YOU LOSE · DRAW · GOLDEN GOAL | font + ribbon art 600×160 | MVP |
| Matchmaking: "Searching for opponent" spinner | 128×128 | Later (online) |
| VS screen: emblem + 2 portrait frames | 400×300 / 300×300 | Later |
| Results panel: rewards, rematch/home | 700×480 (9-slice) | MVP |
| Tutorial key caps (A, D, J, K, L, I) + pointing hand | 64×64 / 96×96 | Later |

Render banner text with a **font** and animate its scale in code. Art is needed only for the decorative ribbon behind it.

### 7.5 Mobile touch controls (the game is landscape on mobile)
| Asset | Size | Tag |
|---|---|---|
| Left, Right, Jump, Kick Low, Kick High, Skill buttons (normal + pressed, 60–70% opacity) | 160×160 | MVP for mobile |
| Skill cooldown radial overlay | 160×160 | MVP for mobile |

### 7.6 Audio
Formats: **OGG + MP3/M4A** (Safari), 44.1 kHz, SFX in mono, music in stereo. Keep files small for fast web loading.

| Sound | Variants | Tag |
|---|---|---|
| kick_soft, kick_hard | 2–3 each | MVP |
| header | 2 | MVP |
| ball_bounce_ground | 2 | MVP |
| ball_hit_post / crossbar | 1 | MVP |
| net_swish | 1 | MVP |
| jump, land, footstep | 1–2 | MVP |
| whistle_start, whistle_end | 1 | MVP |
| goal_horn + crowd_cheer_goal | 1 | MVP |
| crowd_ambient_loop | 1 | MVP |
| crowd_ooh (near miss) | 1 | Later |
| countdown_beep, countdown_go | 1 | MVP |
| skill_charge, skill_release per element | 1 each | MVP (1 element) |
| hit, stun, freeze, shatter | 1 each | Later |
| ui_click, ui_back, ui_error | 1 each | MVP |
| coin, unlock, match_found | 1 each | Later |
| win_jingle, lose_jingle | 1 each | MVP |
| Music: menu_loop (60–90 s seamless) | 1 | MVP |
| Music: match_loop (90–120 s seamless) | 1–3 | MVP |
| Music: results stinger | 1 | Later |

### 7.7 Fonts
Free on Google Fonts with open licences:
- **Luckiest Guy**: titles and banners
- **Lilita One**: UI text
- **Bangers**: impact text ("GOAL!")

---

## 8. Build order

1. **Prototype** (art can come later): coded placeholder shapes, 1 stadium, ball, goals, minimal HUD, kick and bounce sounds. This proves the physics and the game feel.
2. **Character 1, MVP set:** idle, run, jump, kicks, header, skill, celebrate, sad, plus kick/dust/goal FX and its skill FX.
3. **Character 2** (to test reuse), main menu, character select, results screen, mobile controls.
4. **Polish:** crowd animation, more FX, music, screen shake, hit-stop.
5. **Content:** more characters, stadiums and ball skins.
6. **Online 1v1:** matchmaking UI and VS screen.

---

## 9. Free resources & tools

| Need | Tools / sources |
|---|---|
| Free assets (placeholders or final) | Kenney.nl (CC0: UI, particles, sports, audio), OpenGameArt.org, itch.io asset packs |
| Sounds | freesound.org (check each file's licence), Pixabay Sounds, jsfxr (generate your own) |
| Music | Pixabay Music, incompetech.com (CC-BY, credit required) |
| Frame cleanup | Aseprite (paid, best for this), LibreSprite (free), Photopea (free, in the browser) |
| Atlas packing | free-tex-packer (free), TexturePacker |
| Skeletal animation | Spine, DragonBones, Cocos Creator, Godot |
