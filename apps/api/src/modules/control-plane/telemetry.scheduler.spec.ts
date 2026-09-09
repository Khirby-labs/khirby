import { ConfigService } from '@nestjs/config';
import {
  TELEMETRY_BOOT_DELAY_MS,
  TELEMETRY_DEV_BOOT_DELAY_MS,
  TELEMETRY_INTERVAL_MS,
  TelemetryScheduler,
} from './telemetry.scheduler';
import type { TelemetryService } from './telemetry.service';

function makeConfig(env: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string, fallback?: string) => {
      if (Object.prototype.hasOwnProperty.call(env, key)) return env[key] ?? fallback;
      return fallback;
    }),
  } as unknown as ConfigService;
}

describe('TelemetryScheduler', () => {
  let telemetry: { sendHeartbeat: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    telemetry = { sendHeartbeat: jest.fn().mockResolvedValue(true) };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires ~5s after boot in non-production and does not start a 24h interval', async () => {
    const scheduler = new TelemetryScheduler(
      telemetry as unknown as TelemetryService,
      makeConfig({ NODE_ENV: 'development' }),
    );
    scheduler.onModuleInit();

    expect(telemetry.sendHeartbeat).not.toHaveBeenCalled();
    jest.advanceTimersByTime(TELEMETRY_DEV_BOOT_DELAY_MS - 1);
    expect(telemetry.sendHeartbeat).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(telemetry.sendHeartbeat).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(TELEMETRY_INTERVAL_MS);
    await Promise.resolve();
    expect(telemetry.sendHeartbeat).toHaveBeenCalledTimes(1);

    scheduler.onModuleDestroy();
  });

  it('fires ~60s after boot in production and then on the 24h interval', async () => {
    const scheduler = new TelemetryScheduler(
      telemetry as unknown as TelemetryService,
      makeConfig({ NODE_ENV: 'production' }),
    );
    scheduler.onModuleInit();

    jest.advanceTimersByTime(TELEMETRY_BOOT_DELAY_MS);
    await Promise.resolve();
    expect(telemetry.sendHeartbeat).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(TELEMETRY_INTERVAL_MS);
    await Promise.resolve();
    expect(telemetry.sendHeartbeat).toHaveBeenCalledTimes(2);

    scheduler.onModuleDestroy();
  });
});
