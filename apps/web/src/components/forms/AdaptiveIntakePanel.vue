<template>
  <div class="crm-panel p-6 space-y-4 ring-1 ring-accent/25">
    <h3 class="text-sm font-semibold text-text-primary">{{ t('forms.adaptive.title') }}</h3>

    <div>
      <label for="adaptive-brief" class="crm-label">{{ t('forms.adaptive.brief.label') }}</label>
      <textarea
        id="adaptive-brief"
        :value="brief"
        rows="4"
        class="crm-input"
        :placeholder="t('forms.adaptive.brief.placeholder')"
        @input="emit('update:brief', ($event.target as HTMLTextAreaElement).value)"
      />
      <p class="text-xs text-text-ghost mt-1">{{ t('forms.adaptive.brief.hint') }}</p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="btn-primary text-xs px-3 py-1.5"
        :disabled="generating || !brief.trim()"
        @click="generate"
      >
        {{ generating ? t('forms.adaptive.generating') : t('forms.adaptive.generate') }}
      </button>
      <p v-if="generateError" class="text-xs text-danger">{{ generateError }}</p>
    </div>

    <div>
      <label for="adaptive-prompt" class="crm-label">{{ t('forms.adaptive.prompt.label') }}</label>
      <textarea
        id="adaptive-prompt"
        :value="systemPrompt"
        rows="10"
        class="crm-input font-mono text-xs"
        :placeholder="t('forms.adaptive.prompt.placeholder')"
        @input="emit('update:systemPrompt', ($event.target as HTMLTextAreaElement).value)"
      />
      <p class="text-xs text-text-ghost mt-1">{{ t('forms.adaptive.prompt.hint') }}</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label for="adaptive-opening-en" class="crm-label">{{
          t('forms.adaptive.opening.labelEn')
        }}</label>
        <input
          id="adaptive-opening-en"
          type="text"
          class="crm-input"
          :value="openingLabels?.en ?? ''"
          :placeholder="t('forms.adaptive.opening.placeholderEn')"
          @input="
            emit('update:openingLabels', {
              en: ($event.target as HTMLInputElement).value,
              pl: openingLabels?.pl ?? '',
            })
          "
        />
      </div>
      <div>
        <label for="adaptive-opening-pl" class="crm-label">{{
          t('forms.adaptive.opening.labelPl')
        }}</label>
        <input
          id="adaptive-opening-pl"
          type="text"
          class="crm-input"
          :value="openingLabels?.pl ?? ''"
          :placeholder="t('forms.adaptive.opening.placeholderPl')"
          @input="
            emit('update:openingLabels', {
              en: openingLabels?.en ?? '',
              pl: ($event.target as HTMLInputElement).value,
            })
          "
        />
      </div>
    </div>
    <p class="text-xs text-text-ghost -mt-2">{{ t('forms.adaptive.opening.hint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormsStore } from '../../stores/forms.store';
import { useToastStore } from '../../stores/toast.store';

const props = defineProps<{
  formId: string;
  brief: string;
  systemPrompt: string;
  openingLabels: { en?: string; pl?: string } | null;
}>();

const emit = defineEmits<{
  'update:brief': [value: string];
  'update:systemPrompt': [value: string];
  'update:openingLabels': [value: { en?: string; pl?: string } | null];
}>();

const { t } = useI18n();
const formsStore = useFormsStore();
const toast = useToastStore();

const generating = ref(false);
const generateError = ref('');

async function generate() {
  const brief = props.brief.trim();
  if (!brief) {
    generateError.value = t('forms.adaptive.errors.briefRequired');
    return;
  }
  generateError.value = '';
  generating.value = true;
  try {
    const result = await formsStore.draftSystemPrompt(props.formId, brief);
    emit('update:systemPrompt', result.systemPrompt);
    emit('update:openingLabels', result.openingLabels);
    toast.success(t('forms.adaptive.toast.drafted'));
  } catch (e: unknown) {
    generateError.value = e instanceof Error ? e.message : t('forms.adaptive.errors.generate');
  } finally {
    generating.value = false;
  }
}
</script>
