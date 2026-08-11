<template>
  <SelectRoot :model-value="internalValue" @update:model-value="onChange">
    <SelectTrigger
      :disabled="disabled"
      :aria-label="ariaLabel"
      :class="
        cn(
          'inline-flex items-center justify-between gap-2 rounded-md bg-surface-input border border-border',
          'text-text-primary text-sm px-3 py-2 min-w-0 transition-colors',
          'hover:border-border-strong focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30',
          'disabled:opacity-40 disabled:pointer-events-none data-[placeholder]:text-text-ghost',
          triggerClass,
        )
      "
    >
      <SelectValue :placeholder="placeholder ?? t('common.form.selectPlaceholder')" />
      <SelectIcon class="text-text-muted">
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="4"
        class="z-[70] min-w-[var(--reka-select-trigger-width)] overflow-hidden rounded-md bg-surface-elevated border border-border shadow-2xl"
      >
        <SelectViewport class="p-1">
          <SelectItem
            v-for="opt in mappedOptions"
            :key="opt.internal"
            :value="opt.internal"
            class="relative flex items-center gap-2 rounded px-2 py-1.5 pr-7 text-sm text-text-secondary cursor-pointer select-none outline-none data-[highlighted]:bg-surface-raise data-[highlighted]:text-text-primary data-[state=checked]:text-text-primary"
          >
            <span
              v-if="opt.color"
              class="h-2.5 w-2.5 rounded-full flex-shrink-0"
              :style="{ backgroundColor: opt.color }"
            />
            <SelectItemText>{{ opt.label }}</SelectItemText>
            <SelectItemIndicator class="absolute right-2 inline-flex items-center text-accent">
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<script setup lang="ts">
/**
 * Token-styled select on Reka UI (docs/DESIGN-SYSTEM.md §6). Prop-driven so it drops
 * into any native <select v-model> site: pass options + v-model.
 * Options may carry a `color` to render a leading dot (pipeline stage picker).
 *
 * Reka forbids SelectItem value="". Call sites still use '' for “clear / all /
 * unassigned”; we map that to a sentinel internally and reverse on emit.
 */
import { computed } from 'vue';
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectIcon,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
} from 'reka-ui';
import { useI18n } from 'vue-i18n';
import { cn } from '../../lib/utils';

/** Sentinel for empty-string option values — Reka reserves "" for cleared selection. */
const EMPTY_VALUE = '__crm_empty__';

export interface SelectOption {
  value: string;
  label: string;
  color?: string;
}

/**
 * `placeholder` has NO default: withDefaults() runs outside a component
 * instance, so t() cannot be called there (`.claude/rules/i18n.md`).
 */
const { t } = useI18n();

const props = defineProps<{
  modelValue: string;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  triggerClass?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'change', value: string): void;
}>();

function toInternal(value: string): string {
  return value === '' ? EMPTY_VALUE : value;
}

function fromInternal(value: string): string {
  return value === EMPTY_VALUE ? '' : value;
}

const mappedOptions = computed(() =>
  props.options.map((opt) => ({
    internal: toInternal(opt.value),
    label: opt.label,
    color: opt.color,
  })),
);

const internalValue = computed(() => toInternal(props.modelValue));

function onChange(value: unknown) {
  const v = fromInternal(value as string);
  emit('update:modelValue', v);
  emit('change', v);
}
</script>
