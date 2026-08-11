import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import SettingsView from './SettingsView.vue';
import { mountWithI18n } from '../../test/i18n';
import { useLocale } from '../../composables/useLocale';
import { loadLocale } from '../../i18n';
import { LOCALE_STORAGE_KEY } from '../../i18n/locales';

/**
 * Boundary spec for the language switcher (ADR-0010, `.claude/rules/i18n.md`).
 *
 * Mounts the real view with the real i18n instance and asserts resolved copy in
 * the DOM — never a key. A `$t` stub that echoed its key would make this file
 * pass while the user read `settings.password.submit` on screen, so the stub is
 * exactly the bug this spec exists to catch.
 */
function mountSettings(): VueWrapper {
  return mountWithI18n(SettingsView, { global: { plugins: [createPinia()] } });
}

const buttonByText = (wrapper: VueWrapper, text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text)!;

/** Click a locale button and let the switch settle. */
async function choose(wrapper: VueWrapper, language: string) {
  await buttonByText(wrapper, language).trigger('click');
  await flushPromises();
}

describe('SettingsView language switcher', () => {
  beforeEach(async () => {
    // Pre-warm the Polish bundle. Lazy loading is covered in i18n/runtime.spec.ts;
    // here the dynamic import would otherwise still be in flight after the click,
    // and the spec would measure module-loader timing instead of the switch.
    await loadLocale('pl');
    // Module-level locale state is shared, so put it back on the fallback and let
    // the <html lang> watcher restamp it. Test order can't leak a language.
    await useLocale().setLocale('en');
    localStorage.clear();
  });

  it('renders English copy and offers both languages by their own names', () => {
    const wrapper = mountSettings();
    const text = wrapper.text();

    expect(text).toContain('Language');
    expect(text).toContain('Change password');
    // The hint promises a SCOPE, so it is asserted rather than skipped: the choice
    // used to be device-only and is now stored on the account (users.locale), and
    // a copy change that quietly broke that promise should fail here.
    expect(text).toContain('Saved on the account and used on every device');
    // Endonyms, never translated — a reader must recognise their own language.
    expect(buttonByText(wrapper, 'Polski').exists()).toBe(true);
    expect(buttonByText(wrapper, 'English').exists()).toBe(true);
  });

  it('marks the active language for assistive tech', () => {
    const wrapper = mountSettings();
    expect(buttonByText(wrapper, 'English').attributes('aria-checked')).toBe('true');
    expect(buttonByText(wrapper, 'Polski').attributes('aria-checked')).toBe('false');
  });

  it('switches the whole view to Polish when Polski is chosen', async () => {
    const wrapper = mountSettings();
    expect(wrapper.text()).toContain('Change password');

    await choose(wrapper, 'Polski');

    const text = wrapper.text();
    expect(text).toContain('Zmiana hasła');
    expect(text).toContain('Bieżące hasło');
    expect(text).toContain('Język');
    expect(text).not.toContain('Change password');
    expect(buttonByText(wrapper, 'Polski').attributes('aria-checked')).toBe('true');
  });

  it('translates the theme options, which come from a module-level constant', async () => {
    const wrapper = mountSettings();
    expect(wrapper.text()).toContain('System');

    await choose(wrapper, 'Polski');

    // Proves the labelKey indirection works: a t() call inside THEME_OPTIONS
    // would have frozen these three labels at the boot locale.
    const text = wrapper.text();
    expect(text).toContain('Systemowy');
    expect(text).toContain('Jasny');
    expect(text).toContain('Ciemny');
  });

  it('stamps <html lang> so assistive tech and hyphenation follow the choice', async () => {
    const wrapper = mountSettings();
    expect(document.documentElement.lang).toBe('en');

    await choose(wrapper, 'Polski');

    expect(document.documentElement.lang).toBe('pl');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('persists the choice so a reload keeps the language', async () => {
    const wrapper = mountSettings();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();

    await choose(wrapper, 'Polski');

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pl');
  });

  it('validates the password form in the active language', async () => {
    const wrapper = mountSettings();
    await choose(wrapper, 'Polski');

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Podaj bieżące hasło.');
  });
});
