/* Persistence behind one interface so a cloud save can replace localStorage later. */
window.KL = window.KL || {};

(() => {
  const KEY = 'kickoff-legends.save.v2';

  const DEFAULT_SETTINGS = () => ({
    master: 0.8,
    music: 0.5,
    sfx: 0.9,
    crowd: 0.8, // the crowd and the stadium's ambience
    voice: 0.9, // the legends' shouts and the announcer
    commentary: true,
    screenShake: true,
    locale: 'en',
    controls: {
      p1: { ...KL.DEFAULT_CONTROLS.p1 },
    },
  });

  const DEFAULT_SAVE = () => ({
    wins: [0, 0],
    matchesPlayed: 0,
    settings: DEFAULT_SETTINGS(),
  });

  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const d = DEFAULT_SAVE();
        cache = {
          ...d,
          ...p,
          settings: {
            ...d.settings,
            ...(p.settings || {}),
            controls: d.settings.controls, // keys are fixed: an old remap from a saved game no longer applies
          },
        };
        return cache;
      }
    } catch (_) {
      /* storage unavailable or corrupt */
    }
    cache = DEFAULT_SAVE();
    return cache;
  }

  function flush() {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(cache));
    } catch (_) {
      /* ignore */
    }
  }

  KL.Save = {
    get: load,
    patch(partial) {
      cache = { ...load(), ...partial };
      flush();
      return cache;
    },
    get settings() {
      return load().settings;
    },
    patchSettings(partial) {
      const settings = { ...load().settings, ...partial };
      KL.Save.patch({ settings });
      return settings;
    },
    recordResult(winner) {
      const s = load();
      const wins = [s.wins[0], s.wins[1]];
      if (winner !== null && winner !== undefined) wins[winner] += 1;
      KL.Save.patch({ wins, matchesPlayed: s.matchesPlayed + 1 });
    },
  };
})();
