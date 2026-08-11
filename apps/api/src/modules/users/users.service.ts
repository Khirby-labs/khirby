import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { users, roles, userRoles } from '../../core/database/schema';
import { isProtectedRoleName } from '../roles/roles.constants';
import { RbacService } from '../../core/rbac/rbac.service';
import { AppException } from '../../core/errors/app-exception';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private rbac: RbacService,
  ) {}

  async findAll(currentUserId?: string) {
    const allUsers = await this.db
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users);

    // attach roles for each user
    const allUserRoles = await this.db
      .select({ userId: userRoles.userId, roleId: userRoles.roleId, roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id));

    return allUsers.map((u) => ({
      ...u,
      roles: allUserRoles
        .filter((r) => r.userId === u.id)
        .map((r) => ({ id: r.roleId, name: r.roleName })),
      isSelf: currentUserId ? u.id === currentUserId : false,
    }));
  }

  async findById(id: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!user) throw AppException.notFound('user', id);

    const userRoleRows = await this.db
      .select({ roleId: userRoles.roleId, roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, id));

    return { ...user, roles: userRoleRows.map((r) => ({ id: r.roleId, name: r.roleName })) };
  }

  async create(dto: { email: string; password: string }) {
    const [existing] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);
    if (existing) throw AppException.alreadyExists('user', 'email', dto.email);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const [created] = await this.db
      .insert(users)
      .values({ email: dto.email, passwordHash } as any)
      .returning({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
      });
    return { ...created, roles: [] };
  }

  async update(id: string, dto: { email?: string; password?: string }) {
    const [existing] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) throw AppException.notFound('user', id);

    const patch: Record<string, unknown> = {};
    if (dto.email) patch.email = dto.email;
    if (dto.password) patch.passwordHash = await bcrypt.hash(dto.password, 10);
    if (Object.keys(patch).length === 0) return this.findById(id);

    await this.db
      .update(users)
      .set(patch as any)
      .where(eq(users.id, id));
    return this.findById(id);
  }

  async delete(id: string, currentUserId?: string) {
    const [existing] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) throw AppException.notFound('user', id);
    if (currentUserId && id === currentUserId) {
      throw AppException.selfDeleteForbidden();
    }
    await this.db.delete(users).where(eq(users.id, id));
    this.rbac.invalidate(id);
    return { deleted: true };
  }

  async assignRole(userId: string, roleId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw AppException.notFound('user', userId);
    const [role] = await this.db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw AppException.notFound('role', roleId);
    await this.db
      .insert(userRoles)
      .values({ userId, roleId } as any)
      .onConflictDoNothing();
    this.rbac.invalidate(userId);
    return this.findById(userId);
  }

  async removeRole(userId: string, roleId: string) {
    const [role] = await this.db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (role && isProtectedRoleName(role.name)) {
      const holders = await this.db.select().from(userRoles).where(eq(userRoles.roleId, roleId));
      if (holders.length <= 1) {
        throw AppException.lastSuperAdmin();
      }
    }
    await this.db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
    this.rbac.invalidate(userId);
    return this.findById(userId);
  }
}
