/* Builds the layered stadium for any scene. Each background is a trimmed strip
 * (see tools/slice-sheet.mjs) placed in its own screen band, back to front:
 * sky → stands (railing + floodlights) → two crowd terraces → pitch.
 *
 * The crowd sits well behind the pitch, so it is drawn small and in tiers: every row further
 * back is smaller, higher and hazier (aerial perspective), which reads as a stadium bowl seen
 * from the touchline instead of fans standing right behind the players.
 * Bands are in logical px at 1280×720; tweak them in KL.STADIUM_LAYOUT. */
window.KL = window.KL || {};

KL.STADIUM_LAYOUT = {
  // fit 'cover': uniform scale that covers the band · 'stretch': exactly spans the view width
  // (+ parallax margin) · 'width': uniform scale to the view width, sat on the bottom edge, so the
  // markings line up with the goals (mirrored copies fill the parallax margin) · tiled layers repeat sideways
  // sky: the mountains sit just behind the stands' wall; the top clouds peek in from above
  sky: { top: -88, height: 472, fit: 'cover', factor: 0.1 },
  stands: { top: 185, height: 82, factor: 0.25, haze: 0.5 },
  // back → front (two rows). haze: how much of the sky colour is mixed in.
  // The front row's fans are under ⅓ of a player's height, so they read as being across the pitch.
  // The back row's see-through fence top sits over the stands' wall, so no sky shows between rows.
  tiers: [
    { top: 235, height: 74, factor: 0.38, haze: 0.3 },
    { top: 279, height: 82, factor: 0.55, haze: 0.1 },
  ],
  // Fence rails in the calm front-row strip (bg_crowd_calm), as fractions of its height: the top
  // rail ends at 8 %, the bottom rail starts at 88 %. Measured from the art; see the rails below.
  frontRails: [0.08, 0.882],
  backRails: [0.07, 0.9], // same for the fence crowds (bg_fence_crowd_a/b/c)
  // Floodlight lamp faces in the stands strip (bg_stands), as fractions of its width / height: two per
  // tile, measured on the art. At night they glow and throw a faint cone of light over the crowd.
  floodlights: { x: [0.1743, 0.8253], y: 0.09 },
  // the field (field.png → bg_pitch) covers the bottom half of the screen: 1983 × 562 at the view
  // width is 363 px tall, so its top (the red barrier) is at 357. Its box corners meet the goals' near
  // posts; the players stand between its touchlines (KL.TUNING.world.groundY)
  pitch: { top: 357, fit: 'width', factor: 1 },
  showcaseY: 620, // where the menu / result screens stand their big characters (on the grass)
};
KL.STADIUM_MARGIN = 200; // extra px on each side so the camera can drift without showing an edge
/** Night floodlights: a warm glow and flare on each lamp, a faint cone of light falling towards the pitch. */
KL.FLOODLIGHT = {
  glow: 40, // px across the halo
  flare: [92, 5], // the thin lens streak through it (w × h)
  beam: { width: 180, alpha: 0.13, lean: 0.22 }, // lean: max tilt (rad) towards the pitch centre
  shimmer: 0.1, // ± alpha, slow, each lamp on its own phase
};
/** The crowd: both rows cheer on the same beat — the front row throws its arms up, the rows behind jump. */
KL.CROWD = {
  beatMs: 170, // one arms-up / arms-down beat
  hop: 3, // px the back rows jump on an up beat
  goalBeats: 13, // a goal: ~2.4 s of cheering
  reactBeats: 3, // a shot near goal / a super: a quick "ooh!"
  reactGapMs: 1400, // at least this long between quick reactions
  // camera flashes popping in the stands: seconds between idle flashes, and how many on a goal
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
  scaledStrip(scene, src, h, haze, color, matchWidth = 0) {
    const R = KL.RES;
    const key = `kl:strip:${src}:${h}:${R}:${haze}:${color}:${matchWidth}`;
    if (scene.textures.exists(key)) return key;
    const img = scene.textures.get(src).getSourceImage();
    const th = Math.round(h * R);
    // matchWidth: force the same tile width as another strip so swapped frames repeat in step
    const tw = matchWidth || Math.round((img.width * th) / img.height);
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
   * @param {{ night?: boolean, parallax?: boolean, bus?: object }} opts  bus: the match EventBus, so the
   *   crowd reacts to shots near goal and supers
   * @returns {{ layers: object, cheer: () => void, react: () => void, update: (camX:number)=>void }}
   */
  build(scene, { night = false, parallax = true, bus = null } = {}) {
    const W = KL.TUNING.world;
    const L = KL.STADIUM_LAYOUT;
    const M = KL.STADIUM_MARGIN;
    const R = KL.RES;
    const span = W.width + M * 2;
    const has = (k) => scene.textures.exists(k) && k !== '__MISSING';
    const hazeColor = night ? KL.STADIUM_HAZE.night : KL.STADIUM_HAZE.day;

    /** Full-resolution layer (sky / pitch): these are shown larger than the source, so no prescale. */
    const big = (texKey, band, depth) => {
      if (!has(texKey)) return null;
      const src = scene.textures.get(texKey).getSourceImage();
      let img;
      if (band.fit === 'width') {
        // as wide as the view and standing on its bottom edge; a mirrored copy each side covers the
        // camera's drift (the field's markings stop well inside its edges, so no mirrored line shows)
        const s = W.width / src.width, top = W.height - src.height * s;
        img = scene.add.image(0, top, texKey).setOrigin(0, 0).setScale(s);
        for (const [x, ox] of [[0, 1], [W.width, 0]]) scene.add.image(x, top, texKey).setOrigin(ox, 0).setScale(s).setFlipX(true).setDepth(depth);
        img.setDepth(depth);
        img.factor = band.factor;
        img.baseY = top;
        return img;
      }
      if (band.fit === 'stretch') {
        img = scene.add.tileSprite(-M, band.top, src.width, src.height, texKey).setOrigin(0, 0);
        img.setScale(span / src.width, band.height / src.height);
      } else {
        const s = Math.max(span / src.width, band.height / src.height);
        img = scene.add.tileSprite(-M, band.top, Math.ceil(span / s) + 2, src.height, texKey).setOrigin(0, 0).setScale(s);
      }
      img.setDepth(depth);
      img.factor = band.factor;
      img.baseY = band.top;
      return img;
    };
    /** Distant strip: prescaled to its band height, tiled sideways at 1 texture px = 1 device px. */
    const strip = (texKey, band, depth, matchWidth = 0) => {
      if (!has(texKey)) return null;
      const key = KL.Stadium.scaledStrip(scene, texKey, band.height, band.haze || 0, hazeColor, matchWidth);
      const th = scene.textures.get(key).getSourceImage().height;
      const img = scene.add.tileSprite(-M, band.top, Math.ceil(span * R), th, key).setOrigin(0, 0).setScale(1 / R).setDepth(depth);
      img.factor = band.factor;
      img.baseY = band.top;
      img.stripKey = key; // (a TileSprite's .texture is its own canvas, not the tiled image)
      img.tileW = scene.textures.get(key).getSourceImage().width;
      img.tileH = th;
      return img;
    };

    // front row: the calm crowd (it has a matching arms-up frame for goals); row(s) behind: fence
    // crowds, shuffled per scene so the stands vary between matches
    const backRows = Phaser.Utils.Array.Shuffle(['bg_fence_crowd_a', 'bg_fence_crowd_b', 'bg_fence_crowd_c'].filter(has));
    const front = has('bg_crowd_calm') ? 'bg_crowd_calm' : backRows.pop();
    const rowKeys = L.tiers.map((_, i) => (i === L.tiers.length - 1 ? front : backRows[i] || front));
    const tiers = L.tiers.map((band, i) => strip(rowKeys[i], band, 1.1 + i * 0.1));
    // each tier starts at a different horizontal offset so the repeating strips don't line up
    tiers.forEach((t, i) => t && (t.tilePositionX = t.tileBase = i * 173 * R));

    const frontRow = tiers[tiers.length - 1];
    // living sky: when the painted sky has been split (tools/sky-split.mjs), show its clear version
    // and let SkyLife put the clouds back as drifting sprites
    const skyKey = night && has('bg_sky_night') ? 'bg_sky_night' : 'bg_sky';
    const skyData = KL.SkyLife.data(scene, skyKey);
    const layers = {
      sky: big(skyData ? skyData.clear : skyKey, L.sky, 0),
      stands: strip('bg_stands', L.stands, 1),
      tiers,
      // arms-up frame of the front row, same tile width so the fans stay in place when it swaps in
      cheer: front === 'bg_crowd_calm' && has('bg_crowd_cheer') && frontRow ? strip('bg_crowd_cheer', L.tiers[L.tiers.length - 1], frontRow.depth, frontRow.tileW) : null,
      pitch: big('bg_pitch', L.pitch, 3),
    };
    if (layers.cheer) layers.cheer.setVisible(false).tilePositionX = layers.cheer.tileBase = frontRow.tileBase;
    KL.SkyLife.build(scene, { sky: layers.sky, data: skyData, night, parallax });

    /** Texture rows ty … ty+h of a crowd strip, drawn at exactly their own spot (follows its parallax). */
    const pinned = (row, ty, h, depth) => {
      const p = scene.add.tileSprite(-M, row.baseY + ty / R, Math.ceil(span * R), h, row.stripKey).setOrigin(0, 0).setScale(1 / R).setDepth(depth);
      p.tilePositionY = ty;
      p.tilePositionX = p.tileBase = row.tileBase;
      p.factor = row.factor;
      p.baseY = p.y;
      return p;
    };

    // The fence is painted into the crowd strips, and the arms-up frame's fence sits a pixel or two
    // lower than the calm frame's. Pin the front row's rails: a static copy of the calm frame's top
    // and bottom rail, drawn over both frames, so only the fans change when the crowd cheers.
    layers.rails = [];
    if (layers.cheer) {
      const [topEnd, bottomStart] = L.frontRails;
      const th = frontRow.tileH;
      const y1 = Math.round(th * topEnd), y2 = Math.round(th * bottomStart);
      layers.rails.push(pinned(frontRow, 0, y1, frontRow.depth + 0.05), pinned(frontRow, y2, th - y2, frontRow.depth + 0.05));
    }
    // The rows behind cheer on the same beat by jumping: the band of fans between their rails lifts,
    // drawn over the still strip (so a jump uncovers the fans' own waists, not a gap) and under
    // pinned copies of the rails (so the fence never moves).
    layers.bands = [];
    for (const row of tiers.slice(0, -1)) {
      if (!row) continue;
      const [topEnd, bottomStart] = L.backRails;
      const th = row.tileH;
      const y1 = Math.round(th * topEnd), y2 = Math.round(th * bottomStart);
      const band = pinned(row, y1, y2 - y1, row.depth + 0.02);
      band.lift = 0;
      layers.bands.push(band);
      layers.rails.push(pinned(row, 0, y1, row.depth + 0.05), pinned(row, y2, th - y2, row.depth + 0.05));
    }

    if (night) {
      // darken everything behind the pitch a little more than the pitch itself
      scene.add.rectangle(0, 0, W.width, L.pitch.top + 20, 0x0b1033, 0.42).setOrigin(0).setDepth(2.5).setScrollFactor(0);
      scene.add.rectangle(0, L.pitch.top + 20, W.width, W.height, 0x0b1033, 0.22).setOrigin(0).setDepth(3.5).setScrollFactor(0);

      // the floodlights are on: drawn over the night shade (light isn't shaded), under the pitch
      const st = layers.stands;
      if (st && L.floodlights) {
        const F = KL.FLOODLIGHT, tex = KL.Stadium.lightTextures(scene);
        const tileW = st.tileW / R, y = st.baseY + L.floodlights.y * (st.tileH / R);
        const sf = parallax ? st.factor : 1;
        const add = (key, depth) => scene.add.image(0, y, key).setScrollFactor(sf, 1).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
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
            if (!KL.SkyLife?.still) scene.tweens.add({ targets: glow, alpha: 1 - F.shimmer * 2, duration: Phaser.Math.Between(1400, 2600), yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: Phaser.Math.Between(0, 1500) });
          }
        }
      }
    }

    const all = () => [layers.stands, ...layers.tiers, layers.cheer, ...layers.bands, ...layers.rails].filter(Boolean);
    const C = KL.CROWD;
    const calm = KL.SkyLife?.still; // OS "reduce motion": no jumping, no flashing

    // camera flashes: a small pool of pops, over the fans' heads (above the night shade, so they pop)
    const flashKey = KL.Stadium.flashTexture(scene);
    const flashes = Array.from({ length: 14 }, () => scene.add.image(0, 0, flashKey).setDepth(2.6).setVisible(false));
    const rows = tiers.filter(Boolean);
    let nextFlash = 0;
    const flash = () => {
      const img = flashes[nextFlash++ % flashes.length];
      const row = rows[Math.random() < 0.55 ? rows.length - 1 : Math.floor(Math.random() * rows.length)];
      if (!row) return;
      const h = row.tileH / R;
      const size = (row === frontRow ? 11 : 8) * Phaser.Math.FloatBetween(0.75, 1.15);
      scene.tweens.killTweensOf(img);
      img.setPosition(Phaser.Math.Between(8, W.width - 8), row.baseY + h * Phaser.Math.FloatBetween(0.22, 0.55)).setScrollFactor(parallax ? row.factor : 1, 1);
      img.setVisible(true).setAlpha(1).setScale((size * 0.45) / (24 * R));
      scene.tweens.add({ targets: img, scale: size / (24 * R), alpha: 0, duration: Phaser.Math.Between(140, 220), ease: 'Quad.out', onComplete: () => img.setVisible(false) });
    };
    const burst = (n, ms) => {
      for (let i = 0; i < n; i++) scene.time.delayedCall(Math.random() * ms, flash);
    };
    if (!calm) {
      const [lo, hi] = night ? C.flashEvery.night : C.flashEvery.day;
      const idle = () => scene.time.delayedCall(Phaser.Math.FloatBetween(lo, hi) * 1000, () => (flash(), idle()));
      idle();
    }

    // the back rows ease towards their lift every frame (a quick jump, a softer landing)
    if (layers.bands.length) {
      const ease = (time, delta) => {
        for (const b of layers.bands) {
          const target = b.baseY - b.lift;
          const k = 1 - Math.pow(b.lift ? 0.3 : 0.55, delta / 16.7);
          b.y += (target - b.y) * k;
        }
      };
      scene.events.on('update', ease);
      scene.events.once('shutdown', () => scene.events.off('update', ease));
    }

    let cheerTimer = null;
    let busyUntil = 0;
    /**
     * Both rows cheer on one beat: on every up beat the front row throws its arms up (calm ↔ arms-up
     * frame) while the rows behind jump. The fences never move.
     */
    const cheer = (beats) => {
      cheerTimer?.remove();
      busyUntil = scene.time.now + (beats + 1) * C.beatMs;
      let n = 0;
      cheerTimer = scene.time.addEvent({
        delay: C.beatMs,
        repeat: beats,
        callback: () => {
          n++;
          const up = n % 2 === 1 && n <= beats;
          if (layers.cheer && frontRow) {
            layers.cheer.setVisible(up);
            frontRow.setVisible(!up);
          }
          for (const b of layers.bands) b.lift = up && !calm ? C.hop * Phaser.Math.FloatBetween(0.85, 1.15) : 0;
        },
      });
    };
    /** A quick "ooh!" from the whole crowd — unless it's already cheering. */
    const react = () => {
      if (scene.time.now < busyUntil + C.reactGapMs) return;
      cheer(C.reactBeats);
      if (!calm) burst(5, 500);
    };
    if (bus) {
      const W2 = W.width;
      const offs = [
        // a strike near either goal: chance! (clashes and taps in midfield don't count)
        bus.on('KICK', (e) => e.kind !== 'clash' && (e.x < 330 || e.x > W2 - 330) && react()),
        bus.on('SUPER_FIRED', () => react()),
      ];
      scene.events.once('shutdown', () => offs.forEach((off) => typeof off === 'function' && off()));
    }

    return {
      layers,
      /** Goal celebration: the whole crowd cheers, cameras flashing all over the stands. */
      cheer() {
        cheer(C.goalBeats);
        if (!calm) burst(C.goalFlashes, C.goalBeats * C.beatMs);
      },
      react,
      update(camX) {
        if (!parallax) return;
        // objects already scroll 1:1 with the camera; shift textures back so far layers drift slower
        for (const l of [layers.sky, ...all(), layers.pitch]) if (l && l.factor < 1) l.tilePositionX = (-camX * (1 - l.factor)) / l.scaleX + (l.tileBase || 0);
      },
    };
  },
};
