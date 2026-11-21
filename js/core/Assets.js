/* What the loading screen loads (js/scenes/Boot.js), listed in one place, and an early start on it.
 *
 * This script runs right after the engine (js/vendor/phaser.min.js) has arrived. On a served page
 * (http/https) it starts every image the loading screen will ask for downloading straight away, in
 * the background, so the network is busy while the game scripts, the fonts and the loading screen
 * start up, instead of sitting idle until the loading screen asks. It waits for the engine on purpose:
 * started any earlier, the images would share the bandwidth with it and the loading screen would
 * appear later. Phaser's requests for the same URLs then pick up these downloads rather than starting
 * again. Opened from file:// the images come straight off the disk, so nothing is done.
 * Same files, same pixels: only when they start downloading changes. */
window.KL = window.KL || {};

/** The sliced atlases (tools/slice-sheet.mjs); crowd = the fans of the stands. */
KL.ATLAS_KEYS = ['characters', 'props', 'ui', 'fx', 'crowd'];

/**
 * Every image the loading screen loads:
 *   atlases: [{ key, pages }]  the atlas descriptors (window.KL_ATLASES), one entry per page image
 *   images:  [[key, url]]      backgrounds, the living sky, the welcome screen, the controller
 * The painted skies (bg_sky, bg_sky_night) are left out when sky.js has split them: their clear sky
 * and cloud sheet are what the stadium shows (js/ui/SkyLife.js). Boot loads a painted sky after all
 * if a file of its split fails to load.
 */
KL.bootAssets = () => {
  const dir = 'assets/images';
  const atlases = KL.ATLAS_KEYS.map((key) => ({ key, pages: [].concat(window.KL_ATLASES?.[key] || []) })).filter((a) => a.pages.length);
  const images = [];
  const skies = window.KL_SKY || {};
  const bg = (key) => images.push([key, KL.backgroundUrl(key)]);
  ['bg_sky', 'bg_sky_night'].filter((key) => !skies[key]).forEach(bg);
  ['bg_stands', 'bg_fence', 'bg_pitch'].forEach(bg);
  for (const sky of Object.values(skies)) [sky.clear, sky.sheet].filter(Boolean).forEach(bg);
  // the welcome screen: backdrop, logo and the logo's spinning football (tools/make-welcome.mjs)
  for (const key of ['welcome_bg', 'welcome_logo', 'welcome_ball', 'welcome_ball_light']) images.push([key, `${dir}/welcome/${key}.webp`]);
  // the controller's buttons (tools/make-pad.mjs; without them js/ui/TouchControls.js paints its own)
  if (window.KL_PAD_ART) images.push(['pad_art', `${dir}/pad/pad.webp`]);
  return { atlasDir: `${dir}/atlases/`, atlases, images };
};

/** A stadium layer's file. */
KL.backgroundUrl = (key) => `assets/images/backgrounds/${key}.webp`;

// The early start. Low priority: the scripts the page needs to run come first.
(() => {
  if (!/^https?:$/.test(location.protocol)) return;
  const { atlasDir, atlases, images } = KL.bootAssets();
  const urls = [...atlases.flatMap((a) => a.pages.map((p) => atlasDir + p.meta.image)), ...images.map(([, url]) => url)];
  for (const href of urls) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = href;
    link.fetchPriority = 'low';
    document.head.appendChild(link);
  }
})();
