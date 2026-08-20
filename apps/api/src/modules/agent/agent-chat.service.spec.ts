import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AgentChatService, MAX_ITERATIONS } from './agent-chat.service';
import { AgentConversationsService } from './agent-conversations.service';
import { CrmToolsAdapter } from './tools/crm-tools.adapter';
import { MailToolsAdapter } from './tools/mail-tools.adapter';
import { PluginToolsAdapter, PokeloToolsAdapter } from './tools/plugin-tools.adapter';
import { AI_COMPOSE_LLM } from '../../../../../packages/plugin-host/src/tokens';
import { AgentLlmClient } from './agent-llm.client';

jest.mock('./agent-llm.client');

describe('AgentChatService', () => {
  let service: AgentChatService;
  let conversations: jest.Mocked<AgentConversationsService>;
  let llmProvider: { getCompletionConfig: jest.Mock };
  const events: any[] = [];

  beforeEach(async () => {
    events.length = 0;
    conversations = {
      assertOwned: jest.fn(),
      createConversation: jest.fn().mockResolvedValue({ id: 'conv-1' }),
      insertUserMessage: jest.fn(),
      touchConversation: jest.fn(),
      loadHistory: jest.fn().mockResolvedValue([{ role: 'user', content: 'hi' }]),
      insertAssistantMessage: jest.fn(),
    } as any;

    llmProvider = {
      getCompletionConfig: jest.fn().mockResolvedValue({
        baseUrl: 'https://llm.test',
        apiKey: 'secret-key',
        model: 'gpt-test',
      }),
    };

    (AgentLlmClient as jest.Mock).mockImplementation(() => ({
      streamCompletion: async function* () {
        yield { kind: 'text', delta: 'Answer' };
        yield { kind: 'done' };
      },
      collectFromChunks: jest.fn().mockReturnValue({ text: 'Answer', toolCalls: [] }),
    }));

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AgentChatService,
        { provide: AgentConversationsService, useValue: conversations },
        { provide: CrmToolsAdapter, useValue: { definitions: () => [], run: jest.fn() } },
        { provide: MailToolsAdapter, useValue: { definitions: () => [], run: jest.fn() } },
        { provide: PluginToolsAdapter, useValue: { definitions: () => [], run: jest.fn() } },
        { provide: PokeloToolsAdapter, useValue: { definitions: () => [], run: jest.fn() } },
        { provide: AI_COMPOSE_LLM, useValue: llmProvider },
      ],
    }).compile();

    service = moduleRef.get(AgentChatService);
  });

  it('happy path emits text_delta and done, saves assistant message', async () => {
    await service.runAgentLoop(
      'user-1',
      { content: 'hello' },
      {
        write: (e) => events.push(e),
      },
    );

    expect(events.some((e) => e.type === 'text_delta')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(conversations.insertAssistantMessage).toHaveBeenCalled();
  });

  it('emits ai_compose_unavailable when LLM config is null', async () => {
    llmProvider.getCompletionConfig.mockResolvedValue(null);
    await service.runAgentLoop(
      'user-1',
      { content: 'hello' },
      {
        write: (e) => events.push(e),
      },
    );
    expect(events).toContainEqual({ type: 'error', code: 'ai_compose_unavailable' });
    expect(conversations.insertUserMessage).toHaveBeenCalled();
  });

  it('throws 409 when conversation already streaming', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    (AgentLlmClient as jest.Mock).mockImplementation(() => ({
      streamCompletion: async function* () {
        await gate;
        yield { kind: 'text', delta: 'Answer' };
      },
      collectFromChunks: jest.fn().mockReturnValue({ text: 'Answer', toolCalls: [] }),
    }));

    const p = service.runAgentLoop(
      'user-1',
      { conversationId: 'c1', content: 'a' },
      { write: () => {} },
    );
    await Promise.resolve();
    await expect(
      service.runAgentLoop('user-1', { conversationId: 'c1', content: 'b' }, { write: () => {} }),
    ).rejects.toBeInstanceOf(ConflictException);
    release();
    await p;
  });

  it('aborts mid-loop when signal is aborted', async () => {
    (AgentLlmClient as jest.Mock).mockImplementation(() => ({
      streamCompletion: async function* () {
        yield { kind: 'text', delta: 'partial' };
        await new Promise((r) => setTimeout(r, 50));
        yield { kind: 'text', delta: 'more' };
      },
      collectFromChunks: jest.fn().mockReturnValue({ text: 'partial', toolCalls: [] }),
    }));

    const ac = new AbortController();
    const p = service.runAgentLoop(
      'user-1',
      { content: 'hello' },
      {
        write: (e) => events.push(e),
        signal: ac.signal,
      },
    );
    ac.abort();
    await p;
    expect(events.filter((e) => e.type === 'text_delta').length).toBeLessThanOrEqual(1);
  });

  it('never logs apiKey', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await service.runAgentLoop('user-1', { content: 'hello' }, { write: () => {} });
    const joined = logSpy.mock.calls.flat().join(' ');
    expect(joined).not.toContain('secret-key');
    logSpy.mockRestore();
  });

  it('synthesizes a reply when the model stops after tool calls only', async () => {
    let call = 0;
    (AgentLlmClient as jest.Mock).mockImplementation(() => ({
      streamCompletion: async function* () {
        call += 1;
        if (call === 1) {
          yield {
            kind: 'tool_call',
            id: 'tc-1',
            name: 'search_leads',
            arguments: '{}',
          };
          yield { kind: 'done' };
          return;
        }
        yield { kind: 'text', delta: 'Podsumowanie wyników.' };
        yield { kind: 'done' };
      },
      collectFromChunks: jest.fn().mockImplementation((chunks) => {
        const toolChunk = chunks.find((c: { kind: string }) => c.kind === 'tool_call');
        if (toolChunk) {
          return {
            text: '',
            toolCalls: [
              {
                id: 'tc-1',
                name: 'search_leads',
                arguments: '{}',
              },
            ],
          };
        }
        return { text: 'Podsumowanie wyników.', toolCalls: [] };
      }),
    }));

    const crmRun = jest.fn().mockResolvedValue({
      ok: true,
      summary: 'Znaleziono 3 leady.',
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AgentChatService,
        { provide: AgentConversationsService, useValue: conversations },
        {
          provide: CrmToolsAdapter,
          useValue: {
            definitions: () => [{ type: 'function', function: { name: 'search_leads' } }],
            run: crmRun,
          },
        },
        { provide: MailToolsAdapter, useValue: { definitions: () => [], run: jest.fn() } },
        { provide: PluginToolsAdapter, useValue: { definitions: () => [], run: jest.fn() } },
        { provide: PokeloToolsAdapter, useValue: { definitions: () => [], run: jest.fn() } },
        { provide: AI_COMPOSE_LLM, useValue: llmProvider },
      ],
    }).compile();

    service = moduleRef.get(AgentChatService);

    await service.runAgentLoop(
      'user-1',
      { content: 'pokaż leady' },
      {
        write: (e) => events.push(e),
      },
    );

    expect(crmRun).toHaveBeenCalled();
    expect(events.some((e) => e.type === 'text_delta' && e.delta.includes('Podsumowanie'))).toBe(
      true,
    );
    expect(conversations.insertAssistantMessage).toHaveBeenCalledWith(
      'conv-1',
      'Podsumowanie wyników.',
      expect.arrayContaining([
        expect.objectContaining({ name: 'search_leads', ok: true, summary: 'Znaleziono 3 leady.' }),
      ]),
    );
  });

  it('falls back to tool summary when the model returns empty text after tools', async () => {
    let call = 0;
    (AgentLlmClient as jest.Mock).mockImplementation(() => ({
      streamCompletion: async function* () {
        call += 1;
        if (call === 1) {
          yield {
            kind: 'tool_call',
            id: 'tc-1',
            name: 'search_leads',
            arguments: '{}',
          };
          yield { kind: 'done' };
          return;
        }
        yield { kind: 'done' };
      },
      collectFromChunks: jest.fn().mockImplementation((chunks) => {
        const toolChunk = chunks.find((c: { kind: string }) => c.kind === 'tool_call');
        if (toolChunk) {
          return {
            text: '',
            toolCalls: [
              {
                id: 'tc-1',
                name: 'search_leads',
                arguments: '{}',
              },
            ],
          };
        }
        return { text: '', toolCalls: [] };
      }),
    }));

    const crmRun = jest.fn().mockResolvedValue({
      ok: true,
      summary: 'Znaleziono 3 leady.',
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AgentChatService,
        { provide: AgentConversationsService, useValue: conversations },
        {
          provide: CrmToolsAdapter,
          useValue: {
            definitions: () => [{ type: 'function', function: { name: 'search_leads' } }],
            run: crmRun,
          },
        },
        { provide: MailToolsAdapter, useValue: { definitions: () => [], run: jest.fn() } },
        { provide: PluginToolsAdapter, useValue: { definitions: () => [], run: jest.fn() } },
        { provide: PokeloToolsAdapter, useValue: { definitions: () => [], run: jest.fn() } },
        { provide: AI_COMPOSE_LLM, useValue: llmProvider },
      ],
    }).compile();

    service = moduleRef.get(AgentChatService);

    await service.runAgentLoop(
      'user-1',
      { content: 'pokaż leady' },
      {
        write: (e) => events.push(e),
      },
    );

    expect(conversations.insertAssistantMessage).toHaveBeenCalledWith(
      'conv-1',
      'Znaleziono 3 leady.',
      expect.any(Array),
    );
    expect(events.some((e) => e.type === 'text_delta' && e.delta === 'Znaleziono 3 leady.')).toBe(
      true,
    );
  });

  it('auto-installs a volume plugin when the model only wrote files', async () => {
    events.length = 0;
    let call = 0;
    (AgentLlmClient as jest.Mock).mockImplementation(() => ({
      streamCompletion: async function* () {
        call += 1;
        if (call === 1) {
          yield {
            kind: 'tool_call',
            id: 'tc-1',
            name: 'write_instance_plugin_file',
            arguments: JSON.stringify({ directory: 'hello_world', path: 'src/index.ts' }),
          };
          yield { kind: 'done' };
          return;
        }
        yield { kind: 'text', delta: 'Done.' };
        yield { kind: 'done' };
      },
      collectFromChunks: jest.fn().mockImplementation((chunks) => {
        const toolChunk = chunks.find((c: { kind: string }) => c.kind === 'tool_call');
        if (toolChunk) {
          return {
            text: '',
            toolCalls: [
              {
                id: 'tc-1',
                name: 'write_instance_plugin_file',
                arguments: JSON.stringify({ directory: 'hello_world', path: 'src/index.ts' }),
              },
            ],
          };
        }
        return { text: 'Done.', toolCalls: [] };
      }),
    }));

    const pluginRun = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, summary: 'Wrote src/index.ts (10 bytes)' })
      .mockResolvedValueOnce({
        ok: true,
        summary: 'Installed crm_hello_world (installed) — live in this API process',
      });

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AgentChatService,
        { provide: AgentConversationsService, useValue: conversations },
        { provide: CrmToolsAdapter, useValue: { definitions: () => [], run: jest.fn() } },
        { provide: MailToolsAdapter, useValue: { definitions: () => [], run: jest.fn() } },
        {
          provide: PluginToolsAdapter,
          useValue: {
            definitions: () => [
              { type: 'function', function: { name: 'write_instance_plugin_file' } },
              { type: 'function', function: { name: 'install_instance_plugin' } },
            ],
            run: pluginRun,
          },
        },
        { provide: PokeloToolsAdapter, useValue: { definitions: () => [], run: jest.fn() } },
        { provide: AI_COMPOSE_LLM, useValue: llmProvider },
      ],
    }).compile();

    service = moduleRef.get(AgentChatService);

    await service.runAgentLoop(
      'user-1',
      { content: 'stwórz plugin' },
      { write: (e) => events.push(e) },
    );

    expect(pluginRun).toHaveBeenCalledTimes(2);
    expect(pluginRun).toHaveBeenLastCalledWith(
      'user-1',
      'install_instance_plugin',
      expect.objectContaining({ directory: 'hello_world' }),
    );
    expect(events.some((e) => e.type === 'tool_call' && e.name === 'install_instance_plugin')).toBe(
      true,
    );
  });

  it('respects MAX_ITERATIONS constant', () => {
    expect(MAX_ITERATIONS).toBe(8);
  });
});
