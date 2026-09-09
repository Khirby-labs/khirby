import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { INSTANCE_IDENTITY_ROW_ID, instanceIdentity } from '../../core/database/schema';

export type InstanceIdentityRow = typeof instanceIdentity.$inferSelect;

@Injectable()
export class InstallationIdentityService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async getOrCreate(): Promise<InstanceIdentityRow> {
    const existing = await this.db
      .select()
      .from(instanceIdentity)
      .where(eq(instanceIdentity.id, INSTANCE_IDENTITY_ROW_ID))
      .limit(1);
    if (existing[0]) return existing[0];

    const installationId = randomUUID();
    try {
      const inserted = await this.db
        .insert(instanceIdentity)
        .values({ id: INSTANCE_IDENTITY_ROW_ID, installationId } as any)
        .returning();
      if (inserted[0]) return inserted[0];
    } catch {
      // Race: another process inserted the singleton row first.
    }

    const again = await this.db
      .select()
      .from(instanceIdentity)
      .where(eq(instanceIdentity.id, INSTANCE_IDENTITY_ROW_ID))
      .limit(1);
    if (!again[0]) {
      throw new Error('Failed to create instance_identity row');
    }
    return again[0];
  }

  async updateRegisteredEmail(
    email: string,
    registeredAt: Date = new Date(),
  ): Promise<InstanceIdentityRow> {
    const row = await this.getOrCreate();
    const updated = await this.db
      .update(instanceIdentity)
      .set({
        registeredEmail: email,
        registeredAt,
        updatedAt: new Date(),
      } as any)
      .where(eq(instanceIdentity.id, row.id))
      .returning();
    return updated[0] ?? row;
  }

  async touchHeartbeat(at: Date = new Date()): Promise<void> {
    const row = await this.getOrCreate();
    await this.db
      .update(instanceIdentity)
      .set({
        lastHeartbeatAt: at,
        updatedAt: new Date(),
      } as any)
      .where(eq(instanceIdentity.id, row.id));
  }
}
