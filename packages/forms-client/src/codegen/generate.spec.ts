import { generateFormModule } from './generate.js';

describe('generateFormModule', () => {
  it('generates typed module source', () => {
    const { code, exportName, typeName } = generateFormModule(
      {
        name: 'Contact Us',
        slug: 'contact-us',
        kind: 'contact',
        fields: [
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'name', label: 'Name', type: 'text', required: false },
        ],
      },
      'token-abc',
    );

    expect(exportName).toBe('contactUsForm');
    expect(typeName).toBe('ContactUsFormSubmit');
    expect(code).toContain("token: 'token-abc'");
    expect(code).toContain('export type ContactUsFormSubmit');
    expect(code).toContain('@khirby/forms-client');
  });
});
