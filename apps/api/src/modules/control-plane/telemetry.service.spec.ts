import { ConfigService } from '@nestjs/config';
import { TelemetryService } from './telemetry.service';
import type { ControlPlaneClient } from './control-plane.client';
import type { InstallationIdentityService } from './installation-identity.service';
import type { HeartbeatPayload } from './contracts';

const INSTALLATION_ID = '11111111-1111-4111-8111-111111111111';

function makeChain(result: unknown = []) {
  const chain: any = {};
  for (const m of ['from', 'where', 'limit', 'values', 'set', 'returning', 'orderBy']) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}

function buildDb() {
  const db: any = {
    select: jest.fn(() => makeChain([{ count: 0 }])),
    insert: jest.fn(() => makeChain([])),
    update: jest.fn(() => makeChain([])),
  };
  return db;
}

function makeConfig(env: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string, fallback?: string) => {
      if (Object.prototype.hasOwnProperty.call(env, key)) return env[key] ?? fallback;
      return fallback;
    }),
  } as unknown as ConfigService;
}

describe('TelemetryService', () => {
  let db: ReturnType<typeof buildDb>;
  let client: { heartbeat: jest.Mock };
  let identity: {
    getOrCreate: jest.Mock;
    touchHeartbeat: jest.Mock;
  };

  function makeService(env: Record<string, string | undefined> = {}) {
    db = buildDb();
    client = { heartbeat: jest.fn().mockResolvedValue({ ok: true, instanceId: INSTALLATION_ID }) };
    identity = {
      getOrCreate: jest.fn().mockResolvedValue({
        id: 'row-1',
        installationId: INSTALLATION_ID,
        registeredEmail: null,
        registeredAt: null,
        lastHeartbeatAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      touchHeartbeat: jest.fn().mockResolvedValue(undefined),
    };

    // buildPayload issues 5 count selects + 1 plugins select
    db.select
      .mockImplementationOnce(() => makeChain([{ count: 3 }])) // users
      .mockImplementationOnce(() => makeChain([{ count: 10 }])) // contacts
      .mockImplementationOnce(() => makeChain([{ count: 4 }])) // leads
      .mockImplementationOnce(() => makeChain([{ count: 7 }])) // tasks
      .mockImplementationOnce(() => makeChain([{ count: 2 }])) // emails
      .mockImplementationOnce(() =>
        makeChain([{ name: 'crm_webhook', version: '1.2.0', enabled: true }]),
      );

    return new TelemetryService(
      db as any,
      makeConfig(env),
      client as unknown as ControlPlaneClient,
      identity as unknown as InstallationIdentityService,
    );
  }

  it('skips fetch entirely when DISABLE_TELEMETRY is truthy', async () => {
    const svc = makeService({ DISABLE_TELEMETRY: 'true' });
    await expect(svc.sendHeartbeat()).resolves.toBe(false);
    expect(client.heartbeat).not.toHaveBeenCalled();
    expect(identity.getOrCreate).not.toHaveBeenCalled();
  });

  it('skips when DISABLE_TELEMETRY=1', async () => {
    const svc = makeService({ DISABLE_TELEMETRY: '1' });
    await expect(svc.sendHeartbeat()).resolves.toBe(false);
    expect(client.heartbeat).not.toHaveBeenCalled();
  });

  it('soft-fails when client returns null (empty URL)', async () => {
    const svc = makeService({ APP_VERSION: '1.0.0' });
    client.heartbeat.mockResolvedValue(null);
    await expect(svc.sendHeartbeat()).resolves.toBe(false);
    expect(client.heartbeat).toHaveBeenCalled();
    expect(identity.touchHeartbeat).not.toHaveBeenCalled();
  });

  it('builds payload and touches heartbeat on success', async () => {
    const svc = makeService({ APP_VERSION: 'v1.2.3' });
    await expect(svc.sendHeartbeat()).resolves.toBe(true);

    const payload = client.heartbeat.mock.calls[0][0] as HeartbeatPayload;
    expect(payload).toMatchObject({
      installationId: INSTALLATION_ID,
      product: 'khirby',
      version: 'v1.2.3',
      users: { total: 3, active7d: 3, active30d: 3 },
      usage: { contacts: 10, leads: 4, boardTasks: 7, emails: 2 },
      features: expect.objectContaining({ crm_webhook: true, boards: true }),
      plugins: [{ id: 'crm_webhook', version: '1.2.0' }],
    });
    expect(identity.touchHeartbeat).toHaveBeenCalled();
  });

  it('skips when last_heartbeat_at is within 24h', async () => {
    const svc = makeService();
    identity.getOrCreate.mockResolvedValue({
      id: 'row-1',
      installationId: INSTALLATION_ID,
      registeredEmail: null,
      registeredAt: null,
      lastHeartbeatAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(svc.sendHeartbeat()).resolves.toBe(false);
    expect(client.heartbeat).not.toHaveBeenCalled();
  });

  it('never throws when identity fails', async () => {
    const svc = makeService();
    identity.getOrCreate.mockRejectedValue(new Error('db down'));
    await expect(svc.sendHeartbeat()).resolves.toBe(false);
  });
});
