import { describe, it, expect, jest } from '@jest/globals';
import { createClient } from './client.js';

describe('createClient — locale', () => {
  const formBody = {
    name: 'Contact',
    slug: 'contact',
    kind: 'contact',
    fields: [{ name: 'email', label: 'E-mail', type: 'email', required: true }],
  };

  it('appends ?locale= from client options', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => formBody,
    });
    const client = createClient({
      baseUrl: 'https://crm.example.com',
      fetch: fetchFn as unknown as typeof fetch,
      locale: 'pl',
    });

    await client.getForm('tok-1');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://crm.example.com/api/public/forms/tok-1?locale=pl',
    );
  });

  it('lets getForm override the client locale', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => formBody,
    });
    const client = createClient({
      baseUrl: 'https://crm.example.com',
      fetch: fetchFn as unknown as typeof fetch,
      locale: 'en',
    });

    await client.getForm('tok-1', { locale: 'pl' });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://crm.example.com/api/public/forms/tok-1?locale=pl',
    );
  });

  it('caches by token + locale', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...formBody,
          fields: [{ name: 'email', label: 'Email', type: 'email', required: true }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => formBody,
      });

    const client = createClient({
      baseUrl: 'https://crm.example.com',
      fetch: fetchFn as unknown as typeof fetch,
    });

    const en1 = await client.form('tok-1', { locale: 'en' });
    const en2 = await client.form('tok-1', { locale: 'en' });
    const pl = await client.form('tok-1', { locale: 'pl' });

    expect(en1.fields[0].label).toBe('Email');
    expect(en2.fields[0].label).toBe('Email');
    expect(pl.fields[0].label).toBe('E-mail');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('omits locale query when none is set (CRM defaults to en)', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => formBody,
    });
    const client = createClient({
      baseUrl: 'https://crm.example.com/',
      fetch: fetchFn as unknown as typeof fetch,
    });

    await client.getForm('tok-1');
    expect(fetchFn).toHaveBeenCalledWith('https://crm.example.com/api/public/forms/tok-1');
  });
});

describe('createClient — inquiry methods', () => {
  const makeOkFetch = (body: unknown) =>
    jest.fn().mockResolvedValue({ ok: true, json: async () => body });

  const baseUrl = 'https://crm.example.com';

  describe('createInquiry()', () => {
    it('POSTs to /api/public/forms/:token/inquiries with _hp and returns result', async () => {
      const result = { publicToken: 'pub-abc', inquiryId: 'inq-1' };
      const fetchFn = makeOkFetch(result);
      const client = createClient({ baseUrl, fetch: fetchFn as unknown as typeof fetch });

      const res = await client.createInquiry('tok-1', { name: 'Alice' });

      expect(fetchFn).toHaveBeenCalledWith(
        `${baseUrl}/api/public/forms/tok-1/inquiries`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Alice', _hp: '' }),
        }),
      );
      expect(res).toEqual(result);
    });

    it('does not assert email present (no FormValidationError for email-less payload)', async () => {
      const fetchFn = makeOkFetch({ publicToken: 'pub-abc', inquiryId: 'inq-2' });
      const client = createClient({ baseUrl, fetch: fetchFn as unknown as typeof fetch });

      // Should NOT throw even though there is no email field
      await expect(client.createInquiry('tok-1', { name: 'Bob' })).resolves.toBeTruthy();
    });

    it('propagates _hp if provided by caller', async () => {
      const fetchFn = makeOkFetch({ publicToken: 'pub-abc', inquiryId: 'inq-3' });
      const client = createClient({ baseUrl, fetch: fetchFn as unknown as typeof fetch });

      await client.createInquiry('tok-1', { name: 'Carol', _hp: 'bot-value' });

      const sentBody = JSON.parse(
        (fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string,
      );
      expect(sentBody._hp).toBe('bot-value');
    });
  });

  describe('planAdaptive()', () => {
    it('POSTs to /api/public/forms/:token/adaptive/plan (no inquiry id)', async () => {
      const result = { questions: ['Q1?', 'Q2?', 'Q3?'] };
      const fetchFn = makeOkFetch(result);
      const client = createClient({ baseUrl, fetch: fetchFn as unknown as typeof fetch });

      const res = await client.planAdaptive('tok-1', { opening: 'Need CRM', locale: 'en' });

      expect(fetchFn).toHaveBeenCalledWith(
        `${baseUrl}/api/public/forms/tok-1/adaptive/plan`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ opening: 'Need CRM', locale: 'en', _hp: '' }),
        }),
      );
      expect(res.questions).toHaveLength(3);
    });
  });

  describe('submitAdaptive()', () => {
    it('POSTs one-shot opening + questions + answers + contact to /inquiries', async () => {
      const result = {
        publicToken: 'pub-abc',
        inquiryId: 'inq-1',
        status: 'ready_for_review',
      };
      const fetchFn = makeOkFetch(result);
      const client = createClient({ baseUrl, fetch: fetchFn as unknown as typeof fetch });

      const res = await client.submitAdaptive('tok-1', {
        opening: 'Need CRM',
        questions: ['Q1?', 'Q2?', 'Q3?'],
        answers: ['A1', 'A2', 'A3'],
        name: 'Ada',
        email: 'ada@example.com',
        company: 'Acme',
        locale: 'pl',
      });

      expect(fetchFn).toHaveBeenCalledWith(
        `${baseUrl}/api/public/forms/tok-1/inquiries`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            opening: 'Need CRM',
            questions: ['Q1?', 'Q2?', 'Q3?'],
            answers: ['A1', 'A2', 'A3'],
            locale: 'pl',
            name: 'Ada',
            email: 'ada@example.com',
            company: 'Acme',
            _hp: '',
          }),
        }),
      );
      expect(res.status).toBe('ready_for_review');
    });
  });

  describe('BoundForm.createInquiry()', () => {
    it('is available when destination is inquiry', async () => {
      const formBody = {
        name: 'Inquiry Form',
        slug: 'inquiry-form',
        kind: 'contact',
        fields: [],
        destination: 'inquiry',
      };
      const inquiryResult = { publicToken: 'pub-bound', inquiryId: 'inq-bound' };
      const fetchFn = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => formBody })
        .mockResolvedValueOnce({ ok: true, json: async () => inquiryResult });
      const client = createClient({ baseUrl, fetch: fetchFn as unknown as typeof fetch });

      const bound = await client.form('tok-bound');
      expect(bound.destination).toBe('inquiry');
      expect(typeof bound.createInquiry).toBe('function');

      const res = await bound.createInquiry!({ name: 'Dave' });
      expect(res).toEqual(inquiryResult);
    });

    it('is NOT present when destination is lead (or absent)', async () => {
      const formBody = {
        name: 'Lead Form',
        slug: 'lead-form',
        kind: 'contact',
        fields: [{ name: 'email', label: 'E-mail', type: 'email', required: true }],
      };
      const fetchFn = jest.fn().mockResolvedValue({ ok: true, json: async () => formBody });
      const client = createClient({ baseUrl, fetch: fetchFn as unknown as typeof fetch });

      const bound = await client.form('tok-lead');
      expect(bound.createInquiry).toBeUndefined();
    });
  });
});
