import { BadRequestException } from '@nestjs/common';
import { assertEmailPresent, validateSubmissionDataAgainstSchema } from './validate-submission-data';

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
    ).toThrow(BadRequestException);
  });

  it('rejects missing required fields', () => {
    expect(() =>
      validateSubmissionDataAgainstSchema(schema, { name: 'Ada' }),
    ).toThrow(/required/i);
  });

  it('rejects invalid email', () => {
    expect(() =>
      validateSubmissionDataAgainstSchema(schema, { email: 'not-an-email' }),
    ).toThrow(/invalid email/i);
  });

  it('accepts any body when schema is empty', () => {
    const result = validateSubmissionDataAgainstSchema([], {
      email: 'anything',
      foo: 'bar',
    });
    expect(result).toEqual({ email: 'anything', foo: 'bar' });
  });
});

describe('assertEmailPresent', () => {
  it('throws BadRequestException when email missing', () => {
    expect(() => assertEmailPresent({})).toThrow(BadRequestException);
  });
});
