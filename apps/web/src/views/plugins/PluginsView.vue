<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="crm-page-title">{{ t('plugins.list.title') }}</h2>
        <p class="text-sm text-text-muted mt-1">{{ t('plugins.list.subtitle') }}</p>
      </div>
      <button class="btn-ghost px-3 py-1.5 text-sm" @click="store.fetchPlugins()">
        {{ t('plugins.actions.refresh') }}
      </button>
    </div>

    <!-- Error banner -->
    <div v-if="error" class="crm-error">
      {{ error }}
    </div>

    <!-- Loading: skeleton shaped like the cards it replaces, never a bare spinner
         (.claude/rules/web.md → Every view must define) -->
    <SkeletonRows v-if="store.loading" :rows="3" height="6.5rem" />

    <!-- Empty state -->
    <EmptyState
      v-else-if="!store.plugins.length && !error"
      :title="t('plugins.list.empty.title')"
      :message="t('plugins.list.empty.message')"
    >
      <template #icon>
        <NavIcon name="plugins" />
      </template>
    </EmptyState>

    <!-- Plugin cards -->
    <div v-else class="space-y-4">
      <div v-for="plugin in store.plugins" :key="plugin.id" class="crm-panel overflow-hidden">
        <!-- Card header -->
        <div class="px-5 py-4">
          <div class="flex items-start justify-between gap-4">
            <!-- Left: title + meta -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <!-- Title and body come from the backend as a stable key plus an
                     English literal; an unknown key (third-party plugin) renders
                     the literal (ADR-0011). -->
                <span class="text-base font-semibold text-text-primary">{{
                  pluginDisplayName(plugin)
                }}</span>
                <span
                  class="px-1.5 py-0.5 text-xs rounded bg-surface-input text-text-muted border border-border font-mono"
                >
                  v{{ plugin.version }}
                </span>
              </div>
              <p v-if="plugin.description" class="mt-1 text-sm text-text-muted">
                {{ pluginDescription(plugin) }}
              </p>
              <p class="mt-2 text-xs text-text-ghost">
                {{ t('plugins.list.installed', { date: formatDate(plugin.installedAt) }) }}
              </p>
            </div>

            <!-- Right: toggle + configure -->
            <div class="flex items-center gap-2 flex-shrink-0">
              <button
                v-if="hasConfig(plugin)"
                class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
                :class="
                  expandedConfigs.has(plugin.name)
                    ? 'bg-surface-hover text-text-primary'
                    : 'bg-surface-raise hover:bg-surface-raise2 text-text-secondary'
                "
                @click="toggleConfig(plugin.name)"
              >
                {{
                  expandedConfigs.has(plugin.name)
                    ? t('common.actions.close')
                    : t('plugins.list.configure')
                }}
              </button>

              <!-- Enable/Disable toggle -->
              <SwitchRoot
                :model-value="plugin.enabled"
                :disabled="togglingPlugin === plugin.name"
                :aria-label="
                  plugin.enabled
                    ? t('plugins.list.disableAria', { name: pluginDisplayName(plugin) })
                    : t('plugins.list.enableAria', { name: pluginDisplayName(plugin) })
                "
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors data-[state=checked]:bg-accent data-[state=unchecked]:bg-surface-raise2 disabled:opacity-40"
                @update:model-value="handleToggle(plugin)"
              >
                <SwitchThumb
                  class="inline-block h-4 w-4 rounded-full bg-text-primary transition-transform data-[state=checked]:translate-x-6 data-[state=unchecked]:translate-x-1"
                />
              </SwitchRoot>
              <span class="text-xs text-text-muted w-14">
                {{ plugin.enabled ? t('plugins.list.enabled') : t('plugins.list.disabled') }}
              </span>
            </div>
          </div>
        </div>

        <!-- Config panel: schema form OR custom settings panel (ADR-0023) -->
        <div
          v-if="expandedConfigs.has(plugin.name) && hasConfig(plugin)"
          class="border-t border-border px-5 py-4 bg-surface-base"
        >
          <PluginConfigForm
            v-if="hasSchemaConfig(plugin)"
            :plugin-name="plugin.name"
            :schema="plugin.configSchema!"
            :config="plugin.config"
            :saving="savingConfig === plugin.name"
            :saved="configSaved === plugin.name"
            @save="(config) => handleSaveConfig(plugin, config)"
          />
          <component
            :is="settingsPanelComponents[plugin.name]"
            v-else-if="hasCustomSettings(plugin)"
            :enabled="plugin.enabled"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, type Component } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { useI18n } from 'vue-i18n';
import { usePluginsStore, type Plugin } from '../../stores/plugins.store';
import { useToastStore } from '../../stores/toast.store';
import { useServerText } from '../../composables/useServerText';
import { pluginSettingsPanels } from '../../plugins/plugin-registry';
import PluginConfigForm from '../../components/PluginConfigForm.vue';
import McpSettingsPanel from '../../components/plugins/McpSettingsPanel.vue';
import AiComposeSettingsPanel from '../../components/plugins/AiComposeSettingsPanel.vue';
import PokeloSettingsPanel from '../../components/plugins/PokeloSettingsPanel.vue';
import EmptyState from '../../components/ui/EmptyState.vue';
import SkeletonRows from '../../components/ui/SkeletonRows.vue';
import NavIcon from '../../components/NavIcon.vue';

const { t, d } = useI18n();
const { pluginDisplayName, pluginDescription } = useServerText();
const store = usePluginsStore();
const toast = useToastStore();
const error = ref<string | null>(null);

const expandedConfigs = reactive(new Set<string>());
const togglingPlugin = ref<string | null>(null);
const savingConfig = ref<string | null>(null);
const configSaved = ref<string | null>(null);

const settingsPanelComponents: Record<string, Component> = {
  crm_mcp: McpSettingsPanel,
  crm_ai_compose: AiComposeSettingsPanel,
  crm_pokelo: PokeloSettingsPanel,
};

function hasSchemaConfig(plugin: Plugin): boolean {
  return (plugin.configSchema?.length ?? 0) > 0;
}

function hasCustomSettings(plugin: Plugin): boolean {
  return plugin.name in pluginSettingsPanels;
}

function hasConfig(plugin: Plugin): boolean {
  return hasSchemaConfig(plugin) || hasCustomSettings(plugin);
}

/** Named format, not a substring: this used to be `iso.slice(0, 10)`, i.e. an ISO date. */
function formatDate(iso: string): string {
  return iso ? d(iso, 'dateShort') : '—';
}

function toggleConfig(name: string) {
  if (expandedConfigs.has(name)) {
    expandedConfigs.delete(name);
  } else {
    expandedConfigs.add(name);
  }
}

async function handleToggle(plugin: Plugin) {
  if (togglingPlugin.value) return;
  togglingPlugin.value = plugin.name;
  const enabling = !plugin.enabled;
  try {
    await store.togglePlugin(plugin.name, enabling);
    // A whole sentence per branch: an interpolated 'enabled/disabled' cannot agree
    // with its noun in Polish (.claude/rules/i18n.md).
    toast.success(
      enabling
        ? t('plugins.toast.enabled', { name: pluginDisplayName(plugin) })
        : t('plugins.toast.disabled', { name: pluginDisplayName(plugin) }),
    );
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('plugins.errors.toggle');
  } finally {
    togglingPlugin.value = null;
  }
}

async function handleSaveConfig(plugin: Plugin, config: Record<string, string>) {
  if (savingConfig.value) return;
  savingConfig.value = plugin.name;
  error.value = null;
  try {
    await store.updateConfig(plugin.name, config);
    configSaved.value = plugin.name;
    setTimeout(() => {
      configSaved.value = null;
    }, 2000);
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('plugins.errors.saveConfig');
  } finally {
    savingConfig.value = null;
  }
}

onMounted(async () => {
  error.value = null;
  try {
    await store.fetchPlugins();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('plugins.errors.load');
  }
});
</script>
