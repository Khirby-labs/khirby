import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('api/client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('apiGet', () => {
    it('sends credentials: include (cookie session)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ data: [] })),
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiGet } = await import('./client');
      await apiGet('/api/contacts');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.credentials).toBe('include');
    });

    it('does NOT send Authorization header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{}'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiGet } = await import('./client');
      await apiGet('/api/contacts');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
    });

    it('throws on 401 responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      // A 401 with no code (bare Nest 401, proxy page…) is treated as an ended
      // session: redirect to /login and normalize the message, because
      // "Unauthorized" is not copy to show a user.
      const { apiGet } = await import('./client');
      await expect(apiGet('/api/contacts')).rejects.toThrow('Session expired');
    });

    it('keeps a rejected login on the page with its real reason', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            statusCode: 401,
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid credentials',
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      // A failed authentication ATTEMPT is not an ended session. Rewriting it to
      // 'Session expired' + a bounce to /login is what hid the real reason
      // (ADR-0011); the same applies to a wrong current password in Settings.
      const { apiGet, ApiError } = await import('./client');
      const failure = await apiGet('/api/auth/login').catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(ApiError);
      expect((failure as InstanceType<typeof ApiError>).message).toBe('Invalid credentials');
      expect((failure as InstanceType<typeof ApiError>).code).toBe('INVALID_CREDENTIALS');
    });

    it('exposes the code, params and per-field detail of a failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            statusCode: 400,
            code: 'VALIDATION_FAILED',
            message: 'email must be an email',
            fields: [{ field: 'email', constraint: 'isEmail', message: 'email must be an email' }],
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiPost, ApiError } = await import('./client');
      const failure = (await apiPost('/api/contacts', {}).catch((e: unknown) => e)) as InstanceType<
        typeof ApiError
      >;

      expect(failure).toBeInstanceOf(ApiError);
      expect(failure.code).toBe('VALIDATION_FAILED');
      expect(failure.fields).toEqual([
        { field: 'email', constraint: 'isEmail', message: 'email must be an email' },
      ]);
    });

    it('throws on 403 with server error message', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'Forbidden resource' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiGet } = await import('./client');
      await expect(apiGet('/api/roles')).rejects.toThrow('Forbidden resource');
    });

    it('throws with fallback message when body is unparseable', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse error')),
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiGet } = await import('./client');
      await expect(apiGet('/api/contacts')).rejects.toThrow('HTTP 500');
    });
  });

  describe('apiPost', () => {
    it('sends JSON body with POST method and credentials: include', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: () => Promise.resolve(JSON.stringify({ id: '1' })),
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiPost } = await import('./client');
      await apiPost('/api/contacts', { email: 'a@b.com' });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ email: 'a@b.com' }));
      expect(init.credentials).toBe('include');
    });
  });

  describe('apiDelete', () => {
    it('returns undefined on 204 No Content', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
        json: () => Promise.reject('no body'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiDelete } = await import('./client');
      const result = await apiDelete('/api/contacts/1');
      expect(result).toBeUndefined();
    });

    it('returns undefined on 200 with empty body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () => Promise.reject(new Error('Unexpected end of JSON input')),
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiDelete } = await import('./client');
      const result = await apiDelete('/api/plugins/listmonk/campaigns/1');
      expect(result).toBeUndefined();
    });

    it('does not send Content-Type without a body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ deleted: true })),
        json: () => Promise.resolve({ deleted: true }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiDelete } = await import('./client');
      await apiDelete('/api/contacts/1');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    });
  });
});
