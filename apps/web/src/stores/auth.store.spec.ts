import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { SessionUser } from '@khirby/types';
import { useAuthStore } from './auth.store';
import { server } from '../test/msw/server';
import { api } from '../test/api-base';

/**
 * Store spec through the real api client, with only the network mocked (MSW).
 *
 * It used to `vi.mock('../api/client')`, which mirrored the implementation and
 * disabled the layer where the bugs actually were — including the one this file
 * now covers: every 401 was rewritten to "Session expired", so a rejected login
 * could never reach the screen (ADR-0010, ADR-0011).
 */
// Typed from @khirby/types so a drift in the response shape fails the typecheck
// rather than production. `locale: null` = the account made no language choice,
// so the device resolution stands (ADR-0011).
const sessionUser: SessionUser = {
  id: 'u1',
  email: 'admin@example.com',
  locale: null,
  permissions: [],
};

const meOk = () => http.get(api('/api/auth/me'), () => HttpResponse.json(sessionUser));

const meUnauthenticated = () =>
  http.get(api('/api/auth/me'), () =>
    HttpResponse.json(
      { statusCode: 401, code: 'SESSION_EXPIRED', message: 'Session expired' },
      { status: 401 },
    ),
  );

describe('auth.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    /*
     * A 401 with code SESSION_EXPIRED makes the api client navigate to /login,
     * which dynamically imports the real router singleton and runs its guard —
     * and that guard fetches /api/plugins. Without a handler, MSW's
     * onUnhandledRequest: 'error' fires ASYNCHRONOUSLY and fails whichever spec
     * file happens to be running, which looked like a flake in router.spec.
     */
    server.use(http.get(api('/api/plugins'), () => HttpResponse.json([])));
  });

  // Let that navigation settle inside this file instead of leaking into the next.
  afterEach(async () => {
    await flushPromises();
  });

  it('starts unauthenticated before session check', () => {
    const auth = useAuthStore();
    expect(auth.user).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.checked).toBe(false);
  });

  it('checkSession sets user when /auth/me succeeds', async () => {
    server.use(meOk());

    const auth = useAuthStore();
    await auth.checkSession();

    expect(auth.user).toEqual(sessionUser);
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.checked).toBe(true);
  });

  it('treats a 401 as "no session", not as an error to show', async () => {
    server.use(meUnauthenticated());

    const auth = useAuthStore();
    await auth.checkSession();

    expect(auth.user).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.checked).toBe(true);
    expect(auth.networkError).toBe(false);
  });

  it('reports a real server failure as a network error', async () => {
    server.use(http.get(api('/api/auth/me'), () => new HttpResponse(null, { status: 500 })));

    const auth = useAuthStore();
    await auth.checkSession();

    expect(auth.user).toBeNull();
    expect(auth.networkError).toBe(true);
  });

  it('checkSession is idempotent — only hits /auth/me once', async () => {
    let calls = 0;
    server.use(
      http.get(api('/api/auth/me'), () => {
        calls++;
        return HttpResponse.json(sessionUser);
      }),
    );

    const auth = useAuthStore();
    await auth.checkSession();
    await auth.checkSession();
    await auth.checkSession();

    expect(calls).toBe(1);
  });

  it('re-fetches /auth/me when the cached user lacks permissions (stale session)', async () => {
    let calls = 0;
    server.use(
      http.get(api('/api/auth/me'), () => {
        calls++;
        return HttpResponse.json(sessionUser);
      }),
    );

    const auth = useAuthStore();
    auth.user = { id: 'u1', email: 'admin@example.com', locale: null } as SessionUser;
    auth.checked = true;

    await auth.checkSession();

    expect(calls).toBe(1);
    expect(auth.user?.permissions).toEqual([]);
  });

  it('login sets user on success', async () => {
    server.use(http.post(api('/api/auth/login'), () => HttpResponse.json({ user: sessionUser })));

    const auth = useAuthStore();
    await auth.login('admin@example.com', 'secret');

    expect(auth.user).toEqual(sessionUser);
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.checked).toBe(true);
  });

  it('surfaces the real reason when credentials are rejected', async () => {
    server.use(
      http.post(api('/api/auth/login'), () =>
        HttpResponse.json(
          { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
          { status: 401 },
        ),
      ),
    );

    const auth = useAuthStore();
    // Not "Session expired": a failed login attempt is not an ended session.
    await expect(auth.login('bad@user.com', 'wrong')).rejects.toThrow('Invalid credentials');
    expect(auth.user).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });

  it('logout clears the user', async () => {
    server.use(
      http.post(api('/api/auth/login'), () => HttpResponse.json({ user: sessionUser })),
      http.post(api('/api/auth/logout'), () => new HttpResponse(null, { status: 204 })),
    );

    const auth = useAuthStore();
    await auth.login('admin@example.com', 'pass');
    expect(auth.isAuthenticated).toBe(true);

    await auth.logout();

    expect(auth.user).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.checked).toBe(false);
  });

  it('logout clears the user even when the server call fails', async () => {
    server.use(
      http.post(api('/api/auth/login'), () => HttpResponse.json({ user: sessionUser })),
      http.post(api('/api/auth/logout'), () => new HttpResponse(null, { status: 500 })),
    );

    const auth = useAuthStore();
    await auth.login('admin@example.com', 'pass');
    await auth.logout();

    expect(auth.user).toBeNull();
  });

  it('flags loading while the login request is in flight', async () => {
    server.use(
      http.post(api('/api/auth/login'), async () => {
        await delay(20);
        return HttpResponse.json({ user: sessionUser });
      }),
    );

    const auth = useAuthStore();
    expect(auth.loading).toBe(false);

    const pending = auth.login('a@b.com', 'pw');
    expect(auth.loading).toBe(true);

    await pending;
    expect(auth.loading).toBe(false);
  });

  it('hasPermission reflects effective session grants', async () => {
    const userWithAgent = {
      ...sessionUser,
      permissions: [{ resource: 'agent', action: 'use' }],
    };
    server.use(http.get(api('/api/auth/me'), () => HttpResponse.json(userWithAgent)));

    const auth = useAuthStore();
    await auth.checkSession();

    expect(auth.hasPermission('agent', 'use')).toBe(true);
    expect(auth.hasPermission('agent', 'manage')).toBe(false);
    expect(auth.hasPermission('contacts', 'manage')).toBe(false);
  });

  it('hasPermission is false before a session exists', () => {
    const auth = useAuthStore();
    expect(auth.hasPermission('agent', 'use')).toBe(false);
  });
});
