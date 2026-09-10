import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAgentChatStore } from './agent-chat.store';
import { usePluginsStore } from './plugins.store';
import { i18n } from '../i18n';
import { FALLBACK_LOCALE } from '../i18n/locales';

const apiPostStream = vi.fn();
const apiGet = vi.fn();

vi.mock('../api/client', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
  apiDelete: vi.fn(),
  apiPostStream: (...args: unknown[]) => apiPostStream(...args),
}));

vi.mock('../router', () => ({ registerPluginRoutes: vi.fn() }));

describe('agent-chat store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    apiGet.mockResolvedValue([]);
    i18n.global.locale.value = FALLBACK_LOCALE;
  });

  it('refetches plugins when install_instance_plugin succeeds', async () => {
    apiPostStream.mockImplementation(async (_path, _body, onLine: (line: string) => void) => {
      onLine(
        `data: ${JSON.stringify({
          type: 'tool_call',
          id: 't1',
          name: 'install_instance_plugin',
          args: { directory: 'crm_demo' },
        })}`,
      );
      onLine(`data: ${JSON.stringify({ type: 'tool_result', id: 't1', ok: true, summary: 'ok' })}`);
      onLine(`data: ${JSON.stringify({ type: 'done' })}`);
    });

    const plugins = usePluginsStore();
    const fetchSpy = vi.spyOn(plugins, 'fetchPlugins').mockResolvedValue();

    await useAgentChatStore().sendMessage('install the plugin');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refetches plugins when scaffold_plugin installs successfully', async () => {
    apiPostStream.mockImplementation(async (_path, _body, onLine: (line: string) => void) => {
      onLine(
        `data: ${JSON.stringify({
          type: 'tool_call',
          id: 't1',
          name: 'scaffold_plugin',
          args: { directory: 'hello-world-stats', name: 'crm_hello_world_stats' },
        })}`,
      );
      onLine(
        `data: ${JSON.stringify({
          type: 'tool_result',
          id: 't1',
          ok: true,
          summary: 'Scaffolded and installed crm_hello_world_stats (installed)',
        })}`,
      );
      onLine(`data: ${JSON.stringify({ type: 'done' })}`);
    });

    const plugins = usePluginsStore();
    const fetchSpy = vi.spyOn(plugins, 'fetchPlugins').mockResolvedValue();

    await useAgentChatStore().sendMessage('create a hello world plugin');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refetches plugins when write_instance_plugin_file succeeds', async () => {
    apiPostStream.mockImplementation(async (_path, _body, onLine: (line: string) => void) => {
      onLine(
        `data: ${JSON.stringify({
          type: 'tool_call',
          id: 't1',
          name: 'write_instance_plugin_file',
          args: { directory: 'hello-world', path: 'src/nest-module.ts' },
        })}`,
      );
      onLine(
        `data: ${JSON.stringify({
          type: 'tool_result',
          id: 't1',
          ok: true,
          summary: 'Wrote src/nest-module.ts — live GET handler reloaded',
        })}`,
      );
      onLine(`data: ${JSON.stringify({ type: 'done' })}`);
    });

    const plugins = usePluginsStore();
    const fetchSpy = vi.spyOn(plugins, 'fetchPlugins').mockResolvedValue();

    await useAgentChatStore().sendMessage('add a tile');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refetches plugins when remove_instance_plugin succeeds', async () => {
    apiPostStream.mockImplementation(async (_path, _body, onLine: (line: string) => void) => {
      onLine(
        `data: ${JSON.stringify({
          type: 'tool_call',
          id: 't1',
          name: 'remove_instance_plugin',
          args: { directory: 'crm_demo' },
        })}`,
      );
      onLine(`data: ${JSON.stringify({ type: 'tool_result', id: 't1', ok: true, summary: 'ok' })}`);
      onLine(`data: ${JSON.stringify({ type: 'done' })}`);
    });

    const plugins = usePluginsStore();
    const fetchSpy = vi.spyOn(plugins, 'fetchPlugins').mockResolvedValue();

    await useAgentChatStore().sendMessage('remove the plugin');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not refetch plugins for unrelated tools', async () => {
    apiPostStream.mockImplementation(async (_path, _body, onLine: (line: string) => void) => {
      onLine(
        `data: ${JSON.stringify({
          type: 'tool_call',
          id: 't1',
          name: 'list_contacts',
          args: {},
        })}`,
      );
      onLine(`data: ${JSON.stringify({ type: 'tool_result', id: 't1', ok: true, summary: 'ok' })}`);
      onLine(`data: ${JSON.stringify({ type: 'done' })}`);
    });

    const plugins = usePluginsStore();
    const fetchSpy = vi.spyOn(plugins, 'fetchPlugins').mockResolvedValue();

    await useAgentChatStore().sendMessage('list contacts');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the active UI locale with every chat request', async () => {
    apiPostStream.mockResolvedValue(undefined);
    await useAgentChatStore().sendMessage('Summarize my pipeline');
    expect(apiPostStream).toHaveBeenCalledWith(
      '/api/agent/chat',
      expect.objectContaining({ content: 'Summarize my pipeline', locale: 'en' }),
      expect.any(Function),
    );

    i18n.global.locale.value = 'pl';
    await useAgentChatStore().sendMessage('podsumuj pipeline');
    expect(apiPostStream).toHaveBeenLastCalledWith(
      '/api/agent/chat',
      expect.objectContaining({ content: 'podsumuj pipeline', locale: 'pl' }),
      expect.any(Function),
    );
  });

  it('keeps streamed message ids when reloading the same transcript', async () => {
    apiPostStream.mockImplementation(async (_path, _body, onLine: (line: string) => void) => {
      onLine(`data: ${JSON.stringify({ type: 'conversation', conversationId: 'conv-1' })}`);
      onLine(`data: ${JSON.stringify({ type: 'text_delta', delta: 'Hello Ada' })}`);
      onLine(`data: ${JSON.stringify({ type: 'done' })}`);
    });
    apiGet.mockImplementation(async (path: string) => {
      if (path === '/api/agent/conversations') return [];
      return {
        id: 'conv-1',
        title: 'Hello',
        messages: [
          { id: 'server-user', role: 'user', content: 'hi', createdAt: '2026-01-01T00:00:00.000Z' },
          {
            id: 'server-asst',
            role: 'assistant',
            content: 'Hello Ada',
            createdAt: '2026-01-01T00:00:01.000Z',
          },
        ],
      };
    });

    const store = useAgentChatStore();
    await store.sendMessage('hi');
    const ids = store.messages.map((m) => m.id);
    expect(ids.some((id) => id.startsWith('local-'))).toBe(true);

    await store.loadConversation('conv-1');
    expect(store.messages.map((m) => m.id)).toEqual(ids);
    expect(store.messages[1]?.content).toBe('Hello Ada');
  });
});
