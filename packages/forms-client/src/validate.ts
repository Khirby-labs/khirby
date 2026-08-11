import { FormValidationError } from './errors.js';
import type { FormFieldDefinition } from './types.js';

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

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return false;
}

function assertKnownFieldNames(data: Record<string, unknown>, allowed: Set<string>): void {
  for (const key of Object.keys(data)) {
    if (key === '_hp') continue;
    if (!allowed.has(key)) {
      throw new FormValidationError(`Unknown field: ${key}`);
    }
  }
}

function validateByType(
  fieldName: string,
  type: string | undefined,
  value: unknown,
  options?: string[],
): void {
  if (type === undefined || type === 'text' || type === 'textarea') {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new FormValidationError(`Field "${fieldName}" must be a string or number`);
    }
    return;
  }

  if (type === 'checkbox') {
    if (typeof value !== 'boolean' && typeof value !== 'string') {
      throw new FormValidationError(`Field "${fieldName}" must be a boolean`);
    }
    return;
  }

  if (type === 'email') {
    if (typeof value !== 'string' || !EMAIL_RE.test(value.trim())) {
      throw new FormValidationError(`Invalid email in field "${fieldName}"`);
    }
    return;
  }

  if (type === 'number') {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new FormValidationError(`Invalid number in field "${fieldName}"`);
      }
      return;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        throw new FormValidationError(`Invalid number in field "${fieldName}"`);
      }
      return;
    }
    throw new FormValidationError(`Invalid number in field "${fieldName}"`);
  }

  if (type === 'tel') {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new FormValidationError(`Invalid phone in field "${fieldName}"`);
    }
    return;
  }

  if (type === 'url') {
    if (typeof value !== 'string') {
      throw new FormValidationError(`Invalid URL in field "${fieldName}"`);
    }
    const s = value.trim();
    try {
      const u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new FormValidationError(`Invalid URL in field "${fieldName}"`);
      }
    } catch {
      throw new FormValidationError(`Invalid URL in field "${fieldName}"`);
    }
    return;
  }

  if (type === 'select') {
    if (typeof value !== 'string') {
      throw new FormValidationError(`Field "${fieldName}" must be a string`);
    }
    if (options && options.length > 0 && !options.includes(value)) {
      throw new FormValidationError(`Field "${fieldName}" must be one of: ${options.join(', ')}`);
    }
    return;
  }

  throw new FormValidationError(`Field "${fieldName}" has an unsupported type "${type}"`);
}

/**
 * When schema is non-empty, validates keys and values.
 * When schema is empty, accepts any body (minus honeypot).
 */
export function validateSubmissionDataAgainstSchema(
  schema: FormFieldDefinition[],
  body: Record<string, unknown>,
): Record<string, unknown> {
  const data = { ...body };
  delete data['_hp'];

  if (!schema.length) return data;

  const allowed = new Set(schema.map((f) => f.name));
  assertKnownFieldNames(data, allowed);

  for (const field of schema) {
    const value = data[field.name];

    if (field.required && !isNonEmptyValue(value)) {
      throw new FormValidationError(`Field "${field.name}" is required`);
    }

    if (!isNonEmptyValue(value)) continue;

    validateByType(field.name, field.type, value, field.options);
  }

  return data;
}

const EMAIL_VALIDATOR_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** CRM public submit always requires a valid top-level email field. */
export function assertEmailPresent(data: Record<string, unknown>): void {
  const rawEmail = String(data['email'] ?? '').trim();
  if (!rawEmail || !EMAIL_VALIDATOR_RE.test(rawEmail)) {
    throw new FormValidationError('A valid email address is required');
  }
}
