import { ConfigService } from '@nestjs/config';
import { TelemetryService } from './telemetry.service';
import type { ControlPlaneClient } from './control-plane.client';
import type { InstallationIdentityService } from './installation-identity.service';
import type { HeartbeatPayload } from './contracts';

const INSTALLATION_ID = '11111111-1111-4111-8111-111111111111';

const COUNT_ROW = {
  users: 3,
  active_7d: 2,
  active_30d: 3,
  contacts: 10,
  contacts_7d: 1,
  contacts_30d: 4,
  submissions: 8,
  submissions_7d: 2,
  submissions_30d: 5,
  forms: 3,
  forms_active: 2,
  leads: 4,
  leads_7d: 1,
  leads_30d: 2,
  leads_won: 1,
  leads_lost: 1,
  lead_comments: 6,
  pipeline_stages: 5,
  board_projects: 2,
  board_modules: 4,
  board_tasks: 7,
  board_tasks_7d: 3,
  board_tasks_30d: 6,
  board_task_comments: 9,
  emails: 12,
  emails_7d: 3,
  emails_30d: 8,
  emails_inbound: 7,
  emails_outbound: 5,
  email_threads: 6,
  mailboxes: 2,
  mailboxes_enabled: 1,
  mailboxes_connected: 1,
  mailboxes_error: 0,
  mailboxes_google_oauth: 1,
  agent_conversations: 4,
  agent_messages: 20,
  agent_assistant_messages: 11,
  agent_messages_7d: 5,
  agent_messages_30d: 14,
  custom_fields: 2,
  newsletter_lists: 1,
  roles: 3,
};

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
    select: jest.fn(() => makeChain([])),
    execute: jest.fn().mockResolvedValue([COUNT_ROW]),
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

    db.select.mockImplementationOnce(() =>
      makeChain([{ name: 'crm_webhook', version: '1.2.0', enabled: true }]),
    );

    return new TelemetryService(
      db as any,
      makeConfig({ NODE_ENV: 'production', ...env }),
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

  it('builds rich anonymous payload and touches heartbeat on success', async () => {
    const svc = makeService({
      APP_VERSION: 'v1.2.3',
      GOOGLE_MAIL_CLIENT_ID: 'client.apps.googleusercontent.com',
      GOOGLE_MAIL_CLIENT_SECRET: 'secret',
    });
    await expect(svc.sendHeartbeat()).resolves.toBe(true);

    const payload = client.heartbeat.mock.calls[0][0] as HeartbeatPayload;
    expect(payload).toMatchObject({
      installationId: INSTALLATION_ID,
      product: 'khirby',
      version: 'v1.2.3',
      users: { total: 3, active7d: 2, active30d: 3 },
      usage: {
        contacts: 10,
        contacts7d: 1,
        contacts30d: 4,
        submissions: 8,
        forms: 3,
        formsActive: 2,
        leads: 4,
        leadsWon: 1,
        leadsLost: 1,
        boardTasks: 7,
        emails: 12,
        emailsInbound: 7,
        emailsOutbound: 5,
        mailboxesEnabled: 1,
        mailboxesGoogleOauth: 1,
        agentConversations: 4,
        agentAssistantMessages: 11,
        agentMessages7d: 5,
        customFields: 2,
        pluginsInstalled: 1,
        pluginsEnabled: 1,
      },
      features: expect.objectContaining({
        boards: true,
        leads: true,
        forms: true,
        agent: true,
        mail: true,
        mailGoogleOauth: true,
        customFields: true,
        crm_webhook: true,
      }),
      plugins: [{ id: 'crm_webhook', version: '1.2.0' }],
    });
    expect(identity.touchHeartbeat).toHaveBeenCalled();
  });

  it('skips when last_heartbeat_at is within 24h in production', async () => {
    const svc = makeService({ NODE_ENV: 'production' });
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

  it('sends again on every run in non-production even within 24h', async () => {
    const svc = makeService({ NODE_ENV: 'development' });
    identity.getOrCreate.mockResolvedValue({
      id: 'row-1',
      installationId: INSTALLATION_ID,
      registeredEmail: null,
      registeredAt: null,
      lastHeartbeatAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(svc.sendHeartbeat()).resolves.toBe(true);
    expect(client.heartbeat).toHaveBeenCalled();
  });

  it('never throws when identity fails', async () => {
    const svc = makeService();
    identity.getOrCreate.mockRejectedValue(new Error('db down'));
    await expect(svc.sendHeartbeat()).resolves.toBe(false);
  });
});
