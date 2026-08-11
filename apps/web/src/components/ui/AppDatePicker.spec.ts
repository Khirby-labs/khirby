import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import AppDatePicker from './AppDatePicker.vue';
import { mountWithI18n, withLocale, resetLocale } from '../../test/i18n';

/**
 * Boundary spec: the real component with real Reka primitives, driven through the
 * DOM (ADR-0010). The panel is portalled out of the component's own tree, so the
 * assertions read `document.body` — mounting detached would make every query miss.
 *
 * This is also the layer that would catch the bug the pickers exist for: a native
 * date input renders no calendar cells at all in jsdom, because the browser draws it.
 */
let wrapper: VueWrapper | null = null;

function mountPicker(props: Record<string, unknown> = {}) {
  wrapper = mountWithI18n(AppDatePicker, {
    props: { modelValue: null, ...props },
    attachTo: document.body,
  });
  return wrapper;
}

/** Reka marks every day cell with this attribute — no test-id needed. */
const dayCells = () =>
  Array.from(document.body.querySelectorAll<HTMLElement>('[data-reka-calendar-cell-trigger]'));

const cellFor = (isoDay: string) =>
  document.body.querySelector<HTMLElement>(
    `[data-reka-calendar-cell-trigger][data-value="${isoDay}"]`,
  );

async function open(view: VueWrapper) {
  await view.find('button').trigger('click');
  await flushPromises();
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  resetLocale();
});

describe('AppDatePicker', () => {
  it('shows the placeholder until a date is chosen, then the formatted date', async () => {
    const view = mountPicker({ placeholder: 'Pick a day' });
    expect(view.find('button').text()).toBe('Pick a day');

    await view.setProps({ modelValue: '2026-07-15' });
    expect(view.find('button').text()).toBe('Jul 15, 2026');
  });

  it('falls back to the shared placeholder message when none is passed', () => {
    const view = mountPicker();
    expect(view.find('button').text()).toBe('Select a date');
  });

  it('opens a month grid and emits the clicked day as an ISO string', async () => {
    const view = mountPicker({ modelValue: '2026-07-15' });
    expect(dayCells()).toHaveLength(0);

    await open(view);
    // fixed-weeks keeps the panel one height: 6 rows × 7 days, always.
    expect(dayCells()).toHaveLength(42);

    cellFor('2026-07-20')!.click();
    await flushPromises();

    expect(view.emitted('update:modelValue')).toEqual([['2026-07-20']]);
    expect(view.emitted('change')).toEqual([['2026-07-20']]);
  });

  it('marks the selected day, so the choice is visible on reopen', async () => {
    const view = mountPicker({ modelValue: '2026-07-15' });
    await open(view);

    expect(cellFor('2026-07-15')!.getAttribute('data-selected')).toBe('true');
    expect(cellFor('2026-07-16')!.hasAttribute('data-selected')).toBe(false);
  });

  it('closes the panel once a day is picked', async () => {
    const view = mountPicker({ modelValue: '2026-07-15' });
    await open(view);
    cellFor('2026-07-20')!.click();
    await flushPromises();

    expect(dayCells()).toHaveLength(0);
  });

  it('disables days outside min/max instead of accepting them', async () => {
    const view = mountPicker({
      modelValue: '2026-07-15',
      minDay: '2026-07-10',
      maxDay: '2026-07-20',
    });
    await open(view);

    expect(cellFor('2026-07-09')!.hasAttribute('data-disabled')).toBe(true);
    expect(cellFor('2026-07-21')!.hasAttribute('data-disabled')).toBe(true);
    expect(cellFor('2026-07-10')!.hasAttribute('data-disabled')).toBe(false);
    expect(cellFor('2026-07-20')!.hasAttribute('data-disabled')).toBe(false);
  });

  it('clears through the panel when clearable', async () => {
    const view = mountPicker({ modelValue: '2026-07-15', clearable: true });
    await open(view);

    const clear = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Clear',
    );
    expect(clear).toBeDefined();
    clear!.click();
    await flushPromises();

    expect(view.emitted('update:modelValue')).toEqual([[null]]);
  });

  it('has no clear action unless asked for — a required field must not be emptiable', async () => {
    const view = mountPicker({ modelValue: '2026-07-15' });
    await open(view);
    expect(document.body.textContent).not.toContain('Clear');
  });

  /*
   * Month and weekday names come from Intl for the active locale, not from message
   * files. This is the assertion that would fail if a picker were ever given a
   * hardcoded locale tag or an English month table.
   */
  it('renders the calendar chrome in the active language', async () => {
    await withLocale('pl');
    const view = mountPicker({ modelValue: '2026-07-15' });

    expect(view.find('button').text()).toBe('15 lip 2026');

    await open(view);
    expect(document.body.textContent).toContain('lipiec 2026');
    // Weekday initials come from Intl too: P W Ś C P S N, not S M T W T F S.
    expect(document.body.textContent).toContain('PWŚCPSN');
    // Reka ships English defaults on these two ("Previous page") — they must be ours.
    const navLabels = Array.from(document.body.querySelectorAll('button[aria-label]')).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(navLabels).toContain('Poprzedni miesiąc');
    expect(navLabels).toContain('Następny miesiąc');
  });

  it('names the trigger for a screen reader', () => {
    const view = mountPicker({ ariaLabel: 'Start date' });
    expect(view.find('button').attributes('aria-label')).toBe('Start date');
  });

  it('takes an id, so FormField’s label can point at the trigger', () => {
    const view = mountPicker({ id: 'starts-on' });
    expect(view.find('button').attributes('id')).toBe('starts-on');
  });
});
