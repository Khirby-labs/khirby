import { AsyncLocalStorage } from 'node:async_hooks';

/** Opaque request/job scope — plugins may store a workspace id; core must not interpret it. */
export type ScopeStore = {
  scopeId: string | null;
  /** Optional drizzle/postgres handle bound to a single connection for SET LOCAL. */
  db?: unknown;
};

const scopeAls = new AsyncLocalStorage<ScopeStore>();

export function getScopeStore(): ScopeStore | undefined {
  return scopeAls.getStore();
}

export function getScopeId(): string | null {
  return scopeAls.getStore()?.scopeId ?? null;
}

export function getScopedDb<T = unknown>(): T | undefined {
  return scopeAls.getStore()?.db as T | undefined;
}

/**
 * Run `fn` with the given scope id (and optional connection-bound db) on ALS.
 * Used by HTTP interceptors, background jobs, and tests.
 */
export function runWithScope<T>(scopeId: string | null, fn: () => T, opts?: { db?: unknown }): T {
  return scopeAls.run({ scopeId, db: opts?.db }, fn);
}

export async function runWithScopeAsync<T>(
  scopeId: string | null,
  fn: () => Promise<T>,
  opts?: { db?: unknown },
): Promise<T> {
  return scopeAls.run({ scopeId, db: opts?.db }, fn);
}
