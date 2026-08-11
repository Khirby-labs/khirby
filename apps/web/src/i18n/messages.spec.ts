import { describe, expect, it } from 'vitest';
import en from './messages/en';
import pl from './messages/pl';
import { LOCALE_CODES } from './locales';

/**
 * Parity is a pure unit over the two message trees — no mocks are possible, so
 * no tautology is either (ADR-0010). `pnpm lint:i18n` checks the same invariant
 * over the JSON on disk; this spec makes it fail at test time too, next to the
 * code that depends on it.
 */
function flatten(value: unknown, prefix = '', out = new Map<string, unknown>()) {
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, out);
    else out.set(path, child);
  }
  return out;
}

const bundles = { en, pl } as const;

describe('message bundles', () => {
  it('covers every registered locale', () => {
    expect(Object.keys(bundles).sort()).toEqual([...LOCALE_CODES].sort());
  });

  it('has identical key sets in pl and en — no missing keys, no orphans', () => {
    const enKeys = [...flatten(en).keys()].sort();
    const plKeys = [...flatten(pl).keys()].sort();
    expect(plKeys).toEqual(enKeys);
  });

  it.each(Object.entries(bundles))('has no empty values in %s', (_locale, bundle) => {
    for (const [key, value] of flatten(bundle)) {
      expect(typeof value, `${key} should be a string`).toBe('string');
      expect((value as string).trim(), `${key} should not be empty`).not.toBe('');
    }
  });

  it('writes Polish copy with Polish typography', () => {
    for (const [key, value] of flatten(pl)) {
      expect(value as string, `${key} must not use a straight quote`).not.toContain('"');
      expect(value as string, `${key} must use a real ellipsis`).not.toContain('...');
    }
  });

  /*
   * A shipped plural key, checked at the boundaries that break: Polish needs
   * three forms and the 12–14 exception, so a message authored for English is
   * wrong at 2 and 5 and reads as broken Polish rather than as a bug.
   */
  it('gives every plural message the right number of forms', () => {
    const forms = (bundle: unknown) =>
      (flatten(bundle).get('plugins.config.subscribers') as string).split('|').length;

    expect(forms(en)).toBe(2);
    expect(forms(pl)).toBe(3);
  });

  it('does not leak Polish quotes into English copy', () => {
    for (const [key, value] of flatten(en)) {
      expect(value as string, `${key} must not use Polish quotes`).not.toContain('„');
    }
  });
});
