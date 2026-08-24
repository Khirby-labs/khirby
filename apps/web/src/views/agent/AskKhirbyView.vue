<template>
  <div class="flex h-full min-h-0 flex-col bg-surface-base">
    <div
      v-if="!hasAccess"
      class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <p class="text-lg font-medium text-text-primary">{{ t('agent.accessDenied.title') }}</p>
      <p class="max-w-md text-sm text-text-muted">{{ t('agent.accessDenied.message') }}</p>
    </div>

    <template v-else>
      <div class="flex min-h-0 flex-1">
        <AskKhirbyHistoryRail
          v-if="historyOpen"
          class="hidden w-64 shrink-0 border-r border-border-subtle md:flex md:flex-col"
        />

        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <div ref="scrollEl" class="flex-1 overflow-y-auto px-4 py-6 md:px-8">
            <div v-if="!messages.length" class="mx-auto max-w-2xl space-y-4 text-center">
              <h1 class="text-xl font-semibold text-text-primary">{{ t('agent.empty.title') }}</h1>
              <p class="text-sm text-text-muted">{{ t('agent.empty.subtitle') }}</p>
              <div v-if="errorCode === 'ai_compose_unavailable'" class="pt-2">
                <RouterLink
                  to="/settings/integrations"
                  class="text-sm text-accent hover:text-accent-hover"
                >
                  {{ t('agent.empty.integrationsCta') }}
                </RouterLink>
              </div>
              <div class="flex flex-wrap justify-center gap-2 pt-4">
                <button
                  v-for="chip in suggestionKeys"
                  :key="chip"
                  type="button"
                  class="rounded-full border border-border-subtle px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-raise"
                  @click="draft = t(chip)"
                >
                  {{ t(chip) }}
                </button>
              </div>
            </div>

            <div v-else class="mx-auto flex w-full max-w-5xl flex-col gap-6">
              <TransitionGroup name="chat-msg" tag="div" class="flex flex-col gap-6">
                <article
                  v-for="msg in messages"
                  :key="msg.id"
                  :class="msg.role === 'user' ? 'flex justify-end' : 'w-full min-w-0'"
                >
                  <div v-if="msg.role === 'user'" class="flex max-w-xl flex-col items-end gap-1">
                    <div class="rounded-xl bg-accent px-4 py-3 text-sm text-accent-ink">
                      <p class="whitespace-pre-wrap">{{ msg.content }}</p>
                    </div>
                    <div
                      v-if="showMessageMeta(msg)"
                      class="flex items-center gap-2 px-1 text-[11px] text-text-ghost"
                    >
                      <time :datetime="msg.createdAt">{{ messageTimeLabel(msg.createdAt) }}</time>
                      <button
                        type="button"
                        class="text-text-muted transition-colors hover:text-text-secondary"
                        @click="copyMessage(msg)"
                      >
                        {{ t('agent.message.copy') }}
                      </button>
                    </div>
                  </div>
                  <div v-else class="w-full min-w-0">
                    <div
                      v-if="msg.content?.trim()"
                      class="md-prose text-sm"
                      v-html="renderMarkdown(msg.content)"
                      @click="onMarkdownClick"
                    />
                    <p
                      v-else-if="showInlineStatus(msg)"
                      class="text-sm text-text-ghost"
                      aria-live="polite"
                    >
                      {{ statusLabel }}
                    </p>
                    <span
                      v-if="
                        msg.role === 'assistant' &&
                        isStreaming &&
                        msg === lastAssistant &&
                        msg.content?.trim()
                      "
                      class="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-accent align-text-bottom"
                      aria-hidden="true"
                    />
                    <p
                      v-if="showToolStatus(msg)"
                      class="mt-1 font-mono text-[10px] text-text-ghost"
                      aria-live="polite"
                    >
                      {{ statusLabel }}
                    </p>
                    <div v-if="msg.toolTrace?.length" class="mt-3 flex flex-wrap gap-2">
                      <span
                        v-for="pill in msg.toolTrace"
                        :key="pill.id"
                        class="rounded-full border border-border-subtle px-2 py-0.5 font-mono text-[10px] text-text-muted"
                      >
                        {{ pill.name }}
                      </span>
                    </div>
                    <div
                      v-if="showMessageMeta(msg)"
                      class="mt-2 flex items-center gap-2 text-[11px] text-text-ghost"
                    >
                      <time :datetime="msg.createdAt">{{ messageTimeLabel(msg.createdAt) }}</time>
                      <button
                        type="button"
                        class="text-text-muted transition-colors hover:text-text-secondary"
                        @click="copyMessage(msg)"
                      >
                        {{ t('agent.message.copy') }}
                      </button>
                    </div>
                  </div>
                </article>
              </TransitionGroup>
              <p v-if="errorCode" class="text-xs text-danger" role="alert">
                {{ t(`agent.errors.${errorCode}`, errorCode) }}
              </p>
            </div>
          </div>

          <form class="border-t border-border-subtle p-4" @submit.prevent="onSend">
            <div class="mx-auto flex w-full max-w-5xl items-end gap-2">
              <textarea
                ref="composerTextarea"
                v-model="draft"
                rows="1"
                class="crm-input min-h-[44px] max-h-48 flex-1 resize-none overflow-hidden leading-relaxed"
                :placeholder="t('agent.composer.placeholder')"
                :disabled="isStreaming"
                @input="onComposerInput"
                @keydown.enter.exact.prevent="onSend"
              />
              <button
                type="submit"
                class="btn-primary shrink-0"
                :disabled="isStreaming || !draft.trim()"
              >
                {{ t('agent.composer.send') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '../../stores/auth.store';
import { useAgentChatStore, type AgentMessage } from '../../stores/agent-chat.store';
import { useToastStore } from '../../stores/toast.store';
import { renderMarkdown } from '../../utils/markdown';
import { inAppPathFromClick } from '../../utils/in-app-path';
import { formatRelativeTime } from '../../utils/relative-time';
import AskKhirbyHistoryRail from './AskKhirbyHistoryRail.vue';

withDefaults(defineProps<{ historyOpen?: boolean }>(), { historyOpen: true });

const { t, d, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const chat = useAgentChatStore();
const toast = useToastStore();
const { messages, isStreaming, statusCode, errorCode, activeConversationId } = storeToRefs(chat);

const draft = ref('');
const scrollEl = ref<HTMLElement | null>(null);
const composerTextarea = ref<HTMLTextAreaElement | null>(null);
/** Ticks so relative labels (5 min ago → 6 min ago) stay fresh. */
const nowMs = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;

/** Cap growth so long prompts stay readable without eating the whole viewport. */
const COMPOSER_MAX_HEIGHT_PX = 192;

function fitComposer(el: HTMLTextAreaElement | null = composerTextarea.value) {
  if (!el) return;
  el.style.height = 'auto';
  const next = Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > COMPOSER_MAX_HEIGHT_PX ? 'auto' : 'hidden';
}

function onComposerInput() {
  fitComposer();
}

function resetComposerHeight() {
  const el = composerTextarea.value;
  if (!el) return;
  el.style.height = '';
  el.style.overflowY = 'hidden';
  void nextTick(() => fitComposer());
}

// Never gate on an optional boolean prop — Vue coerces an omitted one to `false`,
// which would deny every signed-in user even when RBAC grants agent:use.
const hasAccess = computed(() => auth.hasPermission('agent', 'use'));

const suggestionKeys = [
  'agent.suggestions.contacts',
  'agent.suggestions.pipeline',
  'agent.suggestions.plugins',
];

const lastAssistant = computed(() =>
  [...messages.value].reverse().find((m) => m.role === 'assistant'),
);

const statusLabel = computed(() => {
  const code = statusCode.value;
  if (!code) return '';
  if (code.startsWith('running_')) {
    return t('agent.status.runningTool', { tool: code.slice('running_'.length) });
  }
  return t(`agent.status.${code}`, code);
});

function showInlineStatus(msg: AgentMessage) {
  return (
    isStreaming.value &&
    msg === lastAssistant.value &&
    !!statusCode.value &&
    !msg.content?.trim() &&
    !statusCode.value.startsWith('running_')
  );
}

function showToolStatus(msg: AgentMessage) {
  return (
    isStreaming.value && msg === lastAssistant.value && !!statusCode.value?.startsWith('running_')
  );
}

function showMessageMeta(msg: AgentMessage) {
  if (!msg.content?.trim()) return false;
  if (isStreaming.value && msg === lastAssistant.value) return false;
  return Boolean(msg.createdAt);
}

function messageTimeLabel(iso: string) {
  // Depend on nowMs so labels recompute every tick.
  void nowMs.value;
  return formatRelativeTime(iso, String(locale.value), (date) => d(date, 'dateTime'), nowMs.value);
}

async function copyMessage(msg: AgentMessage) {
  const text = msg.content?.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast.success(t('agent.message.copied'));
  } catch {
    toast.error(t('agent.message.copyFailed'));
  }
}

/** Keep the latest bubble in view while tokens stream and after history loads. */
const scrollAnchor = computed(() => {
  const list = messages.value;
  const last = list.length > 0 ? list[list.length - 1] : undefined;
  return `${messages.value.length}:${last?.content?.length ?? 0}:${isStreaming.value}:${statusCode.value ?? ''}`;
});

function scrollToBottom(behavior: 'auto' | 'instant' | 'smooth' = 'smooth') {
  void nextTick(() => {
    const el = scrollEl.value;
    if (!el || typeof el.scrollTo !== 'function') return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  });
}

watch(scrollAnchor, () => scrollToBottom(isStreaming.value ? 'auto' : 'smooth'));

onMounted(async () => {
  nowTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, 30_000);

  if (!hasAccess.value) return;
  const stateDraft = (history.state as { draft?: string } | null)?.draft;
  if (stateDraft) draft.value = stateDraft;

  await chat.fetchConversations();
  const id = route.params.conversationId as string | undefined;
  if (id) {
    await chat.loadConversation(id);
    scrollToBottom('auto');
  }
  void nextTick(() => fitComposer());
});

onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer);
  nowTimer = null;
});

watch(
  () => route.params.conversationId,
  async (id) => {
    if (!hasAccess.value || isStreaming.value) return;
    if (typeof id === 'string' && id) {
      await chat.loadConversation(id);
      scrollToBottom('auto');
    } else chat.newThread();
  },
);

watch(
  () => chat.activeConversationId,
  (id) => {
    if (!id || route.params.conversationId === id || isStreaming.value) return;
    router.replace({ name: 'ask-thread', params: { conversationId: id } });
  },
);

watch(isStreaming, (streaming, wasStreaming) => {
  if (streaming || !wasStreaming) return;
  const id = chat.activeConversationId;
  if (!id || route.params.conversationId === id) return;
  router.replace({ name: 'ask-thread', params: { conversationId: id } });
});

watch(draft, () => {
  void nextTick(() => fitComposer());
});

async function onSend() {
  const text = draft.value.trim();
  if (!text || isStreaming.value) return;
  draft.value = '';
  resetComposerHeight();
  scrollToBottom('smooth');
  await chat.sendMessage(text, activeConversationId.value);
}

function onMarkdownClick(event: MouseEvent) {
  const path = inAppPathFromClick(event);
  if (!path) return;
  event.preventDefault();
  void router.push(path);
}
</script>

<style scoped>
.chat-msg-enter-active,
.chat-msg-leave-active {
  transition:
    opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.chat-msg-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
</style>
