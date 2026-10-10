import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { from, Observable, throwError } from 'rxjs';
import { switchMap } from 'rxjs/operators';
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
  runWithScopeAsync,
  resolveLoadedProvider,
} from '../../../../../packages/plugin-host/src';

/**
 * Thin core wiring for ADR-0055: when a plugin registers SCOPE_PROVIDER, wrap
 * HTTP handlers in a scoped DB transaction. No workspace product logic here.
 * Provider is resolved at call time (volume plugins bind after boot — ADR-0048).
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

    return from(this.resolve(provider, req)).pipe(
      switchMap(({ scopeId, enforcement }) => {
        if (enforcement && !scopeId && req?.session?.userId) {
          return throwError(() => new ScopeEnforcementError());
        }
        const run = () => next.handle().toPromise() as Promise<unknown>;
        if (!scopeId) {
          return from(runWithScopeAsync(null, run));
        }
        return from(
          withScopedDb(this.db(), scopeId, (tx, id) => this.setLocal(tx, id), run, {
            enforcement,
          }),
        );
      }),
    );
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
