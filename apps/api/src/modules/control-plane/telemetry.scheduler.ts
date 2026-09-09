import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';

export const TELEMETRY_BOOT_DELAY_MS = 60_000;
export const TELEMETRY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Fires an anonymous heartbeat ~60s after boot, then every 24h.
 * The service itself gates on last_heartbeat_at so overlapping timers
 * (boot + interval) cannot double-send within a day.
 */
@Injectable()
export class TelemetryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryScheduler.name);
  private bootTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly telemetry: TelemetryService) {}

  onModuleInit(): void {
    this.bootTimer = setTimeout(() => {
      void this.safeSend('boot');
    }, TELEMETRY_BOOT_DELAY_MS);

    this.intervalTimer = setInterval(() => {
      void this.safeSend('interval');
    }, TELEMETRY_INTERVAL_MS);

    // Allow the process to exit without waiting on the long interval.
    if (typeof this.intervalTimer.unref === 'function') this.intervalTimer.unref();
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
