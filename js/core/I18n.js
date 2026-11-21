/* Tiny i18n: KL.t('key') with {placeholders}. en is the source of truth; missing keys fall back to en, then to the key. */
window.KL = window.KL || {};

KL.I18n = {
  locale: 'en',
  tables: window.LOCALES || { en: {} },
  /** 'change' (locale) whenever set() switches language. See KL.onLocale. */
  events: new Phaser.Events.EventEmitter(),
  get available() {
    return Object.keys(this.tables);
  },
  set(locale) {
    const next = this.tables[locale] ? locale : 'en';
    if (next === this.locale) return;
    this.locale = next;
    this.events.emit('change', next);
  },
  t(key, vars) {
    const table = this.tables[this.locale] || {};
    let s = table[key] ?? this.tables.en?.[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  },
};
KL.t = (key, vars) => KL.I18n.t(key, vars);

/**
 * Run fn(locale) whenever the language changes, until the scene shuts down. Most screens don't need
 * this: Settings restarts itself and the screen it returns to is built afresh. It is for the scenes
 * that stay up underneath Settings (the match HUD) and must re-set their text in the new language.
 */
KL.onLocale = (scene, fn) => {
  KL.I18n.events.on('change', fn);
  const off = () => KL.I18n.events.off('change', fn);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  scene.events.once(Phaser.Scenes.Events.DESTROY, off);
};
