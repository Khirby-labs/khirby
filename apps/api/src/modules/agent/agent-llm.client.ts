export type AgentSseEvent =
  | { type: 'conversation'; conversationId: string }
  | { type: 'status'; code: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; ok: boolean; summary: string; code?: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'done' }
  | { type: 'error'; code: string; message?: string };

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

export type LlmToolDef = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type StreamChunk =
  | { kind: 'text'; delta: string }
  | { kind: 'tool_call'; index: number; id?: string; name?: string; argumentsDelta?: string }
  | { kind: 'done' };

export class AgentLlmClient {
  async *streamCompletion(opts: {
    baseUrl: string;
    apiKey: string;
    model: string;
    messages: LlmMessage[];
    tools?: LlmToolDef[];
    signal?: AbortSignal;
  }): AsyncGenerator<StreamChunk> {
    const url = `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        tools: opts.tools?.length ? opts.tools : undefined,
        stream: true,
      }),
      signal: opts.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`LLM upstream ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (opts.signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            yield { kind: 'done' };
            return;
          }
          let json: any;
          try {
            json = JSON.parse(payload);
          } catch {
            continue;
          }
          const choice = json.choices?.[0];
          const delta = choice?.delta;
          if (!delta) continue;
          if (delta.content) yield { kind: 'text', delta: delta.content };
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              yield {
                kind: 'tool_call',
                index: tc.index ?? 0,
                id: tc.id,
                name: tc.function?.name,
                argumentsDelta: tc.function?.arguments,
              };
            }
          }
          if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
            yield { kind: 'done' };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** Fold stream chunks into assistant text + tool_calls (for tests and loop). */
  collectFromChunks(chunks: StreamChunk[]) {
    let text = '';
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

    for (const chunk of chunks) {
      if (chunk.kind === 'text') text += chunk.delta;
      if (chunk.kind === 'tool_call') {
        const cur = toolCalls.get(chunk.index) ?? { id: '', name: '', arguments: '' };
        if (chunk.id) cur.id = chunk.id;
        if (chunk.name) cur.name = chunk.name;
        if (chunk.argumentsDelta) cur.arguments += chunk.argumentsDelta;
        toolCalls.set(chunk.index, cur);
      }
    }

    return {
      text,
      toolCalls: [...toolCalls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, v]) => v)
        .filter((v) => v.id && v.name),
    };
  }
}
