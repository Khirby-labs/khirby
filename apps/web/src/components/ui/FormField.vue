<template>
  <div class="space-y-1.5">
    <label v-if="label" :for="fieldId" class="crm-label mb-0">
      {{ label
      }}<span v-if="required" class="text-text-ghost">
        <span aria-hidden="true">*</span><span class="sr-only">{{ t('common.form.required') }}</span>
      </span>
    </label>
    <slot :field-id="fieldId" :error-id="error ? errorId : undefined" :invalid="!!error" />
    <p v-if="error" :id="errorId" class="text-xs text-danger">{{ error }}</p>
    <p v-else-if="hint" class="text-xs text-text-ghost">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Field wrapper — label + control slot + inline error (docs/DESIGN-SYSTEM.md §5).
 * The slot is passed `fieldId`, `errorId` and `invalid` so the control can wire
 * `:id`, `aria-describedby` and `aria-invalid`. Error replaces hint when present.
 */
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Stable id base; falls back to a slug of the label */
  id?: string;
}>();

/**
 * Slugging a translated label would make the DOM id locale-dependent, so any
 * selector keyed on it would break in the second language only. `useId()` gives
 * a stable id; pass `id` explicitly when a test or label needs to predict it.
 */
const fallbackId = useId();
const fieldId = computed(() => props.id ?? fallbackId);
const errorId = computed(() => `${fieldId.value}-error`);
</script>
