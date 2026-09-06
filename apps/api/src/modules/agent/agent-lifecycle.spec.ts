import { AgentChatService, MAX_ITERATIONS } from './agent-chat.service';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function setup() {
  const conversations = {
    assertOwned: jest.fn().mockResolvedValue(undefined),
    insertUserMessage: jest.fn(),
    touchConversation: jest.fn(),
    loadHistory: jest.fn().mockResolvedValue([]),
    insertAssistantMessage: jest.fn(),
  };
  const empty = { definitions: () => [], run: jest.fn() };
  const mail = { definitions: () => [{ function: { name: 'send_mail' } }], run: jest.fn() };
  const service = new AgentChatService(
    conversations as any,
    empty as any,
    mail as any,
    empty as any,
    empty as any,
    empty as any,
    {
      getCompletionConfig: async () => ({
        apiKey: 'fixture',
        baseUrl: 'https://example.invalid',
        model: 'fixture',
      }),
    } as any,
  );
  const completion = jest
    .spyOn(service as any, 'collectCompletion')
    .mockResolvedValue({ text: 'Done', toolCalls: [] });
  return { service, conversations, mail, completion };
}

describe('agent lifecycle regressions', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each([
    ['next completion', 1, 'fetch'],
    ['next completion', 1, 'read'],
    ['final synthesis', MAX_ITERATIONS, 'fetch'],
    ['final synthesis', MAX_ITERATIONS, 'read'],
  ] as const)('persists tool outcomes once on disconnect during %s %s %s', async (_, toolCount, phase) => {
    const { service, conversations, mail, completion } = setup();
    completion.mockRestore();
    mail.run.mockResolvedValue({ ok: true, summary: 'Email sent' });
    const ac = new AbortController();
    const waiting = deferred();
    let llmCalls = 0;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      llmCalls++;
      if (llmCalls <= toolCount) {
        const delta = {
          tool_calls: [{
            index: 0,
            id: `call-${llmCalls}`,
            function: { name: 'send_mail', arguments: '{}' },
          }],
        };
        return new Response(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`);
      }
      if (phase === 'fetch') {
        return new Promise<Response>((_, reject) => {
          ac.signal.addEventListener('abort', () => reject(ac.signal.reason), { once: true });
          waiting.resolve();
        });
      }
      return new Response(new ReadableStream({
        pull(controller) {
          ac.signal.addEventListener('abort', () => controller.error(ac.signal.reason), { once: true });
          waiting.resolve();
        },
      }));
    });
    const pending = service.runAgentLoop(
      'user',
      { conversationId: 'conversation', content: 'send' },
      { signal: ac.signal, write: jest.fn() },
    );
    await waiting.promise;
    ac.abort();
    await pending;

    expect(llmCalls).toBe(toolCount + 1);
    expect(mail.run).toHaveBeenCalledTimes(toolCount);
    expect(conversations.insertAssistantMessage).toHaveBeenCalledTimes(1);
    const [conversationId, content, trace] = conversations.insertAssistantMessage.mock.calls[0];
    expect(conversationId).toBe('conversation');
    expect(content).toBe('Email sent');
    expect(trace).toHaveLength(toolCount);
    expect(trace).toEqual(Array.from({ length: toolCount }, (_, index) => expect.objectContaining({
      id: `call-${index + 1}`,
      name: 'send_mail',
      ok: true,
      summary: 'Email sent',
    })));
    expect((service as any).activeStreams.has('conversation')).toBe(false);
  });

  it('admits only one concurrent request after asynchronous ownership checks', async () => {
    const { service, conversations } = setup();
    const owned = deferred();
    const inserted = deferred();
    conversations.assertOwned.mockReturnValue(owned.promise);
    conversations.insertUserMessage.mockReturnValue(inserted.promise);
    const dto = { conversationId: 'conversation', content: 'hello' };
    const outcomes = Promise.allSettled([
      service.runAgentLoop('user', dto, { write: jest.fn() }),
      service.runAgentLoop('user', dto, { write: jest.fn() }),
    ]);
    owned.resolve();
    await settle();
    expect(conversations.insertUserMessage).toHaveBeenCalledTimes(1);
    inserted.resolve();
    const results = await outcomes;
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { status: 409 },
    });
  });

  it('waits for a slow mutating operation and persists its outcome after disconnect', async () => {
    jest.useFakeTimers();
    const { service, conversations, mail, completion } = setup();
    completion.mockResolvedValueOnce({
      text: '',
      toolCalls: [
        { id: 'call-1', name: 'send_mail', arguments: '{}' },
        { id: 'call-2', name: 'send_mail', arguments: '{}' },
      ],
    });
    const sent = deferred<{ ok: boolean; summary: string }>();
    mail.run.mockReturnValue(sent.promise);
    const ac = new AbortController();
    const write = jest.fn();
    const dto = { conversationId: 'conversation', content: 'send' };
    const pending = service.runAgentLoop('user', dto, { signal: ac.signal, write });
    await settle();
    await jest.advanceTimersByTimeAsync(11_000);
    expect(write.mock.calls.some(([event]) => event.type === 'tool_result')).toBe(false);
    await expect(service.runAgentLoop('user', dto, { write })).rejects.toMatchObject({
      status: 409,
    });
    ac.abort();
    sent.resolve({ ok: true, summary: 'Email sent' });
    await pending;
    expect(mail.run).toHaveBeenCalledTimes(1);
    expect(conversations.insertAssistantMessage).toHaveBeenCalledWith(
      'conversation',
      'Email sent',
      [
        expect.objectContaining({
          id: 'call-1',
          name: 'send_mail',
          ok: true,
          summary: 'Email sent',
        }),
      ],
    );
    expect((service as any).activeStreams.has('conversation')).toBe(false);
  });
});
