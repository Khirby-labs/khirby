import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { roles, rolePermissions, userRoles, users } from '../../core/database/schema';
import { isProtectedRoleName } from './roles.constants';
import { RbacService } from '../../core/rbac/rbac.service';
import { AppException } from '../../core/errors/app-exception';

@Injectable()
export class RolesService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private rbac: RbacService,
  ) {}

  private enrichRole<T extends { name: string }>(role: T) {
    return {
      ...role,
      isProtected: isProtectedRoleName(role.name),
    };
  }

  async findAll() {
    const allRoles = await this.db.select().from(roles);
    const allPerms = await this.db.select().from(rolePermissions);
    return allRoles.map((role) => ({
      ...this.enrichRole(role),
      permissions: allPerms.filter((p) => p.roleId === role.id),
    }));
  }

  async findById(id: string) {
    const [role] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!role) throw AppException.notFound('role', id);
    const perms = await this.db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, id));
    return { ...this.enrichRole(role), permissions: perms };
  }

  async create(dto: { name: string; description?: string }) {
    const [existing] = await this.db.select().from(roles).where(eq(roles.name, dto.name)).limit(1);
    if (existing) throw AppException.alreadyExists('role', 'name', dto.name);

    const [created] = await this.db
      .insert(roles)
      .values({ name: dto.name, description: dto.description ?? null } as any)
      .returning();
    return { ...this.enrichRole(created), permissions: [] };
  }

  async update(id: string, dto: { name?: string; description?: string }) {
    const [existing] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!existing) throw AppException.notFound('role', id);

    if (dto.name !== undefined && dto.name !== existing.name) {
      if (isProtectedRoleName(existing.name)) {
        throw AppException.systemEntityImmutable('role', 'rename');
      }
      const [dup] = await this.db.select().from(roles).where(eq(roles.name, dto.name)).limit(1);
      if (dup) throw AppException.alreadyExists('role', 'name', dto.name);
    }

    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;

    const [updated] = await this.db
      .update(roles)
      .set(patch as any)
      .where(eq(roles.id, id))
      .returning();
    if (!updated) throw AppException.notFound('role', id);
    // Role-wide change (name affects super-admin resolution) — clear all caches.
    this.rbac.invalidate();
    return updated;
  }

  async delete(id: string) {
    const [role] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!role) throw AppException.notFound('role', id);
    if (isProtectedRoleName(role.name)) {
      throw AppException.systemEntityImmutable('role', 'delete');
    }
    await this.db.delete(roles).where(eq(roles.id, id));
    // Role-wide change — clear all caches.
    this.rbac.invalidate();
  }

  async setPermissions(roleId: string, permissions: { resource: string; action: string }[]) {
    const [role] = await this.db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw AppException.notFound('role', roleId);
    if (isProtectedRoleName(role.name)) {
      throw AppException.systemEntityImmutable('role', 'modify permissions of');
    }

    // Atomic swap — a failed insert must not leave the role with zero permissions.
    const result = await this.db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (permissions.length === 0) return [];
      const inserted = await tx
        .insert(rolePermissions)
        .values(permissions.map((p) => ({ roleId, resource: p.resource, action: p.action })) as any)
        .returning();
      return inserted;
    });
    // Role-wide change — clear all caches.
    this.rbac.invalidate();
    return result;
  }

  async assignToUser(userId: string, roleId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw AppException.notFound('user', userId);
    const [role] = await this.db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw AppException.notFound('role', roleId);

    await this.db
      .insert(userRoles)
      .values({ userId, roleId } as any)
      .onConflictDoNothing();
    this.rbac.invalidate(userId);
  }

  async removeFromUser(userId: string, roleId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw AppException.notFound('user', userId);
    const [role] = await this.db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw AppException.notFound('role', roleId);

    if (isProtectedRoleName(role.name)) {
      const holders = await this.db.select().from(userRoles).where(eq(userRoles.roleId, roleId));
      if (holders.length <= 1) {
        throw AppException.lastSuperAdmin();
      }
    }

    await this.db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
    this.rbac.invalidate(userId);
  }
}
