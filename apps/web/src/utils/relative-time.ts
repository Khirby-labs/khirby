/** Buckets for chat-style relative timestamps (minutes → hours → yesterday → absolute). */

export type RelativeTimeParts =
  | { kind: 'relative'; value: number; unit: Intl.RelativeTimeFormatUnit }
  | { kind: 'absolute'; date: Date };

/**
 * Pick how to render `then` relative to `now`.
 * Callers format `relative` via Intl.RelativeTimeFormat and `absolute` via i18n `d()`.
 */
export function relativeTimeParts(
  then: Date | string | number,
  now: Date | number = Date.now(),
): RelativeTimeParts {
  const date = then instanceof Date ? then : new Date(then);
  const nowMs = typeof now === 'number' ? now : now.getTime();
  if (Number.isNaN(date.getTime())) {
    return { kind: 'absolute', date: new Date(nowMs) };
  }

  const diffMs = nowMs - date.getTime();
  // Future clock skew — show absolute.
  if (diffMs < 0) return { kind: 'absolute', date };

  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 45) return { kind: 'relative', value: 0, unit: 'second' };

  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 60) return { kind: 'relative', value: -diffMin, unit: 'minute' };

  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfThen = new Date(date);
  startOfThen.setHours(0, 0, 0, 0);
  const dayDelta = Math.round((startOfToday.getTime() - startOfThen.getTime()) / 86_400_000);

  if (dayDelta === 0) {
    const diffHour = Math.max(1, Math.round(diffMs / 3_600_000));
    return { kind: 'relative', value: -diffHour, unit: 'hour' };
  }
  if (dayDelta === 1) return { kind: 'relative', value: -1, unit: 'day' };
  if (dayDelta > 1 && dayDelta < 7) return { kind: 'relative', value: -dayDelta, unit: 'day' };

  return { kind: 'absolute', date };
}

export function formatRelativeTime(
  then: Date | string | number,
  locale: string,
  formatAbsolute: (date: Date) => string,
  now: Date | number = Date.now(),
): string {
  const parts = relativeTimeParts(then, now);
  if (parts.kind === 'absolute') return formatAbsolute(parts.date);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(parts.value, parts.unit);
}
