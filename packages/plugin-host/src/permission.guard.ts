import { Injectable, CanActivate, ExecutionContext, Inject, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSION_KEY,
  PERMISSION_ANY_KEY,
  SUPER_ADMIN_KEY,
} from './require-permission.decorator';
import { AppException } from './app-exception';
import { RBAC_SERVICE, type RbacServiceLike } from './tokens';

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private reflector: Reflector,
    @Inject(RBAC_SERVICE) private rbacService: RbacServiceLike,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireSuperAdmin = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const permission = this.reflector.getAllAndOverride<{ resource: string; action: string }>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    const permissionsAny = this.reflector.getAllAndOverride<
      Array<{ resource: string; action: string }>
    >(PERMISSION_ANY_KEY, [context.getHandler(), context.getClass()]);

    if (!permission && !permissionsAny && !requireSuperAdmin) {
      // Auth-only route (SessionGuard already ran). Warn in non-prod so missing
      // decorators surface during development; keep allow in production.
      if (process.env.NODE_ENV !== 'production') {
        const name = `${context.getClass().name}.${context.getHandler().name}`;
        this.logger.warn(
          `PermissionGuard: no @RequirePermission / @RequireAnyPermission / @RequireSuperAdmin on ${name} — allowing authenticated session`,
        );
      }
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.session?.userId;

    if (!userId) return false;

    if (requireSuperAdmin) {
      const isSuperAdmin = await this.rbacService.isSuperAdmin(userId);
      if (!isSuperAdmin) {
        throw AppException.superAdminRequired();
      }
    }

    if (permission) {
      return this.rbacService.hasPermission(userId, permission.resource, permission.action);
    }

    if (permissionsAny && permissionsAny.length > 0) {
      for (const perm of permissionsAny) {
        if (await this.rbacService.hasPermission(userId, perm.resource, perm.action)) {
          return true;
        }
      }
      return false;
    }

    return true;
  }
}
