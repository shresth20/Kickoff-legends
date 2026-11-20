/* A goal: crossbar + back post the ball bounces off, a goal-line test, and its art.
 *
 * Perspective art (goal_left / goal_right, sliced from goal-net-*.png by tools/slice-sheet.mjs) is
 * two layers that sandwich the players and the ball: the back layer (far frame, roof net) behind
 * them and the near side panel in front, so a ball in the goal sits behind the near netting. The
 * near net ripples when a goal goes in, and twitches when the ball clatters the frame. The layers
 * are placed by the anchors measured on the art (frame.customData.goal): the mouth, crossbar top
 * and ground at mid-depth line up with the physics below.
 * Side-view art (goal_right + goal_net_shake: older atlases and the placeholder) still works. */
window.KL = window.KL || {};

KL.GOAL_DEPTH = { back: 9, near: 15 }; // players are 10–11, the ball 20 (14 behind a near net)

KL.Goal = class Goal {
  constructor(scene, side) {
    const G = KL.TUNING.goal;
    const W = KL.TUNING.world;
    const dir = side === 'left' ? 1 : -1;
    const baseX = side === 'left' ? W.wallPadding : W.width - W.wallPadding;
    this.scene = scene;
    this.side = side;
    this.key = side === 'left' ? 'goal_left' : 'goal_right';
    const frontX = baseX + dir * G.width; // front post (the goal mouth)
    // the whole ball must cross the line
    this.lineX = baseX + dir * (G.width - KL.TUNING.ball.radius);

    if (scene.textures.get('props').has(`${this.key}/back`)) this.buildLayered(scene, frontX);
    else this.buildSideView(scene, frontX, dir);

    const topY = W.groundY - G.openingHeight;
    this.statics = scene.physics.add.staticGroup();
    const bar = (this.bar = this.statics.create(baseX + dir * (G.width / 2), topY - G.crossbarThickness / 2, '__DEFAULT').setVisible(false));
    bar.setDisplaySize(G.width, G.crossbarThickness).refreshBody();
    const post = (this.post = this.statics.create(baseX + dir * 4, W.groundY - G.openingHeight / 2 - 4, '__DEFAULT').setVisible(false));
    post.setDisplaySize(10, G.openingHeight + 8).refreshBody();
  }

  /** Perspective goal: back layer + near side panel, scaled so the mid-depth opening fits the physics. */
  buildLayered(scene, frontX) {
    const G = KL.TUNING.goal;
    const W = KL.TUNING.world;
    this.back = scene.add.image(frontX, W.groundY, 'props', `${this.key}/back`);
    const a = this.back.frame.customData.goal; // fractions of the frame
    const fw = this.back.frame.realWidth, fh = this.back.frame.realHeight;
    const s = (G.openingHeight + G.crossbarThickness) / ((a.groundY - a.barY) * fh);
    this.back.setOrigin(a.mouthX, a.groundY).setScale(s).setDepth(KL.GOAL_DEPTH.back);
    // near frames are trimmed inside the same frame size, so the same origin + scale line them up
    this.sprite = scene.add.sprite(frontX, W.groundY, 'props', `${this.key}/near/00`).setOrigin(a.mouthX, a.groundY).setScale(s).setDepth(KL.GOAL_DEPTH.near);
    const x = (f) => frontX + (f - a.mouthX) * fw * s;
    const y = (f) => W.groundY + (f - a.groundY) * fh * s;
    this.nearRect = new Phaser.Geom.Rectangle(x(a.near[0]), y(a.near[1]), x(a.near[2]) - x(a.near[0]), y(a.near[3]) - y(a.near[1]));
    if (a.posts?.length) this.dress(scene, a.posts.map((p) => ({ x: x(p.x), y: y(p.y), near: p.near })));

    const frame = (i) => ({ key: 'props', frame: `${this.key}/near/${String(i).padStart(2, '0')}` });
    if (!scene.anims.exists(`${this.key}/ripple`)) {
      // goal: the net swings back and forth twice and settles · bump: one small twitch
      scene.anims.create({ key: `${this.key}/ripple`, frames: [1, 2, 3, 4, 0].map(frame), frameRate: 16 * KL.animPace(), repeat: 1 });
      scene.anims.create({ key: `${this.key}/bump`, frames: [3, 4, 0].map(frame), frameRate: 16 * KL.animPace() });
    }
  }

  /**
   * The goalmouth as it looks after a season: turf worn to brown earth between the posts (with a
   * few islands of grass left), and tufts of grass where each post meets the ground. Drawn in code at
   * device resolution, from a fixed seed per goal so it looks the same every match.
   */
  dress(scene, posts) {
    const R = KL.RES;
    const W = KL.TUNING.world;
    const night = !!scene.cfg?.night;
    const rand = KL.Goal.seeded(this.side === 'left' ? 7 : 11);
    // worn earth: the ground from the far posts to the near ones, from the back of the goal out past
    // the mouth, where the keeper stands
    const xs = posts.map((p) => p.x), ys = posts.map((p) => p.y);
    const out = 34, back = 8; // px past the mouth (field side) / past the back posts
    const left = Math.min(...xs) - (this.side === 'left' ? back : out), right = Math.max(...xs) + (this.side === 'left' ? out : back);
    const top = Math.min(...ys, W.groundY - 14) - 8, bottom = Math.max(...ys) + 10;
    const w = right - left, h = bottom - top;
    const dirtKey = `kl:goal:dirt:${this.side}:${Math.round(w)}x${Math.round(h)}:${R}`;
    if (!scene.textures.exists(dirtKey)) scene.textures.addImage(dirtKey, KL.Goal.drawDirt(w * R, h * R, rand, R));
    // under the night shade like the rest of the pitch, under the shadows
    scene.add.image(left, top, dirtKey).setOrigin(0, 0).setScale(1 / R).setDepth(3.2);

    const tuftKey = KL.Goal.tuftTexture(scene);
    const tuft = (px, py, size, depth, frame) => {
      const img = scene.add.image(px, py, tuftKey, frame).setOrigin(0.5, 0.86).setScale(size / (40 * R)).setDepth(depth);
      if (night) img.setTint(0x9aa2c4); // floodlit grass, like the shaded pitch around it
      return img;
    };
    // a tuft at the foot of every post: in front of the near panel for its posts, behind the players for the far one
    posts.forEach((p, i) => tuft(p.x, p.y + 2, p.near ? 32 : 25, p.near ? KL.GOAL_DEPTH.near + 0.5 : KL.GOAL_DEPTH.back + 0.5, i % 3));
    // and a couple of stray ones in the worn patch
    for (let i = 0; i < 2; i++) tuft(left + w * (0.25 + 0.4 * rand()), top + h * (0.45 + 0.3 * rand()), 14 + 6 * rand(), 3.3, (i + 1) % 3);
  }

  /** Small deterministic PRNG (mulberry32): the same goalmouth every match. */
  static seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Worn earth patch, cel-shaded like the pitch art: a ragged brown blob with a darker rim and grass islands. */
  static drawDirt(w, h, rand, R) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    const ctx = c.getContext('2d');
    /** A ragged ellipse: n points with jittered radius, `inset` px pulled in (for an inner fill). */
    const blob = (cx, cy, rx, ry, rough, n = 22) => {
      const jitter = Array.from({ length: n }, () => 1 - rough / 2 + rough * rand());
      return (inset = 0) => {
        const kx = Math.max(0, 1 - inset / rx), ky = Math.max(0, 1 - inset / ry);
        const pts = jitter.map((k, i) => {
          const t = (i / n) * Math.PI * 2;
          return [cx + Math.cos(t) * rx * k * kx, cy + Math.sin(t) * ry * k * ky];
        });
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const p = pts[i % n], q = pts[(i + 1) % n];
          const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
          if (i === 0) ctx.moveTo(mx, my);
          else ctx.quadraticCurveTo(p[0], p[1], mx, my);
        }
        ctx.closePath();
      };
    };
    // a few overlapping lumps make one ragged patch: filled dark, then again a little smaller in
    // the earth colour, so only the patch's outer edge keeps a dark rim
    const lumps = [[0.5, 0.55, 0.47, 0.42], [0.3, 0.5, 0.26, 0.4], [0.7, 0.6, 0.25, 0.36], [0.5, 0.4, 0.3, 0.3]].map(([fx, fy, rx, ry]) => blob(w * fx, h * fy, w * rx, h * ry, 0.22));
    ctx.fillStyle = '#6a3f22';
    for (const trace of lumps) (trace(), ctx.fill());
    ctx.fillStyle = '#8a5835';
    for (const trace of lumps) (trace(2.5 * R), ctx.fill());
    // lighter, drier clumps
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(176,118,74,0.65)';
    for (let i = 0; i < 5; i++) (blob(w * (0.2 + 0.6 * rand()), h * (0.3 + 0.4 * rand()), w * (0.04 + 0.05 * rand()), h * (0.08 + 0.08 * rand()), 0.3, 10)(), ctx.fill());
    // islands where the grass held on: the pitch shows through
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 4; i++) (blob(w * (0.15 + 0.7 * rand()), h * (0.25 + 0.5 * rand()), w * (0.03 + 0.05 * rand()), h * (0.1 + 0.12 * rand()), 0.35, 10)(), ctx.fill());
    return c;
  }

  /** Three grass-tuft variants (frames 0–2), 40 × 30 px each: a fan of pointed blades, dark behind, lighter in front. */
  static tuftTexture(scene) {
    const R = KL.RES;
    const key = `kl:goal:tuft:${R}`;
    if (scene.textures.exists(key)) return key;
    const fw = 40 * R, fh = 30 * R;
    const c = document.createElement('canvas');
    c.width = fw * 3;
    c.height = fh;
    const ctx = c.getContext('2d');
    const rand = KL.Goal.seeded(3);
    for (let v = 0; v < 3; v++) {
      const cx = v * fw + fw / 2, base = fh * 0.86;
      ctx.fillStyle = 'rgba(20,55,35,0.35)'; // where it meets the ground
      ctx.beginPath();
      ctx.ellipse(cx, base, fw * 0.36, fh * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const [color, count, spread, tall] of [['#22684d', 7, 1.25, 0.95], ['#2f8a63', 6, 1.0, 0.8], ['#3ea476', 3, 0.6, 0.6]]) {
        ctx.fillStyle = color;
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0.5 : i / (count - 1);
          const ang = (t - 0.5) * 2 * spread + (rand() - 0.5) * 0.25;
          const len = fh * 0.82 * tall * (1 - Math.abs(t - 0.5) * 0.6) * (0.85 + 0.3 * rand());
          const bx = cx + (t - 0.5) * fw * 0.32, bw = fw * 0.075;
          const sx = Math.sin(ang), cy = Math.cos(ang);
          ctx.beginPath();
          ctx.moveTo(bx - bw / 2, base);
          ctx.quadraticCurveTo(bx + sx * len * 0.35 - bw * 0.3, base - cy * len * 0.55, bx + sx * len, base - cy * len);
          ctx.quadraticCurveTo(bx + sx * len * 0.35 + bw * 0.4, base - cy * len * 0.5, bx + bw / 2, base);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    scene.textures.addImage(key, c);
    const tex = scene.textures.get(key);
    for (let v = 0; v < 3; v++) tex.add(v, 0, v * fw, 0, fw, fh);
    return key;
  }

  /** Flat side-view goal (one sprite in front of the players, net-shake strip). */
  buildSideView(scene, frontX, dir) {
    const G = KL.TUNING.goal;
    const W = KL.TUNING.world;
    // art faces left with the front post on its left edge and the crossbar at the top; keep its aspect
    this.sprite = scene.add.sprite(0, W.groundY + 4, 'props', 'goal_right').setOrigin(0.5, 1).setDepth(KL.GOAL_DEPTH.near);
    const fr = this.sprite.frame;
    const h = (G.openingHeight + G.crossbarThickness) / 0.94;
    const w = (h * fr.realWidth) / fr.realHeight;
    this.sprite.setDisplaySize(w, h);
    this.sprite.x = frontX - dir * (w * 0.46);
    this.sprite.setFlipX(this.side === 'left');
    this.displaySize = { w, h };
    if (!scene.anims.exists('goal_net_shake')) {
      scene.anims.create({ key: 'goal_net_shake', frames: scene.anims.generateFrameNames('props', { prefix: 'goal_net_shake/', start: 0, end: 3, zeroPad: 2 }), frameRate: 12 * KL.animPace(), repeat: 1 });
    }
  }

  /** Ball centre across the line and below the bar. */
  contains(x, y) {
    const G = KL.TUNING.goal;
    const W = KL.TUNING.world;
    const under = y > W.groundY - G.openingHeight + KL.TUNING.ball.radius * 0.5;
    return under && (this.side === 'left' ? x < this.lineX : x > this.lineX);
  }

  /** Does the near side netting cover this ball? (It plays at mid-depth, behind the near panel.) */
  hides(ball) {
    const r = this.nearRect;
    if (!r) return false;
    const rad = KL.TUNING.ball.radius;
    const nx = Phaser.Math.Clamp(ball.x, r.x, r.right), ny = Phaser.Math.Clamp(ball.y, r.y, r.bottom);
    return Math.hypot(ball.x - nx, ball.y - ny) < rad;
  }

  /** Goal scored: the net bulges and swings. */
  shake() {
    if (this.back) {
      this.sprite.play(`${this.key}/ripple`);
      return;
    }
    this.sprite.play('goal_net_shake');
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.sprite.setFrame('goal_right');
      this.sprite.setDisplaySize(this.displaySize.w, this.displaySize.h);
    });
  }

  /** The ball hit the frame: a hard knock makes the net twitch. */
  bump(ball) {
    if (!this.back || this.sprite.anims.isPlaying || ball.body.velocity.length() < 260) return;
    this.sprite.play(`${this.key}/bump`);
  }
};
