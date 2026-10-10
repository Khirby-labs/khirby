/**
 * Nest ScopeInterceptor lives in apps/api (needs drizzle-orm).
 * Host exports ALS helpers + withScopedDb for workers that pass their own setLocal.
 */

import type { Db } from '../tokens';
import { runWithScopeAsync } from './scope-context';
import { ScopeEnforcementError } from './scoped-db';

export type SetLocalScopeFn = (tx: Db, scopeId: string) => Promise<void>;

/**
 * Run `fn` inside `db.transaction` with SET LOCAL applied via `setLocal`.
 * Used by core interceptor and background jobs.
 */
export async function withScopedDb<T>(
  db: Db,
  scopeId: string | null,
  setLocal: SetLocalScopeFn,
  fn: () => Promise<T>,
  opts?: { enforcement?: boolean },
): Promise<T> {
  if (opts?.enforcement && !scopeId) {
    throw new ScopeEnforcementError();
  }
  if (!scopeId) {
    return runWithScopeAsync(null, fn);
  }
  return db.transaction(async (tx: Db) => {
    await setLocal(tx, scopeId);
    return runWithScopeAsync(scopeId, fn, { db: tx });
  });
}
