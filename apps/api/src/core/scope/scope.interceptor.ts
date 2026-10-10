import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { defer, from, Observable } from 'rxjs';
import { sql } from 'drizzle-orm';
import {
  DB_TOKEN,
  type Db,
  SCOPE_PROVIDER,
  type ScopeProviderLike,
  type ScopeSessionLike,
  type ScopeRequestLike,
  SCOPE_GUC,
  SCOPE_DB_ROLE,
  ScopeEnforcementError,
  withScopedDb,
  resolveLoadedProvider,
  getScopeStore,
  enterScopeStore,
} from '../../../../../packages/plugin-host/src';

/**
 * Thin core wiring for ADR-0055: when a plugin registers SCOPE_PROVIDER, wrap
 * HTTP handlers in a scoped DB transaction. No workspace product logic here.
 * Provider is resolved at call time (volume plugins bind after boot — ADR-0048).
 *
 * Important: Nest/RxJS can drop AsyncLocalStorage across `next.handle()`.
 * We subscribe inside the scoped store and re-enter it on each notification so
 * `createScopedDbProxy` keeps using the same transaction connection. Otherwise
 * the SET LOCAL connection sits `idle in transaction` while domain queries take
 * new pool clients — with `max: 10` that deadlocks and Cloudflare returns 504.
 */
@Injectable()
export class ScopeInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ScopeInterceptor.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  private db(): Db {
    return this.moduleRef.get(DB_TOKEN, { strict: false });
  }

  private provider(): ScopeProviderLike | null {
    return resolveLoadedProvider<ScopeProviderLike>(this.moduleRef, SCOPE_PROVIDER);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const provider = this.provider();
    if (!provider) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<{
      session?: ScopeSessionLike;
      url?: string;
      method?: string;
      headers?: Record<string, string | string[] | undefined>;
      params?: Record<string, string | undefined>;
      raw?: { url?: string };
    }>();

    return defer(() =>
      from(
        (async () => {
          const { scopeId, enforcement } = await this.resolve(provider, req);
          if (enforcement && !scopeId && req?.session?.userId) {
            throw new ScopeEnforcementError();
          }
          if (!scopeId) {
            return this.firstValue(next);
          }
          return withScopedDb(
            this.db(),
            scopeId,
            (tx, id) => this.setLocal(tx, id),
            () => this.firstValueInScope(next),
            { enforcement },
          );
        })(),
      ),
    );
  }

  /** Subscribe to the route Observable while re-binding ALS on each hop. */
  private firstValueInScope(next: CallHandler): Promise<unknown> {
    const store = getScopeStore();
    if (!store) return this.firstValue(next);
    return new Promise((resolve, reject) => {
      let last: unknown;
      let hasValue = false;
      // Subscribe synchronously inside the store so the controller starts scoped.
      enterScopeStore(store);
      next.handle().subscribe({
        next: (value) => {
          enterScopeStore(store);
          last = value;
          hasValue = true;
        },
        error: (err) => {
          enterScopeStore(store);
          reject(err);
        },
        complete: () => {
          enterScopeStore(store);
          resolve(hasValue ? last : undefined);
        },
      });
    });
  }

  private firstValue(next: CallHandler): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let last: unknown;
      let hasValue = false;
      next.handle().subscribe({
        next: (value) => {
          last = value;
          hasValue = true;
        },
        error: (err) => reject(err),
        complete: () => resolve(hasValue ? last : undefined),
      });
    });
  }

  private async resolve(
    provider: ScopeProviderLike,
    req?: {
      session?: ScopeSessionLike;
      url?: string;
      method?: string;
      headers?: Record<string, string | string[] | undefined>;
      params?: Record<string, string | undefined>;
      raw?: { url?: string };
    },
  ): Promise<{ scopeId: string | null; enforcement: boolean }> {
    const enforcement = await Promise.resolve(provider.isEnforcementRequired());
    const session = req?.session;

    if (session?.userId) {
      try {
        const scopeId = await provider.resolveFromSession(session);
        return { scopeId, enforcement };
      } catch (err) {
        this.logger.warn(`Scope resolve failed: ${err instanceof Error ? err.message : 'unknown'}`);
        return { scopeId: null, enforcement };
      }
    }

    // Public / ingress (forms, etc.): plugin maps server-trusted request → scope.
    if (provider.resolveFromRequest) {
      try {
        const scopeReq: ScopeRequestLike = {
          session: session ?? null,
          url: req?.url ?? req?.raw?.url,
          method: req?.method,
          headers: req?.headers,
          params: req?.params,
        };
        const scopeId = await provider.resolveFromRequest(scopeReq);
        return { scopeId, enforcement: false };
      } catch (err) {
        this.logger.warn(
          `Scope resolveFromRequest failed: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }

    return { scopeId: null, enforcement: false };
  }

  private async setLocal(tx: Db, scopeId: string): Promise<void> {
    // Docker POSTGRES_USER is superuser+BYPASSRLS — drop to the plugin role so RLS applies.
    await tx.execute(sql.raw(`SET LOCAL ROLE ${SCOPE_DB_ROLE}`));
    await tx.execute(
      sql.raw(`SELECT set_config('${SCOPE_GUC}', '${scopeId.replace(/'/g, "''")}', true)`),
    );
  }
}
