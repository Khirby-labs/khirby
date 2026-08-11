import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isoDayToLocalDate,
  localDayEnd,
  localDayStart,
  matchPreset,
  normalizeRange,
  parseIsoDay,
  presetRange,
  toIsoDay,
  todayIsoDay,
} from './date-range';

/**
 * Pure input→output, no mocks — the layer where a tautology is impossible (ADR-0010).
 *
 * The UTC-bound assertions are written as invariants rather than as literal ISO
 * strings on purpose: the dev machine runs Europe/Warsaw and CI runs UTC, and a spec
 * that hardcodes `2026-07-23T22:00:00.000Z` passes in exactly one of them.
 */
const NOON_24_JULY = '2026-07-24T12:00:00';

/** Local calendar day of an instant, i.e. what the operator would call it. */
function localDayOf(instant: string): string {
  const d = new Date(instant);
  return [
    String(d.getFullYear()).padStart(4, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

describe('parseIsoDay / toIsoDay', () => {
  it('round-trips an ISO day', () => {
    const parsed = parseIsoDay('2026-07-24');
    expect(parsed).toBeDefined();
    expect(toIsoDay(parsed!)).toBe('2026-07-24');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toIsoDay(parseIsoDay('2026-01-05')!)).toBe('2026-01-05');
  });

  it.each([null, undefined, '', 'today', '24-07-2026', '2026-7-4', '2026-07-24T10:00:00Z'])(
    'rejects %s instead of guessing',
    (value) => {
      expect(parseIsoDay(value as string | null)).toBeUndefined();
    },
  );

  /*
   * `new CalendarDate(2026, 2, 31)` silently rolls to 28 February. A filter
   * persisted in a URL as 2026-02-31 must read as "no date", not as a different day
   * than the one written.
   */
  it('rejects a day that does not exist in its month', () => {
    expect(parseIsoDay('2026-02-31')).toBeUndefined();
    expect(parseIsoDay('2026-02-28')).toBeDefined();
  });
});

describe('local day bounds', () => {
  it('keeps the operator’s calendar day on both ends', () => {
    expect(localDayOf(localDayStart('2026-07-24'))).toBe('2026-07-24');
    expect(localDayOf(localDayEnd('2026-07-24'))).toBe('2026-07-24');
  });

  it('spans the whole day, end after start', () => {
    const start = new Date(localDayStart('2026-07-24')).getTime();
    const end = new Date(localDayEnd('2026-07-24')).getTime();
    expect(end - start).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('emits UTC instants, so the API never has to guess a zone', () => {
    expect(localDayStart('2026-07-24')).toMatch(/Z$/);
    expect(localDayEnd('2026-07-24')).toMatch(/\.999Z$/);
  });

  /*
   * The spring-forward day is 23 hours long in Europe/Warsaw and 24 in UTC. Either
   * way the bounds must stay inside the same calendar day — that is the property, not
   * the hour count.
   */
  it('survives a DST transition', () => {
    expect(localDayOf(localDayStart('2026-03-29'))).toBe('2026-03-29');
    expect(localDayOf(localDayEnd('2026-03-29'))).toBe('2026-03-29');
  });

  it('formats an ISO day as the reader’s own day, not UTC midnight', () => {
    // The bug this prevents: `new Date('2026-07-24')` is 00:00 UTC, which is the
    // 23rd for every zone west of Greenwich.
    const asDate = isoDayToLocalDate('2026-07-24');
    expect(asDate.getFullYear()).toBe(2026);
    expect(asDate.getMonth()).toBe(6);
    expect(asDate.getDate()).toBe(24);
  });
});

describe('presetRange', () => {
  afterEach(() => vi.useRealTimers());

  function at(instant: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
  }

  it('counts today as one of the last N days', () => {
    at(NOON_24_JULY);
    expect(presetRange('last7')).toEqual({ from: '2026-07-18', to: '2026-07-24' });
    expect(presetRange('last30')).toEqual({ from: '2026-06-25', to: '2026-07-24' });
    expect(presetRange('last90')).toEqual({ from: '2026-04-26', to: '2026-07-24' });
  });

  it('ends “this month” at today, never in the future', () => {
    at(NOON_24_JULY);
    expect(presetRange('thisMonth')).toEqual({ from: '2026-07-01', to: '2026-07-24' });
  });

  it('covers the previous month end to end', () => {
    at(NOON_24_JULY);
    expect(presetRange('prevMonth')).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  /* 31 March minus one month is 28 February, so a naive `set({ day: 1 })` after the
   * subtraction would land in the wrong month's length. */
  it('handles a short previous month from a long current one', () => {
    at('2026-03-31T12:00:00');
    expect(presetRange('prevMonth')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('crosses a year boundary', () => {
    at('2026-01-15T12:00:00');
    expect(presetRange('prevMonth')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetRange('last30')).toEqual({ from: '2025-12-17', to: '2026-01-15' });
  });

  it('takes the clock as an argument, so callers can pin it', () => {
    expect(presetRange('thisMonth', new Date('2026-02-10T09:00:00'))).toEqual({
      from: '2026-02-01',
      to: '2026-02-10',
    });
  });
});

describe('matchPreset', () => {
  const now = new Date('2026-07-24T12:00:00');

  it('names the preset a range came from', () => {
    expect(matchPreset(presetRange('last30', now), now)).toBe('last30');
    expect(matchPreset(presetRange('prevMonth', now), now)).toBe('prevMonth');
  });

  it('returns undefined for a hand-picked range', () => {
    expect(matchPreset({ from: '2026-07-02', to: '2026-07-09' }, now)).toBeUndefined();
  });

  it('returns undefined for a half-open or empty range', () => {
    expect(matchPreset({ from: '2026-07-02', to: null }, now)).toBeUndefined();
    expect(matchPreset({ from: null, to: null }, now)).toBeUndefined();
  });
});

describe('normalizeRange', () => {
  it('orders a backwards range', () => {
    expect(normalizeRange({ from: '2026-07-24', to: '2026-07-01' })).toEqual({
      from: '2026-07-01',
      to: '2026-07-24',
    });
  });

  it('leaves an ordered or incomplete range alone', () => {
    expect(normalizeRange({ from: '2026-07-01', to: '2026-07-24' })).toEqual({
      from: '2026-07-01',
      to: '2026-07-24',
    });
    expect(normalizeRange({ from: null, to: '2026-07-24' })).toEqual({
      from: null,
      to: '2026-07-24',
    });
  });
});

describe('todayIsoDay', () => {
  it('reads the local calendar, not UTC', () => {
    expect(todayIsoDay(new Date('2026-07-24T23:30:00'))).toBe('2026-07-24');
    expect(todayIsoDay(new Date('2026-01-05T00:30:00'))).toBe('2026-01-05');
  });
});
