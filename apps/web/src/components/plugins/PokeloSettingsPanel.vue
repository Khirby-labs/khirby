<template>
  <div class="space-y-5">
    <p v-if="!enabled" class="text-sm text-text-muted">
      {{ t('plugins.list.enableToConfigure') }}
    </p>

    <template v-else>
      <div v-if="loadError" class="crm-error">{{ loadError }}</div>

      <section class="space-y-4">
        <h3 class="text-sm font-medium text-text-primary">
          {{ t('plugins.pokelo.connection.title') }}
        </h3>

        <div class="space-y-1">
          <label class="block text-sm text-text-secondary">
            {{ t('plugins.pokelo.connection.baseUrl.label') }}
          </label>
          <input
            v-model="form.baseUrl"
            type="text"
            class="w-full crm-input"
            placeholder="https://rag.bearly.pro/v1"
          />
          <p class="text-xs text-text-ghost">
            {{ t('plugins.pokelo.connection.baseUrl.description') }}
          </p>
        </div>

        <div class="space-y-1">
          <label class="block text-sm text-text-secondary">
            {{ t('plugins.pokelo.connection.token.label') }}
          </label>
          <div class="flex items-center gap-2">
            <span
              v-if="settings?.tokenConfigured"
              class="text-xs px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/40"
            >
              {{ t('plugins.pokelo.status.tokenConfigured') }}
            </span>
            <span
              v-else
              class="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/40"
            >
              {{ t('plugins.pokelo.status.tokenMissing') }}
            </span>
          </div>
          <input
            v-model="form.token"
            type="password"
            class="w-full crm-input mt-1"
            :placeholder="t('plugins.pokelo.connection.token.placeholder')"
            autocomplete="off"
          />
          <p class="text-xs text-text-ghost">
            {{ t('plugins.pokelo.connection.token.description') }}
          </p>
        </div>

        <div v-if="saveError" class="crm-error">{{ saveError }}</div>
        <div v-if="savedOk" class="text-sm text-success">
          {{ t('plugins.pokelo.status.saved') }}
        </div>
        <div v-if="autoSelectedHint" class="text-sm text-text-secondary">
          {{ autoSelectedHint }}
        </div>

        <button
          type="button"
          class="btn-primary disabled:opacity-50"
          :disabled="saving"
          @click="saveConnection"
        >
          {{
            saving
              ? t('plugins.pokelo.connection.saving')
              : t('plugins.pokelo.connection.saveButton')
          }}
        </button>
      </section>

      <section class="space-y-4 border-t border-border pt-4">
        <h3 class="text-sm font-medium text-text-primary">
          {{ t('plugins.pokelo.project.title') }}
        </h3>
        <p class="text-xs text-text-ghost">
          {{ t('plugins.pokelo.project.description') }}
        </p>

        <div class="space-y-2">
          <label class="block text-sm text-text-secondary">
            {{ t('plugins.pokelo.project.label') }}
          </label>
          <div v-if="projects.length > 0" class="flex flex-wrap gap-2">
            <button
              v-for="p in projects"
              :key="p.id"
              type="button"
              class="px-3 py-1 text-xs rounded-full border transition-colors"
              :class="
                form.projectIds.includes(p.id)
                  ? 'bg-accent text-white border-accent'
                  : 'border-border text-text-secondary hover:border-accent'
              "
              :disabled="!settings?.tokenConfigured"
              @click="toggleProject(p.id)"
            >
              {{ p.name }}
            </button>
          </div>
          <p v-else-if="settings?.tokenConfigured" class="text-sm text-text-ghost">
            {{ t('plugins.pokelo.project.empty') }}
          </p>
          <p v-if="!settings?.tokenConfigured" class="text-xs text-text-ghost">
            {{ t('plugins.pokelo.project.needToken') }}
          </p>
          <p v-if="projectsError" class="crm-error mt-1">{{ projectsError }}</p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn-ghost text-sm px-3 py-2 disabled:opacity-50"
            :disabled="!settings?.tokenConfigured || fetchingProjects"
            @click="loadProjects"
          >
            {{
              fetchingProjects
                ? t('plugins.pokelo.project.refreshing')
                : t('plugins.pokelo.project.refreshButton')
            }}
          </button>
          <button
            type="button"
            class="btn-primary disabled:opacity-50"
            :disabled="saving || !settings?.tokenConfigured"
            @click="saveProject"
          >
            {{
              saving
                ? t('plugins.pokelo.connection.saving')
                : t('plugins.pokelo.project.saveButton')
            }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPatch } from '../../api/client';

interface PokeloSettings {
  baseUrl: string;
  projectIds: string[];
  tokenConfigured: boolean;
}

interface PokeloProject {
  id: string;
  name: string;
}

const props = withDefaults(defineProps<{ enabled?: boolean }>(), { enabled: true });

const { t } = useI18n();

const loadError = ref('');
const saveError = ref('');
const savedOk = ref(false);
const saving = ref(false);
const fetchingProjects = ref(false);
const projectsError = ref('');
const autoSelectedHint = ref('');

const settings = ref<PokeloSettings | null>(null);
const projects = ref<PokeloProject[]>([]);

const form = ref({
  baseUrl: 'https://rag.bearly.pro/v1',
  token: '',
  projectIds: [] as string[],
});

function toggleProject(id: string) {
  const idx = form.value.projectIds.indexOf(id);
  if (idx >= 0) {
    form.value.projectIds.splice(idx, 1);
  } else {
    form.value.projectIds.push(id);
  }
}

async function loadSettings() {
  if (!props.enabled) return;
  loadError.value = '';
  try {
    const data = await apiGet<PokeloSettings>('/api/plugins/pokelo/settings');
    settings.value = data;
    form.value.baseUrl = data.baseUrl;
    form.value.projectIds = [...(data.projectIds ?? [])];
    if (data.tokenConfigured) {
      await loadProjects();
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : t('plugins.pokelo.errors.load');
  }
}

async function loadProjects() {
  if (!settings.value?.tokenConfigured) return;
  fetchingProjects.value = true;
  projectsError.value = '';
  try {
    projects.value = await apiGet<PokeloProject[]>('/api/plugins/pokelo/projects');
  } catch (e) {
    projectsError.value = e instanceof Error ? e.message : t('plugins.pokelo.errors.fetchProjects');
  } finally {
    fetchingProjects.value = false;
  }
}

async function saveConnection() {
  await doSave({
    token: form.value.token || undefined,
    baseUrl: form.value.baseUrl,
  });
}

async function saveProject() {
  await doSave({ projectIds: [...form.value.projectIds] });
}

async function doSave(patch: Record<string, unknown>) {
  saving.value = true;
  saveError.value = '';
  savedOk.value = false;
  autoSelectedHint.value = '';
  const previousIds = settings.value?.projectIds ?? [];
  try {
    const updated = await apiPatch<PokeloSettings>('/api/plugins/pokelo/settings', patch);
    settings.value = updated;
    form.value.token = '';
    form.value.projectIds = [...(updated.projectIds ?? [])];
    savedOk.value = true;
    setTimeout(() => {
      savedOk.value = false;
    }, 3000);

    if (updated.tokenConfigured) {
      await loadProjects();
      if (
        patch.token &&
        previousIds.length === 0 &&
        updated.projectIds.length === 1 &&
        projects.value.length === 1 &&
        projects.value[0].id === updated.projectIds[0]
      ) {
        autoSelectedHint.value = t('plugins.pokelo.status.autoSelected', {
          name: projects.value[0].name,
        });
      }
    }
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : t('plugins.pokelo.errors.save');
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.enabled,
  (on) => {
    if (on) void loadSettings();
  },
);

onMounted(loadSettings);
</script>
