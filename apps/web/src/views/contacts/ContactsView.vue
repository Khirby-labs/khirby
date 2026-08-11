<template>
  <div class="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
    <PageActions>
      <button
        v-if="listmonkEnabled"
        class="btn-ghost inline-flex h-8 items-center !px-3 !py-0 text-sm disabled:opacity-50"
        :disabled="syncing"
        @click="syncFromListmonk"
      >
        {{ syncing ? t('contacts.list.sync.running') : t('contacts.list.sync.action') }}
      </button>
    </PageActions>

    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
      <h2 class="crm-page-title">{{ t('contacts.list.title') }}</h2>
      <p v-if="!loading" class="text-sm text-text-muted tabular-nums">
        {{ t('contacts.list.resultCount', { count: total }, total) }}
      </p>
    </div>

    <p v-if="syncMessage" class="shrink-0 text-sm text-success">{{ syncMessage }}</p>

    <!-- Compact filter bar -->
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <AppSelect
        :model-value="filterPhone"
        :options="phoneOptions"
        :aria-label="t('contacts.list.filters.phone')"
        trigger-class="h-8 min-w-[8.5rem] !py-1.5"
        @update:model-value="setPhoneFilter"
      />
      <AppSelect
        :model-value="filterFormId"
        :options="formOptions"
        :aria-label="t('contacts.list.filters.form')"
        trigger-class="h-8 min-w-[10rem] !py-1.5"
        @update:model-value="setFormFilter"
      />
      <AppSelect
        v-if="listmonkEnabled"
        :model-value="filterNewsletter"
        :options="newsletterOptions"
        :aria-label="t('contacts.list.filters.newsletter')"
        trigger-class="h-8 min-w-[10rem] !py-1.5"
        @update:model-value="setNewsletterFilter"
      />
      <AppDateRangePicker
        :model-value="dateRange"
        :aria-label="t('contacts.list.filters.added')"
        :placeholder="t('contacts.list.filters.addedPlaceholder')"
        clearable
        trigger-class="h-8 min-w-[12rem] !py-1.5"
        @update:model-value="setDateRange"
      />
      <button
        v-if="hasActiveFilters"
        type="button"
        class="btn-ghost h-8 text-sm"
        @click="clearFilters"
      >
        {{ t('contacts.list.filters.clear') }}
      </button>
    </div>

    <div v-if="error" class="crm-error shrink-0">{{ error }}</div>

    <!-- Table fills remaining viewport; pageSize is derived from this slot.
         No overflow clip — leftover space below the card is intentional so the
         rounded bottom edge reads as a finished list, not a cut-off. -->
    <div ref="tableSlotRef" class="min-h-0 flex-1">
      <AppTable
        :loading="loading"
        :columns="tableColumns"
        :rows="contacts"
        :clickable="true"
        :has-actions="true"
        :sort-key="sortBy"
        :sort-dir="sortDir"
        @row-click="(row) => goToContact((row as ContactRow).id)"
        @sort-change="onSortChange"
      >
        <template #empty>
          <EmptyState
            v-if="hasActiveFilters"
            :title="t('contacts.list.empty.filteredTitle')"
            :message="t('contacts.list.empty.filteredMessage')"
          >
            <template #action>
              <button class="btn-ghost" @click="clearFilters">
                {{ t('contacts.list.filters.clear') }}
              </button>
            </template>
          </EmptyState>
          <EmptyState
            v-else
            :title="t('contacts.list.empty.noneTitle')"
            :message="t('contacts.list.empty.noneMessage')"
          >
            <template #action>
              <button class="btn-primary" @click="showCreateModal = true">
                <span aria-hidden="true">+</span> {{ t('common.actions.add') }}
              </button>
            </template>
          </EmptyState>
        </template>
        <template #cell-email="{ value }">
          <span class="block truncate text-text-primary font-medium">{{ value ?? '—' }}</span>
        </template>
        <template #cell-name="{ value }">
          <span class="block truncate">{{ value || '—' }}</span>
        </template>
        <template #cell-phone="{ value }">
          <span class="block truncate">{{ value || '—' }}</span>
        </template>
        <template #cell-createdAt="{ value }">
          <span class="whitespace-nowrap">{{ formatDate(value as string) }}</span>
        </template>
        <template v-if="listmonkEnabled" #cell-listmonk="{ row }">
          <ListmonkStatusBadge :info="(row as ContactRow).listmonk" />
        </template>
        <template #actions="{ row }">
          <div class="flex items-center justify-end gap-2 whitespace-nowrap">
            <span v-if="savedId === (row as ContactRow).id" class="text-xs text-success">
              <span aria-hidden="true">✓</span> {{ t('common.actions.saved') }}
            </span>
            <button
              class="btn-danger text-xs px-2 py-1"
              @click.stop="
                promptDelete({
                  id: (row as ContactRow).id,
                  name: (row as ContactRow).name ?? (row as ContactRow).email,
                })
              "
            >
              {{ t('common.actions.delete') }}
            </button>
          </div>
        </template>
      </AppTable>
    </div>

    <!-- Keep pagination in layout (invisible when one page) so row count stays stable -->
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

    <AppModal v-if="showCreateModal" @close="showCreateModal = false">
      <h3 class="text-base font-semibold text-text-primary mb-5">
        {{ t('contacts.list.create.title') }}
      </h3>
      <form class="space-y-3" @submit.prevent="createContact">
        <div>
          <label for="contact-email" class="crm-label">
            {{ t('contacts.list.create.email') }}
            <span class="text-text-ghost">
              <span aria-hidden="true">*</span
              ><span class="sr-only">{{ t('common.form.required') }}</span>
            </span>
          </label>
          <input
            id="contact-email"
            v-model="newContact.email"
            type="email"
            required
            class="crm-input"
          />
        </div>
        <div>
          <label for="contact-name" class="crm-label">{{ t('contacts.list.create.name') }}</label>
          <input id="contact-name" v-model="newContact.name" type="text" class="crm-input" />
        </div>
        <div>
          <label for="contact-phone" class="crm-label">{{ t('contacts.list.create.phone') }}</label>
          <input
            id="contact-phone"
            v-model="newContact.phone"
            type="tel"
            class="crm-input"
            autocomplete="tel"
          />
        </div>
        <div v-if="createError" class="text-sm text-danger">{{ createError }}</div>
        <div class="flex gap-2 pt-2">
          <button type="submit" :disabled="creating" class="btn-primary disabled:opacity-50">
            {{ creating ? t('common.actions.creating') : t('common.actions.create') }}
          </button>
          <button type="button" class="btn-ghost" @click="showCreateModal = false">
            {{ t('common.actions.cancel') }}
          </button>
        </div>
      </form>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter, type LocationQuery } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPost, apiDelete } from '../../api/client';
import { usePluginsStore } from '../../stores/plugins.store';
import PageActions from '../../components/ui/PageActions.vue';
import AppTable, { type TableSortDir } from '../../components/AppTable.vue';
import EmptyState from '../../components/ui/EmptyState.vue';
import AppPagination from '../../components/AppPagination.vue';
import AppModal from '../../components/AppModal.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import AppDateRangePicker from '../../components/ui/AppDateRangePicker.vue';
import ListmonkStatusBadge from '../../components/ListmonkStatusBadge.vue';
import { useConfirm } from '../../composables/useConfirm';
import { useToastStore } from '../../stores/toast.store';
import type { DayRange } from '../../utils/date-range';

interface ListmonkSubscriberInfo {
  subscriberId: number;
  status: string;
  lists: { id: number; name: string; subscriptionStatus: string }[];
}

interface ContactRow {
  id: string;
  email: string;
  name?: string;
  phone?: string | null;
  createdAt?: string;
  listmonk?: ListmonkSubscriberInfo | null;
}

interface ContactsResponse {
  data: ContactRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface FormListItem {
  id: string;
  name: string;
}

type SortBy = 'email' | 'name' | 'phone' | 'createdAt';
type PhoneFilter = '' | 'true' | 'false';
type NewsletterFilter = '' | 'synced' | 'missing';

const SORTABLE = new Set<SortBy>(['email', 'name', 'phone', 'createdAt']);
/** Matches AppTable header + body row (py-3 + text-sm + border). */
const TABLE_HEAD_PX = 41;
/** Slightly above bare text rows — newsletter badges need the extra line box. */
const TABLE_ROW_PX = 49;
/** Keep the card's bottom radius + a breath of space above pagination visible. */
const TABLE_FIT_SLACK_PX = 16;
const PAGE_SIZE_MIN = 5;
const PAGE_SIZE_MAX = 60;

const { t, d, n } = useI18n();
const route = useRoute();
const router = useRouter();
const pluginsStore = usePluginsStore();
const askConfirm = useConfirm();
const toast = useToastStore();

const contacts = ref<ContactRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(PAGE_SIZE_MIN);
const sortBy = ref<SortBy>('createdAt');
const sortDir = ref<TableSortDir>('desc');
const filterPhone = ref<PhoneFilter>('');
const filterFormId = ref('');
const filterNewsletter = ref<NewsletterFilter>('');
const dateRange = ref<DayRange>({ from: null, to: null });
const forms = ref<FormListItem[]>([]);

const loading = ref(false);
const error = ref('');
const syncing = ref(false);
const syncMessage = ref('');
const tableSlotRef = ref<HTMLElement | null>(null);

const showCreateModal = ref(false);
const newContact = ref({ email: '', name: '', phone: '' });
const creating = ref(false);
const createError = ref('');
const savedId = ref<string | null>(null);

const listmonkEnabled = computed(() =>
  pluginsStore.plugins.some((p) => p.name === 'crm_listmonk' && p.enabled),
);

const phoneOptions = computed(() => [
  { value: '', label: t('contacts.list.filters.phoneAny') },
  { value: 'true', label: t('contacts.list.filters.phoneYes') },
  { value: 'false', label: t('contacts.list.filters.phoneNo') },
]);

const newsletterOptions = computed(() => [
  { value: '', label: t('contacts.list.filters.newsletterAny') },
  { value: 'synced', label: t('contacts.list.filters.newsletterSynced') },
  { value: 'missing', label: t('contacts.list.filters.newsletterMissing') },
]);

const formOptions = computed(() => [
  { value: '', label: t('contacts.list.filters.formAny') },
  ...forms.value.map((f) => ({ value: f.id, label: f.name })),
]);

const hasActiveFilters = computed(
  () =>
    Boolean(filterPhone.value) ||
    Boolean(filterFormId.value) ||
    Boolean(filterNewsletter.value) ||
    Boolean(dateRange.value.from && dateRange.value.to),
);

const tableColumns = computed(() => {
  const base = [
    { key: 'email', label: t('contacts.list.columns.email'), sortable: true },
    { key: 'name', label: t('contacts.list.columns.name'), sortable: true },
    { key: 'phone', label: t('contacts.list.columns.phone'), sortable: true },
  ];
  const createdAt = {
    key: 'createdAt',
    label: t('contacts.list.columns.createdAt'),
    sortable: true,
  };
  return listmonkEnabled.value
    ? [...base, { key: 'listmonk', label: t('contacts.list.columns.newsletter') }, createdAt]
    : [...base, createdAt];
});

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

let fetchSeq = 0;
let listReady = false;
let resizeObserver: ResizeObserver | null = null;

function parseListState(q: LocationQuery) {
  const sort =
    typeof q.sort === 'string' && SORTABLE.has(q.sort as SortBy) ? (q.sort as SortBy) : 'createdAt';
  const dir: TableSortDir = q.dir === 'asc' ? 'asc' : 'desc';
  const p = Math.max(1, Number(q.page) || 1);
  const phone: PhoneFilter =
    q.phone === 'true' || q.phone === 'false' ? (q.phone as PhoneFilter) : '';
  const form = typeof q.form === 'string' ? q.form : '';
  const newsletter: NewsletterFilter =
    q.newsletter === 'synced' || q.newsletter === 'missing'
      ? (q.newsletter as NewsletterFilter)
      : '';
  const from = typeof q.from === 'string' ? q.from : null;
  const to = typeof q.to === 'string' ? q.to : null;
  return { sort, dir, p, phone, form, newsletter, from, to };
}

function buildQuery(
  overrides: {
    sort?: SortBy;
    dir?: TableSortDir;
    page?: number;
    phone?: PhoneFilter;
    form?: string;
    newsletter?: NewsletterFilter;
    from?: string | null;
    to?: string | null;
  } = {},
): Record<string, string> {
  const sort = overrides.sort ?? sortBy.value;
  const dir = overrides.dir ?? sortDir.value;
  const p = overrides.page ?? page.value;
  const phone = overrides.phone ?? filterPhone.value;
  const form = overrides.form ?? filterFormId.value;
  const newsletter = overrides.newsletter ?? filterNewsletter.value;
  const from = overrides.from !== undefined ? overrides.from : dateRange.value.from;
  const to = overrides.to !== undefined ? overrides.to : dateRange.value.to;

  const query: Record<string, string> = {};
  if (sort !== 'createdAt') query.sort = sort;
  if (dir !== 'desc' || sort !== 'createdAt') query.dir = dir;
  if (p > 1) query.page = String(p);
  if (phone) query.phone = phone;
  if (form) query.form = form;
  if (listmonkEnabled.value && newsletter) query.newsletter = newsletter;
  if (from && to) {
    query.from = from;
    query.to = to;
  }
  return query;
}

function queryEqual(a: Record<string, string>, b: LocationQuery): boolean {
  const bFlat: Record<string, string> = {};
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'string' && k !== 'new') bFlat[k] = v;
  }
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(bFlat).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => a[k] === bFlat[k]);
}

function replaceListQuery(overrides: Parameters<typeof buildQuery>[0] = {}) {
  const query = buildQuery(overrides);
  if (queryEqual(query, route.query)) return;
  void router.replace({ query });
}

function applyRouteToState() {
  const s = parseListState(route.query);
  sortBy.value = s.sort;
  sortDir.value = s.dir;
  page.value = s.p;
  filterPhone.value = s.phone;
  filterFormId.value = s.form;
  filterNewsletter.value = listmonkEnabled.value ? s.newsletter : '';
  dateRange.value = { from: s.from, to: s.to };
}

/**
 * Fit rows to the table slot height (flex remaining space). Falls back to
 * viewport math when the slot has not been sized yet. Prefer measured DOM
 * row height when rows are already rendered (badges make rows taller).
 */
function measurePageSize(): number {
  const el = tableSlotRef.value;
  if (!el) return PAGE_SIZE_MIN;

  let available = el.clientHeight;
  if (available < TABLE_HEAD_PX + TABLE_ROW_PX) {
    const top = el.getBoundingClientRect().top;
    const paginationEl = el.nextElementSibling as HTMLElement | null;
    const bottomReserve = paginationEl?.offsetHeight ?? 56;
    available = window.innerHeight - top - bottomReserve;
  }

  const headEl = el.querySelector('thead tr') as HTMLElement | null;
  const rowEl = el.querySelector('tbody tr') as HTMLElement | null;
  const headH = headEl?.getBoundingClientRect().height || TABLE_HEAD_PX;
  const rowH = rowEl?.getBoundingClientRect().height || TABLE_ROW_PX;

  const usable = available - headH - TABLE_FIT_SLACK_PX;
  if (usable < rowH) return PAGE_SIZE_MIN;
  const rows = Math.floor(usable / rowH);
  return Math.min(PAGE_SIZE_MAX, Math.max(PAGE_SIZE_MIN, rows));
}

let resizeTimer: ReturnType<typeof setTimeout> | null = null;

function syncPageSizeFromLayout() {
  if (!listReady) return;
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    const next = measurePageSize();
    if (next === pageSize.value) return;
    pageSize.value = next;
    const maxPage = Math.max(1, Math.ceil(total.value / next) || 1);
    if (page.value > maxPage) {
      replaceListQuery({ page: maxPage });
      return;
    }
    void fetchContacts();
  }, 100);
}

function goToPage(p: number) {
  const clamped = Math.min(totalPages.value, Math.max(1, p));
  replaceListQuery({ page: clamped });
}

function setPhoneFilter(value: string) {
  replaceListQuery({ phone: value as PhoneFilter, page: 1 });
}

function setFormFilter(value: string) {
  replaceListQuery({ form: value, page: 1 });
}

function setNewsletterFilter(value: string) {
  replaceListQuery({ newsletter: value as NewsletterFilter, page: 1 });
}

function setDateRange(value: DayRange) {
  replaceListQuery({ from: value.from, to: value.to, page: 1 });
}

function clearFilters() {
  replaceListQuery({
    phone: '',
    form: '',
    newsletter: '',
    from: null,
    to: null,
    page: 1,
  });
}

function onSortChange(payload: { key: string; dir: TableSortDir }) {
  if (!SORTABLE.has(payload.key as SortBy)) return;
  replaceListQuery({ sort: payload.key as SortBy, dir: payload.dir, page: 1 });
}

watch(
  () => route.query,
  () => {
    if (!listReady) return;
    if (route.query.new) {
      showCreateModal.value = true;
      const { new: _n, ...rest } = route.query;
      void router.replace({ query: rest });
      return;
    }
    applyRouteToState();
    void fetchContacts();
  },
);

onMounted(async () => {
  if (!pluginsStore.plugins.length) {
    try {
      await pluginsStore.fetchPlugins();
    } catch {
      /* contacts work without plugin metadata */
    }
  }
  try {
    forms.value = await apiGet<FormListItem[]>('/api/forms');
  } catch {
    forms.value = [];
  }

  if (route.query.new) {
    showCreateModal.value = true;
    const { new: _n, ...rest } = route.query;
    await router.replace({ query: rest });
  }

  applyRouteToState();
  await nextTick();
  pageSize.value = measurePageSize();
  listReady = true;
  await fetchContacts();

  if (tableSlotRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      syncPageSizeFromLayout();
    });
    resizeObserver.observe(tableSlotRef.value);
  }
  window.addEventListener('resize', syncPageSizeFromLayout);
});

onBeforeUnmount(() => {
  listReady = false;
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('resize', syncPageSizeFromLayout);
});

async function enrichWithListmonk(): Promise<void> {
  if (!listmonkEnabled.value || contacts.value.length === 0) return;

  const emails = contacts.value.map((c) => c.email);
  try {
    const lookup = await apiPost<Record<string, ListmonkSubscriberInfo>>(
      '/api/plugins/listmonk/subscribers/lookup',
      { emails },
    );
    contacts.value = contacts.value.map((contact) => ({
      ...contact,
      listmonk: lookup[contact.email.toLowerCase()] ?? null,
    }));
  } catch {
    contacts.value = contacts.value.map((contact) => ({
      ...contact,
      listmonk: null,
    }));
  }
}

async function fetchContacts(opts: { skipRefit?: boolean } = {}) {
  const seq = ++fetchSeq;
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize.value),
      sortBy: sortBy.value,
      sortDir: sortDir.value,
    });
    if (filterPhone.value) params.set('hasPhone', filterPhone.value);
    if (filterFormId.value) params.set('formId', filterFormId.value);
    if (listmonkEnabled.value && filterNewsletter.value) {
      params.set('newsletter', filterNewsletter.value);
    }
    if (dateRange.value.from && dateRange.value.to) {
      params.set('createdFrom', dateRange.value.from);
      params.set('createdTo', dateRange.value.to);
    }
    const res = await apiGet<ContactsResponse>(`/api/contacts?${params}`);
    if (seq !== fetchSeq) return;
    contacts.value = res.data;
    total.value = res.total;
    await enrichWithListmonk();
    if (seq !== fetchSeq) return;

    // After badges render, rows can grow — shrink pageSize once so the card
    // bottom stays fully visible instead of looking clipped.
    if (!opts.skipRefit && listReady) {
      await nextTick();
      const fitted = measurePageSize();
      if (fitted < pageSize.value) {
        pageSize.value = fitted;
        await fetchContacts({ skipRefit: true });
      }
    }
  } catch (e: unknown) {
    if (seq !== fetchSeq) return;
    error.value = e instanceof Error ? e.message : t('contacts.list.errors.load');
  } finally {
    if (seq === fetchSeq) loading.value = false;
  }
}

async function syncFromListmonk() {
  syncing.value = true;
  syncMessage.value = '';
  error.value = '';
  try {
    const result = await apiPost<{ imported: number; updated: number; total: number }>(
      '/api/plugins/listmonk/subscribers/sync',
      {},
    );
    syncMessage.value = t(
      'contacts.list.sync.result',
      {
        total: n(result.total, 'integer'),
        imported: n(result.imported, 'integer'),
        updated: n(result.updated, 'integer'),
      },
      result.total,
    );
    setTimeout(() => {
      syncMessage.value = '';
    }, 5000);
    await fetchContacts();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('contacts.list.errors.sync');
  } finally {
    syncing.value = false;
  }
}

function formatDate(dateStr: string): string {
  return dateStr ? d(dateStr, 'dateShort') : '—';
}

function goToContact(id: string) {
  router.push(`/contacts/${id}`);
}

async function promptDelete(item: { id: string; name: string }) {
  const confirmed = await askConfirm({
    title: t('contacts.list.delete.title'),
    message: t('contacts.list.delete.message', { name: item.name }),
    confirmLabel: t('contacts.list.delete.confirm'),
  });
  if (!confirmed) return;

  try {
    await apiDelete(`/api/contacts/${item.id}`);
    await fetchContacts();
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : t('contacts.list.errors.delete'));
  }
}

async function createContact() {
  createError.value = '';
  creating.value = true;
  try {
    const created = await apiPost<ContactRow>('/api/contacts', {
      email: newContact.value.email,
      ...(newContact.value.name ? { name: newContact.value.name } : {}),
      ...(newContact.value.phone.trim() ? { phone: newContact.value.phone.trim() } : {}),
    });
    newContact.value = { email: '', name: '', phone: '' };
    showCreateModal.value = false;
    savedId.value = created.id;
    setTimeout(() => (savedId.value = null), 3000);
    await fetchContacts();
  } catch (e: unknown) {
    createError.value = e instanceof Error ? e.message : t('contacts.list.errors.create');
  } finally {
    creating.value = false;
  }
}
</script>
