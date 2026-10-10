import { AppException } from '../../core/errors/app-exception';

/**
 * First-class adaptive submit keys — must not appear in forms.schema (ADR-0058).
 * Also block names that collide with the public adaptive payload envelope.
 */
export const ADAPTIVE_RESERVED_CONTACT_FIELD_NAMES = new Set([
  'name',
  'email',
  'company',
  'companyName',
  'opening',
  'content',
  'questions',
  'answers',
  'locale',
  'fields',
  '_hp',
]);

export function assertAdaptiveContactSchema(
  schema: Array<{ name: string }> | null | undefined,
): void {
  if (!schema?.length) return;
  const seen = new Set<string>();
  for (const field of schema) {
    const name = String(field.name ?? '').trim();
    if (!name) {
      throw AppException.badRequest('Contact field name is required.', { field: 'schema' });
    }
    if (ADAPTIVE_RESERVED_CONTACT_FIELD_NAMES.has(name)) {
      throw AppException.badRequest(
        `Contact field "${name}" is reserved — use the first-class name/email/company keys instead.`,
        { field: 'schema' },
      );
    }
    if (seen.has(name)) {
      throw AppException.badRequest(`Duplicate contact field name: ${name}`, { field: 'schema' });
    }
    seen.add(name);
  }
}

/** Prefer explicit `phone` / `tel` keys; then any value that looks like a phone number. */
export function extractPhoneFromContactFields(
  contactFields: Record<string, unknown> | null | undefined,
): string | null {
  if (!contactFields || typeof contactFields !== 'object') return null;

  const preferredKeys = ['phone', 'telefon', 'mobile', 'tel'];
  for (const key of preferredKeys) {
    const raw = contactFields[key];
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) return trimmed;
  }

  for (const [key, raw] of Object.entries(contactFields)) {
    if (/phone|telefon|mobile|tel|komórk|komork/i.test(key) && typeof raw === 'string') {
      const trimmed = raw.trim();
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length >= 7 && digits.length <= 15) return trimmed;
    }
  }

  return null;
}

/** Operator-facing labels for adaptive contact fields, keyed by schema `name`. */
export function contactFieldLabelsFromSchema(
  schema:
    | Array<{ name: string; label?: string; labels?: { en?: string; pl?: string } }>
    | null
    | undefined,
): Record<string, { label?: string; pl?: string; en?: string }> {
  const out: Record<string, { label?: string; pl?: string; en?: string }> = {};
  for (const field of schema ?? []) {
    const name = String(field.name ?? '').trim();
    if (!name) continue;
    out[name] = { label: field.label, pl: field.labels?.pl, en: field.labels?.en };
  }
  return out;
}

export function readContactFieldsFromSourceMeta(
  sourceMeta: unknown,
): Record<string, unknown> | null {
  if (!sourceMeta || typeof sourceMeta !== 'object') return null;
  const bag = (sourceMeta as Record<string, unknown>).contactFields;
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return null;
  return bag as Record<string, unknown>;
}

/**
 * Contact metadata written on inquiry accept (ADR-0058).
 * - `company` stays a top-level metadata key (existing convention)
 * - adaptive extras land in `formContact` so they do not require custom_field_definitions
 */
export function buildContactAcceptMetadata(input: {
  companyName?: string | null;
  contactFields?: Record<string, unknown> | null;
}): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {};
  if (input.companyName?.trim()) meta.company = input.companyName.trim();
  if (input.contactFields && Object.keys(input.contactFields).length > 0) {
    meta.formContact = { ...input.contactFields };
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}
