/* Kickoff Legends — entry point. Everything is a classic script on window.KL so
 * the game runs from file:// with no bundler and no network. */
window.KL = window.KL || {};
KL.VERSION = '2.0.0';

(() => {
  KL.I18n.set(KL.Save.settings.locale || 'en');
  const W = KL.TUNING.world;

  const params = new URLSearchParams(location.search);
  const config = {
    // file:// images count as cross-origin for WebGL in Chrome, so a double-clicked index.html uses Canvas
    type: params.get('renderer') === 'canvas' || location.protocol === 'file:' ? Phaser.CANVAS : Phaser.AUTO,
    parent: 'game',
    // the canvas is KL.RES × the 1280×720 logical size; HiDPIPlugin zooms every camera to match
    width: W.width * KL.RES,
    height: W.height * KL.RES,
    backgroundColor: '#0f1230',
    pixelArt: false,
    antialias: true,
    roundPixels: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: W.width * KL.RES,
      height: W.height * KL.RES,
    },
    plugins: { scene: [{ key: 'KLHiDPI', plugin: KL.HiDPIPlugin, mapping: 'hidpi' }] },
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: W.gravity }, debug: false, fps: 60, fixedStep: true },
    },
    audio: { noAudio: true }, // we synthesise all audio via KL.Audio (WebAudio), no files
    input: { activePointers: 6 }, // tablets: several fingers on the on-screen controller (2 players → 4+ thumbs)
    loader: { imageLoadType: 'HTMLImageElement' }, // <img> loading works from file:// (XHR does not)
    scene: [KL.BootScene, KL.MenuScene, KL.CharSelectScene, KL.MatchScene, KL.HUDScene, KL.PauseScene, KL.SettingsScene, KL.ResultScene, KL.CreditsScene],
  };

  const start = () => {
    KL.game = new Phaser.Game(config);
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
