// Asset Viewer: plays every animation cut from raw-assets/ by
// tools/build_asset_viewer.py next to the same action on the cut-out rig
// (built from the parts sheets), and shows which actions have no art yet.
(function () {
  const DATA = window.ASSET_VIEWER;
  const HOLD = 0.6;            // s a one-shot animation rests on its last frame before replaying
  const MINI_W = 150, MINI_H = 160, MINI_GROUND = 150;
  const THUMB_W = 56, THUMB_H = 70;
  const RIG_AIR = { jump_up: 60, jump_down: 60, air_kick: 60 }; // rig units above the ground
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const $ = id => document.getElementById(id);

  // The character animations in ART_SPEC.md / RIG_SPEC.md, grouped as in the Rig Lab.
  const ACTIONS = [
    { group: 'Movement', key: 'idle', name: 'Idle', trigger: 'No input' },
    { group: 'Movement', key: 'run', name: 'Run', trigger: 'Move toward the opponent' },
    { group: 'Movement', key: 'run_back', name: 'Run back', trigger: 'Move away, still facing the opponent' },
    { group: 'Movement', key: 'sprint', name: 'Sprint', trigger: 'Fast run' },
    { group: 'Jump', key: 'jump', name: 'Whole jump', trigger: 'The four jump parts in a row', extra: true },
    { group: 'Jump', key: 'jump_start', name: 'Jump start', trigger: 'L: take-off crouch' },
    { group: 'Jump', key: 'jump_up', name: 'Jump up', trigger: 'Rising' },
    { group: 'Jump', key: 'jump_down', name: 'Jump down', trigger: 'Falling' },
    { group: 'Jump', key: 'land', name: 'Land', trigger: 'Touches the ground' },
    { group: 'Actions', key: 'kick_low', name: 'Low kick', trigger: 'J: ground shot' },
    { group: 'Actions', key: 'kick_high', name: 'High kick', trigger: 'K: lob or volley' },
    { group: 'Actions', key: 'air_kick', name: 'Air kick', trigger: 'J/K in the air' },
    { group: 'Actions', key: 'header', name: 'Header', trigger: 'Ball at the head' },
    { group: 'Actions', key: 'skill', name: 'Super skill', trigger: 'I' },
    { group: 'Reactions', key: 'hit', name: 'Hit', trigger: 'Hit by the ball or a skill' },
    { group: 'Reactions', key: 'stunned', name: 'Stunned', trigger: 'After a hit' },
    { group: 'Match end', key: 'celebrate', name: 'Celebrate', trigger: 'Scored' },
    { group: 'Match end', key: 'sad', name: 'Sad', trigger: 'Conceded' },
    { group: 'Match end', key: 'win', name: 'Win', trigger: 'Match won' },
    { group: 'Match end', key: 'lose', name: 'Lose', trigger: 'Match lost' },
    { group: 'Not in the spec', key: 'walk', name: 'Walk', trigger: 'No game trigger yet', extra: true },
  ];

  const JUMP_SHEET = 'from “Chibi Athlete Jump Animation Sprite Sheet.png”.';
  const NOTES = {
    jump: `All 10 frames ${JUMP_SHEET} Turn on “Keep jump height” to see the small lift drawn on the sheet; the game moves the sprite up itself.`,
    jump_start: `Frames 1–3 ${JUMP_SHEET}`,
    jump_up: `Frames 4–5 ${JUMP_SHEET}`,
    jump_down: `Frames 6–7 ${JUMP_SHEET}`,
    land: `Frames 8–10 ${JUMP_SHEET} Ends standing up, so it can blend straight into idle.`,
    skill: 'Probably “image-gen-1(20261021-215729).png”: an unnamed 6-frame charge and dash. The spec asks for 12 frames, with the skill firing on frame 8.',
    sprint: 'Two versions. Two frames in the second one overlap on the sheet, so one boot is clipped.',
    header: 'The ball is drawn into every frame, so it would double up with the game ball.',
    hit: 'The ball is drawn into frame 1.',
    stunned: 'The wobble lines are drawn in. The spec keeps effects as separate sprites.',
    celebrate: 'Two versions.',
    win: 'The sheet has labels and number badges on it. The viewer strips them out.',
    lose: 'Same sheet as Win.',
    walk: 'Top row of “Chibi Footballer Animation Sprite Sheet.png”.',
  };

  const ISSUES = [
    '<b>Every sheet uses a different scale.</b> The character is about 360 to 650 px tall depending on the sheet. The viewer resizes every animation to the same height. The game will need that too.',
    '<b>The jersey number “10”</b> is on the shorts in most frames and on the near thigh part. The engine mirrors the player on the right, so it will read “01”. The spec rules out numbers and text.',
    '<b>Swoosh-like mark on the boots</b> in “Chibi Football Character Parts Sheet.png”. It looks like a brand logo, which the spec rules out.',
    '<b>The ball is drawn into the frames</b> of the header and hit sheets.',
    '<b>Rig faces:</b> the rig expects a blank head plus separate eyes and mouth pieces. These sheets have whole heads with the face drawn in, so the viewer swaps the whole head. No head exists for shock, a blink or tongue-out.',
    '<b>Parts don’t match the rig templates.</b> Their sizes and joints differ from RIG_SPEC.md, so the viewer fits each part to the skeleton by estimate. Expect small gaps at the joints. Fit the parts to the templates in the Rig Lab before using them in the game.',
    '<b>The two leg sheets</b> are thigh, shin and boot pieces at fixed angles. The rig rotates the parts itself, so these only help if you hand-draw frames.',
  ];

  // ---------- Art ----------

  const loading = [];
  function loadImage(src, onLoad) {
    const img = new Image();
    loading.push(img);
    if (onLoad) img.addEventListener('load', () => onLoad(img));
    img.src = encodeURI(src);
    return img;
  }
  const ready = img => img.complete && img.naturalWidth > 0;

  const sheets = Object.fromEntries(DATA.anims.map(a => [a.id, loadImage(a.src)]));

  // Far-side limbs reuse the same art, drawn darker (as in js/rig/art.js).
  function darken(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(20, 24, 48, 0.3)';
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // Part sizes and pivots in rig units, in place of the FC.PARTS templates.
  const fitted = p => ({ size: [p.size[0] * p.k, p.size[1] * p.k], pivot: [p.pivot[0] * p.k, p.pivot[1] * p.k] });
  const LIMBS = ['upperArm', 'forearm', 'thigh', 'shin', 'boot'];
  const rigArt = { eyes: {}, mouth: {} }; // no face pieces: the heads have their faces drawn in
  const rigDefs = {};
  const heads = {};
  for (const [name, part] of Object.entries(DATA.rig.parts)) {
    if (name === 'heads') continue;
    rigDefs[name] = fitted(part);
    loadImage(part.src, img => {
      rigArt[name] = img;
      if (LIMBS.includes(name)) rigArt[name + '_dark'] = darken(img);
    });
  }
  for (const [name, part] of Object.entries(DATA.rig.parts.heads)) {
    heads[name] = { img: loadImage(part.src), def: fitted(part) };
  }

  const neutral = DATA.rig.parts.heads.neutral;
  const neck = FC.SKELETON.find(bone => bone.name === 'head').at;
  const RIG_HEIGHT = FC.HIP_HEIGHT - neck[1] + neutral.pivot[1] * neutral.k;
  const RIG_PX = DATA.idleHeight / RIG_HEIGHT; // strip px per rig unit, so both characters match

  // The rig picks eyes and mouth pieces; pick the whole head closest to them.
  function headFor({ eyes, mouth }) {
    if (eyes === 'dizzy') return 'dizzy';
    if (eyes === 'sad' || mouth === 'sad') return 'sad';
    if (eyes === 'angry' || mouth === 'grit') return 'angry';
    if (eyes === 'shock' || mouth === 'shout') return 'shout';
    if (eyes === 'happy' || (eyes === 'closed' && mouth === 'smile')) return 'wink';
    return 'neutral';
  }

  // ---------- Drawing ----------

  function drawSprite(ctx, anim, frame, x, ground, scale, { facing = 1, air = false, alpha = 1 } = {}) {
    const img = sheets[anim.id];
    if (!ready(img)) return;
    const [cw, ch] = anim.cell;
    const [ax, ay] = anim.anchor;
    const lift = air ? anim.lift[frame] : 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, ground - lift * scale);
    ctx.scale(facing * scale, scale);
    ctx.drawImage(img, frame * cw, 0, cw, ch, -ax, -ay, cw, ch);
    ctx.restore();
  }

  function drawRigPose(ctx, pose, x, ground, rigScale, { facing = 1, debug = false } = {}) {
    const head = heads[headFor(pose.face)];
    if (ready(head.img)) {
      rigArt.head = head.img;
      rigDefs.head = head.def;
    }
    const templates = FC.PARTS;
    FC.PARTS = rigDefs;
    try {
      FC.drawRig(ctx, rigArt, pose, x, ground, { facing, scale: rigScale, debug });
    } finally {
      FC.PARTS = templates;
    }
  }

  // x of a sprite's anchor so its cell is centred on cx.
  const spriteX = (anim, cx, scale, facing) => cx + facing * (anim.anchor[0] - anim.cell[0] / 2) * scale;

  function drawPlayer(ctx, player, cx, ground, scale, opts) {
    if (player.kind === 'sprite') {
      const a = player.anim;
      const x = spriteX(a, cx, scale, opts.facing);
      if (opts.onion) drawSprite(ctx, a, (player.frame + a.frames - 1) % a.frames, x, ground, scale, { ...opts, alpha: 0.28 });
      drawSprite(ctx, a, player.frame, x, ground, scale, opts);
    } else {
      const lift = (RIG_AIR[player.name] || 0) * RIG_PX * scale;
      drawRigPose(ctx, player.rig.pose, cx, ground - lift, RIG_PX * scale, opts);
    }
  }

  // One scale for every animation, so sizes compare between previews.
  function fitScale(w, ground) {
    let s = Infinity;
    for (const a of DATA.anims) {
      const up = a.anchor[1] + (a.air ? Math.max(...a.lift) : 0);
      s = Math.min(s, (ground - 6) / up, (w - 8) / a.cell[0]);
    }
    const rigUp = (RIG_HEIGHT + 40 + RIG_AIR.jump_up) * RIG_PX; // arms can rise above the head
    return Math.min(s, (ground - 6) / rigUp);
  }

  // ---------- Players ----------

  function frameAt(n, fps, loop, t) {
    if (loop) return Math.floor(t * fps) % n;
    return Math.min(Math.floor((t % (n / fps + HOLD)) * fps), n - 1);
  }

  class SpritePlayer {
    constructor(anim) {
      this.kind = 'sprite';
      this.anim = anim;
      this.fps = anim.fps;
      this.t = 0;
      this.frame = 0;
    }
    update(dt) {
      this.t += dt;
      this.frame = frameAt(this.anim.frames, this.fps, this.anim.loop, this.t);
    }
    seek(frame) {
      const n = this.anim.frames;
      this.frame = (frame + n) % n;
      this.t = this.frame / this.fps;
    }
    step(d) { this.seek(this.frame + d); }
  }

  class RigPlayer {
    constructor(name) {
      this.kind = 'rig';
      this.name = name;
      this.anim = FC.ANIMATIONS[name];
      this.rig = new FC.Rig();
      this.wait = 0;
      this.start(0);
    }
    start(blend = 0.08) {
      this.rig.play(this.name, { blend, onComplete: () => { this.wait = HOLD; } });
    }
    update(dt) {
      if (this.wait > 0 && (this.wait -= dt) <= 0) this.start();
      this.rig.update(dt);
    }
    get time() { return this.rig.base.time; }
    seek(t) {
      this.wait = 0;
      this.start(0);
      this.rig.update(t);
    }
    step(d) {
      const { duration, loop } = this.anim;
      let t = this.time + d / 24;
      t = loop ? (t + duration) % duration : Math.max(0, Math.min(duration, t));
      this.seek(t);
    }
  }

  // ---------- Action list with previews ----------

  const minis = [];
  const visible = new Set();
  const observer = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) visible.add(e.target.mini);
      else visible.delete(e.target.mini);
    }
  });

  function makeMini(player, caption) {
    const fig = document.createElement('figure');
    fig.className = 'preview';
    const canvas = document.createElement('canvas');
    canvas.width = MINI_W * dpr;
    canvas.height = MINI_H * dpr;
    const cap = document.createElement('figcaption');
    cap.innerHTML = caption;
    fig.append(canvas, cap);
    const mini = { fig, ctx: canvas.getContext('2d'), player };
    fig.mini = mini;
    fig.addEventListener('click', () => select(mini, true));
    observer.observe(fig);
    minis.push(mini);
    return fig;
  }

  function el(tag, className, html) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function statusOf(action, sprites) {
    if (action.extra) return ['extra', 'Extra: frame-by-frame only'];
    if (!sprites.length) return ['missing', 'No frame-by-frame art'];
    if (action.key === 'skill') return ['unclear', 'Unclear: unnamed sheet'];
    return ['ok', `Frame-by-frame ✓${sprites.length > 1 ? ` (${sprites.length} versions)` : ''}`];
  }

  function renderActions() {
    const list = $('actions');
    const spec = ACTIONS.filter(a => !a.extra);
    const counts = { ok: 0, missing: [], unclear: [] };
    let group = null;
    for (const action of ACTIONS) {
      if (action.group !== group) {
        group = action.group;
        list.append(el('div', 'group-title', group));
      }
      const sprites = DATA.anims.filter(a => a.action === action.key);
      const [status, label] = statusOf(action, sprites);
      if (status === 'ok') counts.ok++;
      if (status === 'missing') counts.missing.push(action.name);
      if (status === 'unclear') counts.unclear.push(action.name);

      const row = el('div', 'action');
      const info = el('div');
      info.append(
        el('h4', '', `${action.name} <code>${action.key}</code>`),
        el('p', '', action.trigger),
        el('p', `status ${status}`, label),
      );
      if (NOTES[action.key]) info.append(el('p', '', NOTES[action.key]));

      const previews = el('div', 'previews');
      for (const anim of sprites) {
        const time = (anim.frames / anim.fps).toFixed(2);
        previews.append(makeMini(new SpritePlayer(anim),
          `<b>Frame-by-frame</b><br>${anim.label} · ${anim.frames} frames · ${time} s`));
      }
      if (!sprites.length) previews.append(el('div', 'preview empty', 'No frame-by-frame art'));
      if (FC.ANIMATIONS[action.key]) {
        const anim = FC.ANIMATIONS[action.key];
        previews.append(makeMini(new RigPlayer(action.key),
          `<b>Skeleton rig</b><br>${action.key} · ${anim.duration} s${anim.loop ? ' loop' : ''}`));
      }
      row.append(info, previews);
      list.append(row);
    }

    const chips = [
      ['ok', `${counts.ok} of ${spec.length} actions have frame-by-frame art`],
      counts.missing.length && ['bad', `Missing: ${counts.missing.join(', ')}`],
      counts.unclear.length && ['warn', `Unclear: ${counts.unclear.join(', ')}`],
      ['', `All ${spec.length} play on the rig`],
    ];
    for (const [cls, text] of chips.filter(Boolean)) $('summary').append(el('span', `chip ${cls}`, text));
  }

  function renderSheets() {
    for (const text of ISSUES) $('issues').append(el('li', '', text));

    for (const still of DATA.stills) {
      const fig = el('figure');
      const img = new Image();
      img.loading = 'lazy';
      img.src = encodeURI(still.src);
      img.alt = still.file;
      fig.append(img, el('figcaption', '', `<b>${still.file}</b>${still.note}`));
      $('stills').append(fig);
    }

    const parts = Object.entries(DATA.rig.parts).filter(([name]) => name !== 'heads')
      .concat(Object.entries(DATA.rig.parts.heads).map(([name, p]) => [`head: ${name}`, p]));
    for (const [name, part] of parts) {
      const fig = el('figure');
      const img = new Image();
      img.src = encodeURI(part.src);
      img.alt = name;
      fig.append(img, el('figcaption', '', name));
      $('rig-parts').append(fig);
    }
  }

  // ---------- Stage ----------

  const canvas = $('stage');
  const ctx = canvas.getContext('2d');
  const view = { playing: true, speed: 1, flip: false, onion: false, air: false, guides: false, light: false };
  let current = null; // the stage's player
  let selected = null; // the mini it came from
  let stage = { w: 0, h: 0, ground: 0, scale: 1 };
  let thumbs = [];
  let thumbsDrawn = false;

  function resize() {
    const w = canvas.clientWidth;
    const h = Math.round(w * 0.75);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ground = Math.round(h * 0.88);
    stage = { w, h, ground, scale: Math.min(fitScale(w, ground), (h * 0.62) / DATA.idleHeight) };
  }

  function select(mini, scroll) {
    if (selected) selected.fig.classList.remove('on');
    selected = mini;
    mini.fig.classList.add('on');
    const p = mini.player;
    current = p.kind === 'sprite' ? new SpritePlayer(p.anim) : new RigPlayer(p.name);
    view.air = p.kind === 'sprite' && p.anim.air;
    $('air').checked = view.air;
    $('fps').value = p.kind === 'sprite' ? p.anim.fps : '';
    $('fps').disabled = $('onion').disabled = $('air').disabled = p.kind !== 'sprite';
    buildStrip();
    if (scroll && window.matchMedia('(max-width: 980px)').matches) canvas.scrollIntoView({ behavior: 'smooth' });
  }

  function buildStrip() {
    const strip = $('strip');
    strip.textContent = '';
    const n = current.kind === 'sprite' ? current.anim.frames : 8;
    thumbs = [];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('canvas');
      c.className = 'thumb';
      c.width = THUMB_W * dpr;
      c.height = THUMB_H * dpr;
      c.title = current.kind === 'sprite' ? `Frame ${i + 1}` : `Pose at ${(momentOf(i)).toFixed(2)} s`;
      c.addEventListener('click', () => {
        setPlaying(false);
        current.seek(current.kind === 'sprite' ? i : momentOf(i));
      });
      thumbs.push(c);
      strip.append(c);
    }
    thumbsDrawn = false;
  }

  // 8 moments of a rig animation, including the last pose of a one-shot.
  const momentOf = i => current.anim.duration * i / (current.anim.loop ? 8 : 7);

  function drawThumbs() {
    if (!loading.every(img => img.complete)) return;
    for (let i = 0; i < thumbs.length; i++) {
      const g = thumbs[i].getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, THUMB_W, THUMB_H);
      if (current.kind === 'sprite') {
        const a = current.anim;
        const s = Math.min((THUMB_W - 4) / a.cell[0], (THUMB_H - 6) / a.cell[1]);
        drawSprite(g, a, i, spriteX(a, THUMB_W / 2, s, 1), THUMB_H - 3, s);
      } else {
        const s = (THUMB_H - 8) / (RIG_HEIGHT + 40);
        drawRigPose(g, FC.poseAt(current.name, momentOf(i)), THUMB_W / 2, THUMB_H - 3, s);
      }
    }
    thumbsDrawn = true;
  }

  function drawStage() {
    const { w, h, ground, scale } = stage;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = view.light ? '#e9ebf0' : '#1d2029';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = view.light ? '#d6d9e0' : '#181a22';
    ctx.fillRect(0, ground, w, h - ground);
    ctx.strokeStyle = view.light ? '#b4b8c2' : '#343947';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, ground + 0.5);
    ctx.lineTo(w, ground + 0.5);
    ctx.stroke();
    if (!current) return;

    const facing = view.flip ? -1 : 1;
    drawPlayer(ctx, current, w / 2, ground, scale, { facing, air: view.air, onion: view.onion, debug: view.guides });

    if (view.guides && current.kind === 'sprite') {
      const a = current.anim;
      const x = spriteX(a, w / 2, scale, facing);
      const y = ground - (view.air ? a.lift[current.frame] : 0) * scale;
      ctx.strokeStyle = 'rgba(255, 176, 32, 0.8)';
      ctx.strokeRect(w / 2 - a.cell[0] * scale / 2, y - a.anchor[1] * scale, a.cell[0] * scale, a.cell[1] * scale);
      ctx.beginPath();
      ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y);
      ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10);
      ctx.stroke();
    }
  }

  let lastInfo = '';
  function updateInfo() {
    let html;
    if (current.kind === 'sprite') {
      const a = current.anim;
      const r = a.rects[current.frame];
      html = `<b>${a.label}</b> · frame ${current.frame + 1} / ${a.frames} · ${current.fps} fps · `
        + `${(a.frames / current.fps).toFixed(2)} s ${a.loop ? 'loop' : 'once'}<br>`
        + `${a.sheet} · frame at x ${r[0]}, y ${r[1]}, ${r[2]}×${r[3]} px`;
      thumbs.forEach((t, i) => t.classList.toggle('on', i === current.frame));
    } else {
      const { duration, loop, events } = current.anim;
      const ev = Object.entries(events || {}).map(([name, t]) => `${name} at ${t} s`).join(', ');
      html = `<b>Skeleton rig: ${current.name}</b> · ${current.time.toFixed(2)} / ${duration} s ${loop ? 'loop' : 'once'}`
        + `${ev ? ` · ${ev}` : ''}<br>Parts from ${DATA.rig.sources.join(', ')}`;
    }
    if (html !== lastInfo) $('info').innerHTML = lastInfo = html;
  }

  // ---------- Controls ----------

  function setPlaying(on) {
    view.playing = on;
    $('play').textContent = on ? 'Pause' : 'Play';
  }

  function step(d) {
    setPlaying(false);
    current.step(d);
  }

  $('play').addEventListener('click', () => setPlaying(!view.playing));
  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
  $('speed').addEventListener('change', e => { view.speed = Number(e.target.value); });
  $('fps').addEventListener('change', e => {
    const fps = Math.max(1, Math.min(60, Number(e.target.value) || 1));
    if (current.kind === 'sprite') current.fps = fps;
    e.target.value = fps;
  });
  for (const id of ['flip', 'onion', 'air', 'guides', 'light']) {
    $(id).addEventListener('change', e => { view[id] = e.target.checked; });
  }
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, select, button')) return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!view.playing); }
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  window.addEventListener('resize', resize);

  // ---------- Loop ----------

  let miniScale = 1;
  let last = performance.now();
  function frame(now) {
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.1));
    last = now;

    for (const mini of minis) mini.player.update(dt);
    for (const mini of visible) {
      const g = mini.ctx;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, MINI_W, MINI_H);
      g.fillStyle = '#181a22';
      g.fillRect(0, MINI_GROUND, MINI_W, MINI_H - MINI_GROUND);
      drawPlayer(g, mini.player, MINI_W / 2, MINI_GROUND, miniScale, { facing: 1, air: mini.player.anim.air });
    }

    if (current) {
      if (view.playing) current.update(dt * view.speed);
      if (!thumbsDrawn) drawThumbs();
      updateInfo();
    }
    drawStage();
    requestAnimationFrame(frame);
  }

  renderActions();
  renderSheets();
  miniScale = fitScale(MINI_W, MINI_GROUND);
  resize();
  select(minis[0], false);
  requestAnimationFrame(frame);
})();
