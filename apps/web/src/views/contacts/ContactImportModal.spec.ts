import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import ContactImportModal from './ContactImportModal.vue';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';
import { mountWithI18n, resetLocale } from '../../test/i18n';

describe('ContactImportModal', () => {
  beforeEach(() => {
    server.use(http.get(api('/api/custom-fields'), () => HttpResponse.json([])));
  });

  afterEach(() => {
    resetLocale();
    document.body.innerHTML = '';
  });

  it('maps headers from a Polish Excel CSV (semicolon, BOM, CRLF)', async () => {
    mountWithI18n(ContactImportModal, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    await flushPromises();

    const csv = '\uFEFFE-mail;Imię;MRR\r\nada@example.com;Ada;1200\r\n';
    const file = new File([csv], 'kontakty.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: async () => csv });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();

    expect(document.body.textContent).toContain('E-mail');
    expect(document.body.textContent).toContain('Imię');
    expect(document.body.textContent).toContain('MRR');
  });
});
