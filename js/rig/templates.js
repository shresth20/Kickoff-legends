// Templates generated from the rig spec in parts.js: layout sheets to attach
// to GPT prompts, and exact-size guides for fitting each part.
(function () {
  const SHEET_W = 1536;
  const SHEET_H = 1024;
  const MARGIN = 60;
  const GAP = 50;
  const GREY = {
    skin: '#bdbdbd', hair: '#8a8a8a', jersey: '#9e9e9e', jerseyDark: '#757575',
    shorts: '#8a8a8a', socks: '#cfcfcf', boots: '#6d6d6d', sole: '#4a4a4a',
  };
  let guideArt = null;
  const guides = () => guideArt || (guideArt = FC.makePlaceholderArt(GREY));

  function items(kind) {
    if (kind === 'body') {
      return Object.keys(FC.PARTS).map(name => ({ label: name, def: FC.PARTS[name], image: guides()[name] }));
    }
    return Object.entries(FC.FACE).flatMap(([slot, def]) =>
      def.variants.map(v => ({ label: `${slot}_${v}`, def, image: guides()[slot][v] })));
  }

  // Faint guide shape, dashed outline, red pivot cross and blue joint dots.
  function drawBox(g, def, image, s) {
    const [w, h] = def.size;
    g.globalAlpha = 0.2;
    g.drawImage(image, 0, 0, w * s, h * s);
    g.globalAlpha = 1;
    g.strokeStyle = '#9aa0a6';
    g.lineWidth = 2;
    g.setLineDash([8, 6]);
    g.strokeRect(1, 1, w * s - 2, h * s - 2);
    g.setLineDash([]);

    const [px, py] = def.pivot;
    g.strokeStyle = '#e53935';
    g.beginPath();
    g.moveTo(px * s - 10, py * s); g.lineTo(px * s + 10, py * s);
    g.moveTo(px * s, py * s - 10); g.lineTo(px * s, py * s + 10);
    g.stroke();
    g.fillStyle = '#1e88e5';
    for (const [jx, jy] of Object.values(def.joints)) {
      g.beginPath();
      g.arc(jx * s, jy * s, 5, 0, Math.PI * 2);
      g.fill();
    }
  }

  // kind: 'body' or 'face'. The sheet is drawn at 2x the final part size.
  FC.templateSheet = function (kind) {
    const c = document.createElement('canvas');
    c.width = SHEET_W;
    c.height = SHEET_H;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, SHEET_W, SHEET_H);
    g.fillStyle = '#222';
    g.font = 'bold 26px system-ui, sans-serif';
    g.fillText(kind === 'body' ? 'BODY PARTS: 3/4 view, facing right' : 'FACE PIECES: 3/4 view, looking right', MARGIN, 44);
    g.fillStyle = '#666';
    g.font = '16px system-ui, sans-serif';
    g.fillText('Red cross = joint the part rotates around · Blue dot = where the next part attaches · Boxes are 2× the final PNG size', MARGIN, 68);

    let x = MARGIN, y = 100, rowH = 0;
    for (const item of items(kind)) {
      const w = item.def.size[0] * 2;
      const h = item.def.size[1] * 2;
      if (x + w > SHEET_W - MARGIN) {
        x = MARGIN;
        y += rowH + 70;
        rowH = 0;
      }
      g.save();
      g.translate(x, y);
      drawBox(g, item.def, item.image, 2);
      g.restore();
      g.fillStyle = '#222';
      g.font = 'bold 18px system-ui, sans-serif';
      g.fillText(item.label, x, y + h + 24);
      g.fillStyle = '#888';
      g.font = '14px system-ui, sans-serif';
      g.fillText(`${item.def.size[0]}×${item.def.size[1]}`, x, y + h + 44);
      x += Math.max(w, 130) + GAP;
      rowH = Math.max(rowH, h);
    }
    return c;
  };

  // name: a body part, or 'eyes' / 'mouth'. Exactly the final PNG size, transparent.
  FC.templateGuide = function (name) {
    const def = FC.PARTS[name] || FC.FACE[name];
    const image = FC.PARTS[name] ? guides()[name] : guides()[name][def.variants[0]];
    const c = document.createElement('canvas');
    [c.width, c.height] = def.size;
    drawBox(c.getContext('2d'), def, image, 1);
    return c;
  };

  FC.downloadCanvas = function (canvas, filename) {
    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  };
})();
