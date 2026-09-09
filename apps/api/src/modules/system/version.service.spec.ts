import {
  DEFAULT_RELEASES_URL,
  VERSION_CACHE_TTL_MS,
  VERSION_FAILURE_TTL_MS,
  VERSION_MAX_BYTES,
  VersionService,
} from './version.service';

function makeConfig(env: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string, fallback?: string) => {
      if (Object.prototype.hasOwnProperty.call(env, key)) return env[key] ?? fallback;
      return fallback;
    }),
  } as any;
}

function makeService(env: Record<string, string | undefined> = {}) {
  return new VersionService(makeConfig(env));
}

function jsonResponse(body: unknown, init: { type?: string; status?: number } = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': init.type ?? 'application/json' },
  });
}

const RELEASE = {
  tag_name: 'v1.2.0',
  html_url: 'https://github.com/Khirby-labs/khirby/releases/tag/v1.2.0',
};

let fetchMock: jest.Mock;
const realFetch = global.fetch;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
});

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('VersionService — current version', () => {
  it('falls back to dev when APP_VERSION is unset', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RELEASE));
    const info = await makeService({ APP_VERSION: undefined }).getVersionInfo();
    expect(info.current).toBe('dev');
  });

  it('normalises a leading v on APP_VERSION', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RELEASE));
    const info = await makeService({ APP_VERSION: 'v1.1.5' }).getVersionInfo();
    expect(info.current).toBe('1.1.5');
  });
});

describe('VersionService — GitHub latest', () => {
  it('flags an update when the release is newer than the running build', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RELEASE));
    const info = await makeService({ APP_VERSION: '1.1.5' }).getVersionInfo();

    expect(info).toMatchObject({
      current: '1.1.5',
      latest: '1.2.0',
      updateAvailable: true,
      releaseUrl: RELEASE.html_url,
      checkFailed: false,
    });
    expect(info.checkedAt).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      DEFAULT_RELEASES_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }),
      }),
    );
  });

  it('does not flag an update when versions match', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...RELEASE, tag_name: 'v1.1.5' }));
    const info = await makeService({ APP_VERSION: 'v1.1.5' }).getVersionInfo();
    expect(info.updateAvailable).toBe(false);
    expect(info.latest).toBe('1.1.5');
  });

  it('serves the positive cache within the TTL', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RELEASE));
    const svc = makeService({ APP_VERSION: '1.0.0' });
    await svc.getVersionInfo();
    await svc.getVersionInfo();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + VERSION_CACHE_TTL_MS + 1);
    await svc.getVersionInfo();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('negatively caches a failed fetch', async () => {
    fetchMock.mockResolvedValue(jsonResponse('nope', { status: 503 }));
    const svc = makeService({ APP_VERSION: '1.0.0' });

    const first = await svc.getVersionInfo();
    expect(first).toMatchObject({
      latest: null,
      updateAvailable: false,
      checkFailed: true,
    });

    fetchMock.mockClear();
    const second = await svc.getVersionInfo();
    expect(second.checkFailed).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + VERSION_FAILURE_TTL_MS + 1);
    fetchMock.mockResolvedValue(jsonResponse(RELEASE));
    const third = await svc.getVersionInfo();
    expect(third.latest).toBe('1.2.0');
    expect(third.checkFailed).toBe(false);
  });

  it('rejects a non-https override URL without calling the network', async () => {
    const info = await makeService({
      APP_VERSION: '1.0.0',
      KHIRBY_RELEASES_URL: 'http://evil.example/releases',
    }).getVersionInfo();
    expect(info.latest).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse('x'.repeat(VERSION_MAX_BYTES + 1), { type: 'application/json' }),
    );
    const info = await makeService({ APP_VERSION: '1.0.0' }).getVersionInfo();
    expect(info.latest).toBeNull();
    expect(info.checkFailed).toBe(true);
  });

  it('uses KHIRBY_RELEASES_URL when set', async () => {
    const url = 'https://example.com/releases/latest';
    fetchMock.mockResolvedValue(jsonResponse(RELEASE));
    await makeService({ APP_VERSION: '1.0.0', KHIRBY_RELEASES_URL: url }).getVersionInfo();
    expect(fetchMock).toHaveBeenCalledWith(url, expect.any(Object));
  });
});
