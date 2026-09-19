<template>
  <div class="crm-card w-full min-w-0" :class="resizable ? 'overflow-x-auto' : 'overflow-hidden'">
    <table class="w-full table-fixed text-sm" :style="tableMinWidthStyle">
      <caption v-if="caption" class="sr-only">
        {{
          caption
        }}
      </caption>
      <colgroup v-if="resizable">
        <col v-for="col in columns" :key="col.key" :style="{ width: `${effectiveWidth(col)}px` }" />
        <col v-if="hasActions" style="width: 5rem" />
      </colgroup>
      <thead>
        <tr class="border-b border-border">
          <th
            v-for="col in columns"
            :key="col.key"
            class="relative px-3 py-3 text-xs font-medium text-text-ghost uppercase tracking-wider select-none"
            :class="[col.align === 'right' ? 'text-right' : 'text-left', col.class]"
            :aria-sort="ariaSortFor(col)"
            scope="col"
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
            <span v-else class="truncate block pr-2">{{ col.label }}</span>

            <span
              v-if="resizable"
              class="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-accent/40 active:bg-accent/60"
              role="separator"
              :aria-orientation="'vertical'"
              :aria-label="t('common.table.resizeColumn', { column: col.label })"
              @mousedown.prevent="startResize(col, $event)"
              @dblclick.prevent="resetWidth(col.key)"
            />
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
            class="px-3 py-3 text-text-secondary min-w-0 overflow-hidden"
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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * `emptyText` deliberately has NO default: withDefaults() is evaluated outside a
 * component instance, so t() cannot run there. The fallback is resolved in the
 * template instead (`.claude/rules/i18n.md`).
 *
 * `table-fixed` + col widths keep columns stable; optional `resizable` adds drag
 * handles and persists widths when `storageKey` is set.
 */
const { t } = useI18n();

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  /** Extra classes on th/td (e.g. column width hints under table-fixed). */
  class?: string;
  /** Initial width in px when resizable (or as a fixed hint). */
  width?: number;
  /** Minimum width while resizing (default 64). */
  minWidth?: number;
}

export type TableSortDir = 'asc' | 'desc';

const DEFAULT_WIDTH = 140;
const DEFAULT_MIN_WIDTH = 64;

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
    /** Enable drag-to-resize column headers. */
    resizable?: boolean;
    /** localStorage key for persisted column widths (requires resizable). */
    storageKey?: string;
  }>(),
  {
    clickable: false,
    hasActions: false,
    loading: false,
    sortKey: null,
    sortDir: 'desc',
    resizable: false,
  },
);

const emit = defineEmits<{
  (e: 'row-click', row: any): void;
  (e: 'sort-change', payload: { key: string; dir: TableSortDir }): void;
}>();

const widths = ref<Record<string, number>>({});

watch(
  () => [props.columns, props.storageKey, props.resizable] as const,
  () => {
    widths.value = loadWidths();
  },
  { immediate: true, deep: true },
);

const tableMinWidthStyle = computed(() => {
  if (!props.resizable) return undefined;
  const cols = props.columns.reduce((sum, col) => sum + effectiveWidth(col), 0);
  const actions = props.hasActions ? 80 : 0;
  return { minWidth: `${cols + actions}px` };
});

function defaultWidthFor(col: TableColumn): number {
  return col.width ?? DEFAULT_WIDTH;
}

function minWidthFor(col: TableColumn): number {
  return col.minWidth ?? DEFAULT_MIN_WIDTH;
}

function effectiveWidth(col: TableColumn): number {
  const stored = widths.value[col.key];
  if (typeof stored === 'number' && Number.isFinite(stored)) {
    return Math.max(minWidthFor(col), stored);
  }
  return defaultWidthFor(col);
}

function loadWidths(): Record<string, number> {
  const next: Record<string, number> = {};
  for (const col of props.columns) {
    next[col.key] = defaultWidthFor(col);
  }
  if (!props.resizable || !props.storageKey || typeof localStorage === 'undefined') {
    return next;
  }
  try {
    const raw = localStorage.getItem(props.storageKey);
    if (!raw) return next;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const col of props.columns) {
      const v = parsed[col.key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        next[col.key] = Math.max(minWidthFor(col), Math.round(v));
      }
    }
  } catch {
    // ignore corrupt storage
  }
  return next;
}

function persistWidths() {
  if (!props.storageKey || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(props.storageKey, JSON.stringify(widths.value));
  } catch {
    // quota / private mode
  }
}

function resetWidth(key: string) {
  const col = props.columns.find((c) => c.key === key);
  if (!col) return;
  widths.value = { ...widths.value, [key]: defaultWidthFor(col) };
  persistWidths();
}

type ResizeState = {
  key: string;
  startX: number;
  startWidth: number;
  minWidth: number;
};

const resizing = ref<ResizeState | null>(null);

function startResize(col: TableColumn, event: MouseEvent) {
  if (!props.resizable) return;
  resizing.value = {
    key: col.key,
    startX: event.clientX,
    startWidth: effectiveWidth(col),
    minWidth: minWidthFor(col),
  };
  window.addEventListener('mousemove', onResizeMove);
  window.addEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function onResizeMove(event: MouseEvent) {
  const state = resizing.value;
  if (!state) return;
  const delta = event.clientX - state.startX;
  const next = Math.max(state.minWidth, Math.round(state.startWidth + delta));
  widths.value = { ...widths.value, [state.key]: next };
}

function onResizeEnd() {
  if (!resizing.value) return;
  resizing.value = null;
  window.removeEventListener('mousemove', onResizeMove);
  window.removeEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  persistWidths();
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onResizeMove);
  window.removeEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

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
