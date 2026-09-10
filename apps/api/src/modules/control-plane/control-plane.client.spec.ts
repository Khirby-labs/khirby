import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import {
  CONTROL_PLANE_RETRY_BACKOFF_MS,
  ControlPlaneClient,
  DEFAULT_CONTROL_PLANE_URL,
} from './control-plane.client';
import type { HeartbeatPayload } from './contracts';

function makeConfig(env: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string, fallback?: string) => {
      if (Object.prototype.hasOwnProperty.call(env, key)) return env[key] ?? fallback;
      return fallback;
    }),
  } as any;
}

function makeClient(env: Record<string, string | undefined> = {}) {
  return new ControlPlaneClient(makeConfig(env));
}

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

const INSTALLATION_ID = '11111111-1111-4111-8111-111111111111';

const HEARTBEAT_PAYLOAD: HeartbeatPayload = {
  installationId: INSTALLATION_ID,
  product: 'khirby',
  version: '1.0.0',
  users: { total: 1, active7d: 1, active30d: 1 },
};

let fetchMock: jest.Mock;
const realFetch = global.fetch;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.useFakeTimers({ advanceTimers: true });
});

afterEach(() => {
  global.fetch = realFetch;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('ControlPlaneClient', () => {
  it('trims trailing slash from CONTROL_PLANE_URL', () => {
    const client = makeClient({ CONTROL_PLANE_URL: 'https://cp.example.com/' });
    expect(client.baseUrl()).toBe('https://cp.example.com');
    expect(client.isConfigured()).toBe(true);
  });

  it('rejects http CONTROL_PLANE_URL in production', () => {
    const client = makeClient({
      CONTROL_PLANE_URL: 'http://cp.example.com',
      NODE_ENV: 'production',
    });
    expect(() => client.baseUrl()).toThrow(BadRequestException);
  });

  it('allows http CONTROL_PLANE_URL when NODE_ENV is not production', () => {
    const client = makeClient({
      CONTROL_PLANE_URL: 'http://localhost:4000/',
      NODE_ENV: 'dev',
    });
    expect(client.baseUrl()).toBe('http://localhost:4000');
  });

  it('rejects CONTROL_PLANE_URL without a host', () => {
    const client = makeClient({ CONTROL_PLANE_URL: 'https://' });
    expect(() => client.baseUrl()).toThrow(BadRequestException);
  });

  it('defaults to ctrl.bearly.pro when CONTROL_PLANE_URL is unset', () => {
    const client = makeClient({});
    expect(client.baseUrl()).toBe(DEFAULT_CONTROL_PLANE_URL);
    expect(client.isConfigured()).toBe(true);
  });

  it('heartbeat returns null when URL is empty (soft fail)', async () => {
    const client = makeClient({ CONTROL_PLANE_URL: '' });
    await expect(client.heartbeat(HEARTBEAT_PAYLOAD)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('listPlugins returns null when URL is explicitly empty', async () => {
    const client = makeClient({ CONTROL_PLANE_URL: '' });
    await expect(client.listPlugins()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('register throws when URL is not configured', async () => {
    const client = makeClient({ CONTROL_PLANE_URL: '   ' });
    await expect(
      client.register({ installationId: INSTALLATION_ID, email: 'admin@example.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('heartbeat posts and validates the response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, instanceId: '22222222-2222-4222-8222-222222222222' }),
    );
    const client = makeClient({ CONTROL_PLANE_URL: 'https://cp.example.com' });
    const result = await client.heartbeat(HEARTBEAT_PAYLOAD);

    expect(result).toEqual({
      ok: true,
      instanceId: '22222222-2222-4222-8222-222222222222',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cp.example.com/v1/telemetry/heartbeat',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('retries once on network error then soft-fails for heartbeat', async () => {
    fetchMock
      .mockRejectedValueOnce(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
      )
      .mockRejectedValueOnce(new TypeError('fetch failed'));

    const client = makeClient({ CONTROL_PLANE_URL: 'https://cp.example.com' });
    const promise = client.heartbeat(HEARTBEAT_PAYLOAD);
    await jest.advanceTimersByTimeAsync(CONTROL_PLANE_RETRY_BACKOFF_MS);
    await expect(promise).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('register throws upstreamFailed on HTTP error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'nope' }, { status: 503 }));
    const client = makeClient({ CONTROL_PLANE_URL: 'https://cp.example.com' });
    await expect(
      client.register({ installationId: INSTALLATION_ID, email: 'admin@example.com' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
