<template>
  <div class="space-y-6 max-w-2xl">
    <div class="flex items-center justify-between">
      <h2 class="crm-page-title">{{ t('newsletter.list.title') }}</h2>
    </div>

    <div v-if="error" class="crm-error">
      {{ error }}
    </div>
    <AppTable
      :loading="loading"
      :columns="columns"
      :rows="lists"
      :has-actions="true"
      :empty-text="t('newsletter.list.empty')"
    >
      <template #cell-syncedAt="{ value }">
        {{ value ? formatDate(value as string) : t('newsletter.list.never') }}
      </template>
      <template #actions="{ row }">
        <div class="flex items-center justify-end gap-2">
          <span v-if="savedId === (row as NewsletterList).id" class="text-xs text-success">
            <span aria-hidden="true">✓</span> {{ t('common.actions.saved') }}
          </span>
          <button
            class="btn-danger text-xs px-2 py-1"
            @click="
              promptDelete({ id: (row as NewsletterList).id, name: (row as NewsletterList).name })
            "
          >
            {{ t('common.actions.delete') }}
          </button>
        </div>
      </template>
    </AppTable>

    <!-- Add list form -->
    <div class="crm-panel p-5">
      <h3 class="text-sm font-semibold text-text-secondary mb-4">
        {{ t('newsletter.add.title') }}
      </h3>
      <form @submit.prevent="addList" class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="nl-list-id" class="block text-xs text-text-ghost mb-1">
              {{ t('newsletter.add.listId') }}
              <span class="text-text-ghost">
                <span aria-hidden="true">*</span
                ><span class="sr-only">{{ t('common.form.required') }}</span>
              </span>
            </label>
            <input
              id="nl-list-id"
              v-model.number="newList.listmonkListId"
              type="number"
              required
              min="1"
              class="w-full px-3 py-2 rounded bg-surface-input border border-border text-text-primary text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label for="nl-name" class="block text-xs text-text-ghost mb-1">
              {{ t('newsletter.add.name') }}
              <span class="text-text-ghost">
                <span aria-hidden="true">*</span
                ><span class="sr-only">{{ t('common.form.required') }}</span>
              </span>
            </label>
            <input
              id="nl-name"
              v-model="newList.name"
              type="text"
              required
              class="w-full px-3 py-2 rounded bg-surface-input border border-border text-text-primary text-sm focus:outline-none focus:border-accent"
            />
          </div>
        </div>
        <div v-if="addError" class="text-sm text-danger">{{ addError }}</div>
        <div class="flex items-center gap-2">
          <button type="submit" :disabled="adding" class="btn-primary">
            {{ adding ? t('newsletter.add.submitting') : t('newsletter.add.submit') }}
          </button>
          <span v-if="savedId" class="text-xs text-success ml-2">
            <span aria-hidden="true">✓</span> {{ t('common.actions.saved') }}
          </span>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPost, apiDelete } from '../../api/client';
import AppTable, { type TableColumn } from '../../components/AppTable.vue';
import { useConfirm } from '../../composables/useConfirm';
import { useToastStore } from '../../stores/toast.store';

interface NewsletterList {
  id: string;
  listmonkListId: number;
  name: string;
  syncedAt?: string;
}

const { t, d } = useI18n();
const askConfirm = useConfirm();
const toast = useToastStore();

const lists = ref<NewsletterList[]>([]);
const loading = ref(false);
const error = ref('');

const newList = ref({ listmonkListId: '' as unknown as number, name: '' });
const adding = ref(false);
const addError = ref('');
const savedId = ref<string | null>(null);

/**
 * Resolved inside the component: a module-level const runs before app.use(i18n),
 * so t() would return the key and freeze the boot locale (.claude/rules/i18n.md).
 */
const columns = computed<TableColumn[]>(() => [
  { key: 'listmonkListId', label: t('newsletter.list.columns.listmonkId') },
  { key: 'name', label: t('newsletter.list.columns.name') },
  { key: 'syncedAt', label: t('newsletter.list.columns.syncedAt') },
]);

onMounted(() => fetchLists());

async function fetchLists() {
  loading.value = true;
  error.value = '';
  try {
    lists.value = await apiGet<NewsletterList[]>('/api/newsletter/lists');
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('newsletter.errors.load');
  } finally {
    loading.value = false;
  }
}

/** Named format, no inline locale: 'en-US' used to be hardcoded here. */
function formatDate(dateStr: string): string {
  return dateStr ? d(dateStr, 'dateTime') : '—';
}

/**
 * useConfirm rather than a hand-rolled modal (.claude/rules/web.md §Components).
 * It also retires a sentence that was split across three DOM nodes, which no
 * inflected language can reassemble.
 */
async function promptDelete(item: { id: string; name: string }) {
  const confirmed = await askConfirm({
    title: t('newsletter.list.delete.title'),
    message: t('newsletter.list.delete.message', { name: item.name }),
    confirmLabel: t('newsletter.list.delete.confirm'),
  });
  if (!confirmed) return;

  try {
    await apiDelete(`/api/newsletter/lists/${item.id}`);
    await fetchLists();
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : t('newsletter.errors.delete'));
  }
}

async function addList() {
  addError.value = '';
  adding.value = true;
  try {
    const created = await apiPost<NewsletterList>('/api/newsletter/lists', {
      listmonkListId: newList.value.listmonkListId,
      name: newList.value.name,
    });
    newList.value = { listmonkListId: '' as unknown as number, name: '' };
    savedId.value = created.id;
    setTimeout(() => (savedId.value = null), 3000);
    await fetchLists();
  } catch (e: unknown) {
    addError.value = e instanceof Error ? e.message : t('newsletter.errors.add');
  } finally {
    adding.value = false;
  }
}
</script>
