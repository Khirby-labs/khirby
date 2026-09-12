/** Re-exports the host vue-i18n for plugin ESM (import map → vue-i18n). */
const ns = window.__KHIRBY__.VueI18n;
export default ns.default ?? ns;
export const DatetimeFormat = ns.DatetimeFormat;
export const I18nD = ns.I18nD;
export const I18nInjectionKey = ns.I18nInjectionKey;
export const I18nN = ns.I18nN;
export const I18nT = ns.I18nT;
export const NumberFormat = ns.NumberFormat;
export const Translation = ns.Translation;
export const VERSION = ns.VERSION;
export const createI18n = ns.createI18n;
export const useI18n = ns.useI18n;
export const vTDirective = ns.vTDirective;
