import { describe, expect, it } from 'vitest';
import { PL_FEW, PL_MANY, PL_ONE, polishPluralRule } from './plural';

/**
 * Pure input→output unit — no mocks are possible here, so no tautology is
 * either (ADR-0010). The cases are the CLDR `pl` boundaries: the 12–14
 * exception is the one a hand-rolled rule always gets wrong.
 */
describe('polishPluralRule', () => {
  const THREE_FORMS = 3;
  const category = (n: number) => polishPluralRule(n, THREE_FORMS);

  it('uses the singular only for exactly one', () => {
    expect(category(1)).toBe(PL_ONE);
  });

  it.each([2, 3, 4, 22, 23, 24, 102, 1004])('treats %i as few', (n) => {
    expect(category(n)).toBe(PL_FEW);
  });

  it.each([0, 5, 6, 9, 10, 11, 25, 100, 1000])('treats %i as many', (n) => {
    expect(category(n)).toBe(PL_MANY);
  });

  it.each([12, 13, 14, 112, 113, 114])('treats %i as many despite ending in 2–4', (n) => {
    expect(category(n)).toBe(PL_MANY);
  });

  it('treats fractions as many — "1,5 pliku" takes the genitive', () => {
    expect(category(1.5)).toBe(PL_MANY);
    expect(category(2.5)).toBe(PL_MANY);
  });

  it('ignores the sign', () => {
    expect(category(-1)).toBe(PL_ONE);
    expect(category(-3)).toBe(PL_FEW);
  });

  it('degrades to one/other when a message only has two forms', () => {
    expect(polishPluralRule(1, 2)).toBe(0);
    expect(polishPluralRule(3, 2)).toBe(1);
    expect(polishPluralRule(7, 2)).toBe(1);
  });

  it('never indexes past the end of the choice list', () => {
    for (const length of [1, 2, 3]) {
      for (const n of [0, 1, 2, 5, 13, 22, 1.5]) {
        const index = polishPluralRule(n, length);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(length);
      }
    }
  });
});
