import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import {
  contacts,
  emailMessages,
  leads,
  plugins,
  tbTasks,
  users,
} from '../../core/database/schema';
import { ControlPlaneClient } from './control-plane.client';
import type { HeartbeatPayload } from './contracts';
import { InstallationIdentityService } from './installation-identity.service';

const DAY_MS = 24 * 60 * 60 * 1000;

function isTruthyEnv(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly config: ConfigService,
    private readonly client: ControlPlaneClient,
    private readonly identity: InstallationIdentityService,
  ) {}

  telemetryDisabled(): boolean {
    return isTruthyEnv(this.config.get<string>('DISABLE_TELEMETRY'));
  }

  /**
   * Send an anonymous heartbeat. Soft-fails on every error path — never throws
   * to the scheduler or HTTP callers that trigger a sync.
   */
  async sendHeartbeat(opts: { force?: boolean } = {}): Promise<boolean> {
    if (this.telemetryDisabled()) {
      this.logger.debug('Telemetry disabled (DISABLE_TELEMETRY); skipping heartbeat');
      return false;
    }

    try {
      const row = await this.identity.getOrCreate();

      if (!opts.force && row.lastHeartbeatAt) {
        const age = Date.now() - new Date(row.lastHeartbeatAt).getTime();
        if (age < DAY_MS) {
          this.logger.debug('Heartbeat already sent within 24h; skipping');
          return false;
        }
      }

      const payload = await this.buildPayload(row.installationId);
      const result = await this.client.heartbeat(payload);
      if (!result) {
        this.logger.warn('Control Plane heartbeat soft-failed (not configured or unreachable)');
        return false;
      }

      await this.identity.touchHeartbeat();
      return true;
    } catch (err) {
      this.logger.warn(`Heartbeat failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async buildPayload(installationId: string): Promise<HeartbeatPayload> {
    const version = (this.config.get<string>('APP_VERSION') ?? 'dev').trim() || 'dev';

    const [userCount, contactCount, leadCount, taskCount, emailCount, pluginRows] =
      await Promise.all([
        this.count(users),
        this.count(contacts),
        this.count(leads),
        this.count(tbTasks),
        this.count(emailMessages),
        this.db
          .select({
            name: plugins.name,
            version: plugins.version,
            enabled: plugins.enabled,
          })
          .from(plugins),
      ]);

    // users has no lastLogin — report total for all three buckets.
    const features: Record<string, boolean> = {
      boards: true,
      leads: true,
      mail: true,
    };
    for (const p of pluginRows) {
      if (p.enabled) features[p.name] = true;
    }

    return {
      installationId,
      product: 'khirby',
      version: version.slice(0, 64),
      sentAt: new Date().toISOString(),
      users: {
        total: userCount,
        active7d: userCount,
        active30d: userCount,
      },
      usage: {
        contacts: contactCount,
        leads: leadCount,
        boardTasks: taskCount,
        emails: emailCount,
      },
      features,
      plugins: pluginRows.map((p) => ({ id: p.name, version: p.version })),
    };
  }

  private async count(
    table: typeof users | typeof contacts | typeof leads | typeof tbTasks | typeof emailMessages,
  ): Promise<number> {
    const rows = await this.db.select({ count: sql<number>`count(*)::int` }).from(table);
    return Number(rows[0]?.count ?? 0);
  }
}

/** Exported for tests that assert the 24h gate without importing drizzle. */
export { DAY_MS as TELEMETRY_HEARTBEAT_MIN_INTERVAL_MS };
