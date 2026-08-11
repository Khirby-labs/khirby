<template>
  <div class="crm-panel p-5">
    <div class="flex items-start justify-between gap-3 mb-0.5">
      <p class="text-sm font-semibold text-text-primary">
        {{ name || t('forms.preview.untitledForm') }}
      </p>
      <div
        class="inline-flex shrink-0 rounded-md border border-border bg-surface-raised p-0.5"
        role="group"
        :aria-label="t('forms.preview.localeAria')"
      >
        <button
          type="button"
          class="px-2 py-0.5 text-xs font-medium rounded transition-colors"
          :class="
            previewLocale === 'en'
              ? 'bg-surface text-text-primary shadow-sm'
              : 'text-text-ghost hover:text-text-secondary'
          "
          :aria-pressed="previewLocale === 'en'"
          @click="previewLocale = 'en'"
        >
          {{ t('forms.preview.localeEn') }}
        </button>
        <button
          type="button"
          class="px-2 py-0.5 text-xs font-medium rounded transition-colors"
          :class="
            previewLocale === 'pl'
              ? 'bg-surface text-text-primary shadow-sm'
              : 'text-text-ghost hover:text-text-secondary'
          "
          :aria-pressed="previewLocale === 'pl'"
          @click="previewLocale = 'pl'"
        >
          {{ t('forms.preview.localePl') }}
        </button>
      </div>
    </div>
    <p class="text-xs text-text-ghost mb-4">{{ t('forms.preview.caption') }}</p>

    <div v-if="fields.length === 0" class="text-text-ghost text-sm text-center py-8">
      {{ t('forms.preview.empty') }}
    </div>

    <form v-else class="space-y-3" @submit.prevent>
      <div v-for="(f, i) in resolvedFields" :key="i">
        <label class="crm-label">
          {{ f.label || f.name || t('forms.preview.untitledField')
          }}<span v-if="f.required" class="text-danger">
            <span aria-hidden="true">*</span
            ><span class="sr-only">{{ t('common.form.required') }}</span>
          </span>
        </label>

        <textarea
          v-if="f.type === 'textarea'"
          class="crm-input"
          rows="3"
          disabled
          :placeholder="placeholderFor(f)"
        ></textarea>

        <label
          v-else-if="f.type === 'checkbox'"
          class="flex items-center gap-2 text-sm text-text-secondary"
        >
          <input type="checkbox" disabled />
          {{ f.label || f.name }}
        </label>

        <select v-else-if="f.type === 'select'" class="crm-input" disabled>
          <option>{{ f.options?.[0] ?? t('forms.preview.optionPlaceholder') }}</option>
        </select>

        <input
          v-else
          class="crm-input"
          disabled
          :type="inputType(f.type)"
          :placeholder="placeholderFor(f)"
        />
      </div>

      <button type="submit" class="btn-primary w-full" disabled>
        {{ t('forms.preview.submit') }}
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { resolveFormFieldLabel, type FormField, type LocaleCode } from '@khirby/types';

const { t } = useI18n();

const props = defineProps<{ name: string; fields: FormField[] }>();

const previewLocale = ref<LocaleCode>('en');

/** Resolve visitor labels for the preview locale without mutating the builder (ADR-0025). */
const resolvedFields = computed(() =>
  props.fields.map((f) => ({
    ...f,
    label: resolveFormFieldLabel(f, previewLocale.value),
  })),
);

const NATIVE_INPUT_TYPES = new Set(['text', 'email', 'tel', 'url', 'number']);

/** Renamed parameter: `t` would shadow the i18n `t` this component now uses. */
function inputType(type: string): string {
  return NATIVE_INPUT_TYPES.has(type) ? type : 'text';
}

/**
 * Sample values, not copy: `you@example.com` and `https://example.com` are the
 * RFC 2606 reserved examples and read identically in every language, so they stay
 * as they are. Resolved `f.label`/`f.name` are the operator's own persisted data
 * and are rendered raw — never translated via vue-i18n (ADR-0011 / ADR-0025).
 */
function placeholderFor(f: FormField): string {
  switch (f.type) {
    case 'email':
      return 'you@example.com';
    case 'tel':
      return '+1 555 000 0000';
    case 'url':
      return 'https://example.com';
    case 'number':
      return '0';
    default:
      return f.label || f.name || '';
  }
}
</script>
