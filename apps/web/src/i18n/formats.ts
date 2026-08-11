/**
 * Date & number formats (ADR-0011).
 *
 * Every locale declares the same NAMED formats, so a call site says what it means
 * (`d(iso, 'dateShort')`) and never what it looks like. That is what makes adding
 * a language a data change: no view passes Intl options inline, and no view
 * hardcodes a locale tag the way the pre-i18n code did
 * (`toLocaleDateString('en-US', …)`).
 *
 * Money: single-tenant install → one currency (`TENANT_CURRENCY`), identical in
 * every locale.
 */
import { LOCALE_CODES, TENANT_CURRENCY, type Locale } from './locales';

/** Named date/time formats available to `d()` in every locale. */
const DATE_TIME = {
  /** 24 Jul 2026 — table cells, list rows. */
  dateShort: { year: 'numeric', month: 'short', day: 'numeric' },
  /** 24 July 2026 — page headers, detail panels. */
  dateLong: { year: 'numeric', month: 'long', day: 'numeric' },
  /** 24 Jul 2026, 14:05 — audit trails, comments, submissions. */
  dateTime: {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
  /** 24 Jul — axis ticks and bar labels, where the year is noise. */
  dayMonth: { month: 'short', day: 'numeric' },
  /** 14:05 — same-day timestamps. */
  time: { hour: '2-digit', minute: '2-digit' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

/** Named number formats available to `n()` in every locale. */
const NUMBERS = {
  /** Counts and totals — thousands separators, no decimals. */
  integer: { style: 'decimal', maximumFractionDigits: 0 },
  /** Measured values that keep decimals. */
  decimal: { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 2 },
  /** Lead value, deal amounts. */
  currency: {
    style: 'currency',
    currency: TENANT_CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  },
  percent: { style: 'percent', maximumFractionDigits: 1 },
} as const satisfies Record<string, Intl.NumberFormatOptions>;

export type DateTimeFormatName = keyof typeof DATE_TIME;
export type NumberFormatName = keyof typeof NUMBERS;

function forEveryLocale<T>(value: T): Record<Locale, T> {
  return Object.fromEntries(LOCALE_CODES.map((code) => [code, value])) as Record<Locale, T>;
}

// The Intl option objects are locale-independent; Intl itself applies each
// locale's conventions. A locale needing a genuinely different shape (a calendar
// override, say) overrides its own entry here — never at the call site.
export const datetimeFormats: Record<
  Locale,
  Record<DateTimeFormatName, Intl.DateTimeFormatOptions>
> = forEveryLocale(DATE_TIME);

export const numberFormats: Record<
  Locale,
  Record<NumberFormatName, Intl.NumberFormatOptions>
> = forEveryLocale(NUMBERS);
