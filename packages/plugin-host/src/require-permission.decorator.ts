import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

export const RequirePermission = (resource: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { resource, action });

export const SUPER_ADMIN_KEY = 'require-super-admin';

/**
 * Marks a handler (or controller) as mutating roles / role assignments.
 * Enforced by PermissionGuard: only holders of a protected super-admin role
 * may pass. Reads stay gated by @RequirePermission only.
 */
export const RequireSuperAdmin = () => SetMetadata(SUPER_ADMIN_KEY, true);

export const PERMISSION_ANY_KEY = 'permissionsAny';

/**
 * Grants access when the user holds ANY of the specified (resource, action) pairs.
 * Use instead of @RequirePermission when a route is accessible from multiple roles.
 */
export const RequireAnyPermission = (...pairs: Array<[string, string]>) =>
  SetMetadata(
    PERMISSION_ANY_KEY,
    pairs.map(([resource, action]) => ({ resource, action })),
  );
