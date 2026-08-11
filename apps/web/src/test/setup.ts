import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw/server';

/**
 * Node 22+/26 exposes an experimental `localStorage` that is `undefined` unless
 * `--localstorage-file` is set, and that stub shadows jsdom's Storage. Specs that
 * call `localStorage.clear()` then crash. Restore an in-memory store when the
 * host one is unusable.
 */
function ensureLocalStorage(): void {
  const existing = (globalThis as { localStorage?: Storage }).localStorage;
  if (existing && typeof existing.clear === 'function') return;

  const store = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: memory,
    configurable: true,
    writable: true,
  });
}

ensureLocalStorage();

// Global MSW lifecycle for every web spec. `onUnhandledRequest: 'error'` is
// deliberate: a request with no handler is a test bug (usually a wrong URL or a
// missing fixture), and we want it to fail loudly rather than hang or fall
// through to a real network call.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
