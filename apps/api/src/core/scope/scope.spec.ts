import {
  getScopeId,
  runWithScope,
  runWithScopeAsync,
  getScopedDb,
  getScopeStore,
  enterScopeStore,
} from '../../../../../packages/plugin-host/src/scope/scope-context';
import {
  createScopedDbProxy,
  ScopeEnforcementError,
  assertScopeIfRequired,
} from '../../../../../packages/plugin-host/src/scope/scoped-db';

describe('scope-context', () => {
  it('returns null outside ALS', () => {
    expect(getScopeId()).toBeNull();
    expect(getScopedDb()).toBeUndefined();
  });

  it('exposes scopeId and db inside runWithScope', () => {
    const fakeDb = { tag: 'tx' };
    runWithScope(
      'scope-a',
      () => {
        expect(getScopeId()).toBe('scope-a');
        expect(getScopedDb()).toBe(fakeDb);
      },
      { db: fakeDb },
    );
    expect(getScopeId()).toBeNull();
  });

  it('isolates parallel async scopes', async () => {
    const order: string[] = [];
    await Promise.all([
      runWithScopeAsync('a', async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push(`a:${getScopeId()}`);
      }),
      runWithScopeAsync('b', async () => {
        await new Promise((r) => setTimeout(r, 5));
        order.push(`b:${getScopeId()}`);
      }),
    ]);
    expect(order).toEqual(['b:b', 'a:a']);
  });

  it('enterScopeStore rebinds a store after run() exits', () => {
    let stored: ReturnType<typeof getScopeStore>;
    runWithScope('s1', () => {
      stored = getScopeStore();
    });
    expect(getScopeId()).toBeNull();
    enterScopeStore(stored!);
    expect(getScopeId()).toBe('s1');
    // Clear for later tests — enterWith has no exit; nest a null run.
    runWithScope(null, () => undefined);
  });
});

describe('createScopedDbProxy', () => {
  it('delegates to base db when no ALS db', () => {
    const base = {
      select: jest.fn().mockReturnValue('ok'),
    };
    const proxy = createScopedDbProxy(base);
    expect(proxy.select()).toBe('ok');
    expect(base.select).toHaveBeenCalled();
  });

  it('uses ALS db when present', () => {
    const base = { select: jest.fn().mockReturnValue('base') };
    const scoped = { select: jest.fn().mockReturnValue('scoped') };
    const proxy = createScopedDbProxy(base);
    runWithScope(
      's1',
      () => {
        expect(proxy.select()).toBe('scoped');
      },
      { db: scoped },
    );
  });

  it('always reads $client from base even when ALS holds the proxy', () => {
    const client = { unsafe: jest.fn() };
    const base = { $client: client, select: jest.fn() };
    const proxy = createScopedDbProxy(base);
    runWithScope(
      's1',
      () => {
        expect(proxy.$client).toBe(client);
      },
      { db: proxy },
    );
  });
});

describe('assertScopeIfRequired', () => {
  it('throws when enforcement on and no scope', () => {
    expect(() => assertScopeIfRequired(true)).toThrow(ScopeEnforcementError);
  });

  it('passes when scope is set', () => {
    runWithScope('s', () => {
      expect(() => assertScopeIfRequired(true)).not.toThrow();
    });
  });
});
