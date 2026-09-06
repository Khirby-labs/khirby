import { Injectable, Inject } from '@nestjs/common';
import { lockMutation, type Connection } from '../../core/database/transaction';
import { eq, and } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { users, roles, userRoles } from '../../core/database/schema';
import { isProtectedRoleName } from '../roles/roles.constants';
import { RbacService } from '../../core/rbac/rbac.service';
import { assertCanManageUser } from '../../core/rbac/protected-users';
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

  async findById(id: string, db: Connection = this.db) {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!user) throw AppException.notFound('user', id);

    const userRoleRows = await db
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

  async update(id: string, dto: { email?: string; password?: string }, currentUserId?: string) {
    return this.db.transaction(async (tx) => {
      await lockMutation(tx, 'identity');
      return this.updateInTransaction(id, dto, currentUserId, tx);
    });
  }

  private async updateInTransaction(
    id: string,
    dto: { email?: string; password?: string },
    currentUserId: string | undefined,
    db: Connection,
  ) {
    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) throw AppException.notFound('user', id);

    await assertCanManageUser(db, id, currentUserId);
    const patch: Record<string, unknown> = {};
    if (dto.email) patch.email = dto.email;
    if (dto.password) patch.passwordHash = await bcrypt.hash(dto.password, 10);
    if (Object.keys(patch).length === 0) return this.findById(id, db);

    await db
      .update(users)
      .set(patch as any)
      .where(eq(users.id, id));
    return this.findById(id, db);
  }

  async delete(id: string, currentUserId?: string) {
    const result = await this.db.transaction(async (tx) => {
      await lockMutation(tx, 'identity');
      return this.deleteInTransaction(id, currentUserId, tx);
    });
    this.rbac.invalidate(id);
    return result;
  }

  private async deleteInTransaction(id: string, currentUserId: string | undefined, db: Connection) {
    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) throw AppException.notFound('user', id);
    if (currentUserId && id === currentUserId) {
      throw AppException.selfDeleteForbidden();
    }
    await assertCanManageUser(db, id, currentUserId, true);
    await db.delete(users).where(eq(users.id, id));
    return { deleted: true };
  }

  async assignRole(userId: string, roleId: string) {
    const result = await this.db.transaction(async (tx) => {
      await lockMutation(tx, 'identity');
      return this.assignRoleInTransaction(userId, roleId, tx);
    });
    this.rbac.invalidate(userId);
    return result;
  }

  private async assignRoleInTransaction(userId: string, roleId: string, db: Connection) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw AppException.notFound('user', userId);
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw AppException.notFound('role', roleId);
    await db
      .insert(userRoles)
      .values({ userId, roleId } as any)
      .onConflictDoNothing();
    return this.findById(userId, db);
  }

  async removeRole(userId: string, roleId: string) {
    const result = await this.db.transaction(async (tx) => {
      await lockMutation(tx, 'identity');
      return this.removeRoleInTransaction(userId, roleId, tx);
    });
    this.rbac.invalidate(userId);
    return result;
  }

  private async removeRoleInTransaction(userId: string, roleId: string, db: Connection) {
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (role && isProtectedRoleName(role.name)) {
      const holders = await db.select().from(userRoles).where(eq(userRoles.roleId, roleId));
      if (holders.some((holder) => holder.userId === userId) && holders.length <= 1) {
        throw AppException.lastSuperAdmin();
      }
    }
    await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
    return this.findById(userId, db);
  }
}
