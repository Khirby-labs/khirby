import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull, like, or } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, primaryKey } from 'drizzle-orm/pg-core';
import { randomBytes } from 'node:crypto';
import { DB_TOKEN } from '../../core/database/database.module';
import type { Db } from '../../core/database/db';
import { users } from '../../core/database/schema';

/** Minimal mw_* shapes — owned by multi-workspace plugin, written here for CP sync. */
const mwWorkspaces = pgTable('mw_workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

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

type PendingEvent = {
  eventId: string;
  eventType: string;
  aggregateVersion: number;
  payload: {
    organizationName?: string;
    organizationSlug?: string;
    status?: string;
    existingWorkspaceId?: string | null;
    members?: Array<{ email: string; role: string }>;
  };
};

type AckResult = {
  resourceType?: string;
  localResourceId?: string;
  label?: string;
};

function slugify(name: string): string {
  const folded = name
    .trim()
    .toLowerCase()
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/ź/g, 'z')
    .replace(/ż/g, 'z')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return (
    folded
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || `ws-${randomBytes(3).toString('hex')}`
  );
}

/**
 * Pulls CP product grants for Khirby and ensures one mw_workspace per org
 * (ADR-0009 §3), with memberships matched by email.
 */
@Injectable()
export class ControlPlaneProvisioningService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ControlPlaneProvisioningService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    @Inject(DB_TOKEN) private readonly db: Db,
  ) {}

  onModuleInit() {
    const base = this.baseUrl();
    const secret = this.integrationSecret();
    if (!base || !secret) {
      this.log.warn(
        'CONTROL_PLANE_URL / CONTROL_PLANE_INTEGRATION_SECRET_KHIRBY unset — firm provisioning disabled',
      );
      return;
    }
    const ms = Number(this.config.get<string>('CONTROL_PLANE_PROVISIONING_POLL_MS') ?? '10000');
    const interval = Number.isFinite(ms) && ms >= 3000 ? ms : 10000;
    void this.syncOnce();
    this.timer = setInterval(() => void this.syncOnce(), interval);
    this.log.log(`CP provisioning poll every ${interval}ms → ${base}`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async syncOnce(): Promise<{ processed: number }> {
    if (this.running) return { processed: 0 };
    this.running = true;
    try {
      const events = await this.fetchPending();
      let processed = 0;
      for (const ev of events) {
        try {
          const result = await this.applyEvent(ev);
          await this.ack(ev, true, undefined, result);
          processed += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.log.error(`Failed ${ev.eventType} ${ev.eventId}: ${msg}`);
          try {
            await this.ack(ev, false, 'apply_failed');
          } catch {
            /* ignore */
          }
        }
      }
      return { processed };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`CP provisioning sync skipped: ${msg}`);
      return { processed: 0 };
    } finally {
      this.running = false;
    }
  }

  private baseUrl(): string {
    return (this.config.get<string>('CONTROL_PLANE_URL') ?? '').replace(/\/$/, '');
  }

  private integrationSecret(): string {
    return (
      this.config.get<string>('CONTROL_PLANE_INTEGRATION_SECRET_KHIRBY')?.trim() ||
      this.config.get<string>('CONTROL_PLANE_INTEGRATION_SECRET')?.trim() ||
      ''
    );
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-cp-integration-key': this.integrationSecret(),
    };
  }

  private async fetchPending(): Promise<PendingEvent[]> {
    const res = await fetch(
      `${this.baseUrl()}/v1/integrations/provisioning/pending?product=khirby`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`pending HTTP ${res.status}`);
    const body = (await res.json()) as { events: PendingEvent[] };
    return body.events ?? [];
  }

  private async ack(
    ev: PendingEvent,
    ok: boolean,
    reasonCode?: string,
    result?: AckResult | void,
  ) {
    const res = await fetch(`${this.baseUrl()}/v1/integrations/provisioning/ack`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        eventId: ev.eventId,
        product: 'khirby',
        status: ok ? 'acked' : 'failed',
        appliedVersion: ev.aggregateVersion,
        effective: ok,
        ...(reasonCode ? { reasonCode } : {}),
        ...(result && result.localResourceId ? { result } : {}),
      }),
    });
    if (!res.ok) throw new Error(`ack HTTP ${res.status}`);
  }

  private async applyEvent(ev: PendingEvent): Promise<AckResult | void> {
    if (ev.eventType === 'product_grant.upserted.v1') {
      return this.applyProductGrant(ev);
    }
    if (ev.eventType === 'product_grant.disabled.v1') {
      this.log.debug(`Product grant disabled ${ev.eventId} — firm left intact`);
      return;
    }
    this.log.debug(`Ignoring ${ev.eventType}`);
  }

  private async applyProductGrant(ev: PendingEvent): Promise<AckResult | void> {
    const p = ev.payload;
    if (p.status && p.status !== 'active') return;
    const name = (p.organizationName ?? p.organizationSlug ?? '').trim();
    if (!name) {
      this.log.warn(`product_grant ${ev.eventId} missing organizationName`);
      return;
    }

    let ws: { id: string; name: string } | null = null;
    if (p.existingWorkspaceId) {
      const [row] = await this.db
        .select({ id: mwWorkspaces.id, name: mwWorkspaces.name })
        .from(mwWorkspaces)
        .where(eq(mwWorkspaces.id, p.existingWorkspaceId))
        .limit(1);
      ws = row ?? null;
    }
    const orgKey = (ev.payload as { organizationId?: string }).organizationId
      ?.replace(/-/g, '')
      .slice(0, 12);
    if (!ws && orgKey) {
      const [byOrg] = await this.db
        .select({ id: mwWorkspaces.id, name: mwWorkspaces.name })
        .from(mwWorkspaces)
        .where(
          or(eq(mwWorkspaces.slug, `cp${orgKey}`), like(mwWorkspaces.slug, `cp${orgKey}-%`))!,
        )
        .limit(1);
      ws = byOrg ?? null;
    }
    if (!ws) {
      const base = slugify(name);
      let slug = orgKey ? `cp${orgKey}` : base;
      for (let i = 0; i < 8; i++) {
        const [hit] = await this.db
          .select({ id: mwWorkspaces.id })
          .from(mwWorkspaces)
          .where(eq(mwWorkspaces.slug, slug))
          .limit(1);
        if (!hit) break;
        const suffix = randomBytes(2).toString('hex');
        slug = orgKey ? `cp${orgKey}-${suffix}` : `${base.slice(0, 40)}-${suffix}`;
      }
      const [created] = await this.db
        .insert(mwWorkspaces)
        .values({ slug, name, status: 'active' })
        .returning({ id: mwWorkspaces.id, name: mwWorkspaces.name });
      ws = created;
      this.log.log(`Provisioned Khirby firm ${ws.id} for CP org "${name}"`);
    }

    for (const m of p.members ?? []) {
      const email = m.email?.trim().toLowerCase();
      if (!email) continue;
      const role = m.role === 'user' ? 'member' : 'owner';
      const [user] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (user) {
        await this.db
          .insert(mwMemberships)
          .values({ workspaceId: ws.id, userId: user.id, role })
          .onConflictDoNothing();
        continue;
      }
      // User not in Khirby yet (SSO later) — pending invite is claimed on login.
      const [existingInvite] = await this.db
        .select({ id: mwInvites.id })
        .from(mwInvites)
        .where(
          and(
            eq(mwInvites.workspaceId, ws.id),
            eq(mwInvites.email, email),
            isNull(mwInvites.acceptedAt),
          ),
        )
        .limit(1);
      if (existingInvite) continue;
      await this.db.insert(mwInvites).values({
        workspaceId: ws.id,
        email,
        role,
        token: randomBytes(24).toString('hex'),
      });
      this.log.log(`Queued firm invite for ${email} → ${ws.name}`);
    }

    return {
      resourceType: 'workspace',
      localResourceId: ws.id,
      label: ws.name,
    };
  }
}
