import { Injectable, OnApplicationBootstrap, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { Db } from '../database/db';
import { DB_TOKEN } from '../database/database.module';
import { users, roles, rolePermissions, userRoles } from '../database/schema';
import { AuthService } from './auth.service';
import { ALL_PERMISSIONS } from '../../modules/roles/permission-catalog';
// Relative import (like permission-catalog): `nest build` is plain tsc, so a bare
// '@khirby/types' specifier would survive into dist and fail at runtime.
import {
  SUPER_ADMIN_ROLE_NAME,
  SUPER_ADMIN_ROLE_DESCRIPTION,
} from '../../../../../packages/types/src';

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private config: ConfigService,
    private auth: AuthService,
  ) {}

  async onApplicationBootstrap() {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');

    // Ensure super-admin role exists with correct permissions (idempotent)
    const [existingRole] = await this.db
      .select()
      .from(roles)
      .where(eq(roles.name, SUPER_ADMIN_ROLE_NAME))
      .limit(1);
    let role = existingRole;

    if (!role) {
      // Seeded in English on purpose: the SPA localizes this row by identifier and
      // only while the description still matches the seed (ADR-0011). The row is
      // never rewritten in a UI language.
      const [created] = await this.db
        .insert(roles)
        .values({
          name: SUPER_ADMIN_ROLE_NAME,
          description: SUPER_ADMIN_ROLE_DESCRIPTION,
        } as any)
        .returning();
      role = created;
    }

    // Sync permissions — delete old, insert fresh (handles action renames like admin→manage)
    await this.db.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
    await this.db
      .insert(rolePermissions)
      .values(ALL_PERMISSIONS.map((p) => ({ roleId: role.id, ...p })));

    // Create admin user only on first run
    const existing = await this.db.select().from(users).limit(1);
    if (existing.length > 0) {
      this.logger.log('Super-admin permissions synced');
      return;
    }

    if (!email || !password) {
      this.logger.warn('No ADMIN_EMAIL/ADMIN_PASSWORD set — skipping first-run bootstrap');
      return;
    }

    const user = await this.auth.createUser(email, password);
    await this.db.insert(userRoles).values({ userId: user.id, roleId: role.id });
    this.logger.log(`First-run admin created: ${email}`);
  }
}
