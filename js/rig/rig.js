// Cut-out character rig: samples keyframe animations, solves leg IK, blends
// between animations and draws the parts with forward kinematics.
(function () {
  const DEG = Math.PI / 180;
  const BONES = Object.fromEntries(FC.SKELETON.map(bone => [bone.name, bone]));
  const BONE_NAMES = FC.SKELETON.map(bone => bone.name);
  const CHANNELS = ['r', 'x', 'y', 'sx', 'sy'];
  const OVERLAY_FADE_IN = 0.06;
  const OVERLAY_FADE_OUT = 0.08;

  const EASE = {
    linear: k => k,
    in: k => k * k,
    out: k => 1 - (1 - k) * (1 - k),
    inOut: k => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k)),
    back: k => { const s = 1.70158; k -= 1; return k * k * ((s + 1) * k + s) + 1; },
  };

  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function sampleTrack(track, t) {
    let i = 0;
    while (i < track.length - 1 && track[i + 1][0] <= t) i++;
    const [t0, v0] = track[i];
    if (i === track.length - 1 || t <= t0 || typeof v0 === 'string') return v0;
    const [t1, v1, ease = 'inOut'] = track[i + 1];
    const k = EASE[ease]((t - t0) / (t1 - t0));
    return Array.isArray(v0) ? v0.map((v, j) => lerp(v, v1[j], k)) : lerp(v0, v1, k);
  }

  function sampleChannels(anim, t, withStance) {
    const ch = {};
    if (withStance) {
      Object.assign(ch, FC.STANCE);
      // An animation that drives a leg directly replaces the stance's foot target.
      if (anim.tracks['thighF.r']) delete ch.ikF;
      if (anim.tracks['thighB.r']) delete ch.ikB;
    }
    for (const key in anim.tracks) ch[key] = sampleTrack(anim.tracks[key], t);
    return ch;
  }

  // Two-bone IK: thigh and shin rotations that put the ankle on the target,
  // with the knee bending forward.
  function solveLeg(from, to) {
    const { thigh: L1, shin: L2 } = FC.LEG;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.01);
    const aim = Math.atan2(-dx, dy);
    const hip = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
    const knee = Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2));
    return [aim - hip, Math.PI - knee];
  }

  function resolvePose(ch) {
    const pose = { face: { eyes: ch.eyes || 'open', mouth: ch.mouth || 'neutral' } };
    for (const name of BONE_NAMES) {
      pose[name] = {
        r: (ch[name + '.r'] || 0) * DEG,
        x: ch[name + '.x'] || 0,
        y: ch[name + '.y'] || 0,
        sx: ch[name + '.sx'] ?? 1,
        sy: ch[name + '.sy'] ?? 1,
      };
    }
    for (const side of ['F', 'B']) {
      const target = ch['ik' + side];
      if (!target) continue;
      const thigh = BONES['thigh' + side];
      const from = [pose.hip.x + thigh.at[0], BONES.hip.at[1] + pose.hip.y + thigh.at[1]];
      const [thighR, shinR] = solveLeg(from, target);
      pose['thigh' + side].r = thighR;
      pose['shin' + side].r = shinR;
      // With IK the boot track is relative to the ground, so feet stay flat by default.
      pose['boot' + side].r -= thighR + shinR;
    }
    return pose;
  }

  function blendPose(a, b, k, bones = BONE_NAMES) {
    const out = { ...a, face: k < 0.5 ? a.face : b.face };
    for (const name of bones) {
      const p = {};
      for (const c of CHANNELS) p[c] = lerp(a[name][c], b[name][c], k);
      out[name] = p;
    }
    return out;
  }

  function touchedBones(anim) {
    const bones = new Set();
    for (const key in anim.tracks) {
      if (key === 'ikF' || key === 'ikB') ['thigh', 'shin', 'boot'].forEach(p => bones.add(p + key[2]));
      else if (key.includes('.')) bones.add(key.split('.')[0]);
    }
    return [...bones];
  }

  function animation(name) {
    const anim = FC.ANIMATIONS[name];
    if (!anim) throw new Error(`Unknown animation "${name}"`);
    return anim;
  }

  class Rig {
    constructor() {
      this.base = null;
      this.overlay = null;
      this.pose = resolvePose(FC.STANCE);
      this.blinkIn = 2 + Math.random() * 3;
      this.blinkLeft = 0;
      this.onEvent = null; // (eventName, animationName) => {}
    }

    // Replaces the main animation, blending from the current pose.
    play(name, { blend = 0.08, onComplete } = {}) {
      this.base = { name, anim: animation(name), time: 0, age: 0, done: false, onComplete, from: this.pose, blend };
    }

    // Plays on top of the main animation, only on the bones it animates
    // (e.g. a header while jumping).
    playOverlay(name, { onComplete } = {}) {
      const anim = animation(name);
      this.overlay = { name, anim, time: 0, age: 0, done: false, onComplete, bones: touchedBones(anim) };
    }

    update(dt) {
      if (this.base) this._advance(this.base, dt);
      if (this.overlay) this._advance(this.overlay, dt);
      this.pose = this._compose();
      this._blink(dt);
    }

    draw(ctx, art, x, y, options) {
      FC.drawRig(ctx, art, this.pose, x, y, options);
    }

    _advance(layer, dt) {
      const { anim } = layer;
      const prev = layer.time;
      let now = prev + dt;
      layer.age += dt;
      if (anim.loop && now >= anim.duration) {
        this._fire(layer, prev, anim.duration);
        now %= anim.duration;
        this._fire(layer, -1, now);
      } else {
        now = Math.min(now, anim.duration);
        this._fire(layer, prev, now);
      }
      layer.time = now;
      if (!anim.loop && now >= anim.duration && !layer.done) {
        layer.done = true;
        if (layer.onComplete) layer.onComplete();
      }
    }

    _fire(layer, from, to) {
      if (!this.onEvent) return;
      for (const [name, t] of Object.entries(layer.anim.events || {})) {
        if (t > from && t <= to) this.onEvent(name, layer.name);
      }
    }

    _compose() {
      const base = this.base;
      let pose = resolvePose(base ? sampleChannels(base.anim, base.time, true) : FC.STANCE);
      if (base && base.age < base.blend) pose = blendPose(base.from, pose, EASE.inOut(base.age / base.blend));

      const top = this.overlay;
      if (top) {
        const fadeOut = top.anim.loop ? 1 : (top.anim.duration - top.time) / OVERLAY_FADE_OUT;
        const w = clamp(Math.min(top.age / OVERLAY_FADE_IN, fadeOut), 0, 1);
        const topPose = resolvePose(sampleChannels(top.anim, top.time, false));
        const face = pose.face;
        pose = blendPose(pose, topPose, w, top.bones);
        pose.face = w < 0.5 ? face : {
          eyes: top.anim.tracks.eyes ? topPose.face.eyes : face.eyes,
          mouth: top.anim.tracks.mouth ? topPose.face.mouth : face.mouth,
        };
        if (top.done) this.overlay = null;
      }
      return pose;
    }

    _blink(dt) {
      if (this.pose.face.eyes !== 'open') return;
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blinkLeft = 0.12;
        this.blinkIn = 2 + Math.random() * 3;
      }
      if (this.blinkLeft > 0) {
        this.blinkLeft -= dt;
        this.pose.face = { ...this.pose.face, eyes: 'closed' };
      }
    }
  }

  // Canvas matrices: [a, b, c, d, e, f].
  function mul(m, n) {
    return [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  }

  function local(tx, ty, r, sx, sy) {
    const c = Math.cos(r);
    const s = Math.sin(r);
    return [c * sx, s * sx, -s * sy, c * sy, tx, ty];
  }

  // Draws a pose with its ground point at (x, y). facing: 1 = right, -1 = left.
  FC.drawRig = function (ctx, art, pose, x, y, { facing = 1, scale = FC.ART_SCALE, debug = false } = {}) {
    const v = ctx.getTransform();
    const view = [v.a, v.b, v.c, v.d, v.e, v.f];
    const world = {};
    for (const bone of FC.SKELETON) {
      const p = pose[bone.name];
      const at = bone.at || [0, 0];
      const m = local(at[0] + p.x, at[1] + p.y, p.r, p.sx, p.sy);
      world[bone.name] = mul(bone.parent ? world[bone.parent] : [facing * scale, 0, 0, scale, x, y], m);
    }

    for (const name of FC.DRAW_ORDER) {
      const bone = BONES[name];
      let def, img;
      if (bone.slot) {
        def = FC.FACE[bone.slot];
        img = art[bone.slot][pose.face[bone.slot]];
      } else {
        def = FC.PARTS[bone.part];
        img = art[bone.back ? bone.part + '_dark' : bone.part];
      }
      if (!img) continue;
      ctx.setTransform(...mul(view, world[name]));
      ctx.drawImage(img, -def.pivot[0], -def.pivot[1], def.size[0], def.size[1]);
    }
    ctx.setTransform(v);

    if (debug) drawBones(ctx, world);
  };

  function drawBones(ctx, world) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.9)';
    ctx.fillStyle = '#ff1744';
    for (const bone of FC.SKELETON) {
      const m = world[bone.name];
      if (bone.parent) {
        const p = world[bone.parent];
        ctx.beginPath();
        ctx.moveTo(p[4], p[5]);
        ctx.lineTo(m[4], m[5]);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(m[4], m[5], 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // The pose an animation has at time t, without blending (for pose strips).
  FC.poseAt = (name, t) => resolvePose(sampleChannels(animation(name), t, true));
  FC.Rig = Rig;
  FC.EASE = EASE;
})();
