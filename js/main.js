/* Kickoff Legends — entry point. Everything is a classic script on window.KL so
 * the game runs from file:// with no bundler and no network. */
window.KL = window.KL || {};
KL.VERSION = '2.0.0';

(() => {
  KL.I18n.set(KL.Save.settings.locale || 'en');
  const V = KL.View; // the view: 1280×720 grown to the screen's shape (js/core/Viewport.js)
  const gameW = Math.round(V.w * KL.RES), gameH = Math.round(V.h * KL.RES);

  const params = new URLSearchParams(location.search);
  const config = {
    // file:// images count as cross-origin for WebGL in Chrome, so a double-clicked index.html uses Canvas
    type: params.get('renderer') === 'canvas' || location.protocol === 'file:' ? Phaser.CANVAS : Phaser.AUTO,
    parent: 'game',
    // the canvas is KL.RES × the view's logical size; HiDPIPlugin zooms every camera to match
    width: gameW,
    height: gameH,
    backgroundColor: '#0f1230',
    pixelArt: false,
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance', // a laptop with two GPUs draws the match on the faster one
    // the view already has the screen's shape, so the canvas fills the window edge to edge (KL.View
    // resizes the game when the window or orientation changes); only a shape outside
    // KL.View.LIMITS letterboxes
    scale: {
      mode: V.scaleMode(),
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: gameW,
      height: gameH,
    },
    plugins: { scene: [{ key: 'KLHiDPI', plugin: KL.HiDPIPlugin, mapping: 'hidpi' }] },
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: KL.TUNING.world.gravity }, debug: false, fps: 60, fixedStep: true },
    },
    audio: { noAudio: true }, // we synthesise all audio via KL.Audio (WebAudio), no files
    input: { activePointers: 6 }, // tablets: several fingers on the on-screen controller (2 players → 4+ thumbs)
    loader: { imageLoadType: 'HTMLImageElement' }, // <img> loading works from file:// (XHR does not)
    scene: [KL.BootScene, KL.MenuScene, KL.CharSelectScene, KL.MatchScene, KL.HUDScene, KL.PauseScene, KL.SettingsScene, KL.ResultScene, KL.CreditsScene],
  };

  const start = () => {
    KL.game = new Phaser.Game(config);
    V.attach(KL.game); // follow resizes, rotations and full screen
    KL.Activity.attach(KL.game); // the player away (tab hidden, window not in front, idle): everything rests
    KL.audio = new KL.Audio(KL.game);
    KL.Motion.trackRefresh(KL.game); // the match steps its physics at the screen's refresh rate
  };

  // Make sure the display fonts are decoded before Phaser measures any text.
  if (document.fonts?.load) {
    // Teko is split by unicode-range: ask for Devanagari and Latin text so both subsets load
    // (the language can be switched to Hindi from Settings without a reload).
    const faces = ['400 40px Bangers', '700 20px Oswald', '600 20px Teko', '700 20px Teko'];
    Promise.all(faces.map((f) => document.fonts.load(f, f.includes('Teko') ? 'Aa हिंदी' : 'Aa')))
      .catch(() => {})
      .finally(start);
  } else start();
})();
