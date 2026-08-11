/**
 * Pluralization rules (ADR-0011).
 *
 * vue-i18n's built-in rule is index-based and English-shaped, which is WRONG for
 * Slavic languages: a message authored for English renders the wrong form at 2,
 * 5 and 22 in Polish — and reads as broken Polish rather than as a bug, so
 * nobody reports it.
 *
 * Each rule is a pure function, unit-tested without booting vue-i18n.
 */

/** vue-i18n's PluralizationRule shape, declared locally so this file stays framework-free. */
export type PluralRule = (choice: number, choicesLength: number) => number;

/** Index into a `one | few | many` message. */
export const PL_ONE = 0;
export const PL_FEW = 1;
export const PL_MANY = 2;

/**
 * CLDR `pl` cardinal categories:
 *   one  → n = 1
 *   few  → n % 10 in 2..4 and n % 100 not in 12..14
 *   many → everything else (0, 5..21, and non-integers, which take the same
 *          genitive form: "1,5 pliku")
 *
 * A 2-form message (translator wrote only `one | other`) degrades to one/other
 * instead of indexing past the end of the choice list.
 */
export const polishPluralRule: PluralRule = (choice, choicesLength) => {
  const n = Math.abs(choice);
  const isInteger = Number.isInteger(n);

  if (choicesLength < 3) return isInteger && n === 1 ? 0 : Math.min(1, choicesLength - 1);
  if (!isInteger) return PL_MANY;
  if (n === 1) return PL_ONE;

  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return PL_FEW;
  return PL_MANY;
};

/**
 * Only locales whose plural shape differs from vue-i18n's default need an entry.
 * `en` is intentionally absent — the built-in rule is correct for it.
 */
export const pluralRules: Record<string, PluralRule> = {
  pl: polishPluralRule,
};
