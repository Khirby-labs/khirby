import { describe, it, expect } from 'vitest';
import { formatRelativeTime, relativeTimeParts } from './relative-time';

const noon = new Date('2026-08-14T12:00:00');

describe('relativeTimeParts', () => {
  it('uses seconds for the last half-minute', () => {
    expect(relativeTimeParts(new Date(noon.getTime() - 10_000), noon)).toEqual({
      kind: 'relative',
      value: 0,
      unit: 'second',
    });
  });

  it('uses minutes under an hour', () => {
    expect(relativeTimeParts(new Date(noon.getTime() - 5 * 60_000), noon)).toEqual({
      kind: 'relative',
      value: -5,
      unit: 'minute',
    });
  });

  it('uses hours under a day', () => {
    expect(relativeTimeParts(new Date(noon.getTime() - 3 * 3_600_000), noon)).toEqual({
      kind: 'relative',
      value: -3,
      unit: 'hour',
    });
  });

  it('uses yesterday for the previous calendar day even under 24h', () => {
    expect(relativeTimeParts(new Date('2026-08-13T18:00:00'), noon)).toEqual({
      kind: 'relative',
      value: -1,
      unit: 'day',
    });
  });

  it('falls back to absolute for older dates', () => {
    const parts = relativeTimeParts(new Date('2026-07-01T15:11:00'), noon);
    expect(parts.kind).toBe('absolute');
    if (parts.kind === 'absolute') {
      expect(parts.date.toISOString()).toContain('2026-07-01');
    }
  });
});

describe('formatRelativeTime', () => {
  it('formats Polish relative minutes', () => {
    const label = formatRelativeTime(
      new Date(noon.getTime() - 5 * 60_000),
      'pl',
      () => 'ABS',
      noon,
    );
    expect(label).toMatch(/5/);
    expect(label.toLowerCase()).toMatch(/minut/);
  });

  it('uses the absolute formatter for old timestamps', () => {
    expect(
      formatRelativeTime(new Date('2026-07-01T15:11:00'), 'en', (d) => d.toISOString(), noon),
    ).toContain('2026-07-01');
  });
});
