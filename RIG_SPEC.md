# Character Rig Spec (cut-out animation)

Every character is a set of **20 PNG parts**. The game rotates and moves those parts with keyframes and fills in every frame in between, so motion is smooth at 60 fps. You only draw the parts once. All 19 animations already exist in code and work for every character whose parts follow this spec.

- **Try it now:** open `rig-lab.html`. Two placeholder characters show every animation. Your PNGs replace the placeholders as you add them.
- **Code:** sizes and joints are in [js/rig/parts.js](js/rig/parts.js), animations in [js/rig/animations.js](js/rig/animations.js), and the player in [js/rig/rig.js](js/rig/rig.js).

> Keep every character **original**. Don't use real footballers' faces or names, real club kits, or brand logos.

---

## 1. Style (matched to your reference screenshots)

| Rule | Value |
|---|---|
| View | **3/4.** The body is turned toward the right of the screen and the face looks right. You see the near ear on the left. The near eye (left) is full size and the far eye (right) is narrower. |
| Proportions | Head with hair ≈ **45%** of total height, torso ≈ 20%, legs ≈ 35%. Big fists, chunky boots. |
| Line and shading | Dark outline (#1B1B1B), about 4–5 px at template size. Cel shading: base color, 1 shadow tone and a small highlight, lit from the top left. |
| Limbs | Draw them **straight**: arms hanging down, legs straight down, boot toe pointing right with a flat sole. The rig does all the bending. |
| One side only | Draw **one** arm and **one** leg. The game reuses them for the far side and darkens them automatically. |
| Never include | Text, numbers or logos (they appear mirrored for the player facing left), shadows on the ground, background. |
| Background | Transparent PNG. If GPT refuses, use flat magenta #FF00FF and remove it afterwards. |
| In-game size | About 135 px tall at 1280×720, the same as the reference game. |

---

## 2. The 20 files per character

Put them in `assets/characters/<id>/`, e.g. `assets/characters/blaze/`.

### Body parts (7)

Coordinates are pixels inside the PNG.
- **Pivot** (red cross on the templates) is the joint the part rotates around.
- **Attach points** (blue dots) are where the next part connects.

| File | Size | Pivot | Attach points | What it shows |
|---|---|---|---|---|
| `head.png` | 200×200 | neck (96, 192) | eyes (118, 112) · mouth (124, 160) | Whole head with hair, ears and nose, and a **blank face**: no eyes, no eyebrows, no mouth. The chin sits just above the pivot. No neck. |
| `torso.png` | 120×112 | hip (60, 102) | neck (62, 12) · near shoulder (26, 28) · far shoulder (90, 26) | Jersey only, no arms, head or legs. The hem runs a little below the hip pivot so it covers the top of the shorts. |
| `upperArm.png` | 40×64 | shoulder (20, 12) | elbow (20, 52) | Sleeve on top, skin below, hanging straight down. |
| `forearm.png` | 40×68 | elbow (20, 10) | — | Forearm, wristband and a big closed fist at the bottom. |
| `thigh.png` | 52×80 | hip (26, 12) | knee (26, 68) | One leg of the shorts with the knee showing below. |
| `shin.png` | 40×76 | knee (20, 10) | ankle (20, 66) | Shin and sock. |
| `boot.png` | 64×38 | ankle (22, 12) | — | One boot, toe pointing **right**, sole touching the **bottom edge** of the image. |

### Face pieces (13)

| Files | Size | Pivot | Variants |
|---|---|---|---|
| `eyes_<variant>.png` | 120×56 | centre (60, 28) | `open`, `closed`, `angry`, `happy`, `sad`, `dizzy`, `shock` |
| `mouth_<variant>.png` | 64×36 | centre (32, 18) | `neutral`, `smile`, `shout`, `grit`, `sad`, `tongue` |

- **Eyes:** both eyes and the eyebrows go in one piece, with the whites filled solid.
- **Blinking:** the game uses `eyes_closed` automatically every few seconds.

**Size rule:** each PNG must be exactly the listed size, or exactly 2× (for HD). The Rig Lab warns you if a file has the wrong shape.

---

## 3. Making a character with GPT (3 images)

### Step 1: Design the character

```
Design an ORIGINAL 2D cartoon soccer player for a mobile/browser 1v1 soccer game.

Style: bold cartoon with slightly exaggerated proportions — big head (about 45% of total height including hair), compact torso, medium legs, big fists, chunky boots. Thick dark outline (#1B1B1B), cel shading with one shadow tone and a small highlight, light from the top left, saturated colors, clean vector look. Confident, readable silhouette.

Pose and view: full body, standing, arms hanging straight down beside the body with closed fists, legs straight and slightly apart. 3/4 view: body turned toward the RIGHT side of the image, face looking right.

Character: [NAME] — [personality]. [hair style + color], [face details], [skin tone]. Wears a [color] jersey with [simple pattern, e.g. two side stripes], [color] shorts, [color] socks, [color] boots, [accessory: wristband / headband / earring]. Not based on any real person or real team. No logos, no text, no numbers.

Underneath, in a row: the head alone with 4 expressions — neutral, angry effort, happy shouting, dizzy.
Transparent background (if not possible: solid flat #FF00FF magenta). Image 1536×1024.
```

Regenerate until you love it. That image is the reference for everything after.

### Step 2: Download the templates

Open `rig-lab.html` and go to the **Templates** panel. You'll use two kinds of file:
- **Body parts sheet** and **Face sheet:** attach these to the GPT prompts below. Every box on them is drawn at 2× the final PNG size.
- **Exact-size guides** (`guide_head.png` and so on): use these for fitting each part in Step 5.

### Step 3: Body parts (attach the reference and `template_body_parts.png`)

```
Attached: (1) my character reference, (2) a parts template with labelled boxes.

Redraw this EXACT character (same colors, outline thickness, shading and proportions) as separate body parts for 2D cut-out animation. 3/4 view, facing right. Put each part inside its matching box on the template, filling it the way the faint grey guide shape does. A part's red cross is the joint it rotates around; blue dots are where the next part attaches.

- head: whole head with hair, ears and nose, but a BLANK face — no eyes, no eyebrows, no mouth. No neck.
- torso: jersey only — no arms, no head, no legs. Collar at the top, hem at the bottom.
- upperArm: one arm from shoulder to elbow, hanging straight down; jersey sleeve on top, skin below.
- forearm: elbow to fist, hanging straight down, with the wristband and a big closed fist at the bottom.
- thigh: one leg of the shorts with the knee below it, straight down.
- shin: knee to ankle, straight down, with the sock.
- boot: one boot, toe pointing RIGHT, flat sole along the bottom of its box.

Draw only ONE arm and ONE leg (the game reuses them for both sides). Limbs are perfectly straight, not bent. Every limb has rounded ends that reach a little past its joints so it can rotate without gaps. No text, numbers or logos. Transparent background (if not possible: solid flat #FF00FF magenta). Same size and layout as the template; do not draw the boxes, crosses, dots or labels.
```

### Step 4: Face pieces (attach the reference and `template_face.png`)

```
Attached: (1) my character reference, (2) a face template with labelled boxes.

Draw this character's facial features as separate pieces in the same cartoon style and outline thickness — only the features, no skin or head around them. 3/4 view looking right: the near (left) eye is full size, the far (right) eye is narrower. Centre each piece on the red cross in its box, sized like the faint guide.

Eyes (with eyebrows, whites filled solid): open, closed, angry, happy (^ ^ arcs), sad, dizzy (spirals), shock (wide eyes, tiny pupils).
Mouths: neutral, smile, shout (wide open), grit (clenched teeth), sad, tongue (sticking out).

Transparent background (if not possible: solid flat #FF00FF magenta). Same size and layout as the template; do not draw the boxes, crosses or labels.
```

**When GPT gets something wrong**
- **A part comes out bent, merged or off-model:** ask for that part alone, e.g. *"Redraw only the forearm, perfectly straight, same style"*. Attach its `guide_forearm.png`.
- **The colors drift:** fix them in Photopea with Hue/Saturation, or repaint using colors picked from the reference.

### Step 5: Fit each part (Photopea, free, in the browser)

1. If the background isn't transparent, remove it first (magic wand on the magenta).
2. Open `guide_<part>.png`. It is already the exact final size.
3. Copy the part from the GPT image and paste it as a new layer.
4. Scale and move the part until it lines up:
   - **Limbs:** put the red cross on the centre of the top joint and the blue dot on the centre of the bottom joint.
   - **Head:** sit the chin just above the red cross and fill the faint guide. The blue dots mark where the eyes and mouth will go.
   - **Boot:** put the sole on the bottom edge and the ankle on the red cross.
   - **Eyes and mouth:** centre them on the red cross.
5. Hide the guide layer, then export the PNG under its file name (e.g. `forearm.png`).

### Step 6: Check it in the Rig Lab

1. Drop the files into `assets/characters/<id>/` and refresh `rig-lab.html`.
2. The **Character art** panel lists which files were found and any size warnings.
3. Play every animation. Turn on **Show bones and pivots** and **Pose strip** to inspect the joints.

### Step 7: Add the character

Add an entry to [js/characters.js](js/characters.js) with its `id`, `name` and a `palette`. The palette is only used for placeholder parts that are still missing.

---

## 4. Troubleshooting

| What you see | Fix |
|---|---|
| A gap opens at the elbow or knee when it bends | The limb's rounded end is too short. Extend it past the joint. |
| A limb slides or looks detached | The pivot isn't on the joint. Line up the red cross again. |
| Feet float or sink into the ground | The boot's sole must touch the bottom edge of `boot.png`, with the ankle on the red cross. |
| Gap between the head and the collar | The chin must sit right above the head's red cross. |
| Face sits too high or low, or off to one side | Re-centre the eyes or mouth on the red cross. Remember the head's blue dots are the anchors. |
| Lab says "wrong shape" | The PNG must be exactly the template size, or exactly 2×. |
| Text appears mirrored on the player facing left | Remove all text and numbers from the parts. |

---

## 5. Animations included

All of them play on every character. Durations are in seconds. **Events** are the moments the game reacts to, such as the foot touching the ball.

| Animation | Trigger | Length | Loop | Event |
|---|---|---|---|---|
| `idle` | No input | 1.0 | ✔ | — |
| `run` | Move toward the opponent | 0.5 | ✔ | — |
| `run_back` | Move away, still facing the opponent | 0.5 | ✔ | — |
| `sprint` | Fast run | 0.4 | ✔ | — |
| `jump_start` | L | 0.12 | ✘ | — |
| `jump_up` / `jump_down` | Rising / falling | 0.4 | ✔ | — |
| `land` | Touches the ground | 0.15 | ✘ | — |
| `kick_low` | J | 0.30 | ✘ | `contact` at 0.12 |
| `kick_high` | K | 0.33 | ✘ | `contact` at 0.14 |
| `air_kick` | J/K in the air | 0.25 | ✘ | `contact` at 0.10 |
| `header` | Ball at the head (also plays over a run or jump) | 0.20 | ✘ | `contact` at 0.08 |
| `skill` | I | 0.60 | ✘ | `release` at 0.36 |
| `hit` | Hit by the ball or a skill | 0.25 | ✘ | — |
| `stunned` | After a hit | 0.6 | ✔ | — |
| `celebrate` | Scored | 0.8 | ✔ | — |
| `sad` | Conceded | 1.2 | ✔ | — |
| `win` / `lose` | End of the match | 0.8 / 1.4 | ✔ | — |

**Other features**
- **Blending:** switching animations blends over 0.08 s.
- **Feet:** they stay planted using leg IK.
- **Faces:** expressions change by swapping the face pieces.

**Using it in the game**

```js
const { art } = FC.loadCharacterArt(character);
const rig = new FC.Rig();
rig.onEvent = (name) => { if (name === 'contact') kickBall(); };
rig.play('run');
// every frame:
rig.update(dt);
rig.draw(ctx, art, x, groundY, { facing: 1 }); // -1 for the player on the right
```
