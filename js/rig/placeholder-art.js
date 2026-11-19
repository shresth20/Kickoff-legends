// Drawn stand-in parts that match the rig templates exactly, so every
// animation can be tested before the GPT art exists.
(function () {
  const INK = '#1b1b1b';

  function surface(def) {
    const c = document.createElement('canvas');
    [c.width, c.height] = def.size;
    const g = c.getContext('2d');
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.lineWidth = 5;
    g.strokeStyle = INK;
    return [c, g];
  }

  function paint(g, fill) {
    g.fillStyle = fill;
    g.fill();
    g.stroke();
  }

  // Fills a band of the current path (a sleeve, a stripe) without touching the outline.
  function band(g, fill, x, y, w, h) {
    g.save();
    g.clip();
    g.fillStyle = fill;
    g.fillRect(x, y, w, h);
    g.restore();
  }

  function thick(g, width) {
    g.save();
    g.lineWidth = width;
    g.stroke();
    g.restore();
  }

  function oval(g, x, y, rx, ry, fill) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    paint(g, fill);
  }

  function dot(g, x, y, r, fill) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
  }

  function line(g, x1, y1, x2, y2, width) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    thick(g, width);
  }

  function arcLine(g, x, y, r, a0, a1, width = 5) {
    g.beginPath();
    g.arc(x, y, r, a0, a1);
    thick(g, width);
  }

  // 3/4 view looking right: ear on the near (left) side, nose toward the right.
  function head(pal) {
    const [c, g] = surface(FC.PARTS.head);
    g.beginPath();
    g.ellipse(98, 108, 70, 80, 0, 0, Math.PI * 2);
    g.fillStyle = pal.skin;
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = pal.hair;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(200, 0);
    g.lineTo(200, 58);
    g.quadraticCurveTo(140, 48, 100, 58);
    g.quadraticCurveTo(64, 66, 52, 96);
    g.quadraticCurveTo(46, 120, 40, 140);
    g.lineTo(0, 150);
    g.closePath();
    g.fill();
    g.restore();
    g.beginPath();
    g.ellipse(98, 108, 70, 80, 0, 0, Math.PI * 2);
    g.stroke();
    // Spiky top.
    g.beginPath();
    g.moveTo(34, 76);
    g.lineTo(38, 24); g.lineTo(64, 38); g.lineTo(80, 6); g.lineTo(102, 30);
    g.lineTo(126, 5); g.lineTo(136, 34); g.lineTo(170, 24); g.lineTo(162, 62);
    g.quadraticCurveTo(130, 52, 100, 62);
    g.quadraticCurveTo(64, 68, 34, 76);
    g.closePath();
    paint(g, pal.hair);
    oval(g, 42, 120, 12, 17, pal.skin);
    arcLine(g, 44, 120, 6, Math.PI * 0.6, Math.PI * 1.5, 3.5);
    // Nose and cheek.
    g.beginPath();
    g.moveTo(150, 118);
    g.quadraticCurveTo(162, 136, 150, 142);
    thick(g, 4);
    g.fillStyle = 'rgba(255, 105, 105, 0.3)';
    g.beginPath();
    g.ellipse(84, 150, 13, 7, 0, 0, Math.PI * 2);
    g.fill();
    return c;
  }

  function eye(g, variant) {
    switch (variant) {
      case 'open':
        oval(g, 0, 2, 12, 14, '#fff');
        dot(g, 4, 3, 7, INK);
        dot(g, 6, 0, 2.5, '#fff');
        line(g, -14, -18, 12, -20, 5);
        break;
      case 'shock':
        oval(g, 0, 0, 15, 18, '#fff');
        dot(g, 2, 0, 3.5, INK);
        line(g, -12, -26, 12, -28, 4);
        break;
      case 'angry':
        oval(g, 0, 3, 12, 12, '#fff');
        dot(g, 4, 5, 6, INK);
        line(g, -15, -18, 13, -8, 6);
        break;
      case 'sad':
        oval(g, 0, 3, 12, 13, '#fff');
        dot(g, 3, 7, 6, INK);
        line(g, -13, -10, 13, -20, 5);
        break;
      case 'happy':
        arcLine(g, 0, 8, 12, Math.PI * 1.15, Math.PI * 1.85, 6);
        break;
      case 'closed':
        arcLine(g, 0, -4, 12, Math.PI * 0.15, Math.PI * 0.85, 6);
        break;
      case 'dizzy':
        g.beginPath();
        for (let a = 0; a < Math.PI * 5; a += 0.2) {
          const r = 1.5 + a * 1.05;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        thick(g, 3);
        break;
    }
  }

  function eyes(variant) {
    const [c, g] = surface(FC.FACE.eyes);
    // Near eye full size on the left, far eye narrower on the right.
    for (const [x, y, sx, sy] of [[38, 30, 1, 1], [86, 28, 0.72, 0.95]]) {
      g.save();
      g.translate(x, y);
      g.scale(sx, sy);
      eye(g, variant);
      g.restore();
    }
    return c;
  }

  function mouth(variant) {
    const [c, g] = surface(FC.FACE.mouth);
    g.translate(32, 18);
    switch (variant) {
      case 'neutral':
        g.beginPath();
        g.moveTo(-10, 0);
        g.quadraticCurveTo(0, 3, 10, -1);
        thick(g, 4.5);
        break;
      case 'smile':
        arcLine(g, 0, -7, 12, Math.PI * 0.15, Math.PI * 0.85);
        break;
      case 'shout':
        oval(g, 0, 0, 12, 13, '#7a1f1f');
        g.beginPath();
        g.ellipse(0, 7, 7, 4, 0, 0, Math.PI * 2);
        g.fillStyle = '#ff8a95';
        g.fill();
        break;
      case 'grit':
        g.beginPath();
        g.roundRect(-16, -8, 32, 16, 5);
        paint(g, '#fff');
        g.beginPath();
        g.moveTo(-16, 0); g.lineTo(16, 0);
        g.moveTo(-5, -8); g.lineTo(-5, 8);
        g.moveTo(6, -8); g.lineTo(6, 8);
        thick(g, 2.5);
        break;
      case 'sad':
        arcLine(g, 0, 10, 11, Math.PI * 1.15, Math.PI * 1.85);
        break;
      case 'tongue':
        arcLine(g, 0, -7, 10, Math.PI * 0.2, Math.PI * 0.8);
        g.beginPath();
        g.roundRect(-1, 1, 11, 12, 5);
        paint(g, '#ff8a95');
        break;
    }
    return c;
  }

  function torso(pal) {
    const [c, g] = surface(FC.PARTS.torso);
    g.beginPath();
    g.moveTo(16, 24);
    g.quadraticCurveTo(58, 6, 104, 22);
    g.lineTo(100, 70);
    g.quadraticCurveTo(98, 104, 90, 108);
    g.lineTo(32, 108);
    g.quadraticCurveTo(22, 104, 20, 70);
    g.closePath();
    g.fillStyle = pal.jersey;
    g.fill();
    band(g, pal.jerseyDark, 0, 94, 120, 18);
    band(g, pal.jerseyDark, 66, 0, 12, 96);
    g.stroke();
    // V collar, a little right of centre for the 3/4 turn.
    g.beginPath();
    g.moveTo(50, 14);
    g.lineTo(64, 32);
    g.lineTo(78, 14);
    g.fillStyle = pal.jerseyDark;
    g.fill();
    g.stroke();
    return c;
  }

  function upperArm(pal) {
    const [c, g] = surface(FC.PARTS.upperArm);
    g.beginPath();
    g.roundRect(8, 1, 24, 61, 12);
    g.fillStyle = pal.skin;
    g.fill();
    band(g, pal.jersey, 0, 0, 40, 32);
    g.stroke();
    line(g, 9, 32, 31, 32, 4);
    return c;
  }

  function forearm(pal) {
    const [c, g] = surface(FC.PARTS.forearm);
    g.beginPath();
    g.roundRect(12, 1, 16, 46, 8);
    g.fillStyle = pal.skin;
    g.fill();
    band(g, '#262626', 0, 34, 40, 10);
    g.stroke();
    // Fist.
    g.beginPath();
    g.roundRect(6, 40, 28, 26, 12);
    paint(g, pal.skin);
    line(g, 12, 50, 26, 50, 3);
    return c;
  }

  function thigh(pal) {
    const [c, g] = surface(FC.PARTS.thigh);
    g.beginPath();
    g.roundRect(15, 30, 22, 48, 11);
    paint(g, pal.skin);
    // Flared shorts.
    g.beginPath();
    g.moveTo(6, 3);
    g.lineTo(46, 3);
    g.lineTo(50, 56);
    g.quadraticCurveTo(26, 62, 2, 56);
    g.closePath();
    g.fillStyle = pal.shorts;
    g.fill();
    band(g, pal.jerseyDark, 0, 48, 52, 12);
    g.stroke();
    return c;
  }

  function shin(pal) {
    const [c, g] = surface(FC.PARTS.shin);
    g.beginPath();
    g.roundRect(9, 1, 22, 73, 11);
    g.fillStyle = pal.socks;
    g.fill();
    band(g, pal.jerseyDark, 0, 16, 40, 8);
    band(g, pal.jerseyDark, 0, 30, 40, 6);
    g.stroke();
    return c;
  }

  function boot(pal) {
    const [c, g] = surface(FC.PARTS.boot);
    // The sole sits on the bottom edge of the box.
    g.beginPath();
    g.moveTo(6, 8);
    g.lineTo(32, 6);
    g.quadraticCurveTo(50, 8, 58, 20);
    g.quadraticCurveTo(63, 30, 57, 36);
    g.lineTo(7, 36);
    g.quadraticCurveTo(2, 22, 6, 8);
    g.closePath();
    g.fillStyle = pal.boots;
    g.fill();
    band(g, pal.sole, 0, 30, 64, 10);
    g.stroke();
    g.beginPath();
    g.moveTo(28, 11); g.lineTo(34, 17);
    g.moveTo(36, 12); g.lineTo(42, 18);
    thick(g, 3);
    return c;
  }

  FC.makePlaceholderArt = function (pal) {
    const art = {
      head: head(pal),
      torso: torso(pal),
      upperArm: upperArm(pal),
      forearm: forearm(pal),
      thigh: thigh(pal),
      shin: shin(pal),
      boot: boot(pal),
      eyes: {},
      mouth: {},
    };
    for (const v of FC.FACE.eyes.variants) art.eyes[v] = eyes(v);
    for (const v of FC.FACE.mouth.variants) art.mouth[v] = mouth(v);
    return art;
  };
})();
