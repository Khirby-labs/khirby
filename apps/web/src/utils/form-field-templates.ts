import type { FormField, FormKind } from '@khirby/types';

export const FORM_FIELD_TYPES = [
  'text',
  'email',
  'textarea',
  'number',
  'tel',
  'url',
  'checkbox',
  'select',
] as const;

/** Seed a field with English visitor label; PL stays empty for the operator to author (ADR-0025). */
function seedField(
  name: string,
  type: FormField['type'],
  required: boolean,
  enLabel: string,
): FormField {
  return {
    name,
    type,
    required,
    label: enLabel,
    labels: { en: enLabel },
  };
}

export interface FormSchemaTemplate {
  id: FormKind;
  /**
   * Message key for the PICKER label — never a translated string and never a
   * `t()` call: this module is imported before `app.use(i18n)`, so `t()` here
   * would return the raw key and pin it to the boot locale
   * (`.claude/rules/i18n.md`). Views resolve it in a `computed`.
   */
  labelKey: string;
  kind: FormKind;
  /**
   * ⚠ Field labels are ENGLISH SEEDS written into `forms.schema` and shown to
   * the *customer's* site visitors (ADR-0011 / ADR-0025). Do not copy the
   * operator UI locale into these seeds. Templates set `labels.en` (and
   * `label`); Polish is left empty for the operator to author in the builder.
   */
  fields: FormField[];
}

export const FORM_SCHEMA_TEMPLATES: Record<FormKind, FormSchemaTemplate> = {
  contact: {
    id: 'contact',
    labelKey: 'forms.kind.contact',
    kind: 'contact',
    fields: [
      seedField('name', 'text', true, 'Full name'),
      seedField('email', 'email', true, 'Email'),
      seedField('message', 'textarea', true, 'Message'),
    ],
  },
  waitlist: {
    id: 'waitlist',
    labelKey: 'forms.kind.waitlist',
    kind: 'waitlist',
    fields: [
      seedField('email', 'email', true, 'Email'),
      seedField('name', 'text', false, 'Name'),
    ],
  },
  wishlist: {
    id: 'wishlist',
    labelKey: 'forms.kind.wishlist',
    kind: 'wishlist',
    fields: [
      seedField('email', 'email', true, 'Email'),
      seedField('message', 'textarea', false, 'Message'),
    ],
  },
  feedback: {
    id: 'feedback',
    labelKey: 'forms.kind.feedback',
    kind: 'feedback',
    fields: [
      seedField('message', 'textarea', true, 'Feedback'),
      // email is required: public submissions are matched to contacts by email (see FormsService)
      seedField('email', 'email', true, 'Email'),
    ],
  },
};

export const FORM_TEMPLATE_OPTIONS = Object.values(FORM_SCHEMA_TEMPLATES).map((t) => ({
  id: t.id,
  labelKey: t.labelKey,
}));

export function getTemplate(id: FormKind): FormSchemaTemplate {
  return FORM_SCHEMA_TEMPLATES[id];
}

/**
 * Slug from a form name. The slug is a UNIQUE DB key and must stay ASCII, so a
 * Polish name has to be transliterated rather than stripped: without this,
 * "Zapytanie ofertowe — łódź" collapsed to "zapytanie-ofertowe-d" and "Ćwiczenie"
 * to an empty string, which the server then rejects as a duplicate of every other
 * diacritics-only name.
 *
 * NFD decomposes every Polish diacritic except ł (U+0142 has no decomposition),
 * which is handled explicitly. The same pass fixes é/ü/ñ for free.
 */
export function slugifyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents (a-ogonek, z-dot, e-acute)
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
