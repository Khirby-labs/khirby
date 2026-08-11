<template>
  <div class="crm-panel p-5 space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-text-secondary">{{ t('forms.integration.title') }}</h3>
      <button
        class="text-xs text-accent hover:text-accent"
        @click="copy(submitUrl, t('forms.integration.toast.endpointCopied'))"
      >
        {{ t('forms.integration.copyEndpoint') }}
      </button>
    </div>

    <div
      class="flex gap-1 rounded-md bg-surface-input p-1 border border-border"
      role="tablist"
      :aria-label="t('forms.integration.tabsAria')"
    >
      <button
        v-for="tab in tabs"
        :key="tab.key"
        role="tab"
        :aria-selected="active === tab.key"
        class="flex-1 text-xs font-medium py-1.5 rounded-md transition-colors"
        :class="
          active === tab.key
            ? 'bg-surface-panel text-text-primary'
            : 'text-text-muted hover:text-text-secondary'
        "
        @click="active = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="relative">
      <button
        class="absolute right-2 top-2 z-10 text-xs text-accent hover:text-accent"
        @click="copy(current, t('forms.integration.toast.copied'))"
      >
        {{ t('forms.integration.copy') }}
      </button>
      <pre
        class="text-xs text-text-secondary bg-surface-input rounded-md p-3 pt-8 overflow-x-auto whitespace-pre-wrap font-mono"
        >{{ current }}</pre>
    </div>

    <p class="text-xs text-text-ghost">
      {{ t('forms.integration.submitUrl') }}
      <code class="bg-surface-input px-1 rounded-md font-mono">{{ submitUrl }}</code>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToastStore } from '../../stores/toast.store';

const props = defineProps<{
  submitUrl: string;
  exampleJson: string;
  curlExample: string;
  sdkInstallHint: string;
  sdkExample: string;
  codegenExample: string;
}>();

const { t } = useI18n();
const toast = useToastStore();

type TabKey = 'json' | 'curl' | 'sdk' | 'codegen';

/**
 * A computed like every other label array in the app, even though these four
 * labels never go through `t()`: JSON, curl, SDK and Codegen are proper nouns
 * (docs/i18n-copy-guide.md §5). Keeping the shape means a future translated tab
 * cannot silently freeze at the boot locale, which is what a module-level const
 * would do. The tablist's accessible name IS translated.
 */
const tabs = computed<{ key: TabKey; label: string }[]>(() => [
  { key: 'json', label: 'JSON' },
  { key: 'curl', label: 'curl' },
  { key: 'sdk', label: 'SDK' },
  { key: 'codegen', label: 'Codegen' },
]);
const active = ref<TabKey>('json');

const current = computed<string>(() => {
  switch (active.value) {
    case 'curl':
      return props.curlExample;
    case 'sdk':
      return `${props.sdkInstallHint}\n\n${props.sdkExample}`;
    case 'codegen':
      return props.codegenExample;
    default:
      return props.exampleJson;
  }
});

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error(t('forms.integration.errors.copy'));
  }
}
</script>
