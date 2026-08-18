<template>
  <!-- Mobile scrim -->
  <div
    v-if="ui.mobileNavOpen"
    class="fixed inset-0 z-20 bg-black/60 md:hidden"
    @click="ui.mobileNavOpen = false"
  />

  <aside
    :class="
      cn(
        'fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border-subtle bg-surface-panel',
        'transition-[transform,width] duration-200 md:relative md:translate-x-0',
        'w-60',
        collapsed && 'md:w-16',
        ui.mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )
    "
  >
    <!-- Header — matches the top bar height so the top borders meet in the corner -->
    <div
      :class="
        cn(
          'flex h-12 flex-shrink-0 items-center border-b border-border-subtle',
          collapsed ? 'justify-center px-0' : 'gap-2.5 px-4',
        )
      "
    >
      <span
        class="grid h-6 w-6 flex-shrink-0 place-items-center rounded-md bg-accent font-semibold text-accent-ink"
        aria-hidden="true"
        >B</span
      >
      <span
        v-if="!collapsed"
        class="truncate text-sm font-semibold tracking-tight text-text-primary"
        >Khirby CRM</span
      >
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto px-3 py-3" :aria-label="t('shell.sidebar.navLabel')">
      <p
        v-if="!collapsed"
        class="px-2.5 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-wider text-text-ghost"
      >
        {{ t('shell.sidebar.workspace') }}
      </p>
      <div class="space-y-0.5">
        <SidebarLink
          v-for="item in workspaceNav"
          :key="item.to"
          :to="item.to"
          :icon="item.icon"
          :label="t(item.labelKey)"
          :collapsed="collapsed"
        />
      </div>

      <!-- Discovery, between the daily work above and the plugin pages below —
           ADR-0033. Always rendered: unlike the plugin group it has no data to
           depend on. -->
      <div v-if="collapsed" class="my-3 h-px bg-border-subtle" aria-hidden="true" />
      <p
        v-else
        class="px-2.5 pb-1.5 pt-4 font-mono text-[10px] uppercase tracking-wider text-text-ghost"
      >
        {{ t('shell.sidebar.extensions') }}
      </p>
      <div class="space-y-0.5">
        <SidebarLink
          v-for="item in marketplaceNav"
          :key="item.to"
          :to="item.to"
          :icon="item.icon"
          :label="t(item.labelKey)"
          :collapsed="collapsed"
        />
      </div>

      <template v-if="pluginNav.length">
        <div v-if="collapsed" class="my-3 h-px bg-border-subtle" aria-hidden="true" />
        <p
          v-else
          class="px-2.5 pb-1.5 pt-4 font-mono text-[10px] uppercase tracking-wider text-text-ghost"
        >
          {{ t('shell.sidebar.plugins') }}
        </p>
        <div class="space-y-0.5">
          <SidebarLink
            v-for="item in pluginNav"
            :key="item.to"
            v-bind="item"
            :collapsed="collapsed"
          />
        </div>
      </template>
    </nav>

    <!-- Footer — pinned to the bottom -->
    <div class="flex-shrink-0 space-y-1 border-t border-border-subtle p-3">
      <SidebarLink
        to="/settings"
        :label="t('settings.title')"
        icon="settings"
        :collapsed="collapsed"
      />

      <AppTooltip v-if="collapsed" :label="t('shell.sidebar.expand')" side="right">
        <button
          :class="railBtnClass"
          :aria-label="t('shell.sidebar.expand')"
          @click="ui.toggleRail()"
        >
          <RailIcon :collapsed="true" />
        </button>
      </AppTooltip>
      <button
        v-else
        :class="railBtnClass"
        :aria-label="t('shell.sidebar.collapseAria')"
        @click="ui.toggleRail()"
      >
        <RailIcon :collapsed="false" />
        <span class="flex-1 text-left">{{ t('shell.sidebar.collapse') }}</span>
      </button>

      <div class="pt-1">
        <AccountMenu :collapsed="collapsed" />
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
/**
 * App sidebar (docs/DESIGN-SYSTEM.md §6). Frequency-tiered: Workspace on top,
 * dynamic plugin routes in their own labeled group, admin + account in a pinned
 * footer. Collapses to an icon rail on desktop (tooltips supply the labels).
 */
import { computed, h } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useMediaQuery } from '@vueuse/core';
import SidebarLink from './SidebarLink.vue';
import AccountMenu from './AccountMenu.vue';
import AppTooltip from '../ui/AppTooltip.vue';
import { cn } from '../../lib/utils';
import { workspaceNav, marketplaceNav } from '../../lib/nav';
import type { NavIconName } from '../nav-icons';
import { useUiStore } from '../../stores/ui.store';
import { usePluginsStore } from '../../stores/plugins.store';
import { useServerText } from '../../composables/useServerText';

const { t } = useI18n();
const { pluginNavLabel } = useServerText();
const ui = useUiStore();
const pluginsStore = usePluginsStore();
const { plugins } = storeToRefs(pluginsStore);
const isDesktop = useMediaQuery('(min-width: 768px)');

/** Rail collapse is a desktop affordance; the mobile drawer always shows labels. */
const collapsed = computed(() => ui.railCollapsed && isDesktop.value);

const pluginNav = computed(() =>
  plugins.value
    .filter((p) => p.enabled && p.frontendRoutes?.length)
    .flatMap((p) =>
      p
        .frontendRoutes!.filter((r) => r.showInNav !== false)
        .map((r) => ({
          to: r.path,
          // Resolved in a computed, not at import: the label follows a language
          // switch, and an unknown key falls back to the plugin's own literal.
          label: pluginNavLabel(r),
          icon: 'plugins' as NavIconName,
        })),
    ),
);

const railBtnClass = computed(() =>
  cn(
    'flex w-full items-center rounded-md text-sm text-text-muted transition-colors',
    'hover:bg-surface-raise hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
    collapsed.value ? 'h-9 w-9 justify-center' : 'h-9 gap-3 px-2.5',
  ),
);

/** Inline glyph — chrome icons live at the call site, not the nav registry. */
const RailIcon = (props: { collapsed: boolean }) =>
  h(
    'svg',
    {
      class: 'h-4 w-4 flex-shrink-0',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.8',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    [
      h('rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }),
      h('path', { d: 'M9 3v18' }),
      h('path', { d: props.collapsed ? 'm14 9 3 3-3 3' : 'm17 9-3 3 3 3' }),
    ],
  );
</script>
