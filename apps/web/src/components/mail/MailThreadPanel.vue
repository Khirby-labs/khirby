<template>
  <div class="flex flex-col" :class="detailOnly ? 'h-full min-h-0' : ''">
    <!-- Loading spinner for first fetch -->
    <div v-if="initialLoading" class="p-6 text-sm text-text-ghost text-center">
      {{ t('common.state.loading') }}
    </div>

    <!-- Error state -->
    <div v-else-if="loadError" class="p-4 crm-error">{{ loadError }}</div>

    <template v-else>
      <!-- Thread list (lead/contact panel — not used in inbox split detail pane) -->
      <div v-if="!expandedThreadId && !detailOnly" class="divide-y divide-border">
        <div v-if="!threads.length" class="p-6 text-center">
          <p class="text-sm text-text-muted">{{ t('mail.panel.empty') }}</p>
          <p class="text-xs text-text-ghost mt-1">{{ t('mail.panel.emptyHint') }}</p>
        </div>

        <button
          v-for="thread in threads"
          :key="thread.id"
          type="button"
          class="w-full text-left px-5 py-4 hover:bg-surface-hover transition-colors"
          @click="expandThread(thread.id)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-sm font-medium text-text-primary truncate">
                  {{ thread.subject || t('mail.thread.noSubject') }}
                </span>
                <span
                  class="shrink-0 px-1.5 py-0.5 text-xs rounded-full border font-medium"
                  :class="
                    thread.lastDirection === 'inbound'
                      ? 'bg-info/15 text-info border-info/40'
                      : 'bg-accent/15 text-accent border-accent/40'
                  "
                >
                  {{
                    thread.lastDirection === 'inbound'
                      ? t('mail.direction.inbound')
                      : t('mail.direction.outbound')
                  }}
                </span>
              </div>
              <p class="text-xs text-text-ghost">
                {{ t('mail.thread.messageCount', { n: thread.messageCount }, thread.messageCount) }}
                · {{ formatDate(thread.lastMessageAt) }}
              </p>
            </div>
          </div>
        </button>

        <!-- Pagination -->
        <div
          v-if="store.threadsTotal > store.threadsPageSize"
          class="px-5 py-3 flex items-center justify-between"
        >
          <button
            class="text-xs text-accent hover:text-accent disabled:opacity-40"
            :disabled="store.threadsPage <= 1"
            @click="changePage(store.threadsPage - 1)"
          >
            {{ t('common.pagination.prev') }}
          </button>
          <span class="text-xs text-text-ghost">{{ store.threadsPage }} / {{ totalPages }}</span>
          <button
            class="text-xs text-accent hover:text-accent disabled:opacity-40"
            :disabled="store.threadsPage >= totalPages"
            @click="changePage(store.threadsPage + 1)"
          >
            {{ t('common.pagination.next') }}
          </button>
        </div>
      </div>

      <!-- Compose new thread -->
      <div v-if="!expandedThreadId && !detailOnly" class="border-t border-border">
        <button
          type="button"
          class="w-full text-left px-5 py-3 text-sm font-medium text-accent hover:bg-surface-hover transition-colors"
          @click="composing = !composing"
        >
          {{ composing ? t('mail.panel.cancelCompose') : t('mail.panel.compose') }}
        </button>

        <div v-if="composing" class="px-5 pb-5 space-y-3">
          <FormField :label="t('mail.compose.subject')" :error="composeErrors.subject">
            <template #default="{ fieldId }">
              <input
                :id="fieldId"
                v-model="composeForm.subject"
                type="text"
                class="w-full crm-input"
                @input="composeErrors.subject = ''"
              />
            </template>
          </FormField>

          <!-- Compose assistant slot (ADR-0017): draft first outbound from lead context -->
          <div
            v-for="[pluginName, AssistComponent] in resolvedAssistants"
            v-show="leadId"
            :key="`compose-${pluginName}`"
          >
            <component :is="AssistComponent" :lead-id="leadId" :on-suggest="applyComposeSuggest" />
          </div>

          <FormField :label="t('mail.compose.body')" :error="composeErrors.body">
            <template #default="{ fieldId }">
              <textarea
                :id="fieldId"
                ref="composeTextarea"
                v-model="composeForm.body"
                rows="4"
                class="w-full crm-input resize-none overflow-hidden"
                @input="onComposeInput"
              />
            </template>
          </FormField>
          <div v-if="composeError" class="crm-error">{{ composeError }}</div>
          <button
            type="button"
            :disabled="sending"
            class="btn-primary disabled:opacity-50"
            @click="handleCompose"
          >
            {{ sending ? t('mail.compose.sending') : t('mail.compose.send') }}
          </button>
        </div>
      </div>

      <!-- Expanded thread view -->
      <div v-if="expandedThreadId" class="flex flex-col min-h-0 flex-1">
        <div
          v-if="!detailOnly"
          class="flex items-center gap-2 px-5 py-3 border-b border-border shrink-0"
        >
          <button
            type="button"
            class="text-sm text-accent hover:text-accent"
            @click="collapseThread"
          >
            ← {{ t('mail.panel.backToList') }}
          </button>
        </div>

        <div v-if="store.threadLoading[expandedThreadId]" class="p-4 text-sm text-text-ghost">
          {{ t('common.state.loading') }}
        </div>

        <template v-else-if="expandedDetail">
          <!-- One scrollport: messages + AI assist + reply (oldest top → composer bottom) -->
          <div ref="messagesContainer" class="flex-1 min-h-0 overflow-y-auto">
            <div class="divide-y divide-border">
              <div v-for="msg in expandedDetail.messages" :key="msg.id" class="px-5 py-4 space-y-2">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-xs font-medium text-text-secondary">{{
                        msg.fromAddress
                      }}</span>
                      <span
                        class="px-1.5 py-0.5 text-xs rounded-full border font-medium"
                        :class="
                          msg.direction === 'inbound'
                            ? 'bg-info/15 text-info border-info/40'
                            : 'bg-accent/15 text-accent border-accent/40'
                        "
                      >
                        {{
                          msg.direction === 'inbound'
                            ? t('mail.direction.inbound')
                            : t('mail.direction.outbound')
                        }}
                      </span>
                      <span
                        v-if="msg.status === 'failed'"
                        class="px-1.5 py-0.5 text-xs rounded-full bg-error/15 text-error border border-error/40"
                      >
                        {{ t('mail.message.failed') }}
                      </span>
                      <span
                        v-else-if="msg.status === 'pending'"
                        class="px-1.5 py-0.5 text-xs rounded-full bg-warning/15 text-warning border border-warning/40"
                      >
                        {{ t('mail.message.pending') }}
                      </span>
                    </div>
                    <p class="text-xs text-text-ghost mt-0.5">
                      {{ formatDate(msg.sentAt ?? msg.receivedAt ?? '') }}
                      <template v-if="msg.toAddresses.length">
                        · {{ t('mail.message.to') }}: {{ msg.toAddresses.join(', ') }}
                      </template>
                    </p>
                  </div>
                </div>

                <!-- Body: plain text only, whitespace preserved, NO v-html -->
                <pre
                  class="text-sm text-text-primary whitespace-pre-wrap break-words font-sans bg-surface-base rounded p-3 border border-border"
                  >{{ msg.bodyText }}</pre>

                <!-- Failed message retry -->
                <div v-if="msg.status === 'failed'" class="space-y-1">
                  <p v-if="msg.lastError" class="text-xs text-error">{{ msg.lastError }}</p>
                  <button
                    type="button"
                    class="text-xs text-accent hover:text-accent"
                    :disabled="retrying === msg.id"
                    @click="retryMessage(msg)"
                  >
                    {{ retrying === msg.id ? t('mail.message.retrying') : t('mail.message.retry') }}
                  </button>
                </div>

                <p v-if="msg.hasAttachments" class="text-xs text-text-ghost">
                  {{ t('mail.message.attachmentsNote') }}
                </p>
              </div>
            </div>

            <!-- Compose assistant slot (ADR-0017): registered plugins render above reply textarea -->
            <div
              v-for="[pluginName, AssistComponent] in resolvedAssistants"
              :key="pluginName"
              class="border-t border-border px-5 py-3"
            >
              <component
                :is="AssistComponent"
                :thread-id="expandedThreadId!"
                :lead-id="leadId"
                :on-suggest="applyReplySuggest"
              />
            </div>

            <!-- Reply form -->
            <div class="border-t border-border px-5 py-4 space-y-3">
              <h4 class="text-xs font-medium text-text-ghost uppercase tracking-wider">
                {{ t('mail.reply.title') }}
              </h4>
              <FormField :label="t('mail.compose.body')" :error="replyErrors.body">
                <template #default="{ fieldId }">
                  <textarea
                    :id="fieldId"
                    ref="replyTextarea"
                    v-model="replyBody"
                    rows="4"
                    :placeholder="t('mail.reply.placeholder')"
                    class="w-full crm-input resize-none overflow-hidden"
                    @input="onReplyInput"
                  />
                </template>
              </FormField>
              <div v-if="replyError" class="crm-error">{{ replyError }}</div>
              <button
                type="button"
                :disabled="!replyBody.trim() || replying"
                class="btn-primary disabled:opacity-50"
                @click="handleReply"
              >
                {{ replying ? t('mail.reply.sending') : t('mail.reply.send') }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, shallowRef, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMailStore } from '../../stores/mail.store';
import type { EmailMessagePublic } from '@khirby/types';
import FormField from '../ui/FormField.vue';
import { mailComposeAssistants } from '../../plugins/plugin-registry';

const props = defineProps<{
  contactId?: string;
  leadId?: string;
  /** When provided, opens this thread immediately on mount. */
  threadId?: string;
  /**
   * Inbox split pane: render only the open thread (messages + reply).
   * No thread list, compose, or “back to list”.
   */
  detailOnly?: boolean;
}>();

const { t, d } = useI18n();
const store = useMailStore();

const initialLoading = ref(false);
const loadError = ref('');
const expandedThreadId = ref<string | null>(props.threadId ?? null);
const messagesContainer = ref<HTMLElement | null>(null);
const replyTextarea = ref<HTMLTextAreaElement | null>(null);
const composeTextarea = ref<HTMLTextAreaElement | null>(null);
const composing = ref(false);
const sending = ref(false);
const replying = ref(false);
const retrying = ref<string | null>(null);
const composeError = ref('');
const replyError = ref('');
const replyBody = ref('');

const composeForm = ref({ subject: '', body: '' });
const composeErrors = ref({ subject: '', body: '' });
const replyErrors = ref({ body: '' });

const threads = computed(() => store.threads);

const totalPages = computed(() => Math.ceil(store.threadsTotal / store.threadsPageSize));

/**
 * ADR-0017: Lazy-load registered compose assistant components.
 * shallowRef holds the resolved component; components are loaded once per session.
 */
const resolvedAssistants = shallowRef<[string, unknown][]>([]);

onMounted(async () => {
  const entries = await Promise.all(
    Object.entries(mailComposeAssistants).map(async ([name, loader]) => {
      try {
        const mod = (await loader()) as { default?: unknown };
        return [name, mod?.default ?? mod] as [string, unknown];
      } catch {
        return null;
      }
    }),
  );
  resolvedAssistants.value = entries.filter((e): e is [string, unknown] => e !== null);
});

const expandedDetail = computed(() =>
  expandedThreadId.value ? (store.threadDetails[expandedThreadId.value] ?? null) : null,
);

/** Grow textarea with content so the full draft stays visible (no inner scroll). */
function fitTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function onReplyInput() {
  replyErrors.value.body = '';
  fitTextarea(replyTextarea.value);
}

function onComposeInput() {
  composeErrors.value.body = '';
  fitTextarea(composeTextarea.value);
}

function applyComposeSuggest(draft: string) {
  composeForm.value.body = draft;
  composeErrors.value.body = '';
  void nextTick(() => fitTextarea(composeTextarea.value));
}

function applyReplySuggest(draft: string) {
  replyBody.value = draft;
  void nextTick(() => {
    fitTextarea(replyTextarea.value);
    scrollMessagesToBottom();
  });
}

watch(replyBody, () => {
  void nextTick(() => fitTextarea(replyTextarea.value));
});

watch(
  () => composeForm.value.body,
  () => {
    void nextTick(() => fitTextarea(composeTextarea.value));
  },
);

watch(composing, (open) => {
  if (!open) return;
  void nextTick(() => fitTextarea(composeTextarea.value));
});

/**
 * Pin to absolute bottom (latest message + AI assist + reply). Retries across
 * ticks/frames: inbox split animates open, initialLoading unmounts the pane,
 * and AI assistants load async so scrollHeight grows after first paint.
 */
function scrollMessagesToBottom() {
  const pin = () => {
    const el = messagesContainer.value;
    if (!el || el.clientHeight === 0) return false;
    el.scrollTop = el.scrollHeight;
    return true;
  };

  void nextTick(() => {
    if (pin()) {
      requestAnimationFrame(() => {
        pin();
      });
      return;
    }
    let frames = 0;
    const maxFrames = 36; // ~600ms at 60fps — covers split open + paint
    const tick = () => {
      if (pin() || frames++ >= maxFrames) return;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Keep the composer in view (chat-style: oldest top, reply bottom). */
watch(
  () => {
    const id = expandedThreadId.value;
    if (!id) return null;
    const detail = store.threadDetails[id];
    return {
      // Must wait for the outer spinner — otherwise we scroll while the list is unmounted.
      ready: !initialLoading.value && !store.threadLoading[id],
      count: detail?.messages.length ?? 0,
      lastId: detail?.messages[detail.messages.length - 1]?.id ?? null,
      // Assistants mount async after onMounted — re-pin when they appear.
      assistants: resolvedAssistants.value.length,
    };
  },
  (state) => {
    if (!state || !state.ready || state.count === 0) return;
    scrollMessagesToBottom();
  },
);

function formatDate(iso: string) {
  return iso ? d(iso, 'dateTime') : '—';
}

async function loadThreads(page = 1) {
  loadError.value = '';
  try {
    // Prefer contact scope so all correspondence with the person shows on a lead,
    // including threads that were not tagged with this leadId.
    await store.listThreads({
      contactId: props.contactId,
      leadId: props.contactId ? undefined : props.leadId,
      page,
    });
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : t('mail.errors.loadThreads');
  }
}

async function expandThread(id: string) {
  expandedThreadId.value = id;
  // Always refetch — stale cache was hiding replies that arrived after first open.
  await store.getThread(id);
}

function collapseThread() {
  expandedThreadId.value = null;
  replyBody.value = '';
  replyError.value = '';
  replyErrors.value.body = '';
}

function changePage(page: number) {
  loadThreads(page);
}

async function handleCompose() {
  composeErrors.value.subject = composeForm.value.subject.trim()
    ? ''
    : t('mail.settings.errors.required');
  composeErrors.value.body = composeForm.value.body.trim()
    ? ''
    : t('mail.settings.errors.required');
  if (composeErrors.value.subject || composeErrors.value.body) return;

  sending.value = true;
  composeError.value = '';
  try {
    const detail = await store.createThread({
      contactId: props.contactId,
      leadId: props.leadId,
      subject: composeForm.value.subject.trim(),
      bodyText: composeForm.value.body.trim(),
    });
    composeForm.value = { subject: '', body: '' };
    composing.value = false;
    await loadThreads();
    if (detail?.id) {
      await expandThread(detail.id);
    }
  } catch (e: unknown) {
    composeError.value = e instanceof Error ? e.message : t('mail.errors.send');
  } finally {
    sending.value = false;
  }
}

async function handleReply() {
  replyErrors.value.body = replyBody.value.trim() ? '' : t('mail.settings.errors.required');
  if (replyErrors.value.body || !expandedThreadId.value) return;

  replying.value = true;
  replyError.value = '';
  try {
    await store.replyToThread(expandedThreadId.value, replyBody.value.trim());
    replyBody.value = '';
  } catch (e: unknown) {
    replyError.value = e instanceof Error ? e.message : t('mail.errors.send');
  } finally {
    replying.value = false;
  }
}

async function retryMessage(msg: EmailMessagePublic) {
  if (!expandedThreadId.value) return;
  retrying.value = msg.id;
  try {
    await store.replyToThread(expandedThreadId.value, msg.bodyText);
    await store.getThread(expandedThreadId.value);
  } catch {
    // error shown by store toast
  } finally {
    retrying.value = null;
  }
}

const detailOnly = computed(() => Boolean(props.detailOnly));

watch(
  () => props.threadId,
  async (id) => {
    if (!props.detailOnly) return;
    if (!id) {
      expandedThreadId.value = null;
      return;
    }
    await expandThread(id);
  },
);

watch(
  () => [props.contactId, props.leadId] as const,
  () => {
    if (props.detailOnly) return;
    expandedThreadId.value = null;
    loadThreads();
  },
);

onMounted(async () => {
  if (props.detailOnly) {
    // Inbox split pane supplies threadId — skip listing threads.
    if (props.threadId) {
      initialLoading.value = true;
      try {
        await expandThread(props.threadId);
      } finally {
        initialLoading.value = false;
      }
    }
    return;
  }

  initialLoading.value = true;
  try {
    await loadThreads();
    if (props.threadId) {
      await expandThread(props.threadId);
    }
  } finally {
    initialLoading.value = false;
  }
});
</script>
