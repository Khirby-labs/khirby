import { describe, it, expect } from 'vitest';
import {
  slugifyName,
  getTemplate,
  FORM_TEMPLATE_OPTIONS,
  FORM_SCHEMA_TEMPLATES,
  FORM_FIELD_TYPES,
} from './form-field-templates';

describe('slugifyName', () => {
  it('lowercases and hyphenates words', () => {
    expect(slugifyName('My Cool Form')).toBe('my-cool-form');
  });

  it('collapses runs of punctuation/space into a single hyphen', () => {
    expect(slugifyName('  Hello --- World!!  ')).toBe('hello-world');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugifyName('---abc---')).toBe('abc');
  });

  it('returns an empty string for punctuation-only input', () => {
    expect(slugifyName('!!!')).toBe('');
  });

  /*
   * The slug is a unique DB key, so a Polish name must transliterate rather than
   * lose its letters — stripping non-ASCII used to mangle these into collisions.
   */
  it('transliterates Polish diacritics instead of dropping them', () => {
    expect(slugifyName('Zapytanie ofertowe Łódź')).toBe('zapytanie-ofertowe-lodz');
    expect(slugifyName('Ćwiczenie')).toBe('cwiczenie');
    expect(slugifyName('Zgłoszenia z ankiety')).toBe('zgloszenia-z-ankiety');
    expect(slugifyName('ąćęłńóśźż')).toBe('acelnoszz');
  });

  it('transliterates other Latin diacritics the same way', () => {
    expect(slugifyName('Café Über')).toBe('cafe-uber');
  });
});

describe('getTemplate', () => {
  it('returns the template matching the requested kind', () => {
    const t = getTemplate('waitlist');
    expect(t.kind).toBe('waitlist');
    expect(t.fields.map((f) => f.name)).toContain('email');
  });

  it('every template collects a required email (so it is submittable)', () => {
    for (const template of Object.values(FORM_SCHEMA_TEMPLATES)) {
      const email = template.fields.find((f) => f.name === 'email');
      expect(email, `${template.id} must have an email field`).toBeDefined();
      expect(email?.required, `${template.id} email must be required`).toBe(true);
    }
  });
});

describe('FORM_FIELD_TYPES', () => {
  it('offers select as a field type (parity with the shared type + validator)', () => {
    expect(FORM_FIELD_TYPES).toContain('select');
  });
});

describe('FORM_TEMPLATE_OPTIONS', () => {
  /*
   * A message KEY, never a translated label and never a t() call: this module is
   * imported before app.use(i18n), so a t() here would freeze the boot locale
   * (.claude/rules/i18n.md). Views resolve the key in a computed.
   */
  it('exposes an id + message key for every template', () => {
    expect(FORM_TEMPLATE_OPTIONS.length).toBe(Object.keys(FORM_SCHEMA_TEMPLATES).length);
    for (const opt of FORM_TEMPLATE_OPTIONS) {
      expect(typeof opt.id).toBe('string');
      expect(opt.labelKey).toBe(`forms.kind.${opt.id}`);
    }
  });

  /*
   * Field labels are written into forms.schema and rendered to the customer's own
   * site visitors (ADR-0011 / ADR-0025) — English seed in label + labels.en; PL
   * stays empty so a Polish operator does not silently ship UI-locale copy.
   */
  it('keeps template field labels as an untranslated English seed with labels.en', () => {
    expect(FORM_SCHEMA_TEMPLATES.contact.fields.map((f) => f.label)).toEqual([
      'Full name',
      'Email',
      'Message',
    ]);
    expect(FORM_SCHEMA_TEMPLATES.contact.fields.map((f) => f.labels)).toEqual([
      { en: 'Full name' },
      { en: 'Email' },
      { en: 'Message' },
    ]);
  });
});
