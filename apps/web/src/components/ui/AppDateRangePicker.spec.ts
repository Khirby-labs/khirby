import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import AppDateRangePicker from './AppDateRangePicker.vue';
import { mountWithI18n, withLocale, resetLocale } from '../../test/i18n';

/**
 * Boundary spec: real component, real Reka RangeCalendar, driven through the DOM.
 *
 * The clock is frozen because the preset rail is defined relative to today — with a
 * live clock these assertions would be a slow-burning flake that fires on the 1st of
 * a month.
 */
const NOON_24_JULY = new Date('2026-07-24T12:00:00');

let wrapper: VueWrapper | null = null;

function mountPicker(props: Record<string, unknown> = {}) {
  wrapper = mountWithI18n(AppDateRangePicker, {
    props: { modelValue: { from: null, to: null }, ...props },
    attachTo: document.body,
  });
  return wrapper;
}

const dayCells = () =>
  Array.from(document.body.querySelectorAll<HTMLElement>('[data-reka-calendar-cell-trigger]'));

/** First cell for a day — with two months visible, an edge day appears in both grids. */
const cellFor = (isoDay: string) =>
  document.body.querySelector<HTMLElement>(
    `[data-reka-calendar-cell-trigger][data-value="${isoDay}"]`,
  );

const presetButton = (label: string) =>
  Array.from(document.body.querySelectorAll<HTMLElement>('button')).find(
    (b) => b.textContent?.trim() === label,
  );

async function open(view: VueWrapper) {
  await view.find('button').trigger('click');
  await flushPromises();
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOON_24_JULY);
});

afterEach(() => {
  vi.useRealTimers();
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  resetLocale();
});

describe('AppDateRangePicker', () => {
  it('shows the placeholder until a range exists, then both formatted dates', async () => {
    const view = mountPicker();
    expect(view.find('button').text()).toBe('Select a date range');

    await view.setProps({ modelValue: { from: '2026-07-01', to: '2026-07-24' } });
    expect(view.find('button').text()).toContain('Jul 1, 2026');
    expect(view.find('button').text()).toContain('Jul 24, 2026');
  });

  it('names the range as a phrase for a screen reader, not as two loose dates', async () => {
    const view = mountPicker({ modelValue: { from: '2026-07-01', to: '2026-07-24' } });
    expect(view.find('button').attributes('aria-label')).toBe('From Jul 1, 2026 to Jul 24, 2026');
  });

  it('publishes only once both ends are picked', async () => {
    const view = mountPicker();
    await open(view);

    cellFor('2026-07-10')!.click();
    await flushPromises();
    // A half-open range would refetch with `from` and no `to` — never emit it.
    expect(view.emitted('update:modelValue')).toBeUndefined();

    cellFor('2026-07-20')!.click();
    await flushPromises();
    expect(view.emitted('update:modelValue')).toEqual([[{ from: '2026-07-10', to: '2026-07-20' }]]);
  });

  it('orders a backwards selection', async () => {
    const view = mountPicker();
    await open(view);

    cellFor('2026-07-20')!.click();
    await flushPromises();
    cellFor('2026-07-10')!.click();
    await flushPromises();

    expect(view.emitted('update:modelValue')).toEqual([[{ from: '2026-07-10', to: '2026-07-20' }]]);
  });

  it('closes once a range is complete', async () => {
    const view = mountPicker();
    await open(view);
    cellFor('2026-07-10')!.click();
    await flushPromises();
    cellFor('2026-07-20')!.click();
    await flushPromises();

    expect(dayCells()).toHaveLength(0);
  });

  it('emits the preset’s range against the frozen clock', async () => {
    const view = mountPicker();
    await open(view);

    presetButton('Last 30 days')!.click();
    await flushPromises();

    expect(view.emitted('update:modelValue')).toEqual([[{ from: '2026-06-25', to: '2026-07-24' }]]);
    expect(dayCells()).toHaveLength(0);
  });

  it('covers the whole previous month, not the last 30 days', async () => {
    const view = mountPicker();
    await open(view);

    presetButton('Last month')!.click();
    await flushPromises();

    expect(view.emitted('update:modelValue')).toEqual([[{ from: '2026-06-01', to: '2026-06-30' }]]);
  });

  it('marks the preset the current range came from', async () => {
    const view = mountPicker({ modelValue: { from: '2026-06-25', to: '2026-07-24' } });
    await open(view);

    expect(presetButton('Last 30 days')!.getAttribute('aria-pressed')).toBe('true');
    expect(presetButton('Last 7 days')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('marks no preset for a hand-picked range', async () => {
    const view = mountPicker({ modelValue: { from: '2026-07-02', to: '2026-07-09' } });
    await open(view);

    const pressed = Array.from(document.body.querySelectorAll('button[aria-pressed="true"]'));
    expect(pressed).toHaveLength(0);
  });

  it('paints the ends and the middle of the selected range differently', async () => {
    const view = mountPicker({ modelValue: { from: '2026-07-10', to: '2026-07-12' } });
    await open(view);

    expect(cellFor('2026-07-10')!.getAttribute('data-selection-start')).toBe('true');
    expect(cellFor('2026-07-12')!.getAttribute('data-selection-end')).toBe('true');
    const middle = cellFor('2026-07-11')!;
    expect(middle.getAttribute('data-selected')).toBe('true');
    expect(middle.hasAttribute('data-selection-start')).toBe(false);
    expect(middle.hasAttribute('data-selection-end')).toBe(false);
  });

  it('disables days past maxDay', async () => {
    const view = mountPicker({ maxDay: '2026-07-24' });
    await open(view);

    expect(cellFor('2026-07-25')!.hasAttribute('data-disabled')).toBe(true);
    expect(cellFor('2026-07-24')!.hasAttribute('data-disabled')).toBe(false);
  });

  it('clears to an empty range', async () => {
    const view = mountPicker({ modelValue: { from: '2026-07-01', to: '2026-07-24' }, clearable: true });
    await open(view);

    presetButton('Clear')!.click();
    await flushPromises();

    expect(view.emitted('update:modelValue')).toEqual([[{ from: null, to: null }]]);
  });

  it('renders trigger, presets and calendar in the active language', async () => {
    await withLocale('pl');
    const view = mountPicker({ modelValue: { from: '2026-07-01', to: '2026-07-24' } });

    expect(view.find('button').text()).toContain('1 lip 2026');
    expect(view.find('button').attributes('aria-label')).toBe('Od 1 lip 2026 do 24 lip 2026');

    await open(view);
    expect(presetButton('Ostatnie 30 dni')).toBeDefined();
    expect(document.body.textContent).toContain('lipiec 2026');
  });
});
