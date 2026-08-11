import { describe, it, expect, beforeEach } from 'vitest';
import { i18n, loadLocale, resetLoadedLocales } from './index';
import { FALLBACK_LOCALE } from './locales';

/**
 * The runtime's own contract: the fallback bundle is present before anything
 * renders, other locales arrive as lazy chunks, and a switch actually changes
 * what t()/d()/n() produce.
 */
describe('i18n runtime', () => {
  beforeEach(() => {
    i18n.global.locale.value = FALLBACK_LOCALE;
  });

  it('boots with the fallback locale already loaded', () => {
    expect(i18n.global.availableLocales).toContain('en');
    expect(i18n.global.t('settings.password.title')).toBe('Change password');
  });

  it('lazily registers a locale on first use and is idempotent', async () => {
    resetLoadedLocales();
    await loadLocale('pl');
    expect(i18n.global.availableLocales.sort()).toEqual(['en', 'pl']);
    await expect(loadLocale('pl')).resolves.toBeUndefined();
  });

  it('resolves messages from the active locale', async () => {
    await loadLocale('pl');
    i18n.global.locale.value = 'pl';
    expect(i18n.global.t('settings.password.title')).toBe('Zmiana hasła');
  });

  it('applies the Polish plural rule, which vue-i18n would otherwise get wrong', async () => {
    await loadLocale('pl');
    // Registered at runtime: the shipped namespaces have no plural yet, and a
    // speculative production key would be worse than a fixture here.
    i18n.global.mergeLocaleMessage('pl', {
      probe: { leads: '{count} lead | {count} leady | {count} leadów' },
    } as never);
    i18n.global.locale.value = 'pl';

    const leads = (n: number) => i18n.global.t('probe.leads' as never, n, { count: n } as never);
    expect(leads(1)).toBe('1 lead');
    expect(leads(3)).toBe('3 leady');
    expect(leads(5)).toBe('5 leadów');
    expect(leads(22)).toBe('22 leady');
    expect(leads(13)).toBe('13 leadów');
  });

  it('formats dates and numbers per locale from the named formats', async () => {
    await loadLocale('pl');
    const day = new Date(Date.UTC(2026, 6, 24, 12, 0, 0));

    i18n.global.locale.value = 'en';
    const enDate = i18n.global.d(day, 'dateShort');
    const enMoney = i18n.global.n(1234, 'currency');

    i18n.global.locale.value = 'pl';
    const plDate = i18n.global.d(day, 'dateShort');
    const plMoney = i18n.global.n(1234, 'currency');

    // Same instant, same named format, different conventions — and no call site
    // passed a locale tag or Intl options.
    expect(enDate).not.toBe(plDate);
    expect(plDate).toMatch(/2026/);
    // Single-tenant: one currency in every locale, only the punctuation differs.
    expect(enMoney).toContain('PLN');
    expect(plMoney).toMatch(/zł|PLN/);
    expect(enMoney).not.toBe(plMoney);
  });
});
