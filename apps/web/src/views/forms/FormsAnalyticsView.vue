<template>
  <div class="space-y-6">
    <h2 class="crm-page-title">{{ t('forms.analytics.title') }}</h2>

    <div class="crm-panel p-4 flex flex-wrap gap-4 items-end">
      <div>
        <label for="stats-range" class="crm-label">{{ t('forms.analytics.filters.range') }}</label>
        <AppDateRangePicker
          id="stats-range"
          v-model="filters.range"
          :max-day="today"
          :aria-label="t('forms.analytics.filters.range')"
          clearable
          trigger-class="min-w-[15rem]"
        />
      </div>
      <div>
        <!-- A span, not a <label>: AppSelect's trigger is inside Reka's Select and takes
             no `id`, so it names itself with `aria-label` instead. -->
        <span class="crm-label">{{ t('forms.analytics.filters.form') }}</span>
        <AppSelect
          v-model="filters.formId"
          :options="formOptions"
          :aria-label="t('forms.analytics.filters.form')"
          :placeholder="t('forms.analytics.filters.allForms')"
          trigger-class="min-w-[180px]"
        />
      </div>
      <!-- Refetching keeps the previous numbers on screen, so the only signal that a
           filter change took effect is this line. The skeleton covers the first load only. -->
      <p v-if="loading && stats" class="pb-2 text-xs text-text-ghost">
        {{ t('common.state.loading') }}
      </p>
    </div>

    <div v-if="error" class="crm-error">{{ error }}</div>

    <SkeletonRows v-if="loading && !stats" :rows="3" height="4rem" />

    <template v-else-if="stats">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="crm-panel p-5">
          <p class="text-xs text-text-ghost uppercase tracking-wider">
            {{ t('forms.analytics.stats.total') }}
          </p>
          <p class="text-3xl font-semibold text-text-primary mt-2 font-mono tabular-nums">
            {{ n(stats.total, 'integer') }}
          </p>
        </div>
        <div class="crm-panel p-5">
          <p class="text-xs text-text-ghost uppercase tracking-wider">
            {{ t('forms.analytics.stats.activeForms') }}
          </p>
          <p class="text-3xl font-semibold text-text-primary mt-2 font-mono tabular-nums">
            {{ n(stats.activeForms, 'integer') }}
          </p>
        </div>
      </div>

      <div class="crm-panel p-6">
        <h3 class="text-sm font-semibold text-text-secondary mb-4">
          {{ t('forms.analytics.byForm.title') }}
        </h3>
        <EmptyState
          v-if="stats.byForm.length === 0"
          :title="t('forms.analytics.byForm.empty.title')"
          :message="t('forms.analytics.byForm.empty.message')"
        />
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-text-ghost border-b border-border">
              <th class="pb-2">{{ t('forms.analytics.byForm.columns.form') }}</th>
              <th class="pb-2 text-right">
                {{ t('forms.analytics.byForm.columns.submissions') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in stats.byForm"
              :key="row.formId"
              class="border-b border-border-subtle text-text-secondary"
            >
              <td class="py-2">{{ row.formName }}</td>
              <td class="py-2 text-right font-mono tabular-nums">{{ n(row.count, 'integer') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="stats.byDay?.length" class="crm-panel p-6">
        <h3 class="text-sm font-semibold text-text-secondary mb-4">
          {{ t('forms.analytics.daily.title') }}
        </h3>
        <div class="flex items-end gap-1 h-40">
          <div
            v-for="day in stats.byDay"
            :key="day.day"
            class="flex-1 flex flex-col items-center justify-end gap-1 min-w-0"
          >
            <span class="text-[10px] text-text-ghost font-mono tabular-nums">{{
              n(day.count, 'integer')
            }}</span>
            <div
              class="w-full bg-info rounded-t"
              :style="{ height: barHeight(day.count) }"
              :title="barTooltip(day.day, day.count)"
            />
            <span class="text-[9px] text-text-ghost truncate w-full text-center">{{
              dayLabel(day.day)
            }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { watchDebounced } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import type { FormListItem, FormStats } from '@khirby/types';
import { useFormsStore } from '../../stores/forms.store';
import AppSelect from '../../components/ui/AppSelect.vue';
import AppDateRangePicker from '../../components/ui/AppDateRangePicker.vue';
import EmptyState from '../../components/ui/EmptyState.vue';
import SkeletonRows from '../../components/ui/SkeletonRows.vue';
import {
  localDayEnd,
  localDayStart,
  presetRange,
  todayIsoDay,
  type DayRange,
} from '../../utils/date-range';

const { t, d, n } = useI18n();
const formsStore = useFormsStore();

// Reka's SelectItem forbids an empty-string value, so "All forms" uses a sentinel
// that maps back to "no filter" when the query is built.
const ALL_FORMS = '__all__';

const formsList = ref<FormListItem[]>([]);
const formOptions = computed(() => [
  { value: ALL_FORMS, label: t('forms.analytics.filters.allForms') },
  // Form names are the operator's own data — rendered raw, never translated.
  ...formsList.value.map((f) => ({ value: f.id, label: f.name })),
]);
const stats = ref<FormStats | null>(null);
const loading = ref(false);
const error = ref('');

/** No range in the future — an analytics window past today is always a mis-click. */
const today = todayIsoDay();

/**
 * Opens on the last 30 days rather than on everything: an unbounded first query
 * scans the whole table and the daily chart draws one bar per day since launch.
 */
const filters = ref<{ range: DayRange; formId: string }>({
  range: presetRange('last30'),
  formId: ALL_FORMS,
});

const maxDailyCount = ref(1);
/** Monotonic request id — a slow response from an earlier click must not overwrite a newer one. */
let requestSeq = 0;

/**
 * Auto-apply — there is no "Apply" button any more, because there was nothing left
 * for it to collect: both controls commit a whole value at once (a complete range, a
 * chosen form). The debounce only coalesces a fast second click; `requestSeq` above
 * is what guarantees the newest response wins, so ordering never depends on it.
 */
watchDebounced(filters, () => void loadStats(), { debounce: 250, deep: true });

onMounted(async () => {
  try {
    await formsStore.fetchForms();
    formsList.value = formsStore.forms;
  } catch {
    // ignore — filters still work
  }
  await loadStats();
});

async function loadStats() {
  const seq = ++requestSeq;
  loading.value = true;
  error.value = '';
  try {
    const result = await formsStore.fetchStats({
      from: filters.value.range.from ? localDayStart(filters.value.range.from) : undefined,
      to: filters.value.range.to ? localDayEnd(filters.value.range.to) : undefined,
      formId:
        filters.value.formId && filters.value.formId !== ALL_FORMS
          ? filters.value.formId
          : undefined,
      daily: true,
    });
    if (seq !== requestSeq) return; // a newer request already won
    stats.value = result;
    // Named `entry`, not `d`: that would shadow the i18n date formatter.
    maxDailyCount.value = Math.max(1, ...(result.byDay?.map((entry) => entry.count) ?? [1]));
  } catch (e: unknown) {
    if (seq !== requestSeq) return;
    error.value = e instanceof Error ? e.message : t('forms.errors.loadStats');
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

function barHeight(count: number): string {
  const pct = (count / maxDailyCount.value) * 100;
  return `${Math.max(pct, 4)}%`;
}

/** Named format, no inline locale — this was `toLocaleDateString('en-US', …)`. */
function dayLabel(day: string): string {
  // dayMonth, not dateShort: a full date under each of 30 bars is unreadable.
  return d(new Date(`${day}T00:00:00`), 'dayMonth');
}

/**
 * The tooltip used to interpolate the raw ISO day and a bare integer.
 *
 * `dateShort`, not the axis label's `dayMonth`: the tooltip is the disambiguating
 * detail and has no width to fit, while a 30-day window straddling New Year would
 * otherwise show "31 gru" and "01 sty" with no way to tell which year each is.
 */
function barTooltip(day: string, count: number): string {
  return t(
    'forms.analytics.daily.barTitle',
    { date: d(new Date(`${day}T00:00:00`), 'dateShort'), count: n(count, 'integer') },
    count,
  );
}
</script>
