<template>
  <div class="space-y-6 max-w-4xl">
    <RouterLink to="/inquiries" class="text-sm text-accent hover:text-accent transition-colors">
      <span aria-hidden="true">←</span> {{ t('inquiries.detail.back') }}
    </RouterLink>

    <div v-if="loading" class="crm-panel p-6 text-text-muted text-sm">
      {{ t('common.state.loading') }}
    </div>
    <div v-else-if="error" class="crm-error">{{ error }}</div>

    <template v-else-if="inquiry">
      <!-- Header: status + actions -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span
            class="inline-flex items-center px-2.5 py-1 text-xs rounded-md font-medium"
            :class="statusClass(inquiry.status)"
          >
            {{ statusLabel(inquiry.status) }}
          </span>
        </div>

        <div v-if="canAct" class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn-primary text-sm"
            :disabled="acting || !inquiry.email"
            :title="!inquiry.email ? t('inquiries.actions.acceptNoEmail') : undefined"
            @click="handleAccept"
          >
            {{ t('inquiries.actions.accept') }}
          </button>
          <button type="button" class="btn-ghost text-sm" :disabled="acting" @click="handleReject">
            {{ t('inquiries.actions.reject') }}
          </button>
          <button
            type="button"
            class="btn-ghost text-sm text-text-muted"
            :disabled="acting"
            @click="handleSpam"
          >
            {{ t('inquiries.actions.spam') }}
          </button>
        </div>
      </div>

      <p v-if="canAct && !inquiry.email" class="text-sm text-text-muted" role="note">
        {{ t('inquiries.actions.acceptNoEmail') }}
      </p>

      <!-- Summary -->
      <div class="crm-panel p-6 space-y-2">
        <h3 class="text-sm font-semibold text-text-primary">{{ t('inquiries.detail.summary') }}</h3>
        <p class="text-text-secondary text-sm leading-relaxed">
          {{ inquiry.aiSummary || t('inquiries.detail.noSummary') }}
        </p>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Contact + metadata -->
        <div class="crm-panel p-6 space-y-4">
          <dl class="space-y-3 text-sm">
            <div v-if="inquiry.contactName">
              <dt class="text-text-muted crm-label">
                {{ t('inquiries.list.columns.contactName') }}
              </dt>
              <dd class="text-text-primary">{{ inquiry.contactName }}</dd>
            </div>
            <div v-if="inquiry.email">
              <dt class="text-text-muted crm-label">{{ t('inquiries.list.columns.email') }}</dt>
              <dd class="text-text-primary">{{ inquiry.email }}</dd>
            </div>
            <div v-if="inquiry.companyName">
              <dt class="text-text-muted crm-label">
                {{ t('inquiries.list.columns.companyName') }}
              </dt>
              <dd class="text-text-primary">{{ inquiry.companyName }}</dd>
            </div>
            <div v-if="inquiry.proposedType">
              <dt class="text-text-muted crm-label">{{ t('inquiries.detail.proposedType') }}</dt>
              <dd class="text-text-primary">{{ inquiry.proposedType }}</dd>
            </div>
            <div v-if="inquiry.tags.length">
              <dt class="text-text-muted crm-label">{{ t('inquiries.detail.tags') }}</dt>
              <dd class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="tag in inquiry.tags"
                  :key="tag"
                  class="inline-block px-2 py-0.5 text-xs rounded-full bg-surface-input text-text-secondary border border-border"
                >
                  {{ tag }}
                </span>
              </dd>
            </div>
            <div v-if="inquiry.source">
              <dt class="text-text-muted crm-label">{{ t('inquiries.detail.source') }}</dt>
              <dd class="text-text-primary">{{ inquiry.source }}</dd>
            </div>
            <div>
              <dt class="text-text-muted crm-label">{{ t('inquiries.list.columns.createdAt') }}</dt>
              <dd class="text-text-primary">{{ formatDate(inquiry.createdAt) }}</dd>
            </div>
          </dl>
        </div>

        <!-- Structured brief -->
        <div class="crm-panel p-6 space-y-4">
          <h3 class="text-sm font-semibold text-text-primary">
            {{ t('inquiries.detail.briefHeading') }}
          </h3>
          <dl class="space-y-3 text-sm">
            <div v-if="brief.problem">
              <dt class="text-text-muted crm-label">{{ t('inquiries.detail.problem') }}</dt>
              <dd class="text-text-primary">{{ brief.problem }}</dd>
            </div>
            <div v-if="brief.desiredOutcome">
              <dt class="text-text-muted crm-label">{{ t('inquiries.detail.desiredOutcome') }}</dt>
              <dd class="text-text-primary">{{ brief.desiredOutcome }}</dd>
            </div>
            <div v-if="brief.currentProcess">
              <dt class="text-text-muted crm-label">{{ t('inquiries.detail.currentProcess') }}</dt>
              <dd class="text-text-primary">{{ brief.currentProcess }}</dd>
            </div>
            <div v-if="brief.currentTools.length">
              <dt class="text-text-muted crm-label">{{ t('inquiries.detail.currentTools') }}</dt>
              <dd class="text-text-primary">{{ brief.currentTools.join(', ') }}</dd>
            </div>
            <div v-if="brief.teamSize !== null">
              <dt class="text-text-muted crm-label">{{ t('inquiries.detail.teamSize') }}</dt>
              <dd class="text-text-primary">{{ brief.teamSize }}</dd>
            </div>
            <div v-if="brief.constraints.length">
              <dt class="text-text-muted crm-label">{{ t('inquiries.detail.constraints') }}</dt>
              <dd class="text-text-primary">{{ brief.constraints.join(', ') }}</dd>
            </div>
            <div v-if="brief.timeline">
              <dt class="text-text-muted crm-label">{{ t('inquiries.detail.timeline') }}</dt>
              <dd class="text-text-primary">{{ brief.timeline }}</dd>
            </div>
            <div v-if="brief.inquiryType">
              <dt class="text-text-muted crm-label">{{ t('inquiries.detail.inquiryType') }}</dt>
              <dd class="text-text-primary">{{ brief.inquiryType }}</dd>
            </div>
            <div v-if="inquiry.missingInformation.length">
              <dt class="text-text-muted crm-label">
                {{ t('inquiries.detail.missingInformation') }}
              </dt>
              <dd>
                <ul class="list-disc list-inside space-y-0.5 text-text-secondary">
                  <li v-for="item in inquiry.missingInformation" :key="item">{{ item }}</li>
                </ul>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- Form answers (Q→A), not a chat transcript -->
      <div v-if="qaPairs.length" class="crm-panel p-6 space-y-5">
        <h3 class="text-sm font-semibold text-text-primary">
          {{ t('inquiries.detail.transcript') }}
        </h3>
        <dl class="space-y-4">
          <div v-for="(pair, i) in qaPairs" :key="i" class="space-y-1.5">
            <dt class="crm-label text-text-muted">{{ pair.question }}</dt>
            <dd
              class="rounded-md border border-border bg-surface-input px-3 py-2 text-sm text-text-primary leading-relaxed whitespace-pre-wrap"
            >
              {{ pair.answer }}
            </dd>
          </div>
        </dl>
      </div>

      <!-- Lead link after accept -->
      <div v-if="acceptedLeadId" class="crm-panel p-4 text-sm text-success">
        {{ t('inquiries.actions.acceptSuccess') }}
        <RouterLink :to="`/pipeline`" class="underline ml-1">{{
          t('inquiries.actions.acceptSuccess')
        }}</RouterLink>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPost } from '../../api/client';
import { useConfirm } from '../../composables/useConfirm';
import { useToastStore } from '../../stores/toast.store';

interface InquiryBrief {
  problem: string | null;
  desiredOutcome: string | null;
  currentProcess: string | null;
  currentTools: string[];
  teamSize: number | null;
  constraints: string[];
  timeline: string | null;
  inquiryType: string | null;
}

interface InquiryMessage {
  id: string;
  role: 'visitor' | 'assistant';
  content: string;
  createdAt: string;
}

type InquiryStatus = 'active' | 'ready_for_review' | 'accepted' | 'rejected' | 'spam';

interface InquiryDetail {
  id: string;
  status: InquiryStatus;
  contactName: string | null;
  email: string | null;
  companyName: string | null;
  aiSummary: string | null;
  proposedType: string | null;
  missingInformation: string[];
  tags: string[];
  source: string | null;
  structuredData: InquiryBrief;
  messages: InquiryMessage[];
  /** Form opening question — used when the first answer has no preceding assistant message. */
  openingLabel?: string | null;
  leadId: string | null;
  createdAt: string;
}

const TERMINAL_STATUSES: InquiryStatus[] = ['accepted', 'rejected', 'spam'];

const { t, d } = useI18n();
const route = useRoute();
const router = useRouter();
const confirmAction = useConfirm();
const toast = useToastStore();

const inquiry = ref<InquiryDetail | null>(null);
const loading = ref(false);
const error = ref('');
const acting = ref(false);
const acceptedLeadId = ref<string | null>(null);

const brief = computed<InquiryBrief>(() => {
  const raw = inquiry.value?.structuredData;
  return {
    problem: raw?.problem ?? null,
    desiredOutcome: raw?.desiredOutcome ?? null,
    currentProcess: raw?.currentProcess ?? null,
    currentTools: Array.isArray(raw?.currentTools) ? raw.currentTools : [],
    teamSize: raw?.teamSize ?? null,
    constraints: Array.isArray(raw?.constraints) ? raw.constraints : [],
    timeline: raw?.timeline ?? null,
    inquiryType: raw?.inquiryType ?? null,
  };
});

/** Pair assistant questions with the following visitor answer (form Q→A, not chat). */
const qaPairs = computed(() => {
  const messages = inquiry.value?.messages ?? [];
  if (!messages.length) return [] as Array<{ question: string; answer: string }>;

  const opening = inquiry.value?.openingLabel?.trim() || t('inquiries.detail.openingFallback');
  const pairs: Array<{ question: string; answer: string }> = [];
  let i = 0;
  let usedOpening = false;

  while (i < messages.length) {
    const msg = messages[i];
    if (msg.role === 'visitor') {
      if (!usedOpening) {
        pairs.push({ question: opening, answer: msg.content });
        usedOpening = true;
        i += 1;
        continue;
      }
      pairs.push({ question: opening, answer: msg.content });
      i += 1;
      continue;
    }

    const next = messages[i + 1];
    if (next?.role === 'visitor') {
      pairs.push({ question: msg.content, answer: next.content });
      i += 2;
    } else {
      i += 1;
    }
  }

  return pairs;
});

const canAct = computed(
  () => inquiry.value !== null && !TERMINAL_STATUSES.includes(inquiry.value.status),
);

function statusLabel(status: string): string {
  const key = `inquiries.status.${status}` as Parameters<typeof t>[0];
  return t(key);
}

function statusClass(status: string): string {
  switch (status) {
    case 'ready_for_review':
      return 'bg-info/15 text-info border border-info/40';
    case 'accepted':
      return 'bg-success/15 text-success border border-success/40';
    case 'rejected':
      return 'bg-danger/15 text-danger border border-danger/40';
    case 'spam':
      return 'bg-surface-input text-text-muted border border-border';
    default:
      return 'bg-surface-input text-text-secondary border border-border';
  }
}

function formatDate(dateStr: string): string {
  return dateStr ? d(dateStr, 'dateTime') : t('inquiries.list.emptyCell');
}

async function loadInquiry() {
  loading.value = true;
  error.value = '';
  try {
    inquiry.value = await apiGet<InquiryDetail>(`/api/inquiries/${route.params.id as string}`);
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('inquiries.detail.errors.load');
  } finally {
    loading.value = false;
  }
}

async function handleAccept() {
  if (!inquiry.value?.email) return;
  acting.value = true;
  try {
    const result = await apiPost<{ leadId?: string }>(
      `/api/inquiries/${inquiry.value.id}/accept`,
      {},
    );
    toast.success(t('inquiries.actions.acceptSuccess'));
    if (result?.leadId) {
      acceptedLeadId.value = result.leadId;
      void router.push('/pipeline');
    } else {
      await loadInquiry();
    }
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : t('inquiries.actions.error'));
  } finally {
    acting.value = false;
  }
}

async function handleReject() {
  const confirmed = await confirmAction({
    title: t('inquiries.actions.rejectTitle'),
    message: t('inquiries.actions.rejectMessage'),
    confirmLabel: t('inquiries.actions.rejectConfirm'),
  });
  if (!confirmed) return;

  acting.value = true;
  try {
    await apiPost(`/api/inquiries/${inquiry.value!.id}/reject`, {});
    toast.success(t('inquiries.actions.rejectSuccess'));
    await loadInquiry();
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : t('inquiries.actions.error'));
  } finally {
    acting.value = false;
  }
}

async function handleSpam() {
  const confirmed = await confirmAction({
    title: t('inquiries.actions.spamTitle'),
    message: t('inquiries.actions.spamMessage'),
    confirmLabel: t('inquiries.actions.spamConfirm'),
  });
  if (!confirmed) return;

  acting.value = true;
  try {
    await apiPost(`/api/inquiries/${inquiry.value!.id}/spam`, {});
    toast.success(t('inquiries.actions.spamSuccess'));
    await loadInquiry();
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : t('inquiries.actions.error'));
  } finally {
    acting.value = false;
  }
}

onMounted(() => {
  void loadInquiry();
});
</script>
