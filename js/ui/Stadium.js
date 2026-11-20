/* Builds the layered stadium for any scene, back to front:
 * sky → stands (railing + floodlights) → terrace with two rows of fans → one fence → pitch.
 * The sky, stands, fence and pitch are trimmed strips (see tools/slice-sheet.mjs), each in its own
 * screen band; the fans are single sprites cut from the crowd line-ups (crowd atlas).
 *
 * The crowd sits well behind the pitch, so it is drawn small and in two rows: the back row is
 * smaller, higher and hazier (aerial perspective), which reads as a stadium bowl seen from the
 * touchline instead of fans standing right behind the players. Every fan supports one of the two
 * players — about half each, standing mixed in little groups — and only the scorer's half cheers.
 * Bands are in logical px at 1280×720; tweak them in KL.STADIUM_LAYOUT. Every layer runs past both
 * sides of the design area (KL.STADIUM_MARGIN) and the sky reaches up past its top, so a wide phone
 * or a tall tablet (KL.View) sees more stadium, never an edge. */
window.KL = window.KL || {};

KL.STADIUM_LAYOUT = {
  // fit 'cover': uniform scale that covers the band · 'stretch': exactly spans the view width
  // (+ parallax margin) · 'width': uniform scale to the view width, sat on the bottom edge, so the
  // markings line up with the goals (mirrored copies fill the parallax margin) · tiled layers repeat sideways
  // sky: the mountains sit just behind the stands' wall; the top clouds peek in from above. capTo: on a
  // view taller than 16:9 (tablets) the sky's top colour carries on up to here
  sky: { top: -88, height: 472, fit: 'cover', factor: 0.1, capTo: -300 },
  stands: { top: 185, height: 82, factor: 0.25, haze: 0.5 },
  // The fans, back row → front row. feet: the line a row stands on · stand: a fan's height, head to
  // toe · gap: px between neighbours (± 15 %) · haze: how much of the sky colour is mixed in · hop: px
  // a cheering fan jumps · flags: share of fans waving a flag in their player's kit.
  // The front row is about half a player's height, so the fans read as being across the pitch.
  // Their feet never show: the terrace's front step hides the back row's, the pitch's barrier the front row's.
  crowd: [
    { feet: 325, stand: 52, gap: 21, factor: 0.38, haze: 0.3, hop: 2, flags: 0.12 },
    { feet: 369, stand: 64, gap: 26, factor: 0.55, haze: 0.1, hop: 3, flags: 0.08 },
  ],
  // the terrace the fans stand on, in the shade of the stand: from under its wall (top) to the barrier;
  // step: the top of the front step, in front of the back row and behind the front row
  terrace: { top: 258, step: 319, back: '#3c3874', lip: '#7d79bd', face: '#4a4589', floor: '#34306a' },
  // the one fence between the crowd and the pitch (bg_fence, a seamless tile), standing on the barrier
  fence: { top: 317, height: 48, factor: 0.62, haze: 0.05 },
  // Floodlight lamp faces in the stands strip (bg_stands), as fractions of its width / height: two per
  // tile, measured on the art. At night they glow and throw a faint cone of light over the crowd.
  floodlights: { x: [0.1743, 0.8253], y: 0.09 },
  // the field (new-pitch.png → bg_pitch, 2172 × 472) covers the bottom half of the screen, shown
  // `width` px wide, centred, its top (the red barrier) at `top`: 359 px tall, so it runs just past the
  // bottom edge. At that size its near touchline (source x 363 … 1807) spans x 90 … 1188 at y 534, so
  // the box corners meet the goals' near posts; the players stand between its touchlines
  // (KL.TUNING.world.groundY). The art is wider than the design area, so a wide phone sees real grass
  // out to ±185 px past it (mirrored copies only beyond that, on 21:9)
  pitch: { top: 364, width: 1650, fit: 'width', factor: 1 },
  showcaseY: 620, // where the menu / result screens stand their big characters (on the grass)
};
// extra px on each side of the 1280-wide design area: the widest view (KL.View.LIMITS, 21:9 phones
// reach 224 px past each side) plus the far layers' parallax drift, so no edge ever shows
KL.STADIUM_MARGIN = 280;
/** Night floodlights: a warm glow and flare on each lamp, a faint cone of light falling towards the pitch. */
KL.FLOODLIGHT = {
  glow: 40, // px across the halo
  flare: [92, 5], // the thin lens streak through it (w × h)
  beam: { width: 180, alpha: 0.13, lean: 0.22 }, // lean: max tilt (rad) towards the pitch centre
  shimmer: 0.1, // ± alpha, slow, each lamp on its own phase
};
/**
 * The crowd. Each fan supports one player; when that player scores, their fans throw their arms up and
 * jump on the beat (calm ↔ arms-up frame) and wave their flags, while the other half stays put.
 */
KL.CROWD = {
  beatMs: 170, // one beat of a fan's jump / arms-up / arms-down cycle (each fan ± beatJitter, so they drift a little apart)
  beatJitter: 0.08,
  reactDelayMs: 140, // fans don't all react on the same frame: each starts up to this much later
  goalBeats: 13, // a goal: ~2.4 s of cheering
  reactBeats: 3, // a shot at goal / a super: a quick "ooh!" from the attacker's fans
  reactGapMs: 1400, // at least this long between quick reactions (per side)
  nearGoal: 330, // a strike within this many px of the goal a player attacks counts as a chance
  // camera flashes popping in the stands: seconds between idle flashes, and how many on a goal
  // (mostly from the scorer's fans)
  flashEvery: { day: [1.4, 4], night: [0.5, 1.8] },
  goalFlashes: 34,
};
/** Colour of the air between the pitch and the far rows (sampled from each sky near the horizon). */
KL.STADIUM_HAZE = { day: '#b4e4fb', night: '#1a2268' };

KL.Stadium = {
  /**
   * A copy of texture `src` scaled to `h` logical px tall at device resolution, with `haze` of
   * `color` mixed into its opaque pixels. Downscaled in halving steps (clean, no shimmering
   * chain-link) and cached in the global texture manager, so later scenes reuse it.
   */
  scaledStrip(scene, src, h, haze, color) {
    const R = KL.RES;
    const key = `kl:strip:${src}:${h}:${R}:${haze}:${color}`;
    if (scene.textures.exists(key)) return key;
    const img = scene.textures.get(src).getSourceImage();
    const th = Math.round(h * R);
    const tw = Math.round((img.width * th) / img.height);
    let cur = img, cw = img.width, ch = img.height;
    while (cw / 2 >= tw) {
      const c = document.createElement('canvas');
      c.width = Math.round(cw / 2);
      c.height = Math.round(ch / 2);
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(cur, 0, 0, c.width, c.height);
      cur = c;
      cw = c.width;
      ch = c.height;
    }
    const out = document.createElement('canvas');
    out.width = tw;
    out.height = th;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, tw, th);
    if (haze > 0) {
      ctx.globalCompositeOperation = 'source-atop'; // tint only where there are pixels
      ctx.globalAlpha = haze;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, tw, th);
    }
    // a plain image source, not addCanvas: a CanvasTexture reads its pixels back (getImageData),
    // which throws for a canvas that drew a file:// image, and keeps a second copy in memory
    scene.textures.addImage(key, out);
    return key;
  },

  /** Floodlight glow (warm radial bloom, also squashed into the flare) and beam (a soft cone fading downwards). */
  lightTextures(scene) {
    const R = KL.RES;
    const glow = `kl:flood:glow:${R}`, beam = `kl:flood:beam:${R}`;
    if (!scene.textures.exists(glow)) {
      const s = 64 * R, m = s / 2, c = document.createElement('canvas');
      c.width = c.height = s;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(m, m, 0, m, m, m);
      g.addColorStop(0, 'rgba(255,252,232,1)');
      g.addColorStop(0.16, 'rgba(255,244,200,0.75)');
      g.addColorStop(0.42, 'rgba(255,228,160,0.22)');
      g.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      scene.textures.addImage(glow, c);
    }
    if (!scene.textures.exists(beam)) {
      const w = 64 * R, h = 256 * R, c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      // a cone: narrow at the lamp, spreading as it falls, fading out towards the pitch
      const down = ctx.createLinearGradient(0, 0, 0, h);
      down.addColorStop(0, 'rgba(255,246,214,1)');
      down.addColorStop(0.45, 'rgba(255,240,200,0.45)');
      down.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = down;
      ctx.beginPath();
      ctx.moveTo(w * 0.44, 0);
      ctx.lineTo(w * 0.56, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      // soft sides
      ctx.globalCompositeOperation = 'destination-in';
      const across = ctx.createLinearGradient(0, 0, w, 0);
      across.addColorStop(0, 'rgba(0,0,0,0)');
      across.addColorStop(0.5, 'rgba(0,0,0,1)');
      across.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = across;
      ctx.fillRect(0, 0, w, h);
      scene.textures.addImage(beam, c);
    }
    return { glow, beam };
  },

  /** Camera flash: a white pop with a four-point glint, drawn at device resolution. */
  flashTexture(scene) {
    const R = KL.RES;
    const key = `kl:crowd:flash:${R}`;
    if (scene.textures.exists(key)) return key;
    const s = 24 * R, m = s / 2, c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    const glow = ctx.createRadialGradient(m, m, 0, m, m, m);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.22, 'rgba(255,255,240,0.9)');
    glow.addColorStop(1, 'rgba(255,255,220,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#ffffff';
    const r = m, k = r * 0.1;
    ctx.beginPath();
    ctx.moveTo(m, m - r);
    ctx.quadraticCurveTo(m + k, m - k, m + r, m);
    ctx.quadraticCurveTo(m + k, m + k, m, m + r);
    ctx.quadraticCurveTo(m - k, m + k, m - r, m);
    ctx.quadraticCurveTo(m - k, m - k, m, m - r);
    ctx.fill();
    scene.textures.addImage(key, c);
    return key;
  },

  /**
   * Who stands where in one row of the crowd, from x0 to x1 (pure: `rand` returns [0, 1)).
   * Supporters stand in little groups of 1–3 and the groups take turns, so the two players' fans are
   * mixed all along the stand; a group never puts its side more than 2 fans ahead, so each row is
   * split 50 / 50. Nobody stands near their double: a fan type isn't used again within `spread` places.
   * @returns {{ x: number, type: string, team: 0|1, flip: boolean, dy: number, size: number, flag: boolean }[]}
   */
  lineup({ x0, x1, gap, types, flags = 0, rand = Math.random, spread = 6 }) {
    const out = [], recent = [], count = [0, 0];
    let team = rand() < 0.5 ? 0 : 1, left = 0;
    for (let x = x0; x <= x1; x += gap * (0.85 + rand() * 0.3)) {
      if (left <= 0) {
        team = 1 - team;
        left = Math.max(1, Math.min(1 + Math.floor(rand() * 3), count[1 - team] - count[team] + 2));
      }
      left--;
      count[team]++;
      const fresh = types.filter((t) => !recent.includes(t));
      const pool = fresh.length ? fresh : types;
      const type = pool[Math.floor(rand() * pool.length)];
      recent.push(type);
      if (recent.length > Math.min(spread, types.length - 1)) recent.shift();
      out.push({ x, type, team, flip: rand() < 0.5, dy: (rand() - 0.5) * 3, size: 0.95 + rand() * 0.1, flag: rand() < flags });
    }
    return out;
  },

  /**
   * Every fan frame of the crowd atlas, scaled so a fan stands `stand` logical px tall, at device
   * resolution (halving steps like the strips: no shimmering outlines) with `haze` of `color` mixed in.
   * Frames keep their cell (trim), so a sprite anchored on the feet line stays put when calm ↔ cheer
   * swap. Cached in the global texture manager.
   */
  fanSheet(scene, stand, haze, color) {
    const R = KL.RES;
    const key = `kl:fans:${stand}:${R}:${haze}:${color}`;
    if (scene.textures.exists(key)) return key;
    const src = scene.textures.get('crowd');
    const items = src.getFrameNames().filter((n) => n.startsWith('fan/')).map((name) => {
      const f = src.get(name);
      const k = (stand * R) / f.customData.fan.stand;
      return { name, f, k, w: Math.max(1, Math.round(f.cutWidth * k)), h: Math.max(1, Math.round(f.cutHeight * k)) };
    });
    // shelf-pack
    const PAD = 2, MAXW = 2048;
    let x = 0, y = 0, rowH = 0, width = 0;
    for (const it of [...items].sort((a, b) => b.h - a.h)) {
      if (x + it.w > MAXW) (x = 0), (y += rowH + PAD), (rowH = 0);
      it.x = x;
      it.y = y;
      x += it.w + PAD;
      rowH = Math.max(rowH, it.h);
      width = Math.max(width, x);
    }
    const out = document.createElement('canvas');
    out.width = Math.max(1, width);
    out.height = Math.max(1, y + rowH);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    for (const it of items) {
      const f = it.f;
      let cur = f.source.image, sx = f.cutX, sy = f.cutY, cw = f.cutWidth, ch = f.cutHeight;
      while (cw / 2 >= it.w) {
        const c = document.createElement('canvas');
        c.width = Math.round(cw / 2);
        c.height = Math.round(ch / 2);
        const cx = c.getContext('2d');
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(cur, sx, sy, cw, ch, 0, 0, c.width, c.height);
        (cur = c), (sx = sy = 0), (cw = c.width), (ch = c.height);
      }
      ctx.drawImage(cur, sx, sy, cw, ch, it.x, it.y, it.w, it.h);
    }
    if (haze > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = haze;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, out.width, out.height);
    }
    const tex = scene.textures.addImage(key, out); // a plain image source (see scaledStrip)
    for (const it of items) {
      const f = it.f, k = it.k;
      const fr = tex.add(it.name, 0, it.x, it.y, it.w, it.h);
      fr.setTrim(Math.round(f.realWidth * k), Math.round(f.realHeight * k), Math.round(f.x * k), Math.round(f.y * k), it.w, it.h);
      fr.customData = f.customData;
    }
    return key;
  },

  /**
   * A supporter's flag in a player's kit: a stick with a two-colour cloth, ink outlined, at device
   * resolution, with `haze` of `color` mixed in like its row. 18 × 36 logical px; its origin goes at
   * the bottom of the stick (0.1, 1).
   */
  flagTexture(scene, kit, haze = 0, color = '#000') {
    const R = KL.RES;
    const key = `kl:crowd:flag:${kit.primary}:${kit.secondary}:${R}:${haze}:${color}`;
    if (scene.textures.exists(key)) return key;
    const c = document.createElement('canvas');
    c.width = 18 * R;
    c.height = 36 * R;
    const ctx = c.getContext('2d');
    ctx.scale(R, R);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1B1F3B';
    // stick
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(1.8, 35);
    ctx.lineTo(1.8, 1.5);
    ctx.stroke();
    ctx.strokeStyle = '#c9a77a';
    ctx.lineWidth = 1;
    ctx.stroke();
    // cloth: a little ripple, the kit's main colour with a band of its second colour
    const cloth = () => {
      ctx.beginPath();
      ctx.moveTo(2.6, 2);
      ctx.quadraticCurveTo(9, 0.2, 16.6, 2.6);
      ctx.lineTo(16.6, 13.4);
      ctx.quadraticCurveTo(9, 11, 2.6, 13);
      ctx.closePath();
    };
    cloth();
    ctx.fillStyle = kit.primary;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = kit.secondary;
    ctx.fillRect(0, 6, 18, 3.4);
    ctx.restore();
    cloth();
    ctx.strokeStyle = '#1B1F3B';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (haze > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = haze;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    scene.textures.addImage(key, c);
    return key;
  },

  /**
   * @param {{ night?: boolean, parallax?: boolean, bus?: object, teams?: {primary:string, secondary:string}[] }} opts
   *   bus: the match EventBus, so each side's fans react to their player's shots at goal and supers ·
   *   teams: the two players' kits, for the fans' flags (no flags without them)
   * @returns {{ layers: object, cheer: (team?: 0|1) => void, react: (team?: 0|1) => void, update: (camX:number)=>void }}
   */
  build(scene, { night = false, parallax = true, bus = null, teams = null } = {}) {
    const W = KL.TUNING.world;
    const L = KL.STADIUM_LAYOUT;
    const M = KL.STADIUM_MARGIN;
    const R = KL.RES;
    const span = W.width + M * 2;
    const has = (k) => scene.textures.exists(k) && k !== '__MISSING';
    const hazeColor = night ? KL.STADIUM_HAZE.night : KL.STADIUM_HAZE.day;
    KL.audio?.setStadium({ night }); // day birds and wind, or crickets and floodlight hum; the reverb

    /** Full-resolution layer (sky / pitch): these are shown larger than the source, so no prescale. */
    const big = (texKey, band, depth) => {
      if (!has(texKey)) return null;
      const src = scene.textures.get(texKey).getSourceImage();
      // Always the whole image ('__BASE'): once the sky's 'kl:cap' frame (below) has been added to the
      // texture, Phaser makes it the texture's default frame, so a later stadium asking for no frame
      // would get that 2 px strip and the sky would vanish from every screen after the first
      const WHOLE = '__BASE';
      let img;
      if (band.fit === 'width') {
        // band.width px wide (default: the design width), centred on the design area, its top at
        // band.top (default: standing on the bottom edge); a mirrored copy each side covers the rest
        // of the widest view (the field's markings stop well inside its edges, so no mirrored line shows)
        const s = (band.width ?? W.width) / src.width, w = src.width * s, left = (W.width - w) / 2;
        const top = band.top ?? W.height - src.height * s;
        img = scene.add.image(left, top, texKey, WHOLE).setOrigin(0, 0).setScale(s);
        for (const [x, ox] of [[left, 1], [left + w, 0]]) scene.add.image(x, top, texKey, WHOLE).setOrigin(ox, 0).setScale(s).setFlipX(true).setDepth(depth);
        img.setDepth(depth);
        img.factor = band.factor;
        img.baseX = img.x;
        img.baseY = top;
        return img;
      }
      // Plain images, never TileSprites, for art that doesn't repeat: in WebGL every TileSprite copies
      // its texture into a new power-of-two canvas and uploads that, each time a scene builds a
      // stadium — 16 MB and a fresh decode of the sky art for the sky alone, a stall at every screen
      if (band.fit === 'stretch') {
        img = scene.add.image(-M, band.top, texKey, WHOLE).setOrigin(0, 0).setScale(span / src.width, band.height / src.height);
      } else {
        // 'cover': one uniform scale that spans the view and its parallax margin and fills the band
        const s = Math.max(span / src.width, band.height / src.height);
        img = scene.add.image(-M, band.top, texKey, WHOLE).setOrigin(0, 0).setScale(s);
        if (band.capTo != null && band.capTo < band.top) {
          // the top two rows of the texture stretched up to capTo (a flat band of the sky's top
          // colour), tucked one px under the sky; it drifts with it
          const tex = scene.textures.get(texKey);
          if (!tex.has('kl:cap')) tex.add('kl:cap', 0, 0, 0, src.width, 2);
          img.cap = scene.add.image(-M, band.top + 1, texKey, 'kl:cap').setOrigin(0, 1).setScale(s, (band.top + 1 - band.capTo) / 2).setDepth(depth);
        }
      }
      img.setDepth(depth);
      img.factor = band.factor;
      img.baseX = img.x;
      img.baseY = band.top;
      return img;
    };
    /** Distant strip: prescaled to its band height, tiled sideways at 1 texture px = 1 device px. */
    const strip = (texKey, band, depth) => {
      if (!has(texKey)) return null;
      const key = KL.Stadium.scaledStrip(scene, texKey, band.height, band.haze || 0, hazeColor);
      const th = scene.textures.get(key).getSourceImage().height;
      const img = scene.add.tileSprite(-M, band.top, Math.ceil(span * R), th, key).setOrigin(0, 0).setScale(1 / R).setDepth(depth);
      img.factor = band.factor;
      img.baseX = img.x;
      img.baseY = band.top;
      img.tileW = scene.textures.get(key).getSourceImage().width; // (a TileSprite's .texture is its own canvas, not the tiled image)
      img.tileH = th;
      return img;
    };

    const C = KL.CROWD;
    const still = KL.SkyLife?.still; // OS "reduce motion": no jumping, waving or flashing

    // living sky: when the painted sky has been split (tools/sky-split.mjs), show its clear version
    // and let SkyLife put the clouds back as drifting sprites
    const skyKey = night && has('bg_sky_night') ? 'bg_sky_night' : 'bg_sky';
    const skyData = KL.SkyLife.data(scene, skyKey);
    const layers = {
      sky: big(skyData ? skyData.clear : skyKey, L.sky, 0),
      stands: strip('bg_stands', L.stands, 1),
      // the one fence, in front of both rows of fans
      fence: strip('bg_fence', L.fence, 1.3),
      pitch: big('bg_pitch', L.pitch, 3),
      terrace: [],
      fans: [],
    };
    KL.SkyLife.build(scene, { sky: layers.sky, data: skyData, night, parallax });

    // The terrace, in the shade of the stand (flat colour, so it needs no parallax): its back behind
    // the back row, then the front step — lit lip, face and the floor the front row stands on — which
    // hides the back row's feet.
    const T = L.terrace, rows = L.crowd;
    const tint = (hex, amount) => {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.HexStringToColor(hex), Phaser.Display.Color.HexStringToColor(hazeColor), 100, Math.round(amount * 100));
      return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    };
    const backWall = scene.add.graphics().setDepth(1.05);
    backWall.fillStyle(tint(T.back, rows[0].haze)).fillRect(-M, T.top, span, T.step - T.top + 2);
    const frontStep = scene.add.graphics().setDepth(1.15);
    frontStep.fillStyle(tint(T.floor, rows[1].haze)).fillRect(-M, T.step, span, L.pitch.top + 16 - T.step);
    frontStep.fillStyle(tint(T.face, rows[1].haze)).fillRect(-M, T.step, span, 7);
    frontStep.fillStyle(tint(T.lip, rows[1].haze)).fillRect(-M, T.step, span, 1.5);
    layers.terrace.push(backWall, frontStep);

    // The fans: one sprite each with two frames (calm / arms up), on their row's feet line. Every fan
    // supports one of the two players (KL.Stadium.lineup); some wave a flag in their player's kit.
    const fans = layers.fans;
    const atlas = has('crowd') ? scene.textures.get('crowd') : null;
    const types = atlas ? atlas.getFrameNames().filter((n) => n.startsWith('fan/') && !n.endsWith('_cheer') && atlas.has(`${n}_cheer`)) : [];
    if (types.length) {
      rows.forEach((row, r) => {
        const key = KL.Stadium.fanSheet(scene, row.stand, row.haze, hazeColor);
        const depth = 1.1 + r * 0.1;
        const spots = KL.Stadium.lineup({ x0: -M - row.gap, x1: W.width + M + row.gap, gap: row.gap, types, flags: teams ? row.flags : 0 });
        for (const p of spots) {
          const src = atlas.get(p.type);
          const img = scene.add.image(p.x, row.feet + p.dy, key, p.type).setOrigin(0.5, src.customData.fan.feet / src.realHeight);
          // nearer (lower) fans overlap their neighbours. (No scroll factor: the camera never scrolls,
          // it sits on the view's offset, which every layer must follow exactly.)
          img.setScale(p.size / R).setFlipX(p.flip).setDepth(depth + p.dy * 0.002);
          const fan = {
            img, team: p.team, front: r === rows.length - 1, stand: row.stand * p.size, factor: row.factor,
            calm: p.type, cheer: `${p.type}_cheer`, up: false, baseY: img.y, lift: 0,
            hop: row.hop * Phaser.Math.FloatBetween(0.8, 1.2), from: 0, until: -1, beat: C.beatMs, phase: Math.random() * Math.PI * 2,
          };
          if (p.flag) {
            // held up beside the head (the stick's foot hidden behind the fan), leaning outwards
            const side = Math.random() < 0.5 ? -1 : 1, s = fan.stand;
            fan.side = side;
            fan.flagDy = -s * 0.42;
            fan.flag = scene.add.image(p.x + side * s * 0.17, img.y + fan.flagDy, KL.Stadium.flagTexture(scene, teams[p.team], row.haze, hazeColor));
            fan.flag.setOrigin(side < 0 ? 0.9 : 0.1, 1).setFlipX(side < 0).setScale((s * 0.62) / 36 / R).setDepth(img.depth - 0.0005).setRotation(side * 0.1);
          }
          fans.push(fan);
        }
      });
    }

    if (night) {
      // darken everything behind the pitch a little more than the pitch itself (across the widest view)
      const top = Math.min(L.sky.capTo ?? 0, 0) - 20;
      scene.add.rectangle(-M, top, span, L.pitch.top + 20 - top, 0x0b1033, 0.42).setOrigin(0).setDepth(2.5);
      scene.add.rectangle(-M, L.pitch.top + 20, span, W.height - L.pitch.top, 0x0b1033, 0.22).setOrigin(0).setDepth(3.5);

      // the floodlights are on: drawn over the night shade (light isn't shaded), under the pitch
      const st = layers.stands;
      if (st && L.floodlights) {
        const F = KL.FLOODLIGHT, tex = KL.Stadium.lightTextures(scene);
        const tileW = st.tileW / R, y = st.baseY + L.floodlights.y * (st.tileH / R);
        const add = (key, depth) => scene.add.image(0, y, key).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
        for (let k = 0; k * tileW < span; k++) {
          for (const fx of L.floodlights.x) {
            const x = -M + (k + fx) * tileW;
            if (x > -M + span) continue;
            // a faint cone over the crowd, leaning towards the middle of the pitch
            const lean = Phaser.Math.Clamp((W.width / 2 - x) / W.width, -0.5, 0.5) * 2 * F.beam.lean;
            add(tex.beam, 2.52).setPosition(x, y).setOrigin(0.5, 0).setDisplaySize(F.beam.width, L.pitch.top + 50 - y).setRotation(-lean).setAlpha(F.beam.alpha);
            const glow = add(tex.glow, 2.56).setPosition(x, y).setDisplaySize(F.glow, F.glow);
            add(tex.glow, 2.57).setPosition(x, y).setDisplaySize(F.flare[0], F.flare[1]).setAlpha(0.55);
            // a slow shimmer in the night air (not with "reduce motion")
            if (!still) scene.tweens.add({ targets: glow, alpha: 1 - F.shimmer * 2, duration: Phaser.Math.Between(1400, 2600), yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: Phaser.Math.Between(0, 1500) });
          }
        }
      }
    }

    // camera flashes: a small pool of pops at the fans' heads (above the night shade, so they pop)
    const flashKey = KL.Stadium.flashTexture(scene);
    const flashes = Array.from({ length: 14 }, () => scene.add.image(0, 0, flashKey).setDepth(2.6).setVisible(false));
    const V = KL.View;
    const inView = fans.filter((f) => f.img.x > V.x + 8 && f.img.x < V.x + V.w - 8);
    const sides = [0, 1].map((t) => inView.filter((f) => f.team === t));
    let nextFlash = 0;
    /** A flash from one fan's camera: mostly one of `team`'s fans when given, anyone otherwise. */
    const flash = (team) => {
      const pool = team != null && Math.random() < 0.8 ? sides[team] : inView;
      const f = Phaser.Utils.Array.GetRandom(pool);
      if (!f) return;
      const img = flashes[nextFlash++ % flashes.length];
      const size = (f.front ? 11 : 8) * Phaser.Math.FloatBetween(0.75, 1.15);
      scene.tweens.killTweensOf(img);
      img.setPosition(f.img.x + f.stand * Phaser.Math.FloatBetween(-0.2, 0.2), f.baseY - f.stand * Phaser.Math.FloatBetween(0.62, 0.92));
      img.setVisible(true).setAlpha(1).setScale((size * 0.45) / (24 * R));
      scene.tweens.add({ targets: img, scale: size / (24 * R), alpha: 0, duration: Phaser.Math.Between(140, 220), ease: 'Quad.out', onComplete: () => img.setVisible(false) });
    };
    const burst = (n, ms, team) => {
      for (let i = 0; i < n; i++) scene.time.delayedCall(Math.random() * ms, () => flash(team));
    };
    if (!still) {
      const [lo, hi] = night ? C.flashEvery.night : C.flashEvery.day;
      const idle = () => scene.time.delayedCall(Phaser.Math.FloatBetween(lo, hi) * 1000, () => (flash(), idle()));
      idle();
    }

    // Crowd time runs with the game (its goal slow-mo too) and stops while a match is paused. A
    // cheering fan goes round a three-beat cycle of its own — jump with arms up, land with them still
    // up, arms down — until it's done, so most of a cheering side has its arms up at any moment.
    let clock = 0;
    const beatMs = C.beatMs / KL.animPace(); // the look-only pace (KL.TUNING.motion.animPace) sets the beat
    const animate = (time, delta) => {
      if (scene.paused) return;
      clock += delta * (scene.time.timeScale ?? 1);
      const k = delta / 16.7;
      for (const f of fans) {
        const cheering = clock >= f.from && clock < f.until;
        const beat = cheering ? Math.floor((clock - f.from) / f.beat) % 3 : -1;
        const up = beat === 0 || beat === 1;
        if (up !== f.up) {
          f.up = up;
          f.img.setFrame(up ? f.cheer : f.calm);
        }
        f.lift = beat === 0 && !still ? f.hop : 0;
        // a quick jump, a softer landing (eased over a few frames, never snapped)
        const target = f.baseY - f.lift;
        if (f.img.y !== target) {
          f.img.y += (target - f.img.y) * (1 - Math.pow(f.lift ? 0.45 : 0.68, k));
          if (Math.abs(target - f.img.y) < 0.02) f.img.y = target;
        }
        if (f.flag) {
          // a slow sway at rest; waved hard while their player is celebrating
          f.flag.y = f.img.y + f.flagDy;
          const lean = still ? 0.1 : cheering ? 0.2 + 0.34 * Math.sin(clock / 90 + f.phase) : 0.1 + 0.05 * Math.sin(clock / 700 + f.phase);
          f.flag.rotation = f.side * lean;
        }
      }
    };
    if (fans.length) {
      scene.events.on('update', animate);
      scene.events.once('shutdown', () => scene.events.off('update', animate));
    }

    const busy = [-Infinity, -Infinity]; // per side: crowd time until which its fans are cheering
    /**
     * `team`'s fans (everyone when not given) cheer for `beats` beats, each starting a moment apart.
     * exclusive: the other side's fans stop (they have nothing to cheer about).
     */
    const cheer = (team, beats, exclusive = false) => {
      for (const f of fans) {
        if (team != null && f.team !== team) {
          if (exclusive) f.until = Math.min(f.until, clock);
          continue;
        }
        f.from = clock + Math.random() * C.reactDelayMs;
        f.beat = beatMs * (1 + (Math.random() * 2 - 1) * C.beatJitter);
        f.until = f.from + beats * f.beat;
      }
      for (const t of team != null ? [team] : [0, 1]) busy[t] = clock + (beats + 1) * beatMs;
    };
    /** A quick "ooh!" from `team`'s fans (everyone when not given) — unless they're already cheering. */
    const react = (team) => {
      if ((team != null ? [team] : [0, 1]).some((t) => clock < busy[t] + C.reactGapMs)) return;
      cheer(team, C.reactBeats);
      if (!still) burst(5, 500, team);
    };
    if (bus) {
      // a strike near the goal a player attacks is a chance for their fans (player 0 attacks the
      // right-hand goal); clashes and clearances don't count
      const chance = (e) => (e.player === 0 ? e.x > W.width - C.nearGoal : e.x < C.nearGoal);
      const offs = [
        bus.on('KICK', (e) => e.kind !== 'clash' && chance(e) && react(e.player)),
        bus.on('SUPER_FIRED', (e) => react(e.player)),
      ];
      scene.events.once('shutdown', () => offs.forEach((off) => typeof off === 'function' && off()));
    }

    return {
      layers,
      /** A goal (or a win) for `team`: their fans cheer and wave, cameras flash on their side; the rest stay put. */
      cheer(team) {
        cheer(team, C.goalBeats, true);
        if (!still) burst(C.goalFlashes, C.goalBeats * beatMs, team);
      },
      react,
      update(camX) {
        if (!parallax) return;
        // far layers drift by (1 − factor) of the drift; the fans and flags stay put.
        // The layer itself moves (its margin covers the drift) rather than its tiled texture: shifting
        // tilePosition made the Canvas renderer repaint and re-upload these screen-wide strips every frame
        for (const l of [layers.sky, layers.stands, layers.fence, layers.pitch]) {
          if (!l || l.factor >= 1) continue;
          l.baseX ??= l.x;
          l.x = l.baseX + camX * (1 - l.factor);
          if (l.cap) l.cap.x = l.x;
        }
      },
    };
  },
};
