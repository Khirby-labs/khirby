import { FormValidationError } from './errors.js';
import { assertEmailPresent, validateSubmissionDataAgainstSchema } from './validate.js';

describe('validateSubmissionDataAgainstSchema', () => {
  const schema = [
    { name: 'email', type: 'email', required: true },
    { name: 'name', type: 'text', required: false },
    { name: 'age', type: 'number', required: false },
  ];

  it('accepts valid data', () => {
    const result = validateSubmissionDataAgainstSchema(schema, {
      email: 'test@example.com',
      name: 'Ada',
    });
    expect(result).toEqual({ email: 'test@example.com', name: 'Ada' });
  });

  it('strips honeypot field', () => {
    const result = validateSubmissionDataAgainstSchema(schema, {
      email: 'test@example.com',
      _hp: 'bot',
    });
    expect(result).toEqual({ email: 'test@example.com' });
  });

  it('rejects unknown fields when schema is non-empty', () => {
    expect(() =>
      validateSubmissionDataAgainstSchema(schema, {
        email: 'test@example.com',
        extra: 'nope',
      }),
    ).toThrow(FormValidationError);
  });

  it('rejects missing required fields', () => {
    expect(() => validateSubmissionDataAgainstSchema(schema, { name: 'Ada' })).toThrow(/required/i);
  });

  it('rejects invalid email', () => {
    expect(() => validateSubmissionDataAgainstSchema(schema, { email: 'not-an-email' })).toThrow(
      /invalid email/i,
    );
  });

  it('accepts any body when schema is empty', () => {
    const result = validateSubmissionDataAgainstSchema([], {
      email: 'anything',
      foo: 'bar',
    });
    expect(result).toEqual({ email: 'anything', foo: 'bar' });
  });

  it('accepts a select value as a string', () => {
    const selectSchema = [{ name: 'plan', type: 'select', required: true }];
    expect(validateSubmissionDataAgainstSchema(selectSchema, { plan: 'pro' })).toEqual({
      plan: 'pro',
    });
  });

  it('accepts a select value that is one of the declared options', () => {
    const selectSchema = [
      { name: 'plan', type: 'select', required: true, options: ['Free', 'Pro'] },
    ];
    expect(validateSubmissionDataAgainstSchema(selectSchema, { plan: 'Pro' })).toEqual({
      plan: 'Pro',
    });
  });

  it('rejects a select value outside the declared options', () => {
    const selectSchema = [
      { name: 'plan', type: 'select', required: true, options: ['Free', 'Pro'] },
    ];
    expect(() => validateSubmissionDataAgainstSchema(selectSchema, { plan: 'Enterprise' })).toThrow(
      /must be one of/i,
    );
  });

  it('rejects an unsupported field type instead of silently accepting it', () => {
    const badSchema = [{ name: 'when', type: 'date', required: true }] as any;
    expect(() => validateSubmissionDataAgainstSchema(badSchema, { when: '2026-01-01' })).toThrow(
      /unsupported type/i,
    );
  });
});

describe('assertEmailPresent', () => {
  it('accepts valid email', () => {
    expect(() => assertEmailPresent({ email: 'a@b.co' })).not.toThrow();
  });

  it('rejects missing email', () => {
    expect(() => assertEmailPresent({})).toThrow(/email/i);
  });
});
