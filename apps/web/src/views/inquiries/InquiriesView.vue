<template>
  <div class="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
      <h2 class="crm-page-title">{{ t('inquiries.list.title') }}</h2>
      <p v-if="!loading" class="text-sm text-text-muted tabular-nums">
        {{ t('inquiries.list.resultCount', { count: total }, total) }}
      </p>
    </div>

    <!-- Filter bar -->
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <AppSelect
        :model-value="filterStatus"
        :options="statusOptions"
        :aria-label="t('inquiries.list.columns.status')"
        trigger-class="h-8 min-w-[10rem] !py-1.5"
        @update:model-value="setStatusFilter"
      />
      <input
        :value="filterQ"
        type="search"
        class="crm-input h-8 w-48 !py-1.5"
        :placeholder="t('inquiries.list.filters.searchPlaceholder')"
        :aria-label="t('inquiries.list.filters.searchPlaceholder')"
        @change="setQFilter(($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="hasActiveFilters"
        type="button"
        class="btn-ghost h-8 text-sm"
        @click="clearFilters"
      >
        {{ t('inquiries.list.filters.clear') }}
      </button>
    </div>

    <div v-if="error" class="crm-error shrink-0">{{ error }}</div>

    <div class="min-h-0 flex-1">
      <AppTable
        :loading="loading"
        :columns="tableColumns"
        :rows="inquiries"
        :clickable="true"
        resizable
        storage-key="inquiries-table-cols"
        @row-click="(row) => goToInquiry((row as InquiryRow).id)"
      >
        <template #empty>
          <EmptyState
            v-if="hasActiveFilters"
            :title="t('inquiries.list.empty.filteredTitle')"
            :message="t('inquiries.list.empty.filteredMessage')"
          >
            <template #action>
              <button class="btn-ghost" @click="clearFilters">
                {{ t('inquiries.list.filters.clear') }}
              </button>
            </template>
          </EmptyState>
          <EmptyState
            v-else
            :title="t('inquiries.list.empty.noneTitle')"
            :message="t('inquiries.list.empty.noneMessage')"
          />
        </template>

        <template #cell-status="{ value }">
          <span
            class="inline-flex max-w-full items-center truncate px-1.5 py-0.5 text-[10px] rounded font-medium"
            :class="statusClass(value as string)"
          >
            {{ statusLabel(value as string) }}
          </span>
        </template>

        <template #cell-aiSummary="{ value }">
          <span class="block truncate text-text-secondary" :title="(value as string) || undefined">
            {{ (value as string) || t('inquiries.list.emptyCell') }}
          </span>
        </template>
        <template #cell-proposedType="{ value }">
          <span class="block truncate text-text-secondary">
            {{ (value as string) || t('inquiries.list.emptyCell') }}
          </span>
        </template>
        <template #cell-tags="{ value }">
          <div v-if="(value as string[]).length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in value as string[]"
              :key="tag"
              class="inline-flex max-w-full items-center truncate px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-raise2 text-text-secondary border border-border"
              :title="tag"
            >
              {{ tag }}
            </span>
          </div>
          <span v-else class="text-text-secondary">{{ t('inquiries.list.emptyCell') }}</span>
        </template>
        <template #cell-contactName="{ value }">
          <span class="block truncate">{{
            (value as string) || t('inquiries.list.emptyCell')
          }}</span>
        </template>
        <template #cell-companyName="{ value }">
          <span class="block truncate text-text-secondary">
            {{ (value as string) || t('inquiries.list.emptyCell') }}
          </span>
        </template>

        <template #cell-createdAt="{ value }">
          <span class="whitespace-nowrap text-text-secondary">{{
            formatDate(value as string)
          }}</span>
        </template>
      </AppTable>
    </div>

    <!-- Pagination — invisible when one page -->
    <div
      class="shrink-0"
      :class="totalPages > 1 ? '' : 'invisible pointer-events-none'"
      :aria-hidden="totalPages <= 1"
    >
      <AppPagination
        :current-page="page"
        :total-pages="Math.max(totalPages, 1)"
        @prev="goToPage(page - 1)"
        @next="goToPage(page + 1)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet } from '../../api/client';
import AppTable from '../../components/AppTable.vue';
import EmptyState from '../../components/ui/EmptyState.vue';
import AppPagination from '../../components/AppPagination.vue';
import AppSelect from '../../components/ui/AppSelect.vue';

const ALL_STATUSES = '__all__';
const DEFAULT_STATUS = 'ready_for_review';
const PAGE_SIZE = 20;

type InquiryStatus = 'active' | 'ready_for_review' | 'accepted' | 'rejected' | 'spam';

interface InquiryRow {
  id: string;
  status: InquiryStatus;
  aiSummary: string | null;
  contactName: string | null;
  email: string | null;
  companyName: string | null;
  proposedType: string | null;
  tags: string[];
  source: string | null;
  createdAt: string;
}

interface InquiriesResponse {
  data: InquiryRow[];
  total: number;
  page: number;
  pageSize: number;
}

const { t, d } = useI18n();
const route = useRoute();
const router = useRouter();

const inquiries = ref<InquiryRow[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const error = ref('');

const filterStatus = ref<string>(DEFAULT_STATUS);
const filterQ = ref('');

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

const hasActiveFilters = computed(
  () => filterStatus.value !== DEFAULT_STATUS || Boolean(filterQ.value),
);

const statusOptions = computed(() => [
  { value: ALL_STATUSES, label: t('inquiries.list.filters.statusAll') },
  { value: 'active', label: t('inquiries.list.filters.statusActive') },
  { value: 'ready_for_review', label: t('inquiries.list.filters.statusReadyForReview') },
  { value: 'accepted', label: t('inquiries.list.filters.statusAccepted') },
  { value: 'rejected', label: t('inquiries.list.filters.statusRejected') },
  { value: 'spam', label: t('inquiries.list.filters.statusSpam') },
]);

const tableColumns = computed(() => [
  { key: 'status', label: t('inquiries.list.columns.status'), width: 108, minWidth: 72 },
  { key: 'aiSummary', label: t('inquiries.list.columns.summary'), width: 280, minWidth: 120 },
  { key: 'contactName', label: t('inquiries.list.columns.contactName'), width: 140, minWidth: 88 },
  { key: 'email', label: t('inquiries.list.columns.email'), width: 168, minWidth: 100 },
  { key: 'companyName', label: t('inquiries.list.columns.companyName'), width: 132, minWidth: 80 },
  {
    key: 'proposedType',
    label: t('inquiries.list.columns.proposedType'),
    width: 100,
    minWidth: 72,
  },
  { key: 'tags', label: t('inquiries.list.columns.tags'), width: 168, minWidth: 96 },
  { key: 'createdAt', label: t('inquiries.list.columns.createdAt'), width: 148, minWidth: 120 },
]);

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

function parseState() {
  const q = route.query;
  const status =
    typeof q.status === 'string' && q.status !== ALL_STATUSES ? q.status : DEFAULT_STATUS;
  const search = typeof q.q === 'string' ? q.q : '';
  const p = Math.max(1, Number(q.page) || 1);
  return { status, search, p };
}

function buildQuery(overrides: { status?: string; q?: string; page?: number } = {}) {
  const status = overrides.status !== undefined ? overrides.status : filterStatus.value;
  const q = overrides.q !== undefined ? overrides.q : filterQ.value;
  const p = overrides.page !== undefined ? overrides.page : page.value;
  const query: Record<string, string> = {};
  if (status && status !== DEFAULT_STATUS) query.status = status;
  if (q) query.q = q;
  if (p > 1) query.page = String(p);
  return query;
}

function applyRouteToState() {
  const { status, search, p } = parseState();
  filterStatus.value = status || DEFAULT_STATUS;
  filterQ.value = search;
  page.value = p;
}

function replaceQuery(overrides: Parameters<typeof buildQuery>[0] = {}) {
  void router.replace({ query: buildQuery(overrides) });
}

function setStatusFilter(value: string) {
  const status = value === ALL_STATUSES ? '' : value;
  replaceQuery({ status: status || DEFAULT_STATUS, page: 1 });
}

function setQFilter(value: string) {
  replaceQuery({ q: value, page: 1 });
}

function clearFilters() {
  replaceQuery({ status: DEFAULT_STATUS, q: '', page: 1 });
}

function goToPage(p: number) {
  const clamped = Math.min(totalPages.value, Math.max(1, p));
  replaceQuery({ page: clamped });
}

function goToInquiry(id: string) {
  void router.push(`/inquiries/${id}`);
}

let fetchSeq = 0;

async function fetchInquiries() {
  const seq = ++fetchSeq;
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(PAGE_SIZE),
    });
    if (filterStatus.value && filterStatus.value !== ALL_STATUSES) {
      params.set('status', filterStatus.value);
    }
    if (filterQ.value) params.set('q', filterQ.value);

    const res = await apiGet<InquiriesResponse>(`/api/inquiries?${params}`);
    if (seq !== fetchSeq) return;
    inquiries.value = res.data;
    total.value = res.total;
  } catch (e: unknown) {
    if (seq !== fetchSeq) return;
    error.value = e instanceof Error ? e.message : t('inquiries.list.errors.load');
  } finally {
    if (seq === fetchSeq) loading.value = false;
  }
}

watch(
  () => route.query,
  () => {
    applyRouteToState();
    void fetchInquiries();
  },
);

function onInquiryUpdated() {
  void fetchInquiries();
}

onMounted(() => {
  applyRouteToState();
  void fetchInquiries();
  window.addEventListener('inquiry-updated', onInquiryUpdated);
});

onBeforeUnmount(() => {
  window.removeEventListener('inquiry-updated', onInquiryUpdated);
});
</script>
