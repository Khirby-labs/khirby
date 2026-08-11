import { Injectable, Inject } from '@nestjs/common';
import { eq, and, inArray } from 'drizzle-orm';
import { Db } from '../database/db';
import { DB_TOKEN } from '../database/database.module';
import { userRoles, rolePermissions, roles } from '../database/schema';
import { PROTECTED_ROLE_NAMES } from '../../modules/roles/roles.constants';

type Permission = { resource: string; action: string };

/** Cache TTL in ms. Single-tenant, in-process cache — no Redis needed (KISS). */
const CACHE_TTL_MS = 60_000;

@Injectable()
export class RbacService {
  // Per-user caches. RBAC joins run on every guarded request; invalidation is
  // explicit (see invalidate) from every mutation that changes effective access.
  private permissionCache = new Map<string, { permissions: Permission[]; expires: number }>();
  private superAdminCache = new Map<string, { value: boolean; expires: number }>();

  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async getUserPermissions(userId: string): Promise<Permission[]> {
    const cached = this.permissionCache.get(userId);
    if (cached && cached.expires > Date.now()) return cached.permissions;

    const rows = await this.db
      .select({ resource: rolePermissions.resource, action: rolePermissions.action })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
      .where(eq(userRoles.userId, userId));

    // Merge across roles: dedupe identical (resource, action) pairs.
    const seen = new Set<string>();
    const permissions: Permission[] = [];
    for (const r of rows) {
      const key = `${r.resource}:${r.action}`;
      if (seen.has(key)) continue;
      seen.add(key);
      permissions.push({ resource: r.resource, action: r.action });
    }

    this.permissionCache.set(userId, { permissions, expires: Date.now() + CACHE_TTL_MS });
    return permissions;
  }

  async hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    const perms = await this.getUserPermissions(userId);
    return perms.some((p) => p.resource === resource && p.action === action);
  }

  /** True when the user holds a protected (super-admin) role. Single join query. */
  async isSuperAdmin(userId: string): Promise<boolean> {
    const cached = this.superAdminCache.get(userId);
    if (cached && cached.expires > Date.now()) return cached.value;

    const rows = await this.db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(
        and(
          eq(userRoles.userId, userId),
          inArray(roles.name, PROTECTED_ROLE_NAMES as unknown as string[]),
        ),
      );

    const value = rows.length > 0;
    this.superAdminCache.set(userId, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  }

  /** Drop cached access. No arg clears everyone (role-wide change); a userId clears one user. */
  invalidate(userId?: string): void {
    if (userId === undefined) {
      this.permissionCache.clear();
      this.superAdminCache.clear();
      return;
    }
    this.permissionCache.delete(userId);
    this.superAdminCache.delete(userId);
  }
}
