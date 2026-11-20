/* Tiny i18n: KL.t('key') with {placeholders}. en is the source of truth; missing keys fall back to en, then to the key. */
window.KL = window.KL || {};

KL.I18n = {
  locale: 'en',
  tables: window.LOCALES || { en: {} },
  get available() {
    return Object.keys(this.tables);
  },
  set(locale) {
    this.locale = this.tables[locale] ? locale : 'en';
  },
  t(key, vars) {
    const table = this.tables[this.locale] || {};
    let s = table[key] ?? this.tables.en?.[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  },
};
KL.t = (key, vars) => KL.I18n.t(key, vars);
