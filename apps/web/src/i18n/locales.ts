/**
 * Locale registry — the ONE place a language is declared (ADR-0011).
 *
 * Deliberately free of vue-i18n imports: `scripts/i18n-guard.mjs` and pure unit
 * specs read this module without booting the framework, and the pre-paint
 * snippet in index.html mirrors its storage key.
 *
 * Adding a language is four mechanical steps — see `.claude/rules/i18n.md`.
 */

/**
 * Technical fallback only. `pl` and `en` are both authored natively — neither is
 * a translation of the other — but a key missing from the active locale has to
 * resolve to *something* a developer can read, and the repo is English.
 */
export const FALLBACK_LOCALE = 'en';

/** localStorage key holding the chosen locale. Mirrored in index.html's pre-paint script. */
export const LOCALE_STORAGE_KEY = 'crm-locale';

/**
 * Single-tenant CRM (ADR-0004) → exactly one currency for the whole install.
 * Currency belongs to the business, not to the reader's language: every locale
 * formats the same currency, only the punctuation differs.
 */
export const TENANT_CURRENCY = 'PLN';

export interface LocaleDescriptor {
  code: string;
  /**
   * Endonym — the language's own name for itself. Rendered as-is in the switcher
   * and **never** run through t(): a reader looking for their language
   * recognises "Polski", not "Polish" translated into a language they can't read.
   */
  nativeName: string;
  /** BCP-47 tag handed to Intl for date/number formatting (may be more specific than `code`). */
  intlTag: string;
  dir: 'ltr' | 'rtl';
}

/** Order matters: this array orders the switcher. Polish is the primary audience. */
export const SUPPORTED_LOCALES = [
  { code: 'pl', nativeName: 'Polski', intlTag: 'pl', dir: 'ltr' },
  { code: 'en', nativeName: 'English', intlTag: 'en', dir: 'ltr' },
] as const satisfies readonly LocaleDescriptor[];

export type Locale = (typeof SUPPORTED_LOCALES)[number]['code'];

export const LOCALE_CODES: readonly Locale[] = SUPPORTED_LOCALES.map((l) => l.code);

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALE_CODES as readonly string[]).includes(value);
}

export function describeLocale(code: Locale): LocaleDescriptor {
  // Non-null: `code` is narrowed to a registered code by the Locale type.
  return SUPPORTED_LOCALES.find((l) => l.code === code)!;
}

/**
 * BCP-47 tag for the few components that hand a locale to Intl themselves instead
 * of going through `d()`/`n()` — Reka's calendar, `Intl.ListFormat`.
 *
 * Takes a plain string so the caller can pass `useI18n().locale` straight through:
 * that ref is what `d()` formats with, and deriving the tag from anything else lets
 * a calendar render July while the field next to it says lipiec.
 */
export function intlTagFor(code: string | undefined | null): string {
  return describeLocale(isSupportedLocale(code) ? code : FALLBACK_LOCALE).intlTag;
}

/**
 * First supported locale among `candidates`, matching the primary subtag so
 * `pl-PL` from navigator.languages resolves to `pl`. Anything unrecognised falls
 * back to FALLBACK_LOCALE — a German browser gets English, not Polish.
 */
export function resolveLocale(candidates: readonly (string | undefined | null)[]): Locale {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (isSupportedLocale(candidate)) return candidate;
    const primary = candidate.split('-')[0]?.toLowerCase();
    if (isSupportedLocale(primary)) return primary;
  }
  return FALLBACK_LOCALE;
}
