import { describe, expect, it } from 'vitest';
import {
  FALLBACK_LOCALE,
  LOCALE_CODES,
  SUPPORTED_LOCALES,
  describeLocale,
  isSupportedLocale,
  resolveLocale,
} from './locales';

describe('locale registry', () => {
  it('ships Polish and English, Polish first — the array orders the switcher', () => {
    expect(LOCALE_CODES).toEqual(['pl', 'en']);
  });

  it('names every language by its endonym', () => {
    expect(SUPPORTED_LOCALES.map((l) => l.nativeName)).toEqual(['Polski', 'English']);
  });

  it('describes a registered locale', () => {
    expect(describeLocale('pl')).toMatchObject({ nativeName: 'Polski', intlTag: 'pl', dir: 'ltr' });
  });

  it('rejects anything unregistered', () => {
    expect(isSupportedLocale('pl')).toBe(true);
    expect(isSupportedLocale('de')).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});

describe('resolveLocale', () => {
  it('matches an exact code', () => {
    expect(resolveLocale(['pl'])).toBe('pl');
  });

  it('matches the primary subtag, so pl-PL from the browser resolves to pl', () => {
    expect(resolveLocale(['pl-PL'])).toBe('pl');
    expect(resolveLocale(['en-GB'])).toBe('en');
  });

  it('is case-insensitive about the region', () => {
    expect(resolveLocale(['PL-pl'])).toBe('pl');
  });

  it('takes the first supported candidate, skipping unsupported ones', () => {
    expect(resolveLocale(['de-DE', 'fr', 'pl-PL'])).toBe('pl');
  });

  it('falls back to English for an unrecognised language — a German browser is not given Polish', () => {
    expect(resolveLocale(['de-DE'])).toBe(FALLBACK_LOCALE);
    expect(resolveLocale([])).toBe(FALLBACK_LOCALE);
    expect(resolveLocale([undefined, null, ''])).toBe(FALLBACK_LOCALE);
  });
});
