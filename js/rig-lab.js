// Rig Lab: preview every character animation, check imported parts and
// download the part templates.
(function () {
  const W = 1280, H = 720, GROUND = 600;
  const JUMP_SPEED = 900; // game px/s
  const GRAVITY = 2600;   // game px/s²
  const BALL_RADIUS = 64; // rig units (~20 px in game, as in the reference screenshots)
  const BALL_AHEAD = 165; // ball centre in front of the player at kick height, rig units
  const CLOSE_UP_SCALE = 0.9;
  const STRIP_SCALE = 0.42;
  const GROUPS = {
    Movement: ['idle', 'run', 'run_back', 'sprint'],
    Jump: ['jump_start', 'jump_up', 'jump_down', 'land'],
    Actions: ['kick_low', 'kick_high', 'air_kick', 'header', 'skill'],
    Reactions: ['hit', 'stunned'],
    'Match end': ['celebrate', 'sad', 'win', 'lose'],
  };
  const ACTION_KEYS = { j: 'kick_low', k: 'kick_high', i: 'skill', h: 'header', l: 'jump' };

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  const view = { speed: 1, bones: false, strip: false, zoom: false, selected: 'idle' };
  const eventLog = [];

  const players = FC.CHARACTERS.slice(0, 2).map((character, i) => {
    const { art, status } = FC.loadCharacterArt(character, renderArtStatus);
    const p = {
      character, art, status,
      rig: new FC.Rig(),
      x: i === 0 ? 440 : 840,
      facing: i === 0 ? 1 : -1,
      y: 0, vy: 0, airborne: false,
      loop: 'idle',
      flash: 0,
    };
    p.rig.onEvent = (name, anim) => {
      p.flash = 0.18;
      if (i === 0) logEvent(`${anim} → ${name}`);
    };
    p.rig.play('idle');
    return p;
  });

  function playOn(p, name) {
    const anim = FC.ANIMATIONS[name];
    if (anim.loop) {
      p.loop = name;
      p.rig.play(name);
      return;
    }
    p.rig.play(name, { onComplete: () => p.rig.play(p.airborne ? 'jump_down' : p.loop, { blend: 0.12 }) });
  }

  function jump(p) {
    if (p.airborne || p.rig.base.name === 'jump_start') return;
    p.rig.play('jump_start', {
      onComplete: () => {
        p.airborne = true;
        p.vy = -JUMP_SPEED;
        p.rig.play('jump_up', { blend: 0.05 });
      },
    });
  }

  function action(name) {
    for (const p of players) {
      if (name === 'jump') jump(p);
      else if (name === 'header' && p.airborne) p.rig.playOverlay('header');
      else if ((name === 'kick_low' || name === 'kick_high') && p.airborne) playOn(p, 'air_kick');
      else playOn(p, name);
    }
  }

  function step(p, dt) {
    if (p.airborne) {
      p.vy += GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.vy > 0 && p.rig.base.name === 'jump_up') p.rig.play('jump_down', { blend: 0.15 });
      if (p.y >= 0) {
        p.y = 0;
        p.vy = 0;
        p.airborne = false;
        p.rig.play('land', { blend: 0.04, onComplete: () => p.rig.play(p.loop, { blend: 0.1 }) });
      }
    }
    p.flash = Math.max(0, p.flash - dt);
    p.rig.update(dt);
  }

  // ---- Keyboard -------------------------------------------------------------

  const held = new Set();

  function updateMove() {
    const loop = held.has('d') ? (held.has('shift') ? 'sprint' : 'run') : held.has('a') ? 'run_back' : 'idle';
    for (const p of players) {
      if (p.loop === loop) continue;
      p.loop = loop;
      if (FC.ANIMATIONS[p.rig.base.name].loop && !p.airborne) p.rig.play(loop);
    }
  }

  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key === 'a' || key === 'd' || key === 'shift') {
      held.add(key);
      updateMove();
    } else if (!e.repeat && ACTION_KEYS[key]) {
      action(ACTION_KEYS[key]);
    }
  });

  window.addEventListener('keyup', e => {
    held.delete(e.key.toLowerCase());
    updateMove();
  });

  window.addEventListener('blur', () => {
    held.clear();
    updateMove();
  });

  // ---- Panel ----------------------------------------------------------------

  const buttonBox = document.getElementById('anim-buttons');
  for (const [group, names] of Object.entries(GROUPS)) {
    const title = document.createElement('h3');
    title.textContent = group;
    const row = document.createElement('div');
    row.className = 'row';
    for (const name of names) row.append(makeButton(name, () => select(name), name));
    buttonBox.append(title, row);
  }

  function makeButton(label, onClick, anim) {
    const b = document.createElement('button');
    b.textContent = label;
    if (anim) b.dataset.anim = anim;
    b.addEventListener('click', onClick);
    return b;
  }

  function select(name) {
    view.selected = name;
    buttonBox.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.anim === name));
    for (const p of players) {
      p.airborne = false;
      p.y = 0;
      p.vy = 0;
      playOn(p, name);
    }
    const anim = FC.ANIMATIONS[name];
    const events = Object.entries(anim.events || {}).map(([e, t]) => `${e} at ${t}s`).join(', ');
    document.getElementById('anim-info').textContent =
      `${name}: ${anim.duration}s, ${anim.loop ? 'loops' : 'plays once'}${events ? `, ${events}` : ''}`;
  }

  const speed = document.getElementById('speed');
  speed.addEventListener('input', () => {
    view.speed = Number(speed.value);
    document.getElementById('speed-out').textContent = `${view.speed.toFixed(1)}×`;
  });
  for (const id of ['bones', 'strip', 'zoom']) {
    document.getElementById(id).addEventListener('change', e => { view[id] = e.target.checked; });
  }

  function logEvent(text) {
    eventLog.unshift(text);
    eventLog.length = Math.min(eventLog.length, 6);
    document.getElementById('events').innerHTML = eventLog.map(t => `<li>${t}</li>`).join('');
  }

  const sheets = document.getElementById('sheets');
  sheets.append(
    makeButton('Body parts sheet', () => FC.downloadCanvas(FC.templateSheet('body'), 'template_body_parts.png')),
    makeButton('Face sheet', () => FC.downloadCanvas(FC.templateSheet('face'), 'template_face.png')),
  );
  const guideBox = document.getElementById('guides');
  for (const name of [...Object.keys(FC.PARTS), ...Object.keys(FC.FACE)]) {
    guideBox.append(makeButton(name, () => FC.downloadCanvas(FC.templateGuide(name), `guide_${name}.png`)));
  }

  function renderArtStatus() {
    const html = players.map(p => {
      const entries = Object.entries(p.status);
      const found = entries.filter(([, s]) => s.state !== 'placeholder').length;
      const list = entries.map(([file, s]) => `<li class="${s.state}">${file}: ${s.text}</li>`).join('');
      return `<h3>${p.character.name}</h3>
        <p class="small">${found} of ${entries.length} PNGs found in assets/characters/${p.character.id}/</p>
        <details><summary>Files</summary><ul>${list}</ul></details>`;
    }).join('');
    document.getElementById('art-status').innerHTML = html;
  }

  // ---- Drawing --------------------------------------------------------------

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#6fc0ee');
    sky.addColorStop(1, '#d4efff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND);
    ctx.fillStyle = '#5c6bc0';
    ctx.fillRect(0, GROUND - 190, W, 130);
    ctx.fillStyle = '#3949ab';
    ctx.fillRect(0, GROUND - 60, W, 60);
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#43a047';
    for (let x = 0; x < W; x += 160) ctx.fillRect(x, GROUND, 80, H - GROUND);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(0, GROUND - 2, W, 4);
  }

  function drawPlayer(p, x, scale) {
    const height = Math.min(1, -p.y / 300);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(x, GROUND, 90 * scale * (1 - height * 0.5), 16 * scale * (1 - height * 0.5), 0, 0, Math.PI * 2);
    ctx.fill();

    p.rig.draw(ctx, p.art, x, GROUND + p.y, { facing: p.facing, scale, debug: view.bones });

    // Ball-sized marker at kick height; it lights up on contact/release events.
    ctx.beginPath();
    ctx.arc(x + p.facing * BALL_AHEAD * scale, GROUND - BALL_RADIUS * scale, BALL_RADIUS * scale, 0, Math.PI * 2);
    ctx.fillStyle = p.flash > 0 ? 'rgba(255, 176, 32, 0.85)' : 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(27, 27, 27, 0.6)';
    ctx.stroke();
  }

  function drawStrip() {
    const name = view.selected;
    const anim = FC.ANIMATIONS[name];
    const n = 8;
    const p = players[0];
    ctx.fillStyle = '#1b1b1b';
    ctx.textAlign = 'center';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText(`${name}: 8 moments (the game draws every frame in between)`, W / 2, 50);
    ctx.font = '600 16px system-ui, sans-serif';
    for (let i = 0; i < n; i++) {
      const t = anim.loop ? (anim.duration * i) / n : (anim.duration * i) / (n - 1);
      const x = 90 + i * 157;
      FC.drawRig(ctx, p.art, FC.poseAt(name, t), x, GROUND, { scale: STRIP_SCALE, debug: view.bones });
      ctx.fillStyle = '#fff';
      ctx.fillText(`${t.toFixed(2)}s`, x, GROUND + 40);
    }
    ctx.textAlign = 'left';
  }

  let last = performance.now();
  function frame(now) {
    const dt = (Math.min(0.05, (now - last) / 1000)) * view.speed;
    last = now;
    players.forEach(p => step(p, dt));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();
    if (view.strip) drawStrip();
    else if (view.zoom) drawPlayer(players[0], W / 2 - 80, CLOSE_UP_SCALE);
    else players.forEach(p => drawPlayer(p, p.x, FC.ART_SCALE));
    requestAnimationFrame(frame);
  }

  renderArtStatus();
  select('idle');
  requestAnimationFrame(frame);
})();
