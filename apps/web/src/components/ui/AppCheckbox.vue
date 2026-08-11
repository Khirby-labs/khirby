<template>
  <label
    :class="cn(
      'inline-flex items-center gap-2 text-sm text-text-secondary select-none',
      disabled ? 'opacity-40' : 'cursor-pointer',
    )"
  >
    <CheckboxRoot
      :model-value="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      class="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors
             border-border-strong bg-surface-input
             data-[state=checked]:bg-accent data-[state=checked]:border-accent
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
             focus-visible:ring-offset-surface-base"
      @update:model-value="(v) => emit('update:modelValue', v === true)"
    >
      <CheckboxIndicator class="text-accent-ink">
        <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </CheckboxIndicator>
    </CheckboxRoot>
    <slot />
  </label>
</template>

<script setup lang="ts">
/**
 * Token-styled checkbox on Reka UI (docs/DESIGN-SYSTEM.md §6). Honey when checked.
 * Wraps the control in a <label> so the slotted text is clickable.
 */
import { CheckboxRoot, CheckboxIndicator } from 'reka-ui';
import { cn } from '../../lib/utils';

defineProps<{
  modelValue: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();
</script>
