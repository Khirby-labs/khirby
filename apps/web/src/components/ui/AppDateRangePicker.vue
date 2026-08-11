<template>
  <AppPopover :open="open" content-class="p-3" @update:open="(v) => (open = v)">
    <template #trigger>
      <button
        v-bind="$attrs"
        :id="id"
        type="button"
        :disabled="disabled"
        :aria-label="triggerAriaLabel"
        :data-placeholder="hasRange ? undefined : ''"
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
        <span v-if="hasRange" class="truncate font-mono">
          <span>{{ fromLabel }}</span>
          <!-- Glyph in markup, words in messages (.claude/rules/i18n.md): an en dash
               is not a word, and the trigger's accessible name is built from
               `range.ariaValue` above. -->
          <span aria-hidden="true"> – </span>
          <span>{{ toLabel }}</span>
        </span>
        <span v-else class="truncate">{{
          placeholder ?? t('common.datePicker.range.placeholder')
        }}</span>
      </button>
    </template>

    <div class="flex flex-col gap-3 sm:flex-row">
      <div
        class="flex flex-row flex-wrap gap-1 border-border-subtle pb-1 sm:flex-col sm:flex-nowrap sm:border-r sm:pb-0 sm:pr-3"
      >
        <button
          v-for="preset in presetOptions"
          :key="preset.value"
          type="button"
          :aria-pressed="preset.value === activePreset"
          :class="
            cn(
              'whitespace-nowrap rounded px-2.5 py-1.5 text-left text-xs transition-colors',
              preset.value === activePreset
                ? 'bg-accent-subtle font-semibold text-text-primary'
                : 'text-text-muted hover:bg-surface-raise hover:text-text-primary',
            )
          "
          @click="applyPreset(preset.value)"
        >
          {{ preset.label }}
        </button>
      </div>

      <div>
        <RangeCalendarRoot
          v-slot="{ grid, weekDays }"
          :model-value="selected"
          :min-value="min"
          :max-value="max"
          :locale="intlTag"
          :number-of-months="monthCount"
          :calendar-label="gridLabel"
          paged-navigation
          fixed-weeks
          initial-focus
          @update:valid-model-value="onRangeComplete"
        >
          <RangeCalendarHeader class="mb-2 flex items-center justify-between gap-1">
            <RangeCalendarPrev
              class="crm-cal-nav"
              :aria-label="t('common.datePicker.nav.prevMonth')"
            >
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
                <path d="m15 18-6-6 6-6" />
              </svg>
            </RangeCalendarPrev>
            <RangeCalendarHeading class="crm-cal-heading" />
            <RangeCalendarNext
              class="crm-cal-nav"
              :aria-label="t('common.datePicker.nav.nextMonth')"
            >
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
                <path d="m9 18 6-6-6-6" />
              </svg>
            </RangeCalendarNext>
          </RangeCalendarHeader>

          <div class="flex flex-col gap-4 sm:flex-row">
            <RangeCalendarGrid
              v-for="month in grid"
              :key="month.value.toString()"
              class="border-collapse"
            >
              <RangeCalendarGridHead>
                <RangeCalendarGridRow class="flex">
                  <RangeCalendarHeadCell
                    v-for="day in weekDays"
                    :key="day"
                    class="crm-cal-weekday w-9"
                  >
                    {{ day }}
                  </RangeCalendarHeadCell>
                </RangeCalendarGridRow>
              </RangeCalendarGridHead>
              <RangeCalendarGridBody>
                <RangeCalendarGridRow
                  v-for="(week, weekIndex) in month.rows"
                  :key="weekIndex"
                  class="flex w-full"
                >
                  <RangeCalendarCell
                    v-for="date in week"
                    :key="date.toString()"
                    :date="date"
                    class="p-0"
                  >
                    <RangeCalendarCellTrigger
                      :day="date"
                      :month="month.value"
                      class="crm-cal-day-range"
                    />
                  </RangeCalendarCell>
                </RangeCalendarGridRow>
              </RangeCalendarGridBody>
            </RangeCalendarGrid>
          </div>
        </RangeCalendarRoot>

        <div v-if="clearable" class="mt-2 flex justify-end border-t border-border-subtle pt-2">
          <button
            type="button"
            class="rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-raise hover:text-text-primary"
            @click="clear"
          >
            {{ t('common.datePicker.clear') }}
          </button>
        </div>
      </div>
    </div>
  </AppPopover>
</template>

<script setup lang="ts">
/**
 * Date-range control (docs/DESIGN-SYSTEM.md §6, ADR-0012) — one trigger, two months
 * and a preset rail, replacing the pair of loose native date inputs that used to
 * carry a from/to filter.
 *
 * Model is `{ from, to }` as ISO days. Reka owns the two-click selection and already
 * orders a backwards drag, so we only publish upward on `update:validModelValue` —
 * the event that fires when both ends exist. Emitting on every intermediate state
 * would refetch with a half-open range on the first click.
 */
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMediaQuery } from '@vueuse/core';
import {
  RangeCalendarRoot,
  RangeCalendarHeader,
  RangeCalendarHeading,
  RangeCalendarPrev,
  RangeCalendarNext,
  RangeCalendarGrid,
  RangeCalendarGridHead,
  RangeCalendarGridBody,
  RangeCalendarGridRow,
  RangeCalendarHeadCell,
  RangeCalendarCell,
  RangeCalendarCellTrigger,
} from 'reka-ui';
import type { DateRange } from 'reka-ui';
import { cn } from '../../lib/utils';
import { intlTagFor } from '../../i18n/locales';
import AppPopover from './AppPopover.vue';
import {
  isoDayToLocalDate,
  matchPreset,
  normalizeRange,
  parseIsoDay,
  presetRange,
  toIsoDay,
  type DayRange,
  type IsoDay,
  type RangePreset,
} from '../../utils/date-range';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  modelValue: DayRange;
  /** Earliest selectable day, inclusive. */
  minDay?: IsoDay | null;
  /** Latest selectable day, inclusive. */
  maxDay?: IsoDay | null;
  /** Shown when no range is chosen. No default — `t()` cannot run in `withDefaults()`. */
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  clearable?: boolean;
  id?: string;
  triggerClass?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: DayRange): void;
  (e: 'change', value: DayRange): void;
}>();

const { t, d, locale } = useI18n();
const intlTag = computed(() => intlTagFor(locale.value));
const open = ref(false);

/** Reka's own fallback here is the English literal "Event Date" — never let it show. */
const gridLabel = computed(() => props.ariaLabel ?? t('common.datePicker.calendarLabel'));

/** One month below `sm` — two side by side would overflow a phone. */
const isWide = useMediaQuery('(min-width: 640px)');
const monthCount = computed(() => (isWide.value ? 2 : 1));

const hasRange = computed(() => Boolean(props.modelValue.from && props.modelValue.to));
const fromLabel = computed(() =>
  props.modelValue.from ? d(isoDayToLocalDate(props.modelValue.from), 'dateShort') : '',
);
const toLabel = computed(() =>
  props.modelValue.to ? d(isoDayToLocalDate(props.modelValue.to), 'dateShort') : '',
);

/**
 * The visible label is two dates and a glyph; the accessible name has to be a
 * sentence, so it comes from one message with named params rather than from the
 * fragments being read out in DOM order.
 */
const triggerAriaLabel = computed(() =>
  hasRange.value
    ? t('common.datePicker.range.ariaValue', { from: fromLabel.value, to: toLabel.value })
    : (props.ariaLabel ?? t('common.datePicker.range.placeholder')),
);

const selected = computed<DateRange>(() => {
  const ordered = normalizeRange(props.modelValue);
  return { start: parseIsoDay(ordered.from), end: parseIsoDay(ordered.to) };
});
const min = computed(() => parseIsoDay(props.minDay));
const max = computed(() => parseIsoDay(props.maxDay));

/**
 * Written out rather than built from `RANGE_PRESETS`: a concatenated key is
 * invisible to `pnpm lint:i18n`, so a deleted message would only surface as a raw
 * key on screen (`.claude/rules/i18n.md`).
 */
const presetOptions = computed(() => [
  { value: 'last7' as const, label: t('common.datePicker.presets.last7') },
  { value: 'last30' as const, label: t('common.datePicker.presets.last30') },
  { value: 'last90' as const, label: t('common.datePicker.presets.last90') },
  { value: 'thisMonth' as const, label: t('common.datePicker.presets.thisMonth') },
  { value: 'prevMonth' as const, label: t('common.datePicker.presets.prevMonth') },
]);

const activePreset = computed(() => matchPreset(props.modelValue));

function publish(range: DayRange) {
  emit('update:modelValue', range);
  emit('change', range);
}

function onRangeComplete(range: DateRange) {
  if (!range.start || !range.end) return;
  publish({ from: toIsoDay(range.start), to: toIsoDay(range.end) });
  open.value = false;
}

function applyPreset(preset: RangePreset) {
  publish(presetRange(preset));
  open.value = false;
}

function clear() {
  publish({ from: null, to: null });
  open.value = false;
}
</script>
