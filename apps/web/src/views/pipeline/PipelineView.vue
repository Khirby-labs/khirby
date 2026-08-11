<template>
  <div class="space-y-5">
    <PageActions>
      <AppSelect
        v-model="ownerFilter"
        :options="ownerOptions"
        :aria-label="t('pipeline.board.ownerFilterAria')"
        :placeholder="t('pipeline.board.allOwners')"
        trigger-class="h-8 !py-0 text-sm"
        @change="reloadBoard"
      />
      <RouterLink
        to="/pipeline/stages"
        class="btn-ghost inline-flex h-8 items-center gap-1.5 !px-3 !py-0 text-sm"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="4" x2="4" y1="21" y2="14" />
          <line x1="4" x2="4" y1="10" y2="3" />
          <line x1="12" x2="12" y1="21" y2="12" />
          <line x1="12" x2="12" y1="8" y2="3" />
          <line x1="20" x2="20" y1="21" y2="16" />
          <line x1="20" x2="20" y1="12" y2="3" />
          <line x1="1" x2="7" y1="14" y2="14" />
          <line x1="9" x2="15" y1="8" y2="8" />
          <line x1="17" x2="23" y1="16" y2="16" />
        </svg>
        {{ t('pipeline.board.stagesLink') }}
      </RouterLink>
    </PageActions>

    <h2 class="crm-page-title">{{ t('pipeline.board.title') }}</h2>

    <div v-if="store.error" class="crm-error">
      {{ store.error }}
    </div>

    <!-- Desktop Kanban -->
    <div v-if="store.loading" class="hidden md:flex gap-4 overflow-x-auto pb-4">
      <div
        v-for="i in 5"
        :key="i"
        class="flex-shrink-0 w-72 bg-surface-raise border border-border rounded-xl p-3 space-y-2"
      >
        <div class="h-5 w-24 bg-surface-raise2 animate-pulse rounded" />
        <div v-for="j in 3" :key="j" class="h-24 bg-surface-raise2 animate-pulse rounded-lg" />
      </div>
    </div>

    <div v-else-if="store.board" class="hidden md:flex gap-4 overflow-x-auto pb-4">
      <div
        v-for="column in store.board.columns"
        :key="column.stage.id"
        class="flex-shrink-0 w-72 flex flex-col gap-2 min-h-[200px] p-3 rounded-xl bg-surface-raise border border-border transition-shadow"
        :class="{ 'ring-2 ring-accent': dragOverStageId === column.stage.id }"
        @dragover.prevent="dragOverStageId = column.stage.id"
        @dragleave="onDragLeave(column.stage.id)"
        @drop.prevent="onDrop($event, column.stage.id)"
      >
        <div class="mb-1">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: column.stage.color }" />
            <h3 class="text-sm font-semibold text-text-primary">
              {{ stageName(column.stage) }}
              <span class="text-text-ghost font-normal">({{ column.count }})</span>
            </h3>
          </div>
          <p v-if="Number(column.totalValue) > 0" class="text-xs text-text-ghost mt-0.5 pl-5">
            {{ formatCurrency(column.totalValue) }}
          </p>
        </div>

        <LeadCard
          v-for="lead in column.leads"
          :key="lead.id"
          :lead="lead"
          :stage-color="column.stage.color"
          @open="openPanel"
        />

        <div
          v-if="!column.leads.length"
          class="border-2 border-dashed border-border rounded-lg p-6 text-center text-text-ghost text-sm"
        >
          <p>
            {{
              column.stage.position === 0
                ? t('pipeline.board.empty.noLeadsYet')
                : t('pipeline.board.empty.dropHere')
            }}
          </p>
          <button
            v-if="column.stage.position === 0"
            class="mt-2 text-accent hover:text-accent text-xs"
            @click="openAddModalForStage(column.stage.id)"
          >
            <span aria-hidden="true">+</span> {{ t('pipeline.board.addManually') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Mobile list -->
    <div v-if="store.loading" class="md:hidden space-y-4">
      <div v-for="i in 3" :key="i" class="space-y-2">
        <div class="h-5 w-32 bg-surface-raise2 animate-pulse rounded" />
        <div class="h-24 bg-surface-raise2 animate-pulse rounded-lg" />
      </div>
    </div>

    <div v-else-if="store.board" class="md:hidden space-y-6">
      <div v-for="column in store.board.columns" :key="column.stage.id" class="space-y-2">
        <div class="flex items-center gap-2 px-1">
          <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: column.stage.color }" />
          <h3 class="text-sm font-semibold text-text-primary">
            {{ stageName(column.stage) }} ({{ column.count }})
          </h3>
          <span v-if="Number(column.totalValue) > 0" class="text-xs text-text-ghost">
            {{ formatCurrency(column.totalValue) }}
          </span>
        </div>
        <LeadCard
          v-for="lead in column.leads"
          :key="lead.id"
          :lead="lead"
          :stage-color="column.stage.color"
          @open="openPanel"
        />
        <div
          v-if="!column.leads.length"
          class="border-2 border-dashed border-border rounded-lg p-4 text-center text-text-ghost text-sm"
        >
          <!-- Mobile has no drag-and-drop, so it states a fact instead of inviting a drop. -->
          <p>
            {{
              column.stage.position === 0
                ? t('pipeline.board.empty.noLeadsYet')
                : t('pipeline.board.empty.noLeads')
            }}
          </p>
          <button
            v-if="column.stage.position === 0"
            class="mt-2 text-accent hover:text-accent text-xs"
            @click="openAddModalForStage(column.stage.id)"
          >
            <span aria-hidden="true">+</span> {{ t('pipeline.board.addManually') }}
          </button>
        </div>
      </div>
    </div>

    <LeadDetailPanel
      :open="panelOpen"
      :lead-id="selectedLeadId"
      :stages="allStages"
      :assignees="store.assignees"
      @close="closePanel"
    />

    <AddLeadModal
      v-if="showAddModal"
      :stages="allStages"
      :assignees="store.assignees"
      :default-stage-id="addModalStageId"
      @close="showAddModal = false"
      @created="onLeadCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useServerText } from '../../composables/useServerText';
import LeadCard from '../../components/pipeline/LeadCard.vue';
import LeadDetailPanel from '../../components/pipeline/LeadDetailPanel.vue';
import AddLeadModal from '../../components/pipeline/AddLeadModal.vue';
import PageActions from '../../components/ui/PageActions.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import { usePipelineStore } from '../../stores/pipeline.store';
import { formatCurrency } from '../../utils/pipeline-helpers';

const { t } = useI18n();
const { stageName } = useServerText();
const store = usePipelineStore();
const route = useRoute();
const router = useRouter();

const ownerFilter = ref('');

const ownerOptions = computed(() => [
  { value: '', label: t('pipeline.board.allOwners') },
  ...store.assignees.map((a) => ({ value: a.id, label: a.email })),
]);
const dragOverStageId = ref<string | null>(null);
const showAddModal = ref(false);
const addModalStageId = ref<string | undefined>();
const panelOpen = ref(false);
const selectedLeadId = ref<string | null>(null);

const allStages = computed(() => store.stages);

onMounted(async () => {
  await Promise.all([store.fetchAssignees(), store.fetchStages(), store.fetchBoard()]);

  const leadQuery = route.query.lead;
  if (typeof leadQuery === 'string') {
    openPanel(leadQuery);
  }
  // Handle ?new=1 only after stages have loaded, so AddLeadModal can default
  // its stage picker to the first stage (it reads props.stages once on open).
  if (route.query.new) openQuickCreate();
});

watch(
  () => route.query.lead,
  (id) => {
    if (typeof id === 'string') {
      selectedLeadId.value = id;
      panelOpen.value = true;
    } else {
      panelOpen.value = false;
      selectedLeadId.value = null;
    }
  },
);

/** Open the add-lead dialog from the top-bar "+ New" (?new=1). */
function openQuickCreate() {
  addModalStageId.value = undefined;
  showAddModal.value = true;
  router.replace({ query: { ...route.query, new: undefined } });
}

// On initial load the modal is opened from onMounted (after stages load); this
// watcher covers in-session navigations, when stages are already present.
watch(
  () => route.query.new,
  (v) => {
    if (v) openQuickCreate();
  },
);

async function reloadBoard() {
  await store.fetchBoard(ownerFilter.value || undefined);
}

function openPanel(id: string) {
  selectedLeadId.value = id;
  panelOpen.value = true;
  router.replace({ query: { ...route.query, lead: id } });
}

function closePanel() {
  panelOpen.value = false;
  selectedLeadId.value = null;
  const { lead, ...rest } = route.query;
  router.replace({ query: rest });
}

function openAddModalForStage(stageId: string) {
  addModalStageId.value = stageId;
  showAddModal.value = true;
}

async function onLeadCreated() {
  await reloadBoard();
}

function onDragLeave(stageId: string) {
  if (dragOverStageId.value === stageId) {
    dragOverStageId.value = null;
  }
}

async function onDrop(event: DragEvent, stageId: string) {
  dragOverStageId.value = null;
  const leadId = event.dataTransfer?.getData('leadId');
  if (!leadId) return;

  const current = store.board?.columns.flatMap((c) => c.leads).find((l) => l.id === leadId);
  if (current?.stageId === stageId) return;

  await store.moveLead(leadId, stageId);
}
</script>
