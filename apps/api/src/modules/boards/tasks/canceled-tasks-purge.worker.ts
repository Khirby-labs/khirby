import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TasksService } from './tasks.service';

const PURGE_INTERVAL_MS = 60 * 60 * 1000; // hourly

/**
 * Periodically hard-deletes tasks that have sat in a canceled status for ≥ 7 days.
 */
@Injectable()
export class CanceledTasksPurgeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CanceledTasksPurgeWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly tasks: TasksService) {}

  onModuleInit() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), PURGE_INTERVAL_MS);
    // Unref so the timer does not keep the process alive in tests/shutdown races.
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const n = await this.tasks.purgeExpiredCanceled();
      if (n > 0) {
        this.logger.log(`Purged ${n} canceled task(s) older than 7 days`);
      }
    } catch (err) {
      this.logger.warn(
        `Canceled-task purge failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
