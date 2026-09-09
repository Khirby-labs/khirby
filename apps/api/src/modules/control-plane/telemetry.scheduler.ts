import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelemetryService } from './telemetry.service';

/** Production: wait a minute after boot so migrations/health settle. */
export const TELEMETRY_BOOT_DELAY_MS = 60_000;
/** Dev: short delay so each `pnpm dev` run still reaches Control Plane quickly. */
export const TELEMETRY_DEV_BOOT_DELAY_MS = 5_000;
export const TELEMETRY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Production: heartbeat ~60s after boot, then every 24h (service 24h gate).
 * Non-production: heartbeat shortly after every process start; no 24h interval
 * (service skips the gate when NODE_ENV !== production).
 */
@Injectable()
export class TelemetryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryScheduler.name);
  private bootTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly telemetry: TelemetryService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const isProd = (this.config.get<string>('NODE_ENV') ?? '').trim() === 'production';
    const bootDelay = isProd ? TELEMETRY_BOOT_DELAY_MS : TELEMETRY_DEV_BOOT_DELAY_MS;

    this.bootTimer = setTimeout(() => {
      void this.safeSend('boot');
    }, bootDelay);

    if (isProd) {
      this.intervalTimer = setInterval(() => {
        void this.safeSend('interval');
      }, TELEMETRY_INTERVAL_MS);
      if (typeof this.intervalTimer.unref === 'function') this.intervalTimer.unref();
    }

    if (typeof this.bootTimer.unref === 'function') this.bootTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.bootTimer = null;
    this.intervalTimer = null;
  }

  private async safeSend(reason: string): Promise<void> {
    try {
      await this.telemetry.sendHeartbeat();
    } catch (err) {
      this.logger.warn(
        `Telemetry ${reason} tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
