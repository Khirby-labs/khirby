import { ListmonkAdapter } from './listmonk.adapter';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    LISTMONK_URL: 'http://listmonk.test',
    LISTMONK_USER: 'admin',
    LISTMONK_PASSWORD: 'secret',
    ...overrides,
  };
  return { get: jest.fn((key: string, fallback = '') => defaults[key] ?? fallback) };
}

function makeDb() {
  const updateChain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue([{ id: 'sub-1', listmonkSynced: true }]),
  };
  return { update: jest.fn(() => updateChain) };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('ListmonkAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('addSubscriber — happy path calls fetch with correct args', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);

    const adapter = new ListmonkAdapter(makeConfig() as any, makeDb() as any);
    await adapter.addSubscriber('john@example.com', 'John', [1, 2]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://listmonk.test/api/subscribers');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string);
    expect(body.email).toBe('john@example.com');
    expect(body.lists).toEqual([1, 2]);

    const authHeader = (init.headers as Record<string, string>).Authorization;
    expect(authHeader).toBe('Basic ' + Buffer.from('admin:secret').toString('base64'));
  });

  it('addSubscriber — does NOT throw when fetch returns non-ok status', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Internal Server Error'),
    } as unknown as Response);

    const adapter = new ListmonkAdapter(makeConfig() as any, makeDb() as any);
    await expect(adapter.addSubscriber('fail@example.com', 'Fail', [])).resolves.not.toThrow();
  });

  it('addSubscriber — does NOT throw when fetch rejects (network error)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    const adapter = new ListmonkAdapter(makeConfig() as any, makeDb() as any);
    await expect(adapter.addSubscriber('err@example.com', 'Err', [])).resolves.not.toThrow();
  });

  it('syncSubmission — calls addSubscriber and marks listmonkSynced = true', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);

    const db = makeDb();
    const adapter = new ListmonkAdapter(makeConfig() as any, db as any);

    await adapter.syncSubmission('sub-1', 'john@example.com', 'John', [3]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalled();
    const updateChain = db.update.mock.results[0].value;
    expect(updateChain.set).toHaveBeenCalledWith({ listmonkSynced: true });
  });

  it('syncSubmission — still marks synced even if addSubscriber logs warning (non-ok)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue('bad request'),
    } as unknown as Response);

    const db = makeDb();
    const adapter = new ListmonkAdapter(makeConfig() as any, db as any);

    await adapter.syncSubmission('sub-2', 'bad@example.com', 'Bad', []);

    // addSubscriber doesn't throw, syncSubmission still proceeds to update DB
    expect(db.update).toHaveBeenCalled();
  });
});
