import {
  applyReasoningEffort,
  isReasoningEffort,
} from '../../../../../packages/plugin-host/src/reasoning-effort';

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
  /** OpenAI Responses `output` items to replay on the next turn (reasoning + function_call). */
  responsesOutput?: unknown[];
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
  | { kind: 'done'; outputItems?: unknown[] };

type StreamOpts = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  signal?: AbortSignal;
  reasoningEffort?: string | null;
  reasoningSupported?: boolean | null;
};

export class LlmUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly detail?: string,
  ) {
    super(detail ? `LLM upstream ${status}: ${detail}` : `LLM upstream ${status}`);
    this.name = 'LlmUpstreamError';
  }
}

async function readErrorDetail(res: Response): Promise<string | undefined> {
  try {
    const text = (await res.text()).trim();
    if (text) return text.slice(0, 500);
  } catch {
    /* ignore unreadable bodies */
  }
  return undefined;
}

async function throwLlmUpstream(res: Response, detail?: string): Promise<never> {
  throw new LlmUpstreamError(res.status, detail ?? (await readErrorDetail(res)));
}

function jsonHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function normalizeBase(baseUrl: string) {
  return baseUrl.replace(/\/$/, '');
}

function wantsNonNoneEffort(
  effort: string | null | undefined,
  supports: boolean | undefined,
): boolean {
  return isReasoningEffort(effort) && effort !== 'none' && supports !== false;
}

export function mentionsResponsesEndpoint(detail?: string): boolean {
  if (!detail) return false;
  const d = detail.toLowerCase();
  return (
    d.includes('/v1/responses') ||
    d.includes('/responses') ||
    (d.includes('function tools') && d.includes('reasoning'))
  );
}

function mentionsUnknownField(detail: string | undefined, field: string): boolean {
  if (!detail) return false;
  const d = detail.toLowerCase();
  return (
    d.includes(field) &&
    (d.includes('unknown') || d.includes('unexpected') || d.includes('unrecognized'))
  );
}

/** Chat-completions tools → Responses function tools (internally tagged, non-strict). */
export function toResponsesTools(tools: LlmToolDef[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
    // Responses attempts strict mode when `strict` is omitted; our CRM schemas are not strict.
    strict: false as const,
  }));
}

function easyMessage(role: 'user' | 'assistant' | 'system', content: string) {
  return { type: 'message' as const, role, content };
}

/**
 * Chat-completions messages → Responses `input` Items (OpenAI spec).
 * System text is stripped here — callers put it on top-level `instructions`.
 * Assistant turns with `responsesOutput` replay those Items (reasoning + function_call).
 */
export function toResponsesInput(messages: LlmMessage[]): unknown[] {
  const input: unknown[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: m.tool_call_id,
        output: m.content ?? '',
      });
      continue;
    }
    if (m.role === 'assistant' && m.responsesOutput?.length) {
      input.push(...m.responsesOutput);
      continue;
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      if (m.content) input.push(easyMessage('assistant', m.content));
      for (const tc of m.tool_calls) {
        input.push({
          type: 'function_call',
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        });
      }
      continue;
    }
    input.push(easyMessage(m.role, m.content ?? ''));
  }
  return input;
}

export function responsesInstructions(messages: LlmMessage[]): string | undefined {
  const parts = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content ?? '')
    .filter(Boolean);
  return parts.length ? parts.join('\n\n') : undefined;
}

/** OpenAI Responses create body — same shape other OpenAI-compatible providers implement. */
export function buildResponsesBody(opts: {
  model: string;
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  reasoningEffort?: string | null;
  store?: boolean;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.model,
    input: toResponsesInput(opts.messages),
    stream: true,
    store: opts.store ?? false,
  };
  const instructions = responsesInstructions(opts.messages);
  if (instructions) body.instructions = instructions;
  if (opts.tools?.length) body.tools = toResponsesTools(opts.tools);
  if (isReasoningEffort(opts.reasoningEffort) && opts.reasoningEffort !== 'none') {
    body.reasoning = { effort: opts.reasoningEffort };
  }
  return body;
}

type SseFrame = { event: string; data: string };

async function* readSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.replace(/\r$/, '');
        if (line === '') {
          event = '';
          continue;
        }
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
          continue;
        }
        if (!line.startsWith('data:')) continue;
        yield { event, data: line.slice(5).trim() };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function outputItemChunks(output: unknown[]): StreamChunk[] {
  const out: StreamChunk[] = [];
  let index = 0;
  for (const raw of output) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    if (item.type === 'message') {
      const content = item.content;
      if (typeof content === 'string' && content) out.push({ kind: 'text', delta: content });
      if (Array.isArray(content)) {
        for (const part of content) {
          if (!part || typeof part !== 'object') continue;
          const p = part as { type?: string; text?: string };
          if (p.type === 'output_text' && typeof p.text === 'string' && p.text) {
            out.push({ kind: 'text', delta: p.text });
          }
        }
      }
    }
    if (item.type === 'function_call') {
      out.push({
        kind: 'tool_call',
        index,
        id: typeof item.call_id === 'string' ? item.call_id : undefined,
        name: typeof item.name === 'string' ? item.name : undefined,
        argumentsDelta: typeof item.arguments === 'string' ? item.arguments : undefined,
      });
      index += 1;
    }
  }
  return out;
}

function chunksFromResponseObject(json: Record<string, unknown>): StreamChunk[] {
  const nested = json.response;
  const response =
    nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : json;
  const output = Array.isArray(response.output) ? response.output : [];
  const chunks = outputItemChunks(output);
  chunks.push({ kind: 'done', outputItems: output.length ? output : undefined });
  return chunks;
}

function chatDeltaChunks(json: {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string;
  }>;
}): StreamChunk[] {
  const choice = json.choices?.[0];
  const delta = choice?.delta;
  if (!delta) {
    if (choice?.finish_reason === 'stop' || choice?.finish_reason === 'tool_calls') {
      return [{ kind: 'done' }];
    }
    return [];
  }
  const out: StreamChunk[] = [];
  if (delta.content) out.push({ kind: 'text', delta: delta.content });
  if (delta.tool_calls) {
    for (const tc of delta.tool_calls) {
      out.push({
        kind: 'tool_call',
        index: tc.index ?? 0,
        id: tc.id,
        name: tc.function?.name,
        argumentsDelta: tc.function?.arguments,
      });
    }
  }
  if (choice?.finish_reason === 'stop' || choice?.finish_reason === 'tool_calls') {
    out.push({ kind: 'done' });
  }
  return out;
}

async function* parseChatCompletionsStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  for await (const frame of readSse(body, signal)) {
    if (frame.data === '[DONE]') {
      yield { kind: 'done' };
      return;
    }
    let json: Parameters<typeof chatDeltaChunks>[0];
    try {
      json = JSON.parse(frame.data) as Parameters<typeof chatDeltaChunks>[0];
    } catch {
      continue;
    }
    for (const chunk of chatDeltaChunks(json)) yield chunk;
  }
}

async function* parseResponsesStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const byItemId = new Map<string, { index: number; id: string; name: string; sawArgs: boolean }>();
  let nextIndex = 0;
  let yieldedDone = false;
  let emittedFromDeltas = false;
  const outputItems: unknown[] = [];

  const ensureCall = (itemId: string, callId?: string, name?: string) => {
    let rec = byItemId.get(itemId);
    if (!rec) {
      rec = { index: nextIndex++, id: callId ?? '', name: name ?? '', sawArgs: false };
      byItemId.set(itemId, rec);
    } else {
      if (callId) rec.id = callId;
      if (name) rec.name = name;
    }
    return rec;
  };

  const finish = function* (items?: unknown[]) {
    if (yieldedDone) return;
    yieldedDone = true;
    const finalItems = items?.length ? items : outputItems.length ? outputItems : undefined;
    yield { kind: 'done' as const, outputItems: finalItems };
  };

  for await (const frame of readSse(body, signal)) {
    if (frame.data === '[DONE]') {
      yield* finish();
      return;
    }
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(frame.data) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (json.object === 'response' && Array.isArray(json.output) && !json.type) {
      for (const chunk of chunksFromResponseObject(json)) yield chunk;
      yieldedDone = true;
      return;
    }

    const chatChunks = chatDeltaChunks(json as Parameters<typeof chatDeltaChunks>[0]);
    if (chatChunks.length) {
      for (const chunk of chatChunks) {
        if (chunk.kind === 'done') {
          yield* finish();
          continue;
        }
        emittedFromDeltas = true;
        yield chunk;
      }
      continue;
    }

    const type = typeof json.type === 'string' ? json.type : frame.event;
    if (type === 'response.output_text.delta' || type === 'response.text.delta') {
      const delta = json.delta ?? json.text;
      if (typeof delta === 'string' && delta) {
        emittedFromDeltas = true;
        yield { kind: 'text', delta };
      }
      continue;
    }

    if (type === 'response.output_item.added' || type === 'response.output_item.done') {
      const item = json.item as
        | { type?: string; id?: string; call_id?: string; name?: string; arguments?: string }
        | undefined;
      if (type === 'response.output_item.done' && item) outputItems.push(item);
      if (item?.type === 'function_call') {
        const itemId = String(item.id ?? json.item_id ?? nextIndex);
        const rec = ensureCall(itemId, item.call_id, item.name);
        emittedFromDeltas = true;
        yield {
          kind: 'tool_call',
          index: rec.index,
          id: rec.id || undefined,
          name: rec.name || undefined,
        };
        if (
          type === 'response.output_item.done' &&
          typeof item.arguments === 'string' &&
          item.arguments &&
          !rec.sawArgs
        ) {
          rec.sawArgs = true;
          yield { kind: 'tool_call', index: rec.index, argumentsDelta: item.arguments };
        }
      }
      continue;
    }

    if (type === 'response.function_call_arguments.delta') {
      const rec = ensureCall(String(json.item_id ?? ''));
      rec.sawArgs = true;
      emittedFromDeltas = true;
      if (typeof json.delta === 'string' && json.delta) {
        yield { kind: 'tool_call', index: rec.index, argumentsDelta: json.delta };
      }
      continue;
    }

    if (type === 'response.function_call_arguments.done') {
      const rec = ensureCall(String(json.item_id ?? ''));
      if (!rec.sawArgs && typeof json.arguments === 'string' && json.arguments) {
        rec.sawArgs = true;
        emittedFromDeltas = true;
        yield { kind: 'tool_call', index: rec.index, argumentsDelta: json.arguments };
      }
      continue;
    }

    if (type === 'response.completed' || type === 'response.incomplete') {
      const nested = json.response;
      const response =
        nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : json;
      const output = Array.isArray(response.output) ? response.output : outputItems;
      if (!emittedFromDeltas && output.length) {
        for (const chunk of outputItemChunks(output)) yield chunk;
      }
      yield* finish(output);
      continue;
    }

    if (type === 'response.failed' || type === 'error') {
      const err = json.error as { message?: string } | undefined;
      const msg =
        err?.message ?? (typeof json.message === 'string' ? json.message : 'responses failed');
      throw new LlmUpstreamError(400, msg);
    }
  }
}

async function* parseResponsesResponse(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const ct = (typeof res.headers?.get === 'function' ? res.headers.get('content-type') : '') ?? '';
  if (ct.toLowerCase().includes('application/json')) {
    const json =
      typeof res.json === 'function'
        ? ((await res.json()) as Record<string, unknown>)
        : (JSON.parse(await res.text()) as Record<string, unknown>);
    for (const chunk of chunksFromResponseObject(json)) yield chunk;
    return;
  }
  if (!res.body) await throwLlmUpstream(res);
  yield* parseResponsesStream(res.body, signal);
}

export class AgentLlmClient {
  /** Learned from a 400/422 when `/models` did not advertise capabilities. */
  private readonly reasoningLearned = new Map<string, boolean>();

  async *streamCompletion(opts: StreamOpts): AsyncGenerator<StreamChunk> {
    const base = normalizeBase(opts.baseUrl);
    const key = `${base}\0${opts.model}`;
    const catalog = opts.reasoningSupported;
    const learned = this.reasoningLearned.get(key);
    const supports =
      learned === true || learned === false
        ? learned
        : catalog === true || catalog === false
          ? catalog
          : undefined;
    const toolsPresent = Boolean(opts.tools?.length);
    const headers = jsonHeaders(opts.apiKey);
    let triedResponses = false;

    if (toolsPresent && wantsNonNoneEffort(opts.reasoningEffort, supports)) {
      triedResponses = true;
      let body = buildResponsesBody({
        model: opts.model,
        messages: opts.messages,
        tools: opts.tools,
        reasoningEffort: opts.reasoningEffort,
      });
      let res = await fetch(`${base}/responses`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: opts.signal,
      });
      if (!res.ok && (res.status === 400 || res.status === 422) && 'store' in body) {
        const detail = await readErrorDetail(res);
        if (mentionsUnknownField(detail, 'store')) {
          const { store: _store, ...rest } = body;
          body = rest;
          res = await fetch(`${base}/responses`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: opts.signal,
          });
        } else {
          throw new LlmUpstreamError(res.status, detail);
        }
      }
      if (res.ok) {
        this.reasoningLearned.set(key, true);
        yield* parseResponsesResponse(res, opts.signal);
        return;
      }
      if (res.status === 404 || res.status === 405) {
        void res.body?.cancel();
      } else {
        await throwLlmUpstream(res);
      }
    }

    yield* this.streamChatCompletions(opts, {
      base,
      key,
      headers,
      supports,
      toolsPresent,
      triedResponses,
    });
  }

  private responsesBody(opts: StreamOpts) {
    return buildResponsesBody({
      model: opts.model,
      messages: opts.messages,
      tools: opts.tools,
      reasoningEffort: opts.reasoningEffort,
    });
  }

  private async *streamChatCompletions(
    opts: StreamOpts,
    ctx: {
      base: string;
      key: string;
      headers: ReturnType<typeof jsonHeaders>;
      supports: boolean | undefined;
      toolsPresent: boolean;
      triedResponses: boolean;
    },
  ): AsyncGenerator<StreamChunk> {
    const url = `${ctx.base}/chat/completions`;
    const baseBody = {
      model: opts.model,
      messages: opts.messages,
      tools: opts.tools?.length ? opts.tools : undefined,
      stream: true,
    };
    const attempted = applyReasoningEffort(baseBody, opts.reasoningEffort, ctx.supports);
    const sentEffort = Boolean((attempted as { reasoning_effort?: unknown }).reasoning_effort);

    let res = await fetch(url, {
      method: 'POST',
      headers: ctx.headers,
      body: JSON.stringify(attempted),
      signal: opts.signal,
    });

    if (!res.ok && (res.status === 400 || res.status === 422)) {
      const detail = await readErrorDetail(res);
      if (
        !ctx.triedResponses &&
        ctx.toolsPresent &&
        wantsNonNoneEffort(opts.reasoningEffort, ctx.supports) &&
        mentionsResponsesEndpoint(detail)
      ) {
        const retry = await fetch(`${ctx.base}/responses`, {
          method: 'POST',
          headers: ctx.headers,
          body: JSON.stringify(this.responsesBody(opts)),
          signal: opts.signal,
        });
        if (!retry.ok) await throwLlmUpstream(retry);
        this.reasoningLearned.set(ctx.key, true);
        yield* parseResponsesResponse(retry, opts.signal);
        return;
      }
      if (sentEffort) {
        this.reasoningLearned.set(ctx.key, false);
        const retryBody = ctx.toolsPresent
          ? { ...baseBody, reasoning_effort: 'none' as const }
          : baseBody;
        res = await fetch(url, {
          method: 'POST',
          headers: ctx.headers,
          body: JSON.stringify(retryBody),
          signal: opts.signal,
        });
      } else {
        throw new LlmUpstreamError(res.status, detail);
      }
    } else if (res.ok && sentEffort) {
      this.reasoningLearned.set(ctx.key, true);
    }

    if (!res.ok || !res.body) {
      await throwLlmUpstream(res);
    }

    yield* parseChatCompletionsStream(res.body, opts.signal);
  }

  /** Fold stream chunks into assistant text + tool_calls (for tests and loop). */
  collectFromChunks(chunks: StreamChunk[]) {
    let text = '';
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
    let outputItems: unknown[] | undefined;

    for (const chunk of chunks) {
      if (chunk.kind === 'text') text += chunk.delta;
      if (chunk.kind === 'tool_call') {
        const cur = toolCalls.get(chunk.index) ?? { id: '', name: '', arguments: '' };
        if (chunk.id) cur.id = chunk.id;
        if (chunk.name) cur.name = chunk.name;
        if (chunk.argumentsDelta) cur.arguments += chunk.argumentsDelta;
        toolCalls.set(chunk.index, cur);
      }
      if (chunk.kind === 'done' && chunk.outputItems?.length) outputItems = chunk.outputItems;
    }

    return {
      text,
      toolCalls: [...toolCalls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, v]) => v)
        .filter((v) => v.id && v.name),
      ...(outputItems ? { outputItems } : {}),
    };
  }
}
