/** Re-exports the host vue-i18n for plugin ESM (import map → vue-i18n). */
const i = window.__KHIRBY__.VueI18n;
export default i;
export const useI18n = i.useI18n;
export const createI18n = i.createI18n;
