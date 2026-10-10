import {
  assertAdaptiveContactSchema,
  buildContactAcceptMetadata,
  contactFieldLabelsFromSchema,
  extractPhoneFromContactFields,
  readContactFieldsFromSourceMeta,
} from './adaptive-contact-fields';

describe('assertAdaptiveContactSchema', () => {
  it('allows empty / undefined schema', () => {
    expect(() => assertAdaptiveContactSchema([])).not.toThrow();
    expect(() => assertAdaptiveContactSchema(undefined)).not.toThrow();
  });

  it('allows phone / address field names', () => {
    expect(() =>
      assertAdaptiveContactSchema([
        { name: 'phone' },
        { name: 'street' },
        { name: 'postalCode' },
        { name: 'city' },
      ]),
    ).not.toThrow();
  });

  it('rejects reserved first-class names', () => {
    expect(() => assertAdaptiveContactSchema([{ name: 'email' }])).toThrow(/reserved/i);
    expect(() => assertAdaptiveContactSchema([{ name: 'name' }])).toThrow(/reserved/i);
    expect(() => assertAdaptiveContactSchema([{ name: 'company' }])).toThrow(/reserved/i);
  });

  it('rejects duplicate names', () => {
    expect(() => assertAdaptiveContactSchema([{ name: 'phone' }, { name: 'phone' }])).toThrow(
      /Duplicate/i,
    );
  });
});

describe('extractPhoneFromContactFields', () => {
  it('reads phone key', () => {
    expect(extractPhoneFromContactFields({ phone: '+48 997 998 999' })).toBe('+48 997 998 999');
  });

  it('returns null when missing or too short', () => {
    expect(extractPhoneFromContactFields({})).toBeNull();
    expect(extractPhoneFromContactFields({ phone: '123' })).toBeNull();
    expect(extractPhoneFromContactFields(null)).toBeNull();
  });
});

describe('readContactFieldsFromSourceMeta', () => {
  it('reads contactFields bag', () => {
    expect(readContactFieldsFromSourceMeta({ contactFields: { city: 'Gdańsk' } })).toEqual({
      city: 'Gdańsk',
    });
  });

  it('returns null for missing / invalid', () => {
    expect(readContactFieldsFromSourceMeta({})).toBeNull();
    expect(readContactFieldsFromSourceMeta({ contactFields: [] })).toBeNull();
  });
});

describe('buildContactAcceptMetadata', () => {
  it('writes company + formContact bag', () => {
    expect(
      buildContactAcceptMetadata({
        companyName: 'Acme',
        contactFields: { phone: '500600700', city: 'Gdańsk' },
      }),
    ).toEqual({
      company: 'Acme',
      formContact: { phone: '500600700', city: 'Gdańsk' },
    });
  });

  it('returns undefined when empty', () => {
    expect(buildContactAcceptMetadata({})).toBeUndefined();
  });
});

describe('contactFieldLabelsFromSchema', () => {
  it('keeps operator labels keyed by field name', () => {
    expect(
      contactFieldLabelsFromSchema([
        { name: 'city', label: 'Miasto', labels: { pl: 'Miasto', en: 'City' } },
        { name: '  ', label: 'skip' },
      ]),
    ).toEqual({
      city: { label: 'Miasto', pl: 'Miasto', en: 'City' },
    });
  });
});
