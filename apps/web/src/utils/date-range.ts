/**
 * Calendar-day math for the date pickers (ADR-0012).
 *
 * This is the ONLY module in `apps/web` that imports `@internationalized/date`.
 * Views and components speak ISO day strings (`'2026-07-24'`); the `CalendarDate`
 * objects Reka's calendar primitives need are created and unwrapped here. Keeping
 * the import surface in one file is what makes the library replaceable without a
 * sweep — and keeps `DateValue` out of every component's prop types.
 *
 * Why a string and not a `Date`: a calendar day has no time zone. `new Date('2026-07-24')`
 * is midnight **UTC**, so `getDate()` returns 23 for anyone west of Greenwich — the
 * classic off-by-one-day. Time zones enter exactly once, at the query boundary
 * (`localDayStart` / `localDayEnd`), where they belong.
 */
import { CalendarDate, endOfMonth, startOfMonth, type DateValue } from '@internationalized/date';

/** An ISO calendar day, `YYYY-MM-DD`. The wire and model format for every picker. */
export type IsoDay = string;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `'2026-07-24'` → `CalendarDate`, or `undefined` for empty/malformed input.
 *
 * Returns `undefined` rather than throwing: the value can come from a URL query or
 * a persisted filter, and an unparseable one means "no date chosen", not a crash.
 */
export function parseIsoDay(value: string | null | undefined): CalendarDate | undefined {
  if (!value || !ISO_DAY.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const parsed = new CalendarDate(year, month, day);
  // Rejects 2026-02-31, which CalendarDate would silently roll into March.
  if (parsed.month !== month || parsed.day !== day) return undefined;
  return parsed;
}

/** `CalendarDate` → `'2026-07-24'`. Zero-padded by hand; `toString()` may carry a calendar suffix. */
export function toIsoDay(value: DateValue): IsoDay {
  return [
    String(value.year).padStart(4, '0'),
    String(value.month).padStart(2, '0'),
    String(value.day).padStart(2, '0'),
  ].join('-');
}

/**
 * `'2026-07-24'` → a `Date` at **local** midnight, for handing to `d()`.
 *
 * `new Date('2026-07-24')` is midnight UTC, which formats as the 23rd for anyone
 * west of Greenwich. The `T00:00:00` suffix (no `Z`) is what pins it to the reader's
 * own day, and it lives here so no view re-derives it.
 */
export function isoDayToLocalDate(day: IsoDay): Date {
  return new Date(`${day}T00:00:00`);
}

/** Today as an ISO day, read from the host's local calendar. */
export function todayIsoDay(now: Date = new Date()): IsoDay {
  return [
    String(now.getFullYear()).padStart(4, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * First instant of an ISO day in the **operator's** time zone, as UTC ISO.
 *
 * Moved verbatim out of `FormsAnalyticsView.vue`: the picker hands over a calendar
 * day, the API wants an instant, and the operator means their own midnight. The
 * `T00:00:00` form (no `Z`) is what makes `new Date` parse it as local.
 */
export function localDayStart(day: IsoDay): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

/** Last instant of an ISO day in the operator's time zone, as UTC ISO. Inclusive upper bound. */
export function localDayEnd(day: IsoDay): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}

/** A closed day range. `null` on either side means "unbounded". */
export interface DayRange {
  from: IsoDay | null;
  to: IsoDay | null;
}

/**
 * Named ranges offered by the range picker.
 *
 * A frozen closed union, which is what lets a call site build
 * `common.datePicker.presets.${name}` — the one key concatenation
 * `.claude/rules/i18n.md` allows, because the guard can enumerate it.
 */
export const RANGE_PRESETS = ['last7', 'last30', 'last90', 'thisMonth', 'prevMonth'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/**
 * Resolve a preset against a clock.
 *
 * `now` is a parameter, never `new Date()` read inside: that is the difference
 * between a spec that pins real behavior and one that has to mock the clock.
 * `last7` counts today as one of the seven — an operator asking for "last 7 days"
 * on the 24th means the 18th through the 24th, not a week ending yesterday.
 */
export function presetRange(preset: RangePreset, now: Date = new Date()): Required<DayRange> {
  const today = new CalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());

  switch (preset) {
    case 'last7':
      return { from: toIsoDay(today.subtract({ days: 6 })), to: toIsoDay(today) };
    case 'last30':
      return { from: toIsoDay(today.subtract({ days: 29 })), to: toIsoDay(today) };
    case 'last90':
      return { from: toIsoDay(today.subtract({ days: 89 })), to: toIsoDay(today) };
    case 'thisMonth':
      return {
        from: toIsoDay(startOfMonth(today)),
        // Clamp to today, not to the month's end: a range running into the future
        // reads as broken when the chart stops at today anyway.
        to: toIsoDay(today),
      };
    case 'prevMonth': {
      const start = startOfMonth(today.subtract({ months: 1 }));
      return { from: toIsoDay(start), to: toIsoDay(endOfMonth(start)) };
    }
  }
}

/** The preset whose range equals `range`, or `undefined` for a hand-picked one. */
export function matchPreset(range: DayRange, now: Date = new Date()): RangePreset | undefined {
  if (!range.from || !range.to) return undefined;
  return RANGE_PRESETS.find((preset) => {
    const candidate = presetRange(preset, now);
    return candidate.from === range.from && candidate.to === range.to;
  });
}

/** Order a range's ends, so a backwards selection still means what the operator drew. */
export function normalizeRange(range: DayRange): DayRange {
  const { from, to } = range;
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}
