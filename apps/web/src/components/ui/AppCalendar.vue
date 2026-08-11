<template>
  <CalendarRoot
    v-slot="{ grid, weekDays }"
    :model-value="selected"
    :min-value="min"
    :max-value="max"
    :locale="intlTag"
    :calendar-label="gridLabel"
    fixed-weeks
    initial-focus
    class="inline-block"
    @update:model-value="onSelect"
  >
    <CalendarHeader class="mb-2 flex items-center justify-between gap-1">
      <CalendarPrev class="crm-cal-nav" :aria-label="t('common.datePicker.nav.prevMonth')">
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
      </CalendarPrev>
      <CalendarHeading class="crm-cal-heading" />
      <CalendarNext class="crm-cal-nav" :aria-label="t('common.datePicker.nav.nextMonth')">
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
      </CalendarNext>
    </CalendarHeader>

    <CalendarGrid
      v-for="month in grid"
      :key="month.value.toString()"
      class="w-full border-collapse"
    >
      <CalendarGridHead>
        <CalendarGridRow class="flex">
          <CalendarHeadCell v-for="day in weekDays" :key="day" class="crm-cal-weekday w-9">
            {{ day }}
          </CalendarHeadCell>
        </CalendarGridRow>
      </CalendarGridHead>
      <CalendarGridBody>
        <CalendarGridRow
          v-for="(week, weekIndex) in month.rows"
          :key="weekIndex"
          class="flex w-full"
        >
          <CalendarCell v-for="date in week" :key="date.toString()" :date="date" class="p-0">
            <CalendarCellTrigger :day="date" :month="month.value" class="crm-cal-day" />
          </CalendarCell>
        </CalendarGridRow>
      </CalendarGridBody>
    </CalendarGrid>
  </CalendarRoot>
</template>

<script setup lang="ts">
/**
 * Token-styled month grid on Reka's Calendar primitives (docs/DESIGN-SYSTEM.md §6,
 * ADR-0012). Used inline, or inside `AppDatePicker`'s popover.
 *
 * Speaks ISO days (`'2026-07-24'`), never `Date` or `DateValue` — see
 * `utils/date-range.ts` for why. Month and weekday names are NOT translated here:
 * Reka derives them from Intl for `intlTag`, so a new language needs no keys, and
 * the first day of the week follows the locale instead of a hardcoded Monday.
 *
 * `weekStartsOn` is deliberately not set: overriding it would be a per-call-site
 * localization decision, which `.claude/rules/i18n.md` puts in the registry instead.
 */
import { computed } from 'vue';
import {
  CalendarRoot,
  CalendarHeader,
  CalendarHeading,
  CalendarPrev,
  CalendarNext,
  CalendarGrid,
  CalendarGridHead,
  CalendarGridBody,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarCell,
  CalendarCellTrigger,
} from 'reka-ui';
import type { DateValue } from '@internationalized/date';
import { useI18n } from 'vue-i18n';
import { intlTagFor } from '../../i18n/locales';
import { parseIsoDay, toIsoDay, type IsoDay } from '../../utils/date-range';

const props = defineProps<{
  modelValue: IsoDay | null;
  /** Earliest selectable day, inclusive. */
  minDay?: IsoDay | null;
  /** Latest selectable day, inclusive. */
  maxDay?: IsoDay | null;
  /** Accessible name for the grid — a bare calendar has none. */
  ariaLabel?: string;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: IsoDay | null): void }>();

const { t, locale } = useI18n();
const intlTag = computed(() => intlTagFor(locale.value));

/** Reka's own fallback here is the English literal "Event Date" — never let it show. */
const gridLabel = computed(() => props.ariaLabel ?? t('common.datePicker.calendarLabel'));

const selected = computed(() => parseIsoDay(props.modelValue));
const min = computed(() => parseIsoDay(props.minDay));
const max = computed(() => parseIsoDay(props.maxDay));

/**
 * Reka's model can be an array (multi-select) or null (deselect). We only ever
 * enable single select, so anything else collapses to "nothing chosen".
 */
function onSelect(value: DateValue | DateValue[] | undefined) {
  if (!value || Array.isArray(value)) {
    emit('update:modelValue', null);
    return;
  }
  emit('update:modelValue', toIsoDay(value));
}
</script>
