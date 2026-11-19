// A character's part images: placeholders first, then any PNGs found in
// assets/characters/<id>/ replace them as they load.
(function () {
  // Far-side limbs reuse the same art, drawn darker.
  const LIMBS = ['upperArm', 'forearm', 'thigh', 'shin', 'boot'];

  function darken(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(20, 24, 48, 0.3)';
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function setPart(art, part, img) {
    art[part] = img;
    if (LIMBS.includes(part)) art[part + '_dark'] = darken(img);
  }

  // Every PNG a character can provide, and the template size it must match.
  FC.ART_FILES = [
    ...Object.keys(FC.PARTS).map(part => ({
      file: `${part}.png`, def: FC.PARTS[part], set: (art, img) => setPart(art, part, img),
    })),
    ...Object.entries(FC.FACE).flatMap(([slot, def]) => def.variants.map(v => ({
      file: `${slot}_${v}.png`, def, set: (art, img) => { art[slot][v] = img; },
    }))),
  ];

  // status maps each file to { state: 'placeholder' | 'png' | 'warn', text }.
  FC.loadCharacterArt = function (character, onChange) {
    const art = FC.makePlaceholderArt(character.palette);
    for (const part of LIMBS) art[part + '_dark'] = darken(art[part]);
    const status = {};

    for (const f of FC.ART_FILES) {
      status[f.file] = { state: 'placeholder', text: 'placeholder' };
      const img = new Image();
      img.onload = () => {
        f.set(art, img);
        const [w, h] = f.def.size;
        const iw = img.naturalWidth, ih = img.naturalHeight;
        if (Math.abs(iw / ih - w / h) > 0.01) {
          status[f.file] = { state: 'warn', text: `${iw}×${ih}: wrong shape, must be ${w}×${h} (or 2×)` };
        } else {
          status[f.file] = { state: 'png', text: iw === w ? 'PNG' : `PNG ${iw}×${ih}, scaled to ${w}×${h}` };
        }
        if (onChange) onChange();
      };
      img.src = `assets/characters/${character.id}/${f.file}`;
    }
    return { art, status };
  };
})();
