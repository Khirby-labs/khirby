import { EventEmitter } from 'node:events';
import { ImapFlow } from 'imapflow';
import { MailIdleWorker } from './mail-idle.worker';

jest.mock('imapflow', () => ({ ImapFlow: jest.fn() }));
jest.mock('./mail-crypto', () => ({ mailSecretsKeyProblem: () => null }));

const raw = Buffer.from(
  'From: sender@example.invalid\r\nTo: crm@example.invalid\r\nMessage-ID: <one@example.invalid>\r\nSubject: Test\r\n\r\nBody',
);
const settle = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function setup() {
  let checkpoint = 100;
  const client = Object.assign(new EventEmitter(), {
    connect: jest.fn().mockResolvedValue(undefined),
    mailboxOpen: jest.fn().mockResolvedValue(undefined),
    mailbox: { uidValidity: 1, uidNext: 104 },
    capabilities: new Set(['IDLE']),
    search: jest.fn().mockResolvedValue([]),
    fetchOne: jest.fn().mockResolvedValue({ source: raw }),
    close: jest.fn(),
  });
  client.close.mockImplementation(() => client.emit('close'));
  (ImapFlow as unknown as jest.Mock).mockReturnValue(client);
  const mailbox = {
    id: 'mailbox',
    imapLastUid: 100,
    imapUidValidity: 1,
    backfillDays: 30,
    imapHost: 'imap.invalid',
    imapPort: 993,
    imapSecure: true,
    imapUser: 'crm',
  };
  const mailboxSvc = {
    setIdleWorker: jest.fn(),
    getDecryptedCredentials: jest
      .fn()
      .mockResolvedValue({ mailbox, authMethod: 'password', imapPassword: 'test' }),
    getRawRow: jest.fn(async () => ({ ...mailbox, imapLastUid: checkpoint })),
    updateSyncPointer: jest.fn(async (_id, patch) => {
      if (patch.imapLastUid != null) checkpoint = patch.imapLastUid;
    }),
    updateConnectionStatus: jest.fn().mockResolvedValue(undefined),
  };
  const threadSvc = {
    ingestMessage: jest
      .fn()
      .mockResolvedValue({ isNew: false, messageId: 'id', threadId: 'thread' }),
  };
  const worker = new MailIdleWorker(
    mailboxSvc as any,
    threadSvc as any,
    { emit: jest.fn() } as any,
    { emit: jest.fn() } as any,
  );
  return { worker, client, mailboxSvc, threadSvc, checkpoint: () => checkpoint };
}

describe('MailIdleWorker regression', () => {
  afterEach(() => jest.useRealTimers());

  it.each(['fetchSinceUid', 'performBackfill'])(
    '%s never checkpoints past failed ingestion and retries it',
    async (method) => {
      const { worker, client, threadSvc, checkpoint } = setup();
      (worker as any).client = client;
      client.search.mockResolvedValue([103, 101, 102]);
      threadSvc.ingestMessage
        .mockResolvedValueOnce({ isNew: false })
        .mockRejectedValueOnce(new Error('DB unavailable'));
      await expect(
        (worker as any)[method]('mailbox', method === 'performBackfill' ? 30 : 100),
      ).rejects.toThrow('DB unavailable');
      expect(checkpoint()).toBe(101);
      expect(client.fetchOne.mock.calls.map((call) => call[0])).toEqual(['101', '102']);
      client.fetchOne.mockClear();
      await (worker as any).fetchSinceUid('mailbox', checkpoint());
      expect(client.fetchOne.mock.calls.map((call) => call[0])).toEqual(['102', '103']);
      expect(checkpoint()).toBe(103);
    },
  );

  it('leaves a closed IDLE session so the retry loop can reconnect', async () => {
    jest.useFakeTimers();
    const { worker, client } = setup();
    const session = (worker as any).runSession();
    const rejected = expect(session).rejects.toThrow('IMAP connection closed');
    await settle();
    client.emit('close');
    await jest.advanceTimersByTimeAsync(500);
    await rejected;
    expect(client.close).toHaveBeenCalled();
  });

  it('closes the session even when recording the fetch failure also fails', async () => {
    jest.useFakeTimers();
    const { worker, client, mailboxSvc } = setup();
    const session = (worker as any).runSession();
    const rejected = expect(session).rejects.toThrow();
    await settle();
    mailboxSvc.getRawRow.mockRejectedValue(new Error('DB unavailable'));
    mailboxSvc.updateConnectionStatus.mockRejectedValue(new Error('DB unavailable'));
    client.emit('exists');
    await settle();
    expect(client.close).toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(500);
    await rejected;
  });

  it('repeated restarts keep only one retry loop', async () => {
    jest.useFakeTimers();
    const { worker, client } = setup();
    (ImapFlow as unknown as jest.Mock).mockClear();
    await worker.onModuleInit();
    await settle();
    await Promise.all([worker.restartSession(), worker.restartSession(), worker.restartSession()]);
    expect(ImapFlow).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(500);
    await settle();
    expect(ImapFlow).toHaveBeenCalledTimes(2);
    await worker.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(500);
    expect(client.listenerCount('exists')).toBe(0);
  });
});
