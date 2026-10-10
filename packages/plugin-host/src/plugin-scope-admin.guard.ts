import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppException } from './app-exception';
import { resolveLoadedProvider } from './resolve-loaded-provider';
import { PLUGIN_SCOPE_POLICY, type PluginScopePolicyLike } from './scope/plugin-scope-policy';
import type { ScopeSessionLike } from './scope/scope-provider';

/**
 * When PLUGIN_SCOPE_POLICY is active, only the active workspace owner may hit
 * plugins / marketplace admin routes (ADR-0057). Community (no policy) is a no-op.
 */
@Injectable()
export class PluginScopeAdminGuard implements CanActivate {
  constructor(private readonly moduleRef: ModuleRef) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = resolveLoadedProvider<PluginScopePolicyLike>(
      this.moduleRef,
      PLUGIN_SCOPE_POLICY,
    );
    if (!policy) return true;
    if (!(await Promise.resolve(policy.isActive()))) return true;

    const req = context.switchToHttp().getRequest<{ session?: ScopeSessionLike }>();
    const session = req?.session;
    if (!session?.userId) throw AppException.sessionExpired();
    await policy.assertAdmin(session);
    return true;
  }
}
