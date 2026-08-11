<template>
  <header
    class="flex h-12 flex-shrink-0 items-center gap-3 border-b border-border-subtle bg-surface-panel px-4"
  >
    <!-- Mobile: open the nav drawer -->
    <button
      class="-ml-1 rounded-md p-2 text-text-muted hover:bg-surface-raise hover:text-text-primary md:hidden"
      :aria-label="t('shell.topbar.openNav')"
      @click="ui.mobileNavOpen = true"
    >
      <svg
        class="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>

    <!-- Breadcrumb — only on nested pages, so it never repeats the page's own heading -->
    <nav
      v-if="crumbs.length"
      class="flex min-w-0 items-center gap-2 text-sm"
      :aria-label="t('shell.topbar.breadcrumb')"
    >
      <RouterLink
        :to="crumbs[0].to!"
        class="truncate text-text-muted transition-colors hover:text-text-primary"
      >
        {{ crumbs[0].label }}
      </RouterLink>
      <svg
        class="h-3.5 w-3.5 flex-shrink-0 text-text-ghost"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
      <span class="truncate font-medium text-text-primary">{{ crumbs[1].label }}</span>
    </nav>

    <!-- Global search — opens the command palette -->
    <button
      class="flex h-8 w-full max-w-[15rem] items-center gap-2.5 rounded-md border border-border bg-surface-input px-2.5 text-sm text-text-ghost transition-colors hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      :aria-label="t('shell.topbar.searchAria', { shortcut: shortcutSpoken })"
      @click="ui.openCommand()"
    >
      <svg
        class="h-4 w-4 flex-shrink-0"
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
      <span class="flex-1 text-left">{{ t('shell.topbar.search') }}</span>
      <kbd
        class="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] sm:inline"
        >{{ shortcutKbd }}</kbd
      >
    </button>

    <!-- Contextual page actions (filled by the current view) + global create -->
    <div class="ml-auto flex items-center gap-2">
      <div id="topbar-actions" class="flex items-center gap-2 empty:hidden" />
      <QuickCreateMenu />
    </div>
  </header>
</template>

<script setup lang="ts">
/**
 * Global top bar. Stable frame — search + "+ New" are always present; the
 * #topbar-actions slot is filled per-view via <PageActions>. The breadcrumb
 * shows only on nested routes, so the bar never duplicates a page's own title.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRoute } from 'vue-router';
import QuickCreateMenu from './QuickCreateMenu.vue';
import { useUiStore } from '../../stores/ui.store';

const { t } = useI18n();
const ui = useUiStore();
const route = useRoute();

interface Crumb {
  label: string;
  to?: string;
}

/**
 * [parent, current] when the route declares a parent; empty on top-level pages.
 * Route records are module-level, so `meta` carries keys and the translation
 * happens here — otherwise every breadcrumb would freeze at the boot locale.
 */
const crumbs = computed<Crumb[]>(() => {
  const parent = route.meta.parent as { labelKey: string; to: string } | undefined;
  const titleKey = route.meta.titleKey as string | undefined;
  if (parent && titleKey) {
    return [{ label: t(parent.labelKey), to: parent.to }, { label: t(titleKey) }];
  }
  return [];
});

/**
 * The shortcut hint is platform-derived, not translated: ⌘ is a macOS glyph and
 * was previously hardcoded, so it was simply wrong on every Windows and Linux
 * machine. Only the surrounding sentence is a message.
 */
const isMac = /mac/i.test(navigator.platform ?? navigator.userAgent ?? '');
const shortcutKbd = isMac ? '⌘K' : 'Ctrl+K';
const shortcutSpoken = isMac ? 'Command + K' : 'Control + K';
</script>
