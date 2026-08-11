<template>
  <div class="space-y-6 max-w-2xl">
    <RouterLink to="/pipeline" class="text-sm text-accent hover:text-accent">
      <span aria-hidden="true">←</span> {{ t('pipeline.stages.back') }}
    </RouterLink>

    <div class="flex items-center justify-between">
      <h2 class="crm-page-title">{{ t('pipeline.stages.title') }}</h2>
      <button
        class="px-3 py-2 bg-accent hover:bg-accent-hover text-accent-ink font-semibold text-sm rounded-md"
        @click="showAdd = true"
      >
        <span aria-hidden="true">+</span> {{ t('pipeline.stages.add') }}
      </button>
    </div>

    <p class="text-sm text-text-muted">{{ t('pipeline.stages.seedNameHint') }}</p>

    <div v-if="loading" class="space-y-2">
      <div v-for="i in 5" :key="i" class="h-16 bg-surface-raise2 animate-pulse rounded-lg" />
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="(stage, index) in store.stages"
        :key="stage.id"
        class="crm-panel p-4 flex flex-wrap items-center gap-3"
      >
        <div class="w-4 h-4 rounded-full flex-shrink-0" :style="{ backgroundColor: stage.color }" />

        <!-- The STORED name, deliberately, not the localized one: whatever this
             input holds is written back to the database on change, and a
             translation must never be persisted (ADR-0011). Seeded stages
             therefore read English here and Polish on the board — until they are
             renamed, after which both agree on the operator's own words. -->
        <input
          :value="stage.name"
          type="text"
          class="flex-1 min-w-[120px] px-2 py-1 rounded bg-surface-input border border-border text-text-primary text-sm focus:outline-none focus:border-accent"
          @change="updateName(stage.id, ($event.target as HTMLInputElement).value)"
        />

        <AppSelect
          :model-value="stage.color"
          :options="colorOptions"
          :aria-label="t('pipeline.stages.colorAria')"
          trigger-class="w-32 py-1"
          @change="(v) => updateColor(stage.id, v)"
        />

        <AppCheckbox
          :model-value="stage.isWon"
          class="text-xs"
          @update:model-value="(v) => toggleFlag(stage, 'isWon', v)"
        >
          {{ t('pipeline.stages.won') }}
        </AppCheckbox>
        <AppCheckbox
          :model-value="stage.isLost"
          class="text-xs"
          @update:model-value="(v) => toggleFlag(stage, 'isLost', v)"
        >
          {{ t('pipeline.stages.lost') }}
        </AppCheckbox>

        <div class="flex items-center gap-1 ml-auto">
          <AppTooltip :label="t('pipeline.stages.moveUp')">
            <button
              class="px-2 py-1 text-xs bg-surface-input hover:bg-surface-hover rounded disabled:opacity-40"
              :disabled="index === 0"
              :aria-label="t('pipeline.stages.moveUpAria')"
              @click="moveStage(index, -1)"
            >
              ↑
            </button>
          </AppTooltip>
          <AppTooltip :label="t('pipeline.stages.moveDown')">
            <button
              class="px-2 py-1 text-xs bg-surface-input hover:bg-surface-hover rounded disabled:opacity-40"
              :disabled="index === store.stages.length - 1"
              :aria-label="t('pipeline.stages.moveDownAria')"
              @click="moveStage(index, 1)"
            >
              ↓
            </button>
          </AppTooltip>
          <button
            class="px-2 py-1 text-xs text-danger hover:text-danger disabled:opacity-40"
            :disabled="stage.position === 0"
            @click="removeStage(stage.id)"
          >
            {{ t('common.actions.delete') }}
          </button>
        </div>
      </div>
    </div>

    <AppModal v-if="showAdd" :title="t('pipeline.stages.newTitle')" @close="showAdd = false">
      <form class="space-y-3" @submit.prevent="handleAdd">
        <input
          v-model="newStage.name"
          type="text"
          required
          :placeholder="t('pipeline.stages.namePlaceholder')"
          class="w-full crm-input focus:outline-none focus:border-accent"
        />
        <AppSelect
          v-model="newStage.color"
          :options="colorOptions"
          :aria-label="t('pipeline.stages.colorAria')"
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
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import AppModal from '../../components/AppModal.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import AppCheckbox from '../../components/ui/AppCheckbox.vue';
import AppTooltip from '../../components/ui/AppTooltip.vue';
import { usePipelineStore } from '../../stores/pipeline.store';
import { useConfirm } from '../../composables/useConfirm';
import { useServerText } from '../../composables/useServerText';
import type { PipelineStage } from '@khirby/types';

const { t } = useI18n();
const { stageName } = useServerText();
const askConfirm = useConfirm();

const store = usePipelineStore();
const loading = ref(false);
const showAdd = ref(false);

/** Stage palette tuned for graphite surfaces — keep in sync with docs/DESIGN-SYSTEM.md §2.6 */
const colorPresets = [
  { key: 'blue', value: '#6F95C9' },
  { key: 'amber', value: '#D7A445' },
  { key: 'orange', value: '#DD8046' },
  { key: 'green', value: '#74B98A' },
  { key: 'red', value: '#E06055' },
  { key: 'purple', value: '#A78BC9' },
  { key: 'gray', value: '#8F949C' },
];

/**
 * AppSelect options with a leading color dot. The curated palette plus any legacy
 * colors currently stored on stages (older installs) so the picker always shows
 * the real value instead of a placeholder — docs/DESIGN-SYSTEM.md §2.6.
 */
const colorOptions = computed(() => {
  const presetValues = new Set(colorPresets.map((c) => c.value));
  const legacy = store.stages
    .map((s) => s.color)
    .filter((c): c is string => !!c && !presetValues.has(c))
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .map((c) => ({ value: c, label: c, color: c }));
  return [
    ...colorPresets.map((c) => ({
      value: c.value,
      label: t(`pipeline.stages.colors.${c.key}`),
      color: c.value,
    })),
    ...legacy,
  ];
});

const newStage = ref({ name: '', color: '#6F95C9' });

onMounted(async () => {
  loading.value = true;
  try {
    await store.fetchStages();
  } finally {
    loading.value = false;
  }
});

async function updateName(id: string, name: string) {
  await store.updateStage(id, { name });
}

async function updateColor(id: string, color: string) {
  await store.updateStage(id, { color });
}

async function toggleFlag(stage: PipelineStage, field: 'isWon' | 'isLost', checked: boolean) {
  const patch: Partial<{ isWon: boolean; isLost: boolean }> = { [field]: checked };
  if (field === 'isWon' && checked) patch.isLost = false;
  if (field === 'isLost' && checked) patch.isWon = false;
  await store.updateStage(stage.id, patch);
}

async function moveStage(index: number, delta: number) {
  const ids = store.stages.map((s) => s.id);
  const target = index + delta;
  if (target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  await store.reorderStages(ids);
}

async function removeStage(id: string) {
  const stage = store.stages.find((s) => s.id === id);
  const confirmed = await askConfirm({
    title: t('pipeline.stages.delete.title'),
    message: t('pipeline.stages.delete.message', {
      // Localized here: this value is read inside a sentence, not written back.
      name: stage ? stageName(stage) : t('pipeline.stages.thisStage'),
    }),
    confirmLabel: t('pipeline.stages.delete.confirm'),
  });
  if (!confirmed) return;
  await store.deleteStage(id);
}

async function handleAdd() {
  await store.createStage({
    name: newStage.value.name.trim(),
    color: newStage.value.color,
  });
  newStage.value = { name: '', color: '#6F95C9' };
  showAdd.value = false;
}
</script>
