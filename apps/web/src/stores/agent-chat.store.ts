import { defineStore } from './session-state';
import { ref, computed } from 'vue';
import { apiGet, apiDelete, apiPostStream } from '../api/client';
import { usePluginsStore } from './plugins.store';

/** Agent tools that change installed/enabled plugin routes — sidebar must refetch. */
const PLUGIN_NAV_REFRESH_TOOLS = new Set([
  'scaffold_plugin',
  'install_instance_plugin',
  'remove_instance_plugin',
  'write_instance_plugin_file',
]);

export type AgentConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentToolTraceEntry = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
};

export type AgentMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolTrace?: AgentToolTraceEntry[] | null;
  createdAt: string;
};

export type AgentSseEvent =
  | { type: 'conversation'; conversationId: string }
  | { type: 'status'; code: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; ok: boolean; summary: string; code?: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'done' }
  | { type: 'error'; code: string; message?: string };

export const useAgentChatStore = defineStore('agent-chat', () => {
  const conversations = ref<AgentConversation[]>([]);
  const messages = ref<AgentMessage[]>([]);
  const activeConversationId = ref<string | null>(null);
  const isStreaming = ref(false);
  const streamingText = ref('');
  const statusCode = ref<string | null>(null);
  const errorCode = ref<string | null>(null);
  const pendingToolCalls = ref<
    Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
      ok?: boolean;
      summary?: string;
    }>
  >([]);

  const activeConversation = computed(
    () => conversations.value.find((c) => c.id === activeConversationId.value) ?? null,
  );

  async function fetchConversations() {
    conversations.value = await apiGet<AgentConversation[]>('/api/agent/conversations');
  }

  async function loadConversation(id: string) {
    // A new thread gets its URL as soon as the server assigns an id; loading from
    // the API mid-stream would replace the in-memory assistant bubble with history
    // that does not include the response yet.
    if (isStreaming.value) return;

    const data = await apiGet<{ id: string; title: string; messages: AgentMessage[] }>(
      `/api/agent/conversations/${id}`,
    );
    activeConversationId.value = data.id;
    messages.value = data.messages ?? [];
    resetStreamState();
  }

  async function deleteConversation(id: string) {
    await apiDelete(`/api/agent/conversations/${id}`);
    conversations.value = conversations.value.filter((c) => c.id !== id);
    if (activeConversationId.value === id) {
      activeConversationId.value = null;
      messages.value = [];
    }
  }

  function resetStreamState() {
    streamingText.value = '';
    statusCode.value = null;
    errorCode.value = null;
    pendingToolCalls.value = [];
  }

  async function sendMessage(content: string, conversationId?: string | null) {
    if (isStreaming.value) return;
    isStreaming.value = true;
    errorCode.value = null;
    resetStreamState();

    messages.value.push({
      id: `local-user-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    });

    const assistantId = `local-assistant-${Date.now()}`;
    messages.value.push({
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    });

    try {
      await apiPostStream(
        '/api/agent/chat',
        { conversationId: conversationId ?? undefined, content },
        (line) => {
          if (!line.startsWith('data:')) return;
          const payload = line.slice(5).trim();
          if (!payload) return;
          let event: AgentSseEvent;
          try {
            event = JSON.parse(payload);
          } catch {
            return;
          }
          handleEvent(event, assistantId);
        },
      );
    } catch {
      errorCode.value = 'network_error';
    } finally {
      isStreaming.value = false;
      statusCode.value = null;
    }
  }

  function handleEvent(event: AgentSseEvent, assistantId: string) {
    const assistant = messages.value.find((m) => m.id === assistantId);
    if (!assistant) return;

    switch (event.type) {
      case 'conversation':
        activeConversationId.value = event.conversationId;
        break;
      case 'status':
        statusCode.value = event.code;
        break;
      case 'text_delta':
        streamingText.value += event.delta;
        assistant.content += event.delta;
        break;
      case 'tool_call':
        pendingToolCalls.value.push({ id: event.id, name: event.name, args: event.args });
        break;
      case 'tool_result': {
        const pill = pendingToolCalls.value.find((p) => p.id === event.id);
        if (pill) {
          pill.ok = event.ok;
          pill.summary = event.summary;
          if (event.ok && PLUGIN_NAV_REFRESH_TOOLS.has(pill.name)) {
            void usePluginsStore().fetchPlugins();
          }
        }
        break;
      }
      case 'error':
        errorCode.value = event.code;
        break;
      case 'done':
        if (pendingToolCalls.value.length) {
          assistant.toolTrace = pendingToolCalls.value.map((p) => ({
            id: p.id,
            name: p.name,
            args: p.args,
            ok: p.ok ?? false,
            summary: p.summary ?? p.name,
          }));
        }
        streamingText.value = '';
        statusCode.value = null;
        pendingToolCalls.value = [];
        void fetchConversations();
        break;
    }
  }

  function newThread() {
    activeConversationId.value = null;
    messages.value = [];
    resetStreamState();
    errorCode.value = null;
  }

  return {
    conversations,
    messages,
    activeConversationId,
    activeConversation,
    isStreaming,
    streamingText,
    statusCode,
    errorCode,
    pendingToolCalls,
    fetchConversations,
    loadConversation,
    deleteConversation,
    sendMessage,
    newThread,
  };
});
