<template>
  <div class="flex h-full min-h-[32rem] w-full flex-col gap-4">
    <div class="flex shrink-0 items-center justify-between">
      <h2 class="crm-page-title">{{ t('mail.inbox.title') }}</h2>
      <div class="flex items-center gap-2">
        <button class="btn-ghost px-3 py-1.5 text-sm" @click="() => loadThreads(1)">
          {{ t('mail.inbox.refresh') }}
        </button>
        <RouterLink to="/settings/mail" class="btn-ghost px-3 py-1.5 text-sm">
          {{ t('mail.inbox.settings') }}
        </RouterLink>
      </div>
    </div>

    <div v-if="store.threadsError" class="crm-error shrink-0">{{ store.threadsError }}</div>

    <div
      class="crm-panel mail-inbox-shell flex min-h-0 flex-1 overflow-hidden"
      :class="splitOpen ? 'is-split' : 'is-list'"
    >
      <!-- List pane: full width until a thread is open -->
      <div
        class="mail-inbox-list flex min-h-0 min-w-0 flex-col border-border"
        :class="splitOpen ? 'border-r max-lg:hidden' : ''"
      >
        <div v-if="store.threadsLoading" class="space-y-2 p-3">
          <div v-for="i in 6" :key="i" class="animate-pulse rounded-md p-3">
            <div class="mb-2 h-4 w-2/3 rounded bg-surface-raise" />
            <div class="h-3 w-1/2 rounded bg-surface-raise" />
          </div>
        </div>

        <div
          v-else-if="!store.threads.length"
          class="flex flex-1 flex-col items-center justify-center p-8 text-center"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="mb-3 h-10 w-10 text-text-ghost"
            aria-hidden="true"
          >
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <p class="text-text-muted">{{ t('mail.inbox.empty') }}</p>
          <p class="mt-1 text-xs text-text-ghost">{{ t('mail.inbox.emptyHint') }}</p>
        </div>

        <template v-else>
          <div class="min-h-0 flex-1 overflow-y-auto">
            <button
              v-for="thread in store.threads"
              :key="thread.id"
              type="button"
              class="mail-inbox-row w-full border-b border-border-subtle text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
              :class="
                selectedThreadId === thread.id
                  ? 'bg-accent/15 border-l-2 border-l-accent'
                  : 'border-l-2 border-l-transparent'
              "
              @click="selectThread(thread.id)"
            >
              <div class="mail-inbox-row-inner">
                <div class="min-w-0 flex-1">
                  <div class="mb-0.5 flex items-center gap-2">
                    <span class="truncate text-sm font-medium text-text-primary">
                      {{ thread.subject || t('mail.thread.noSubject') }}
                    </span>
                    <span
                      class="shrink-0 rounded-full border px-1.5 py-0.5 text-xs font-medium"
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
                  <div class="flex items-center gap-2 text-xs text-text-muted">
                    <span v-if="thread.contactEmail" class="truncate">
                      {{ thread.contactName || thread.contactEmail }}
                    </span>
                    <span v-else class="italic text-text-ghost">{{
                      t('mail.thread.unknownContact')
                    }}</span>
                  </div>
                </div>
                <div class="mail-inbox-row-meta shrink-0 text-right text-xs text-text-ghost">
                  <div>{{ formatDate(thread.lastMessageAt) }}</div>
                  <div class="mt-0.5">
                    {{
                      t('mail.thread.messageCount', { n: thread.messageCount }, thread.messageCount)
                    }}
                  </div>
                </div>
              </div>
            </button>
          </div>

          <div
            v-if="store.threadsTotal > store.threadsPageSize"
            class="flex shrink-0 items-center justify-between border-t border-border px-3 py-2"
          >
            <button
              class="btn-ghost px-2 py-1 text-xs disabled:opacity-40"
              :disabled="store.threadsPage <= 1"
              @click="changePage(store.threadsPage - 1)"
            >
              {{ t('common.pagination.prev') }}
            </button>
            <span class="text-xs text-text-ghost">
              {{ t('common.pagination.pageOf', { current: store.threadsPage, total: totalPages }) }}
            </span>
            <button
              class="btn-ghost px-2 py-1 text-xs disabled:opacity-40"
              :disabled="store.threadsPage >= totalPages"
              @click="changePage(store.threadsPage + 1)"
            >
              {{ t('common.pagination.next') }}
            </button>
          </div>
        </template>
      </div>

      <!-- Detail pane: slides in when a thread is selected -->
      <div
        class="mail-inbox-detail flex min-h-0 min-w-0 flex-col overflow-hidden"
        :class="splitOpen ? 'is-open' : ''"
        :aria-hidden="!splitOpen"
      >
        <template v-if="selectedThreadId">
          <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 lg:px-5">
            <button type="button" class="text-sm text-accent" @click="closeThread">
              ← {{ t('mail.panel.backToList') }}
            </button>
            <h3 class="min-w-0 flex-1 truncate text-sm font-semibold text-text-secondary">
              {{ currentThread?.subject || t('mail.thread.noSubject') }}
            </h3>
            <button
              type="button"
              class="btn-danger text-xs px-2 py-1 shrink-0"
              :disabled="deleting"
              :aria-label="t('mail.thread.delete.action')"
              @click="promptDeleteThread"
            >
              {{ deleting ? t('mail.thread.delete.deleting') : t('common.actions.delete') }}
            </button>
            <button
              type="button"
              class="text-sm text-text-muted hover:text-text-primary"
              :aria-label="t('common.actions.close')"
              @click="closeThread"
            >
              ✕
            </button>
          </div>
          <div
            v-if="!currentThread?.contactId"
            class="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface-raise/40 px-4 py-3 lg:px-5"
          >
            <p class="min-w-0 flex-1 text-sm text-text-secondary">{{ t('mail.capture.banner') }}</p>
            <button
              type="button"
              class="btn-primary shrink-0 px-3 py-1.5 text-sm"
              @click="openCapture"
            >
              {{ t('mail.capture.cta') }}
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-hidden">
            <MailThreadPanel :key="selectedThreadId" detail-only :thread-id="selectedThreadId" />
          </div>
        </template>
      </div>
    </div>

    <AddLeadModal
      v-if="showCaptureModal && selectedThreadId"
      :stages="pipelineStore.stages"
      :assignees="pipelineStore.assignees"
      :initial-email="captureEmail"
      :capture-thread-id="selectedThreadId"
      :message-snippet="captureSnippet"
      @close="showCaptureModal = false"
      @created="onCaptured"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMailStore } from '../../stores/mail.store';
import { usePipelineStore } from '../../stores/pipeline.store';
import MailThreadPanel from '../../components/mail/MailThreadPanel.vue';
import AddLeadModal from '../../components/pipeline/AddLeadModal.vue';
import { useConfirm } from '../../composables/useConfirm';

const SPLIT_MS = 280;
const SNIPPET_MAX = 600;

const { t, d } = useI18n();
const store = useMailStore();
const pipelineStore = usePipelineStore();
const askConfirm = useConfirm();

const selectedThreadId = ref<string | null>(null);
/** Drives layout/animation; cleared after close transition so content can fade out. */
const splitOpen = ref(false);
const deleting = ref(false);
const showCaptureModal = ref(false);
let closeTimer: ReturnType<typeof setTimeout> | null = null;

const totalPages = computed(() => Math.ceil(store.threadsTotal / store.threadsPageSize));

const currentThread = computed(
  () => store.threads.find((th) => th.id === selectedThreadId.value) ?? null,
);

const selectedDetail = computed(() =>
  selectedThreadId.value ? (store.threadDetails[selectedThreadId.value] ?? null) : null,
);

const captureEmail = computed(() => {
  const msgs = selectedDetail.value?.messages ?? [];
  const inbound = msgs.find((m) => m.direction === 'inbound');
  const raw = inbound?.fromAddress ?? msgs[0]?.fromAddress ?? '';
  const angle = raw.match(/<([^>]+)>/);
  return (angle?.[1] ?? raw).trim().toLowerCase();
});

const captureSnippet = computed(() => {
  const msgs = selectedDetail.value?.messages ?? [];
  const inbound = msgs.find((m) => m.direction === 'inbound');
  const body = (inbound?.bodyText ?? '').trim();
  if (!body) return '';
  return body.length > SNIPPET_MAX ? `${body.slice(0, SNIPPET_MAX)}…` : body;
});

function formatDate(iso: string) {
  return iso ? d(iso, 'dateTime') : '—';
}

async function loadThreads(page = store.threadsPage) {
  await store.listThreads({ page, pageSize: store.threadsPageSize });
}

async function selectThread(id: string) {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  const alreadyOpen = splitOpen.value;
  selectedThreadId.value = id;
  showCaptureModal.value = false;
  if (alreadyOpen) {
    splitOpen.value = true;
    return;
  }
  // Let the detail mount, then open so opacity/transform animate from closed.
  splitOpen.value = false;
  await nextTick();
  requestAnimationFrame(() => {
    splitOpen.value = true;
  });
}

function closeThread() {
  splitOpen.value = false;
  showCaptureModal.value = false;
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    selectedThreadId.value = null;
    closeTimer = null;
  }, SPLIT_MS);
}

async function openCapture() {
  await Promise.all([pipelineStore.fetchAssignees(), pipelineStore.fetchStages()]);
  showCaptureModal.value = true;
}

function onCaptured() {
  showCaptureModal.value = false;
}

async function promptDeleteThread() {
  const threadId = selectedThreadId.value;
  if (!threadId) return;

  const subject = currentThread.value?.subject || t('mail.thread.noSubject');
  const confirmed = await askConfirm({
    title: t('mail.thread.delete.title'),
    message: t('mail.thread.delete.message', { subject }),
    confirmLabel: t('mail.thread.delete.confirm'),
  });
  if (!confirmed) return;

  deleting.value = true;
  try {
    await store.deleteThread(threadId);
    closeThread();
  } catch {
    // error shown by store toast
  } finally {
    deleting.value = false;
  }
}

function changePage(page: number) {
  loadThreads(page);
}

onMounted(() => loadThreads(1));

onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer);
});
</script>

<style scoped>
.mail-inbox-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 0fr;
  transition: grid-template-columns 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.mail-inbox-shell.is-split {
  grid-template-columns: minmax(14rem, 22rem) minmax(0, 1fr);
}

.mail-inbox-detail {
  opacity: 0;
  transform: translateX(0.75rem);
  pointer-events: none;
  transition:
    opacity 220ms ease,
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.mail-inbox-detail.is-open {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

.mail-inbox-row {
  padding: 0.75rem 1rem;
}

.mail-inbox-row-inner {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

/* Full-width list: roomier horizontal rhythm */
.mail-inbox-shell.is-list .mail-inbox-row {
  padding-left: 1.25rem;
  padding-right: 1.25rem;
}

.mail-inbox-shell.is-list .mail-inbox-row-meta {
  min-width: 9rem;
}

@media (max-width: 1023px) {
  .mail-inbox-shell,
  .mail-inbox-shell.is-split {
    grid-template-columns: minmax(0, 1fr);
  }

  .mail-inbox-shell.is-split .mail-inbox-detail {
    grid-column: 1;
    grid-row: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mail-inbox-shell,
  .mail-inbox-detail {
    transition: none;
  }
}
</style>
