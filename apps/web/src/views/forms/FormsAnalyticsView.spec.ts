import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import type { FormStats } from '@khirby/types';
import FormsAnalyticsView from './FormsAnalyticsView.vue';
import SkeletonRows from '../../components/ui/SkeletonRows.vue';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';
import { mountWithI18n, withLocale, resetLocale } from '../../test/i18n';

/**
 * Boundary spec: real view, real store, real pickers, network mocked with MSW.
 *
 * It used to `vi.mock('../../api/client')` and assert the mock's arguments, which
 * `.claude/rules/web.md` forbids — that measures our own call site and skips the
 * layer where the from/to bounds are actually built and serialized. Here the query
 * string is read off the wire, so the local-day → UTC conversion is under test too.
 *
 * The clock is frozen: the filter opens on "last 30 days", so the request URL is a
 * function of today.
 */
const NOON_24_JULY = new Date('2026-07-24T12:00:00');

/** What `presetRange('last30')` covers on the frozen day, as local-day UTC bounds. */
const EXPECTED_FROM = new Date('2026-06-25T00:00:00').toISOString();
const EXPECTED_TO = new Date('2026-07-24T23:59:59.999').toISOString();

const EMPTY_STATS: FormStats = { total: 42, activeForms: 3, byForm: [], byDay: [] };

let statsUrls: string[] = [];
let wrapper: VueWrapper | null = null;

function statsResponds(stats: Partial<FormStats> = {}) {
  return http.get(api('/api/forms/stats'), ({ request }) => {
    statsUrls.push(request.url);
    return HttpResponse.json({ ...EMPTY_STATS, ...stats });
  });
}

function formsResponds(rows: unknown[] = []) {
  return http.get(api('/api/forms'), () => HttpResponse.json(rows));
}

async function mountView() {
  wrapper = mountWithI18n(FormsAnalyticsView, {
    global: { plugins: [createPinia()] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

const rangeTrigger = () => wrapper!.get('#stats-range');

const presetButton = (label: string) =>
  Array.from(document.body.querySelectorAll<HTMLElement>('button')).find(
    (b) => b.textContent?.trim() === label,
  );

beforeEach(() => {
  statsUrls = [];
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

describe('FormsAnalyticsView', () => {
  it('loads and renders the submission totals', async () => {
    server.use(formsResponds(), statsResponds());
    const view = await mountView();

    expect(view.text()).toContain('Total submissions');
    expect(view.text()).toContain('42');
  });

  it('opens on the last 30 days and sends them as UTC bounds of local days', async () => {
    server.use(formsResponds(), statsResponds());
    await mountView();

    expect(rangeTrigger().text()).toContain('Jun 25, 2026');
    expect(rangeTrigger().text()).toContain('Jul 24, 2026');

    expect(statsUrls).toHaveLength(1);
    const query = new URL(statsUrls[0]!).searchParams;
    expect(query.get('from')).toBe(EXPECTED_FROM);
    expect(query.get('to')).toBe(EXPECTED_TO);
    expect(query.get('daily')).toBe('true');
    expect(query.get('formId')).toBeNull();
  });

  it('refetches with the new bounds when a preset is chosen — no Apply button', async () => {
    server.use(formsResponds(), statsResponds());
    const view = await mountView();

    // The button is gone on purpose: both controls commit a whole value at once.
    expect(view.text()).not.toContain('Apply');

    await rangeTrigger().trigger('click');
    await flushPromises();
    presetButton('Last 7 days')!.click();
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(statsUrls).toHaveLength(2);
    const query = new URL(statsUrls[1]!).searchParams;
    expect(query.get('from')).toBe(new Date('2026-07-18T00:00:00').toISOString());
    expect(query.get('to')).toBe(EXPECTED_TO);
  });

  it('coalesces two fast filter changes into one request', async () => {
    server.use(formsResponds(), statsResponds());
    await mountView();

    await rangeTrigger().trigger('click');
    await flushPromises();
    presetButton('Last 7 days')!.click();
    await flushPromises();

    await rangeTrigger().trigger('click');
    await flushPromises();
    presetButton('Last 90 days')!.click();
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    // Debounced: the abandoned intermediate range never reaches the API.
    expect(statsUrls).toHaveLength(2);
    expect(new URL(statsUrls[1]!).searchParams.get('from')).toBe(
      new Date('2026-04-26T00:00:00').toISOString(),
    );
  });

  it('drops the bounds entirely when the range is cleared', async () => {
    server.use(formsResponds(), statsResponds());
    await mountView();

    await rangeTrigger().trigger('click');
    await flushPromises();
    presetButton('Clear')!.click();
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    const query = new URL(statsUrls[1]!).searchParams;
    expect(query.get('from')).toBeNull();
    expect(query.get('to')).toBeNull();
    expect(rangeTrigger().text()).toBe('Select a date range');
  });

  it('shows a loading skeleton until the first stats response arrives', async () => {
    let releaseStats: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      releaseStats = resolve;
    });
    server.use(
      formsResponds(),
      http.get(api('/api/forms/stats'), async () => {
        await pending;
        return HttpResponse.json({ ...EMPTY_STATS, total: 7, activeForms: 1 });
      }),
    );

    wrapper = mountWithI18n(FormsAnalyticsView, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.findComponent(SkeletonRows).exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Total submissions');

    releaseStats();
    await flushPromises();

    expect(wrapper.findComponent(SkeletonRows).exists()).toBe(false);
    expect(wrapper.text()).toContain('Total submissions');
  });

  /*
   * The daily tooltip used to interpolate a raw ISO day and a bare integer; both go
   * through d()/n() now, and Polish needs three plural forms for "zgłoszenie".
   */
  it('localizes the chart tooltip, its date and its plural', async () => {
    server.use(
      formsResponds(),
      statsResponds({
        total: 6,
        activeForms: 1,
        byDay: [
          { day: '2026-07-24', count: 1 },
          { day: '2026-07-25', count: 5 },
        ],
      }),
    );
    await withLocale('pl');
    const view = await mountView();

    expect(view.text()).toContain('Wszystkie zgłoszenia');
    const tooltips = view.findAll('[title]').map((el) => el.attributes('title'));
    expect(tooltips[0]).toBe('24 lip 2026: 1 zgłoszenie');
    expect(tooltips[1]).toBe('25 lip 2026: 5 zgłoszeń');
  });

  it('filters by form without losing the date range', async () => {
    server.use(
      formsResponds([{ id: 'f1', name: 'Contact form', slug: 'contact', submissionCount: 3 }]),
      statsResponds(),
    );
    const view = await mountView();

    await view.getComponent({ name: 'AppSelect' }).vm.$emit('update:modelValue', 'f1');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    const query = new URL(statsUrls[1]!).searchParams;
    expect(query.get('formId')).toBe('f1');
    expect(query.get('from')).toBe(EXPECTED_FROM);
  });
});
