import { mount } from '@vue/test-utils';
import { i18n, loadLocale } from '../i18n';
import { FALLBACK_LOCALE, type Locale } from '../i18n/locales';

/**
 * Mount with the REAL i18n instance (ADR-0010, `.claude/rules/i18n.md`).
 *
 * Never stub `$t` to return its key: the stub is exactly the bug it would hide —
 * every spec passes while the user reads `settings.password.submit` on screen.
 * Specs assert resolved copy, so a renamed or deleted key fails a test.
 */
export const mountWithI18n: typeof mount = (component: any, options: any = {}) =>
  mount(component, {
    ...options,
    global: {
      ...options.global,
      plugins: [i18n, ...(options.global?.plugins ?? [])],
    },
  });

/** Switch the shared instance to `locale`, loading its bundle first. */
export async function withLocale(locale: Locale): Promise<void> {
  await loadLocale(locale);
  i18n.global.locale.value = locale;
}

/** Put the shared instance back on the fallback locale — call in afterEach. */
export function resetLocale(): void {
  i18n.global.locale.value = FALLBACK_LOCALE;
}
