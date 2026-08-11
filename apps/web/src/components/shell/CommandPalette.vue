<template>
  <DialogRoot
    :open="ui.commandOpen"
    @update:open="(v: boolean) => (v ? ui.openCommand() : ui.closeCommand())"
  >
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[80] bg-black/60" />
      <DialogContent
        class="fixed left-1/2 top-[12vh] z-[80] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-2xl focus:outline-none"
        @open-auto-focus="onAutoFocus"
        @keydown="onKeydown"
      >
        <DialogTitle class="sr-only">{{ t('shell.palette.title') }}</DialogTitle>
        <DialogDescription class="sr-only">{{ t('shell.palette.description') }}</DialogDescription>

        <!-- Search field -->
        <div class="flex items-center gap-3 border-b border-border-subtle px-4">
          <svg
            class="h-4 w-4 flex-shrink-0 text-text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref="inputEl"
            v-model="query"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            :aria-activedescendant="activeId"
            :aria-label="t('shell.palette.inputAria')"
            :placeholder="t('shell.palette.placeholder')"
            class="w-full bg-transparent py-3.5 text-sm text-text-primary placeholder-text-ghost focus:outline-none"
          />
          <kbd
            class="hidden flex-shrink-0 rounded border border-border bg-surface-input px-1.5 py-0.5 font-mono text-[10px] text-text-muted sm:inline"
          >
            Esc
          </kbd>
        </div>

        <!-- Results -->
        <div
          id="command-list"
          role="listbox"
          :aria-label="t('shell.palette.listAria')"
          class="max-h-[52vh] overflow-y-auto p-1.5"
        >
          <template v-for="group in filteredGroups" :key="group.heading">
            <p
              v-if="group.items.length"
              class="px-2.5 pb-1 pt-2.5 font-mono text-[10px] uppercase tracking-wider text-text-ghost"
            >
              {{ group.heading }}
            </p>
            <button
              v-for="item in group.items"
              :id="`cmd-${item.index}`"
              :key="item.index"
              type="button"
              role="option"
              :aria-selected="item.index === highlighted"
              class="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-text-secondary transition-colors"
              :class="
                item.index === highlighted
                  ? 'bg-surface-raise2 text-text-primary'
                  : 'hover:bg-surface-raise'
              "
              @click="run(item)"
              @mousemove="highlighted = item.index"
            >
              <NavIcon :name="item.icon" />
              <span class="flex-1 min-w-0">
                <span class="block truncate">{{ item.label }}</span>
                <span v-if="item.detail" class="block truncate text-xs text-text-ghost font-normal">
                  {{ item.detail }}
                </span>
              </span>
              <span v-if="item.kind === 'create'" class="font-mono text-[10px] text-text-ghost">
                {{ t('shell.palette.createTag') }}
              </span>
            </button>
          </template>

          <p v-if="totalCount === 0" class="px-2.5 py-6 text-center text-sm text-text-ghost">
            {{ t('shell.palette.noMatches', { query }) }}
          </p>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
/**
 * Global command palette (⌘K) — navigate, quick-create, and contact search.
 * Reka Dialog handles focus trap / Esc / scroll-lock; we own the filterable list
 * and its keyboard model (arrow keys + Enter, aria-activedescendant on the input).
 */
import { ref, computed, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from 'reka-ui';
import NavIcon from '../NavIcon.vue';
import type { NavIconName } from '../nav-icons';
import { useUiStore } from '../../stores/ui.store';
import { usePluginsStore } from '../../stores/plugins.store';
import { buildCommandGroups, filterCommandGroups, type CommandItem } from '../../lib/nav';
import { useServerText } from '../../composables/useServerText';
import { apiGet } from '../../api/client';

const { t } = useI18n();
const { pluginNavLabel } = useServerText();
const ui = useUiStore();
const router = useRouter();
const pluginsStore = usePluginsStore();
const { plugins } = storeToRefs(pluginsStore);

const inputEl = ref<HTMLInputElement | null>(null);
const query = ref('');
const highlighted = ref(0);
const contactHits = ref<CommandItem[]>([]);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchSeq = 0;

type Command = CommandItem & { index?: number };

interface ContactHit {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
}

const pluginCommands = computed<Command[]>(() =>
  plugins.value
    .filter((p) => p.enabled && p.frontendRoutes?.length)
    .flatMap((p) =>
      p
        .frontendRoutes!.filter((r) => r.showInNav !== false)
        .map((r) => ({
          kind: 'nav' as const,
          label: pluginNavLabel(r),
          to: r.path,
          icon: 'plugins' as NavIconName,
        })),
    ),
);

/** Filtered groups, each item tagged with its flat keyboard index. */
const filteredGroups = computed(() => {
  const navGroups = filterCommandGroups(buildCommandGroups(t, pluginCommands.value), query.value);
  const groups = [...navGroups];
  if (contactHits.value.length) {
    groups.unshift({
      heading: t('nav.commandGroup.contacts'),
      items: contactHits.value,
    });
  }
  let i = 0;
  return groups.map((g) => ({
    heading: g.heading,
    items: g.items.map((it) => ({ ...it, index: i++ })),
  }));
});

const flatItems = computed(() => filteredGroups.value.flatMap((g) => g.items));
const totalCount = computed(() => flatItems.value.length);
const activeId = computed(() => (totalCount.value ? `cmd-${highlighted.value}` : undefined));

watch(query, (q) => {
  highlighted.value = 0;
  scheduleContactSearch(q);
});
watch(
  () => ui.commandOpen,
  (open) => {
    if (open) {
      query.value = '';
      highlighted.value = 0;
      contactHits.value = [];
      if (searchTimer) clearTimeout(searchTimer);
    }
  },
);

function scheduleContactSearch(raw: string) {
  if (searchTimer) clearTimeout(searchTimer);
  const q = raw.trim();
  if (q.length < 2) {
    contactHits.value = [];
    return;
  }
  const seq = ++searchSeq;
  searchTimer = setTimeout(() => {
    void fetchContacts(q, seq);
  }, 250);
}

async function fetchContacts(q: string, seq: number) {
  try {
    const params = new URLSearchParams({
      search: q,
      page: '1',
      pageSize: '8',
      sortBy: 'createdAt',
      sortDir: 'desc',
    });
    const res = await apiGet<{ data: ContactHit[] }>(`/api/contacts?${params}`);
    if (seq !== searchSeq) return;
    contactHits.value = (res.data ?? []).map((c) => {
      const name = c.name?.trim();
      return {
        kind: 'contact' as const,
        label: name || c.email,
        detail: name ? c.email : c.phone?.trim() || undefined,
        to: `/contacts/${c.id}`,
        icon: 'contacts' as NavIconName,
      };
    });
  } catch {
    if (seq !== searchSeq) return;
    contactHits.value = [];
  }
}

function onAutoFocus(e: Event) {
  e.preventDefault();
  nextTick(() => inputEl.value?.focus());
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (totalCount.value) highlighted.value = (highlighted.value + 1) % totalCount.value;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (totalCount.value)
      highlighted.value = (highlighted.value - 1 + totalCount.value) % totalCount.value;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = flatItems.value.find((it) => it.index === highlighted.value);
    if (item) run(item);
  }
}

function run(item: Command) {
  ui.closeCommand();
  router.push(item.to);
}
</script>
