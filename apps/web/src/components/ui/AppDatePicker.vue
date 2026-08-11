<template>
  <AppPopover :open="open" content-class="p-3" @update:open="(v) => (open = v)">
    <template #trigger>
      <button
        v-bind="$attrs"
        :id="id"
        type="button"
        :disabled="disabled"
        :aria-label="ariaLabel"
        :data-placeholder="modelValue ? undefined : ''"
        :class="
          cn(
            'inline-flex items-center gap-2 rounded-md bg-surface-input border border-border',
            'text-text-primary text-sm px-3 py-2 min-w-0 transition-colors',
            'hover:border-border-strong focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30',
            'disabled:opacity-40 disabled:pointer-events-none data-[placeholder]:text-text-ghost',
            triggerClass,
          )
        "
      >
        <svg
          class="h-4 w-4 flex-shrink-0 text-text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M8 2v4M16 2v4M3 10h18" />
        </svg>
        <span class="truncate font-mono">{{ label }}</span>
      </button>
    </template>

    <AppCalendar
      :model-value="modelValue"
      :min-day="minDay"
      :max-day="maxDay"
      :aria-label="ariaLabel"
      @update:model-value="onPick"
    />

    <div v-if="clearable" class="mt-2 flex justify-end border-t border-border-subtle pt-2">
      <button
        type="button"
        class="rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-raise hover:text-text-primary"
        @click="clear"
      >
        {{ t('common.datePicker.clear') }}
      </button>
    </div>
  </AppPopover>
</template>

<script setup lang="ts">
/**
 * Single-date control (docs/DESIGN-SYSTEM.md §6, ADR-0012) — the replacement for the
 * native date input, which `scripts/design-guard.mjs` now rejects. A native picker's
 * calendar glyph and drop-down are drawn by the browser, so no token reaches them: on
 * graphite the glyph stayed black. This trigger's icon is our own SVG on
 * `currentColor`, and the panel is Reka's.
 *
 * Model is an ISO day (`'2026-07-24'`) or `null`. Drops into `FormField`: attributes
 * fall through to the trigger (`inheritAttrs: false`), so `aria-describedby` /
 * `aria-invalid` from the slot land on the focusable element rather than a wrapper.
 */
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { cn } from '../../lib/utils';
import AppPopover from './AppPopover.vue';
import AppCalendar from './AppCalendar.vue';
import { isoDayToLocalDate, type IsoDay } from '../../utils/date-range';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  modelValue: IsoDay | null;
  /** Earliest selectable day, inclusive. */
  minDay?: IsoDay | null;
  /** Latest selectable day, inclusive. */
  maxDay?: IsoDay | null;
  /**
   * Shown when nothing is chosen. No default: `withDefaults()` runs outside a
   * component instance, where `t()` cannot be called (`.claude/rules/i18n.md`).
   */
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Adds a "clear" action to the panel — for optional filters, not required fields. */
  clearable?: boolean;
  id?: string;
  triggerClass?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: IsoDay | null): void;
  (e: 'change', value: IsoDay | null): void;
}>();

const { t, d } = useI18n();
const open = ref(false);

const label = computed(() =>
  props.modelValue
    ? d(isoDayToLocalDate(props.modelValue), 'dateShort')
    : (props.placeholder ?? t('common.datePicker.placeholder')),
);

/** Picking a day is the whole interaction — the panel closes itself. */
function onPick(value: IsoDay | null) {
  emit('update:modelValue', value);
  emit('change', value);
  if (value) open.value = false;
}

function clear() {
  emit('update:modelValue', null);
  emit('change', null);
  open.value = false;
}
</script>
