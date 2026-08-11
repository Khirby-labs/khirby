/**
 * i18n runtime (ADR-0011).
 *
 * `pl` and `en` are both authored natively — neither is a translation of the
 * other. `en` is eager because it is the technical fallback; every other locale
 * is a lazy chunk fetched on first use by loadLocale().
 */
import { createI18n } from 'vue-i18n';
import en from './messages/en';
import { FALLBACK_LOCALE, type Locale } from './locales';
import { pluralRules } from './plural';
import { datetimeFormats, numberFormats } from './formats';

/** The shape every locale must match. Derived from `en`, checked via `satisfies`. */
export type MessageSchema = typeof en;

const loaders: Record<Locale, () => Promise<{ default: MessageSchema }>> = {
  pl: () => import('./messages/pl'),
  en: () => Promise.resolve({ default: en }),
};

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: FALLBACK_LOCALE,
  fallbackLocale: FALLBACK_LOCALE,
  messages: { en },
  pluralRules,
  datetimeFormats,
  numberFormats,
  // Loud in dev, silent in prod: a missing key is a bug to fix, not a runtime
  // error to show a user. `pnpm lint:i18n` is what actually prevents it shipping.
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
});

const loaded = new Set<Locale>([FALLBACK_LOCALE]);

/** Idempotent. Fetches and registers a locale's messages if not already present. */
export async function loadLocale(locale: Locale): Promise<void> {
  if (loaded.has(locale)) return;
  const mod = await loaders[locale]();
  i18n.global.setLocaleMessage(locale, mod.default);
  loaded.add(locale);
}

/** Test seam: forget which bundles are registered so a spec can start clean. */
export function resetLoadedLocales(): void {
  loaded.clear();
  loaded.add(FALLBACK_LOCALE);
}
