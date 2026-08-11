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
