import { describe, it, expect, afterEach } from 'vitest';
import AppPagination from './AppPagination.vue';
import { mountWithI18n, withLocale, resetLocale } from '../test/i18n';

/**
 * The position line is ONE message with two params. Splitting it into fragments
 * ("Page" + n + "of" + n) is what makes a sentence untranslatable, so this spec
 * asserts the whole rendered string in both languages.
 */
describe('AppPagination', () => {
  afterEach(resetLocale);

  it('renders the position as one sentence', () => {
    const wrapper = mountWithI18n(AppPagination, {
      props: { currentPage: 2, totalPages: 7 },
    });
    expect(wrapper.find('p').text()).toBe('Page 2 of 7');
  });

  it('renders the position in Polish word order', async () => {
    await withLocale('pl');
    const wrapper = mountWithI18n(AppPagination, {
      props: { currentPage: 2, totalPages: 7 },
    });
    expect(wrapper.find('p').text()).toBe('Strona 2 z 7');
  });

  it('keeps the arrows out of the copy so they can flip under RTL', () => {
    const wrapper = mountWithI18n(AppPagination, {
      props: { currentPage: 2, totalPages: 7 },
    });
    const [prev, next] = wrapper.findAll('button');

    // The glyph is a separate aria-hidden span; the message holds only the word.
    expect(prev.find('[aria-hidden="true"]').text()).toBe('←');
    expect(next.find('[aria-hidden="true"]').text()).toBe('→');
    expect(prev.text()).toContain('Prev');
  });

  it('names the destination page for screen readers', () => {
    const wrapper = mountWithI18n(AppPagination, {
      props: { currentPage: 3, totalPages: 7 },
    });
    const [prev, next] = wrapper.findAll('button');

    expect(prev.attributes('aria-label')).toBe('Go to page 2');
    expect(next.attributes('aria-label')).toBe('Go to page 4');
  });

  it('disables the edges', () => {
    const first = mountWithI18n(AppPagination, { props: { currentPage: 1, totalPages: 3 } });
    expect(first.findAll('button')[0].attributes('disabled')).toBeDefined();

    const last = mountWithI18n(AppPagination, { props: { currentPage: 3, totalPages: 3 } });
    expect(last.findAll('button')[1].attributes('disabled')).toBeDefined();
  });
});
