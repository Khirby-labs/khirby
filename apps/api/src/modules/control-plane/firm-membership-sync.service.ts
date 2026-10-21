import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, primaryKey } from 'drizzle-orm/pg-core';
import { DB_TOKEN } from '../../core/database/database.module';
import type { Db } from '../../core/database/db';

const mwMemberships = pgTable(
  'mw_memberships',
  {
    workspaceId: uuid('workspace_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

const mwInvites = pgTable('mw_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  email: text('email').notNull(),
  role: text('role').notNull().default('member'),
  token: text('token').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
});

/**
 * After SSO/password login: claim pending mw_invites and pull firm access from CP
 * so members provisioned before the local user existed can switch workspaces.
 */
@Injectable()
export class FirmMembershipSyncService {
  private readonly log = new Logger(FirmMembershipSyncService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(DB_TOKEN) private readonly db: Db,
  ) {}

  async syncForUser(userId: string, email: string | null | undefined): Promise<void> {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) return;

    try {
      await this.claimInvites(userId, normalized);
      await this.pullFromControlPlane(userId, normalized);
    } catch (err) {
      this.log.warn(
        `Firm membership sync failed for ${normalized}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async claimInvites(userId: string, email: string): Promise<void> {
    const pending = await this.db
      .select()
      .from(mwInvites)
      .where(and(eq(mwInvites.email, email), isNull(mwInvites.acceptedAt)));

    for (const inv of pending) {
      await this.db
        .insert(mwMemberships)
        .values({
          workspaceId: inv.workspaceId,
          userId,
          role: inv.role === 'user' ? 'member' : inv.role,
        })
        .onConflictDoNothing();
      await this.db
        .update(mwInvites)
        .set({ acceptedAt: new Date() })
        .where(eq(mwInvites.id, inv.id));
    }
    if (pending.length) {
      this.log.log(`Claimed ${pending.length} firm invite(s) for ${email}`);
    }
  }

  private async pullFromControlPlane(userId: string, email: string): Promise<void> {
    const base = (this.config.get<string>('CONTROL_PLANE_URL') ?? '').replace(/\/$/, '');
    const secret =
      this.config.get<string>('CONTROL_PLANE_INTEGRATION_SECRET_KHIRBY')?.trim() ||
      this.config.get<string>('CONTROL_PLANE_INTEGRATION_SECRET')?.trim();
    if (!base || !secret) return;

    const res = await fetch(
      `${base}/v1/integrations/provisioning/firm-access?product=khirby&email=${encodeURIComponent(email)}`,
      {
        headers: { 'x-cp-integration-key': secret },
      },
    );
    if (!res.ok) {
      this.log.debug(`firm-access HTTP ${res.status}`);
      return;
    }
    const body = (await res.json()) as {
      firms?: Array<{ localResourceId: string; role: string }>;
    };
    for (const firm of body.firms ?? []) {
      if (!firm.localResourceId) continue;
      const role = firm.role === 'user' || firm.role === 'member' ? 'member' : 'owner';
      await this.db
        .insert(mwMemberships)
        .values({ workspaceId: firm.localResourceId, userId, role })
        .onConflictDoNothing();
    }
  }
}
