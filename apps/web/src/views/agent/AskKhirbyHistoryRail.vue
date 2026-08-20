<template>
  <aside class="flex min-h-0 flex-col bg-surface-panel">
    <div class="flex items-center justify-between border-b border-border-subtle px-3 py-3">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {{ t('agent.history.title') }}
      </h2>
      <button type="button" class="text-xs text-accent hover:text-accent-hover" @click="onNew">
        {{ t('agent.history.new') }}
      </button>
    </div>
    <ul class="flex-1 overflow-y-auto p-2">
      <li v-for="c in conversations" :key="c.id">
        <div
          class="group flex items-center gap-1 rounded-md transition-colors hover:bg-surface-raise"
          :class="c.id === activeConversationId ? 'bg-surface-raise2' : ''"
        >
          <button
            type="button"
            class="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm"
            :class="c.id === activeConversationId ? 'text-text-primary' : 'text-text-secondary'"
            @click="open(c.id)"
          >
            {{ c.title }}
          </button>
          <button
            type="button"
            class="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-ghost opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
            :aria-label="t('agent.history.deleteAria', { title: c.title })"
            :title="t('agent.history.deleteAction')"
            @click="onDelete(c)"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useConfirm } from '../../composables/useConfirm';
import { useAgentChatStore, type AgentConversation } from '../../stores/agent-chat.store';

const { t } = useI18n();
const router = useRouter();
const askConfirm = useConfirm();
const chat = useAgentChatStore();
const { conversations, activeConversationId } = storeToRefs(chat);

onMounted(() => {
  void chat.fetchConversations();
});

function open(id: string) {
  router.push({ name: 'ask-thread', params: { conversationId: id } });
}

function onNew() {
  chat.newThread();
  router.push({ name: 'ask-new' });
}

async function onDelete(conversation: AgentConversation) {
  const ok = await askConfirm({
    title: t('agent.history.deleteTitle'),
    message: t('agent.history.deleteMessage', { title: conversation.title }),
    confirmLabel: t('agent.history.deleteConfirm'),
  });
  if (!ok) return;

  const wasActive = conversation.id === activeConversationId.value;
  await chat.deleteConversation(conversation.id);
  if (wasActive) router.push({ name: 'ask-new' });
}
</script>
