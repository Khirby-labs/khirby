<template>
  <div class="crm-card w-full min-w-0 overflow-hidden">
    <table class="w-full table-fixed text-sm">
      <caption v-if="caption" class="sr-only">
        {{
          caption
        }}
      </caption>
      <thead>
        <tr class="border-b border-border">
          <th
            v-for="col in columns"
            :key="col.key"
            class="px-3 py-3 text-xs font-medium text-text-ghost uppercase tracking-wider"
            :class="[col.align === 'right' ? 'text-right' : 'text-left', col.class]"
            :aria-sort="ariaSortFor(col)"
          >
            <button
              v-if="col.sortable"
              type="button"
              class="inline-flex items-center gap-1 max-w-full uppercase tracking-wider text-text-ghost hover:text-text-secondary transition-colors"
              :class="col.align === 'right' ? 'ml-auto' : ''"
              @click="onSort(col.key)"
            >
              <span class="truncate">{{ col.label }}</span>
              <span
                class="font-mono text-[10px] text-accent tabular-nums shrink-0"
                aria-hidden="true"
              >
                {{ sortIndicator(col.key) }}
              </span>
            </button>
            <template v-else>{{ col.label }}</template>
          </th>
          <th v-if="hasActions" class="px-3 py-3 w-20" />
        </tr>
      </thead>
      <tbody>
        <template v-if="loading">
          <tr v-for="i in 5" :key="i" class="border-b border-border-subtle">
            <td v-for="col in columns" :key="col.key" class="px-3 py-3" :class="col.class">
              <div class="h-4 bg-surface-raise2 rounded animate-pulse" />
            </td>
            <td v-if="hasActions" class="px-3 py-3 w-20">
              <div class="h-4 bg-surface-raise2 rounded animate-pulse" />
            </td>
          </tr>
        </template>
        <tr v-else-if="!rows.length">
          <td :colspan="columns.length + (hasActions ? 1 : 0)" class="p-0">
            <slot name="empty">
              <p class="crm-empty">{{ emptyText ?? t('common.state.noData') }}</p>
            </slot>
          </td>
        </tr>
        <tr
          v-else
          v-for="row in rows"
          :key="(row as any).id"
          class="border-b border-border-subtle last:border-0 transition-colors duration-100"
          :class="clickable ? 'cursor-pointer hover:bg-surface-raise' : ''"
          :tabindex="clickable ? 0 : undefined"
          :role="clickable ? 'button' : undefined"
          @click="clickable ? $emit('row-click', row) : null"
          @keydown.enter.space.prevent="clickable ? $emit('row-click', row) : null"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            class="px-3 py-3 text-text-secondary min-w-0"
            :class="[col.align === 'right' ? 'text-right' : '', col.class]"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="(row as any)[col.key]">
              <span
                class="block truncate"
                :class="col.key === columns[0].key ? 'text-text-primary font-medium' : ''"
                :title="cellTitle(row, col.key)"
              >
                {{ (row as any)[col.key] ?? '—' }}
              </span>
            </slot>
          </td>
          <td v-if="hasActions" class="px-3 py-3 w-20 whitespace-nowrap text-right">
            <slot name="actions" :row="row" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

/**
 * `emptyText` deliberately has NO default: withDefaults() is evaluated outside a
 * component instance, so t() cannot run there. The fallback is resolved in the
 * template instead (`.claude/rules/i18n.md`).
 *
 * `table-fixed` + truncate keeps wide tables inside the responsive shell — cells
 * no longer force a horizontal page scroll.
 */
const { t } = useI18n();

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  /** Extra classes on th/td (e.g. column width hints under table-fixed). */
  class?: string;
}

export type TableSortDir = 'asc' | 'desc';

const props = withDefaults(
  defineProps<{
    columns: TableColumn[];
    rows: any[];
    emptyText?: string;
    clickable?: boolean;
    hasActions?: boolean;
    caption?: string;
    loading?: boolean;
    sortKey?: string | null;
    sortDir?: TableSortDir;
  }>(),
  {
    clickable: false,
    hasActions: false,
    loading: false,
    sortKey: null,
    sortDir: 'desc',
  },
);

const emit = defineEmits<{
  (e: 'row-click', row: any): void;
  (e: 'sort-change', payload: { key: string; dir: TableSortDir }): void;
}>();

function cellTitle(row: any, key: string): string | undefined {
  const value = row?.[key];
  return value == null || value === '' ? undefined : String(value);
}

function ariaSortFor(col: TableColumn): 'ascending' | 'descending' | 'none' | undefined {
  if (!col.sortable) return undefined;
  if (props.sortKey !== col.key) return 'none';
  return props.sortDir === 'asc' ? 'ascending' : 'descending';
}

function sortIndicator(key: string): string {
  if (props.sortKey !== key) return '';
  return props.sortDir === 'asc' ? '↑' : '↓';
}

function onSort(key: string) {
  const dir: TableSortDir = props.sortKey === key && props.sortDir === 'desc' ? 'asc' : 'desc';
  emit('sort-change', { key, dir });
}
</script>
