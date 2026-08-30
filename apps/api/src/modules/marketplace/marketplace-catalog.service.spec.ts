import {
  CATALOG_CACHE_TTL_MS,
  CATALOG_FAILURE_TTL_MS,
  CATALOG_MAX_BYTES,
  MarketplaceCatalogService,
} from './marketplace-catalog.service';
import { CATALOG_FORMAT_VERSION, LOCAL_CATALOG } from './catalog';

/**
 * Boundary here is the wire: `global.fetch` is replaced (the pattern
 * `listmonk.adapter.spec.ts` established) and a real `Response` is returned, so the
 * service's own content-type check and capped body reader are exercised rather than
 * mocked away.
 */

function makeConfig(url: string | undefined) {
  return {
    get: jest.fn((key: string, fallback?: string) =>
      key === 'MARKETPLACE_CATALOG_URL' ? (url ?? fallback) : fallback,
    ),
  } as any;
}

function makeService(url?: string) {
  return new MarketplaceCatalogService(makeConfig(url));
}

function jsonResponse(body: unknown, init: { type?: string; status?: number } = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': init.type ?? 'application/json' },
  });
}

function validDocument(overrides: Record<string, unknown> = {}) {
  return {
    version: CATALOG_FORMAT_VERSION,
    entries: [
      {
        package: '@khirby/plugin-webhook',
        name: 'crm_webhook',
        version: '1.0.0',
        category: 'automation',
        vendor: 'Khirby',
        icon: 'plugins',
        docsUrl: 'https://khirby.com/docs/plugins/webhook',
      },
    ],
    ...overrides,
  };
}

/** One entry with `field` replaced by `value`; other fields stay valid. */
function documentWithEntry(field: string, value: unknown) {
  const doc = validDocument();
  (doc.entries[0] as Record<string, unknown>)[field] = value;
  return doc;
}

const REMOTE = 'https://catalog.khirby.com/v1.json';

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

describe('MarketplaceCatalogService — no remote configured', () => {
  it('uses the in-image copy without touching the network', async () => {
    const svc = makeService('');
    await expect(svc.load()).resolves.toEqual(LOCAL_CATALOG);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an unset variable the same way', async () => {
    const svc = makeService(undefined);
    await expect(svc.load()).resolves.toEqual(LOCAL_CATALOG);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores surrounding whitespace rather than fetching an empty address', async () => {
    const svc = makeService('   ');
    await expect(svc.load()).resolves.toEqual(LOCAL_CATALOG);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('MarketplaceCatalogService — remote document', () => {
  it('parses a well-formed document and serves it instead of the local copy', async () => {
    fetchMock.mockResolvedValue(jsonResponse(validDocument()));
    const svc = makeService(REMOTE);

    const doc = await svc.load();
    expect(doc.entries.map((e) => e.name)).toEqual(['crm_webhook']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /*
   * Forward compatibility, and the reason it is not optional: the first format
   * change made for community plugins would otherwise blind every deployed
   * instance still reading its own copy.
   */
  it('ignores unknown extra fields on an entry rather than rejecting the document', async () => {
    fetchMock.mockResolvedValue(jsonResponse(documentWithEntry('verifiedBadge', { tier: 'gold' })));

    const doc = await makeService(REMOTE).load();
    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0]).not.toHaveProperty('verifiedBadge');
  });

  it('drops to the local copy for an unknown format version, with a warning', async () => {
    fetchMock.mockResolvedValue(jsonResponse(validDocument({ version: 99 })));
    const svc = makeService(REMOTE);
    const warn = jest.spyOn((svc as any).logger, 'warn');

    await expect(svc.load()).resolves.toEqual(LOCAL_CATALOG);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('format version 99');
  });

  it.each([
    ['a non-object document', 'not an object', () => jsonResponse([1, 2, 3])],
    ['a missing entries array', 'entries', () => jsonResponse({ version: CATALOG_FORMAT_VERSION })],
    ['unparsable JSON', 'parsable', () => jsonResponse('{ not json')],
    ['an HTML body', 'content-type', () => jsonResponse('<html></html>', { type: 'text/html' })],
    ['a non-200 answer', '503', () => jsonResponse(validDocument(), { status: 503 })],
  ])('falls back for %s', async (_label, expectedReason, makeResponse) => {
    fetchMock.mockResolvedValue(makeResponse());
    const svc = makeService(REMOTE);
    const warn = jest.spyOn((svc as any).logger, 'warn');

    await expect(svc.load()).resolves.toEqual(LOCAL_CATALOG);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0]).toLowerCase()).toContain(expectedReason.toLowerCase());
  });

  it('falls back when the remote is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = makeService(REMOTE);

    await expect(svc.load()).resolves.toEqual(LOCAL_CATALOG);
  });

  it('falls back when the body exceeds the size cap', async () => {
    // No content-length: the running total is what has to stop this, since a
    // server can omit or understate the header.
    const huge = 'x'.repeat(CATALOG_MAX_BYTES + 10);
    fetchMock.mockResolvedValue(
      new Response(huge, { headers: { 'content-type': 'application/json' } }),
    );
    const svc = makeService(REMOTE);
    const warn = jest.spyOn((svc as any).logger, 'warn');

    await expect(svc.load()).resolves.toEqual(LOCAL_CATALOG);
    expect(String(warn.mock.calls[0][0])).toContain('exceeds');
  });

  it('rejects an oversized body declared up front without reading it', async () => {
    const res = new Response('{}', {
      headers: {
        'content-type': 'application/json',
        'content-length': String(CATALOG_MAX_BYTES + 1),
      },
    });
    fetchMock.mockResolvedValue(res);

    await expect(makeService(REMOTE).load()).resolves.toEqual(LOCAL_CATALOG);
  });

  it('refuses a non-https address in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const svc = makeService('http://catalog.khirby.com/v1.json');
      await expect(svc.load()).resolves.toEqual(LOCAL_CATALOG);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('allows plain http outside production, where a local fixture is the point', async () => {
    fetchMock.mockResolvedValue(jsonResponse(validDocument()));
    const svc = makeService('http://localhost:9999/catalog.json');

    await svc.load();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses an address that is not a URL at all', async () => {
    const svc = makeService('not a url');
    await expect(svc.load()).resolves.toEqual(LOCAL_CATALOG);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('MarketplaceCatalogService — per-entry validation rejects the whole document', () => {
  it.each([
    ['an unknown category', 'category', 'crypto'],
    ['an unknown icon', 'icon', 'sparkles'],
    ['a non-https docsUrl', 'docsUrl', 'http://khirby.com/docs'],
    ['a missing package', 'package', undefined],
    ['a blank vendor', 'vendor', '   '],
    ['a non-string name', 'name', 42],
  ])('rejects %s', async (_label, field, value) => {
    fetchMock.mockResolvedValue(jsonResponse(documentWithEntry(field, value)));
    await expect(makeService(REMOTE).load()).resolves.toEqual(LOCAL_CATALOG);
  });

  it('rejects a document listing the same plugin twice', async () => {
    const doc = validDocument();
    doc.entries.push({ ...doc.entries[0] });
    fetchMock.mockResolvedValue(jsonResponse(doc));

    const svc = makeService(REMOTE);
    const warn = jest.spyOn((svc as any).logger, 'warn');

    await expect(svc.load()).resolves.toEqual(LOCAL_CATALOG);
    expect(String(warn.mock.calls[0][0])).toContain('twice');
  });

  /*
   * The rule this pins down: a valid entry beside an invalid one must NOT be
   * admitted. Half a catalog looks correct on screen and silently loses positions,
   * which is much harder to notice than the fallback.
   */
  it('does not admit the valid entries beside an invalid one', async () => {
    const doc = validDocument();
    doc.entries.push({ ...doc.entries[0], name: 'crm_discord', category: 'nonsense' as never });
    fetchMock.mockResolvedValue(jsonResponse(doc));

    const result = await makeService(REMOTE).load();
    expect(result).toEqual(LOCAL_CATALOG);
    expect(
      result.entries.some((e) => e.name === 'crm_webhook' && e.category === 'automation'),
    ).toBe(true);
  });
});

describe('MarketplaceCatalogService — caching', () => {
  it('makes no second request inside the success window, and exactly one after it', async () => {
    fetchMock.mockResolvedValue(jsonResponse(validDocument()));
    const svc = makeService(REMOTE);

    await svc.load();
    await svc.load();
    await svc.load();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A fresh Response per call: a body can only be read once.
    fetchMock.mockImplementation(async () => jsonResponse(validDocument()));
    (Date.now as jest.Mock).mockReturnValue(1_000_000 + CATALOG_CACHE_TTL_MS + 1);
    await svc.load();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /*
   * Without the negative cache the service still ANSWERS while the remote is
   * down — from the local copy — but pays the full fetch timeout on every single
   * request, so the page feels broken even though no error is returned.
   */
  it('does not retry a failed remote on the next request', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = makeService(REMOTE);

    await svc.load();
    await svc.load();
    await svc.load();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once the failure window has passed', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = makeService(REMOTE);
    await svc.load();

    (Date.now as jest.Mock).mockReturnValue(1_000_000 + CATALOG_FAILURE_TTL_MS + 1);
    fetchMock.mockImplementation(async () => jsonResponse(validDocument()));

    const doc = await svc.load();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(doc.entries[0].name).toBe('crm_webhook');
  });
});
