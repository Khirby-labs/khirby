import { getScopedDb, getScopeId } from './scope-context';

/**
 * GUC name used with SET LOCAL / set_config(..., true) for PostgreSQL RLS policies.
 * Plugins' RLS should compare `scope_id` columns to `current_setting('app.scope_id', true)`.
 */
export const SCOPE_GUC = 'app.scope_id';

/**
 * Non-bypass DB role assumed for scoped transactions (ADR-0055).
 * Docker `POSTGRES_USER` is a superuser with BYPASSRLS — RLS is a no-op until the
 * host `SET LOCAL ROLE` to this role (created by the Enterprise plugin migrate).
 */
export const SCOPE_DB_ROLE = 'khirby_scoped';

export class ScopeEnforcementError extends Error {
  readonly code = 'SCOPE_REQUIRED';

  constructor(message = 'Scope context is required for this database operation') {
    super(message);
    this.name = 'ScopeEnforcementError';
  }
}

/**
 * Proxy over a drizzle (or compatible) db so callers that inject DB_TOKEN
 * automatically use the connection-bound handle from ALS when present.
 * Enforcement (fail-closed) is handled by ScopeInterceptor / withScopedDb —
 * this proxy only routes to the scoped connection.
 *
 * `$client` always comes from the base drizzle instance — never from ALS —
 * so plugin `onMigrate(db.$client)` cannot recurse if ALS holds this proxy.
 */
export function createScopedDbProxy<T extends object>(baseDb: T): T {
  const proxy: T = new Proxy(baseDb, {
    get(target, prop) {
      // postgres.js client for migrations — always the unwrapped connection.
      if (prop === '$client') {
        return (target as { $client?: unknown }).$client;
      }
      const scoped = getScopedDb<T>();
      // Guard against ALS accidentally storing this same proxy.
      const db = scoped && scoped !== proxy ? scoped : target;
      const value = Reflect.get(db as object, prop, db as object);
      if (typeof value === 'function') {
        return (value as (...args: unknown[]) => unknown).bind(db);
      }
      return value;
    },
  });
  return proxy;
}

/** Escape helper for tests / docs — prefer parameterized set_config in production. */
export function scopeSetLocalSql(scopeId: string): string {
  const id = scopeId.replace(/'/g, "''");
  return [
    `SET LOCAL ROLE ${SCOPE_DB_ROLE}`,
    `SELECT set_config('${SCOPE_GUC}', '${id}', true)`,
  ].join('; ');
}

/** Assert scope present when enforcement is required (workers / raw paths). */
export function assertScopeIfRequired(enforcement: boolean): void {
  if (enforcement && !getScopeId()) {
    throw new ScopeEnforcementError();
  }
}
