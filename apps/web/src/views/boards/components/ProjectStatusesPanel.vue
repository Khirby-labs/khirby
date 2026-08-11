<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-text-muted">{{ t('boards.statuses.hint') }}</p>
      <button type="button" class="btn-primary text-sm px-3 py-1.5" @click="showAdd = true">
        + {{ t('boards.statuses.add') }}
      </button>
    </div>

    <div v-if="loading" class="space-y-2">
      <div v-for="i in 4" :key="i" class="h-14 animate-pulse rounded-lg bg-surface-raise" />
    </div>

    <div v-else class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
      <div
        v-for="(status, index) in statuses"
        :key="status.id"
        class="crm-panel flex flex-wrap items-center gap-3 p-3"
      >
        <div
          class="h-3.5 w-3.5 shrink-0 rounded-full"
          :style="{ backgroundColor: toPaletteColor(status.color) }"
        />

        <input
          :value="status.name"
          type="text"
          class="min-w-[8rem] flex-1 rounded border border-border bg-surface-input px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
          :aria-label="t('boards.statuses.nameAria')"
          @change="updateName(status.id, ($event.target as HTMLInputElement).value)"
        />

        <AppSelect
          :model-value="toPaletteColor(status.color)"
          :options="colorOptions"
          :aria-label="t('boards.statuses.colorAria')"
          trigger-class="w-32 py-1"
          @change="(v) => updateColor(status.id, v)"
        />
        <AppCheckbox
          :model-value="status.isBacklog"
          class="text-xs"
          @update:model-value="(v) => toggleFlag(status, 'isBacklog', v)"
        >
          {{ t('boards.statuses.backlog') }}
        </AppCheckbox>
        <AppCheckbox
          :model-value="status.isDone"
          class="text-xs"
          @update:model-value="(v) => toggleFlag(status, 'isDone', v)"
        >
          {{ t('boards.statuses.done') }}
        </AppCheckbox>
        <AppCheckbox
          :model-value="status.isCanceled"
          class="text-xs"
          @update:model-value="(v) => toggleFlag(status, 'isCanceled', v)"
        >
          {{ t('boards.statuses.canceled') }}
        </AppCheckbox>

        <div class="ml-auto flex items-center gap-1">
          <AppTooltip :label="t('boards.statuses.moveUp')">
            <button
              type="button"
              class="rounded bg-surface-input px-2 py-1 text-xs hover:bg-surface-hover disabled:opacity-40"
              :disabled="index === 0"
              :aria-label="t('boards.statuses.moveUpAria')"
              @click="moveStatus(index, -1)"
            >
              ↑
            </button>
          </AppTooltip>
          <AppTooltip :label="t('boards.statuses.moveDown')">
            <button
              type="button"
              class="rounded bg-surface-input px-2 py-1 text-xs hover:bg-surface-hover disabled:opacity-40"
              :disabled="index === statuses.length - 1"
              :aria-label="t('boards.statuses.moveDownAria')"
              @click="moveStatus(index, 1)"
            >
              ↓
            </button>
          </AppTooltip>
          <button
            type="button"
            class="px-2 py-1 text-xs text-danger hover:text-danger disabled:opacity-40"
            :disabled="statuses.length <= 1"
            @click="removeStatus(status)"
          >
            {{ t('common.actions.delete') }}
          </button>
        </div>
      </div>
    </div>

    <AppModal v-if="showAdd" :title="t('boards.statuses.newTitle')" @close="showAdd = false">
      <form class="space-y-3" @submit.prevent="handleAdd">
        <input
          v-model="newStatus.name"
          type="text"
          required
          :placeholder="t('boards.statuses.namePlaceholder')"
          class="crm-input w-full focus:border-accent focus:outline-none"
        />
        <AppSelect
          v-model="newStatus.color"
          :options="colorOptions"
          :aria-label="t('boards.statuses.colorAria')"
          trigger-class="w-full"
        />
        <button type="submit" class="btn-primary">
          {{ t('common.actions.create') }}
        </button>
      </form>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppModal from '../../../components/AppModal.vue';
import AppSelect from '../../../components/ui/AppSelect.vue';
import AppCheckbox from '../../../components/ui/AppCheckbox.vue';
import AppTooltip from '../../../components/ui/AppTooltip.vue';
import { useBoardsStore, type TbStatus } from '../../../stores/boards.store';
import { useToastStore } from '../../../stores/toast.store';
import { useConfirm } from '../../../composables/useConfirm';

const props = defineProps<{ projectId: string }>();

const { t } = useI18n();
const store = useBoardsStore();
const toast = useToastStore();
const askConfirm = useConfirm();

const statuses = ref<TbStatus[]>([]);
const loading = ref(false);
const showAdd = ref(false);
const newStatus = ref({ name: '', color: '#6F95C9' });

/** Stage palette — docs/DESIGN-SYSTEM.md §2.6 */
const colorPresets = [
  { key: 'blue', value: '#6F95C9' },
  { key: 'amber', value: '#D7A445' },
  { key: 'orange', value: '#DD8046' },
  { key: 'green', value: '#74B98A' },
  { key: 'red', value: '#E06055' },
  { key: 'purple', value: '#A78BC9' },
  { key: 'gray', value: '#8F949C' },
] as const;

/**
 * Pre-design-system Tailwind hexes from early board defaults — fold into the
 * palette so the picker never lists the same label twice.
 */
const LEGACY_TO_PALETTE: Record<string, string> = {
  '#94a3b8': '#8F949C',
  '#3b82f6': '#6F95C9',
  '#f59e0b': '#D7A445',
  '#22c55e': '#74B98A',
  '#6366f1': '#A78BC9',
};

function normalizeHex(color: string): string {
  return color.trim().toLowerCase();
}

/** Canonical palette hex for select value; unknown colors pass through. */
function toPaletteColor(hex: string): string {
  const n = normalizeHex(hex);
  const preset = colorPresets.find((c) => normalizeHex(c.value) === n);
  if (preset) return preset.value;
  return LEGACY_TO_PALETTE[n] ?? hex;
}

const colorOptions = computed(() => {
  const paletteHexes = new Set(colorPresets.map((c) => normalizeHex(c.value)));
  // Truly unknown custom colors only — never re-add mapped legacy duplicates.
  const custom = statuses.value
    .map((s) => s.color)
    .filter((c): c is string => {
      if (!c) return false;
      const canonical = toPaletteColor(c);
      return normalizeHex(canonical) === normalizeHex(c) && !paletteHexes.has(normalizeHex(c));
    })
    .filter((c, i, arr) => arr.findIndex((x) => normalizeHex(x) === normalizeHex(c)) === i)
    .map((c) => ({ value: c, label: c, color: c }));

  return [
    ...colorPresets.map((c) => ({
      value: c.value,
      label: t(`boards.statuses.colors.${c.key}`),
      color: c.value,
    })),
    ...custom,
  ];
});

async function reload() {
  if (!props.projectId) return;
  loading.value = true;
  try {
    statuses.value = await store.fetchProjectStatuses(props.projectId);
  } catch {
    toast.error(t('boards.errors.load'));
  } finally {
    loading.value = false;
  }
}

async function updateName(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    const updated = await store.updateStatus(id, { name: trimmed });
    statuses.value = statuses.value.map((s) => (s.id === id ? updated : s));
  } catch {
    toast.error(t('boards.errors.save'));
    await reload();
  }
}

async function updateColor(id: string, color: string) {
  try {
    const updated = await store.updateStatus(id, { color });
    statuses.value = statuses.value.map((s) => (s.id === id ? updated : s));
  } catch {
    toast.error(t('boards.errors.save'));
  }
}

async function toggleFlag(
  status: TbStatus,
  field: 'isBacklog' | 'isDone' | 'isCanceled',
  checked: boolean,
) {
  try {
    const patch: { isBacklog?: boolean; isDone?: boolean; isCanceled?: boolean } = {
      [field]: checked,
    };
    if (field === 'isBacklog' && checked) {
      patch.isDone = false;
      patch.isCanceled = false;
    }
    if (field === 'isDone' && checked) {
      patch.isBacklog = false;
      patch.isCanceled = false;
    }
    if (field === 'isCanceled' && checked) {
      patch.isBacklog = false;
      patch.isDone = false;
    }
    await store.updateStatus(status.id, patch);
    await reload();
  } catch {
    toast.error(t('boards.errors.save'));
  }
}

async function moveStatus(index: number, delta: number) {
  const ids = statuses.value.map((s) => s.id);
  const target = index + delta;
  if (target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  try {
    statuses.value = await store.reorderStatuses(props.projectId, ids);
  } catch {
    toast.error(t('boards.errors.save'));
    await reload();
  }
}

async function removeStatus(status: TbStatus) {
  const confirmed = await askConfirm({
    title: t('boards.statuses.delete.title'),
    message: t('boards.statuses.delete.message', { name: status.name }),
    confirmLabel: t('boards.statuses.delete.confirm'),
  });
  if (!confirmed) return;
  try {
    await store.deleteStatus(status.id);
    await reload();
  } catch {
    toast.error(t('boards.errors.deleteStatus'));
  }
}

async function handleAdd() {
  const name = newStatus.value.name.trim();
  if (!name) return;
  try {
    await store.createStatus({
      projectId: props.projectId,
      name,
      color: newStatus.value.color,
    });
    newStatus.value = { name: '', color: '#6F95C9' };
    showAdd.value = false;
    await reload();
  } catch {
    toast.error(t('boards.errors.save'));
  }
}

onMounted(reload);
watch(() => props.projectId, reload);
</script>
