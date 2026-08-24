import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAgentChatStore } from './agent-chat.store';
import { usePluginsStore } from './plugins.store';

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
});
