import {
  AgentLlmClient,
  buildResponsesBody,
  mentionsResponsesEndpoint,
  toResponsesInput,
  toResponsesTools,
} from './agent-llm.client';

function sseBody(text: string): ReadableStream<Uint8Array> {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
}

function responsesSse(
  frames: Array<{ event?: string; data: unknown }>,
): ReadableStream<Uint8Array> {
  const payload = frames
    .map((frame) => {
      const ev = frame.event ? `event: ${frame.event}\n` : '';
      const data = typeof frame.data === 'string' ? frame.data : JSON.stringify(frame.data);
      return `${ev}data: ${data}\n\n`;
    })
    .join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
}

const searchTool = {
  type: 'function' as const,
  function: { name: 'search_contacts', description: 'x', parameters: {} },
};

describe('AgentLlmClient', () => {
  const client = new AgentLlmClient();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('collects tool_calls from delta chunks', () => {
    const chunks = client.collectFromChunks([
      { kind: 'tool_call', index: 0, id: 'call_1', name: 'search_contacts' },
      { kind: 'tool_call', index: 0, argumentsDelta: '{"query":' },
      { kind: 'tool_call', index: 0, argumentsDelta: '"x"}' },
      { kind: 'text', delta: 'Hello' },
    ]);
    expect(chunks.toolCalls).toEqual([
      { id: 'call_1', name: 'search_contacts', arguments: '{"query":"x"}' },
    ]);
    expect(chunks.text).toBe('Hello');
  });

  it('text-only stream yields text without tool calls', () => {
    const chunks = client.collectFromChunks([
      { kind: 'text', delta: 'Hi ' },
      { kind: 'text', delta: 'there' },
    ]);
    expect(chunks.text).toBe('Hi there');
    expect(chunks.toolCalls).toHaveLength(0);
  });

  it('retries without reasoning_effort after HTTP 400 when catalog is silent', async () => {
    const clientWithCache = new AgentLlmClient();
    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { reasoning_effort?: string };
      if (body.reasoning_effort) {
        return { ok: false, status: 400, body: null };
      }
      return { ok: true, status: 200, body: sseBody('ok') };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const opts = {
      baseUrl: 'https://llm.test/v1',
      apiKey: 'sk',
      model: 'any-model',
      messages: [{ role: 'user' as const, content: 'hi' }],
      reasoningEffort: 'high',
    };
    const chunks: string[] = [];
    for await (const chunk of clientWithCache.streamCompletion(opts)) {
      if (chunk.kind === 'text') chunks.push(chunk.delta);
    }
    expect(chunks.join('')).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).reasoning_effort).toBe('high');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).reasoning_effort).toBeUndefined();

    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: true, status: 200, body: sseBody('again') });
    for await (const _ of clientWithCache.streamCompletion(opts)) {
      /* drain */
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).reasoning_effort).toBeUndefined();
  });

  it('does not send reasoning_effort when the catalog said no', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, body: sseBody('ok') });
    global.fetch = fetchMock as unknown as typeof fetch;
    for await (const _ of new AgentLlmClient().streamCompletion({
      baseUrl: 'https://llm.test/v1',
      apiKey: 'sk',
      model: 'chat-only',
      messages: [{ role: 'user' as const, content: 'hi' }],
      reasoningEffort: 'high',
      reasoningSupported: false,
    })) {
      /* drain */
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).reasoning_effort).toBeUndefined();
  });

  it('retries without reasoning_effort after HTTP 400 even when the catalog said yes', async () => {
    const clientWithCache = new AgentLlmClient();
    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { reasoning_effort?: string };
      if (body.reasoning_effort) {
        return { ok: false, status: 400, body: null, text: async () => 'unknown param' };
      }
      return { ok: true, status: 200, body: sseBody('ok') };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const chunks: string[] = [];
    for await (const chunk of clientWithCache.streamCompletion({
      baseUrl: 'https://llm.test/v1',
      apiKey: 'sk',
      model: 'gpt-5.6-sol',
      messages: [{ role: 'user' as const, content: 'hi' }],
      reasoningEffort: 'low',
      reasoningSupported: true,
    })) {
      if (chunk.kind === 'text') chunks.push(chunk.delta);
    }
    expect(chunks.join('')).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).reasoning_effort).toBeUndefined();
  });

  it('posts tools + reasoning to /responses instead of forcing none on chat/completions', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: responsesSse([
        {
          event: 'response.output_text.delta',
          data: { type: 'response.output_text.delta', delta: 'ok' },
        },
        { event: 'response.completed', data: { type: 'response.completed' } },
      ]),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const chunks: string[] = [];
    for await (const chunk of new AgentLlmClient().streamCompletion({
      baseUrl: 'https://llm.test/v1',
      apiKey: 'sk',
      model: 'gpt-5.6-sol',
      messages: [{ role: 'user' as const, content: 'hi' }],
      tools: [searchTool],
      reasoningEffort: 'low',
      reasoningSupported: true,
    })) {
      if (chunk.kind === 'text') chunks.push(chunk.delta);
    }
    expect(chunks.join('')).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://llm.test/v1/responses');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.store).toBe(false);
    expect(body.stream).toBe(true);
    expect(body.input).toEqual([{ type: 'message', role: 'user', content: 'hi' }]);
    expect(body.tools).toEqual(toResponsesTools([searchTool]));
    expect(body.tools[0].strict).toBe(false);
  });

  it('parses Responses function_call SSE into tool_calls', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: responsesSse([
        {
          event: 'response.output_item.added',
          data: {
            type: 'response.output_item.added',
            item: {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'search_contacts',
              arguments: '',
            },
          },
        },
        {
          event: 'response.function_call_arguments.delta',
          data: {
            type: 'response.function_call_arguments.delta',
            item_id: 'fc_1',
            delta: '{"query":"x"}',
          },
        },
        { event: 'response.completed', data: { type: 'response.completed' } },
      ]),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const chunks = [];
    for await (const chunk of new AgentLlmClient().streamCompletion({
      baseUrl: 'https://llm.test/v1',
      apiKey: 'sk',
      model: 'gpt-5.6-sol',
      messages: [{ role: 'user' as const, content: 'hi' }],
      tools: [searchTool],
      reasoningEffort: 'low',
    })) {
      chunks.push(chunk);
    }
    expect(new AgentLlmClient().collectFromChunks(chunks)).toEqual({
      text: '',
      toolCalls: [{ id: 'call_1', name: 'search_contacts', arguments: '{"query":"x"}' }],
    });
  });

  it('keeps chat/completions when there are no function tools', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, body: sseBody('ok') });
    global.fetch = fetchMock as unknown as typeof fetch;
    for await (const _ of new AgentLlmClient().streamCompletion({
      baseUrl: 'https://llm.test/v1',
      apiKey: 'sk',
      model: 'gpt-5.6-sol',
      messages: [{ role: 'user' as const, content: 'hi' }],
      reasoningEffort: 'low',
      reasoningSupported: true,
    })) {
      /* drain */
    }
    expect(fetchMock.mock.calls[0][0]).toBe('https://llm.test/v1/chat/completions');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).reasoning_effort).toBe('low');
  });

  it('falls back to chat/completions when /responses is missing', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (String(url).endsWith('/responses')) {
        return { ok: false, status: 404, body: null, text: async () => 'not found' };
      }
      return { ok: true, status: 200, body: sseBody('ok') };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const chunks: string[] = [];
    for await (const chunk of new AgentLlmClient().streamCompletion({
      baseUrl: 'https://llm.test/v1',
      apiKey: 'sk',
      model: 'chat-only',
      messages: [{ role: 'user' as const, content: 'hi' }],
      tools: [searchTool],
      reasoningEffort: 'low',
    })) {
      if (chunk.kind === 'text') chunks.push(chunk.delta);
    }
    expect(chunks.join('')).toBe('ok');
    expect(fetchMock.mock.calls[0][0]).toBe('https://llm.test/v1/responses');
    expect(fetchMock.mock.calls[1][0]).toBe('https://llm.test/v1/chat/completions');
  });

  it('after /responses 404, last-resorts to reasoning_effort none on chat/completions', async () => {
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/responses')) {
        return { ok: false, status: 404, body: null, text: async () => 'not found' };
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as { reasoning_effort?: string };
      if (body.reasoning_effort === 'low') {
        return {
          ok: false,
          status: 400,
          body: {},
          text: async () =>
            '{"error":{"message":"Function tools with reasoning_effort are not supported. Use /v1/responses."}}',
        };
      }
      return { ok: true, status: 200, body: sseBody('ok') };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const chunks: string[] = [];
    for await (const chunk of new AgentLlmClient().streamCompletion({
      baseUrl: 'https://llm.test/v1',
      apiKey: 'sk',
      model: 'chat-only',
      messages: [{ role: 'user' as const, content: 'hi' }],
      tools: [searchTool],
      reasoningEffort: 'low',
    })) {
      if (chunk.kind === 'text') chunks.push(chunk.delta);
    }
    expect(chunks.join('')).toBe('ok');
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://llm.test/v1/responses',
      'https://llm.test/v1/chat/completions',
      'https://llm.test/v1/chat/completions',
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body)).reasoning_effort).toBe('none');
  });

  it('maps chat tool rounds into Responses function_call items', () => {
    expect(
      toResponsesInput([
        { role: 'system', content: 'You are Khirby.' },
        { role: 'user', content: 'find Ada' },
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'search_contacts', arguments: '{"q":"Ada"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: '[]' },
      ]),
    ).toEqual([
      { type: 'message', role: 'user', content: 'find Ada' },
      {
        type: 'function_call',
        call_id: 'call_1',
        name: 'search_contacts',
        arguments: '{"q":"Ada"}',
      },
      { type: 'function_call_output', call_id: 'call_1', output: '[]' },
    ]);
  });

  it('replays Responses output items on the next turn', () => {
    const reasoning = { type: 'reasoning', id: 'rs_1', summary: [] };
    const call = {
      type: 'function_call',
      call_id: 'call_1',
      name: 'search_contacts',
      arguments: '{}',
    };
    expect(
      toResponsesInput([
        { role: 'user', content: 'find Ada' },
        { role: 'assistant', responsesOutput: [reasoning, call] },
        { role: 'tool', tool_call_id: 'call_1', content: '[]' },
      ]),
    ).toEqual([
      { type: 'message', role: 'user', content: 'find Ada' },
      reasoning,
      call,
      { type: 'function_call_output', call_id: 'call_1', output: '[]' },
    ]);
  });

  it('puts system messages on instructions per the OpenAI Responses spec', () => {
    const body = buildResponsesBody({
      model: 'gpt-5.6-sol',
      messages: [
        { role: 'system', content: 'You are Khirby.' },
        { role: 'user', content: 'hi' },
      ],
      tools: [searchTool],
      reasoningEffort: 'low',
    });
    expect(body.instructions).toBe('You are Khirby.');
    expect(body.input).toEqual([{ type: 'message', role: 'user', content: 'hi' }]);
    expect(body.store).toBe(false);
    expect(body.reasoning).toEqual({ effort: 'low' });
  });

  it('parses a non-streaming OpenAI Response object', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({
        object: 'response',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'ok' }],
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const chunks: string[] = [];
    for await (const chunk of new AgentLlmClient().streamCompletion({
      baseUrl: 'https://llm.test/v1',
      apiKey: 'sk',
      model: 'gpt-5.6-sol',
      messages: [{ role: 'user' as const, content: 'hi' }],
      tools: [searchTool],
      reasoningEffort: 'low',
    })) {
      if (chunk.kind === 'text') chunks.push(chunk.delta);
    }
    expect(chunks.join('')).toBe('ok');
  });

  it('retries Responses without store when the provider rejects the field', async () => {
    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { store?: boolean };
      if (body.store === false) {
        return {
          ok: false,
          status: 400,
          body: {},
          text: async () => '{"error":{"message":"Unknown parameter: store"}}',
        };
      }
      return {
        ok: true,
        status: 200,
        body: responsesSse([
          { data: { type: 'response.output_text.delta', delta: 'ok' } },
          { data: { type: 'response.completed' } },
        ]),
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const chunks: string[] = [];
    for await (const chunk of new AgentLlmClient().streamCompletion({
      baseUrl: 'https://llm.test/v1',
      apiKey: 'sk',
      model: 'gpt-5.6-sol',
      messages: [{ role: 'user' as const, content: 'hi' }],
      tools: [searchTool],
      reasoningEffort: 'low',
    })) {
      if (chunk.kind === 'text') chunks.push(chunk.delta);
    }
    expect(chunks.join('')).toBe('ok');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).store).toBe(false);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).store).toBeUndefined();
  });

  it('detects the provider hint to use /v1/responses', () => {
    expect(
      mentionsResponsesEndpoint(
        'Function tools with reasoning_effort are not supported for gpt-5.6-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to none.',
      ),
    ).toBe(true);
    expect(mentionsResponsesEndpoint('unknown variant')).toBe(false);
  });

  it('includes the provider body on a leftover HTTP 400', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      body: {},
      text: async () => '{"error":{"message":"unknown variant"}}',
    }) as unknown as typeof fetch;
    await expect(
      new AgentLlmClient()
        .streamCompletion({
          baseUrl: 'https://llm.test/v1',
          apiKey: 'sk',
          model: 'x',
          messages: [{ role: 'user' as const, content: 'hi' }],
        })
        .next(),
    ).rejects.toMatchObject({
      name: 'LlmUpstreamError',
      status: 400,
      detail: '{"error":{"message":"unknown variant"}}',
    });
  });
});
