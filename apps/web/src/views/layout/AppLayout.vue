<template>
  <div class="flex h-screen bg-surface-base text-text-secondary">
    <AppSidebar />

    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AppTopbar v-if="!isChatFocus" />
      <main
        :class="
          cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base',
            isChatFocus ? 'p-0' : 'p-6',
          )
        "
      >
        <RouterView v-slot="{ Component }">
          <div
            class="min-h-0 min-w-0 flex-1 overflow-x-hidden"
            :class="isChatFocus ? 'overflow-hidden' : 'overflow-y-auto'"
          >
            <component :is="Component" />
          </div>
        </RouterView>
      </main>
    </div>

    <CommandPalette />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import AppSidebar from '../../components/shell/AppSidebar.vue';
import AppTopbar from '../../components/shell/AppTopbar.vue';
import CommandPalette from '../../components/shell/CommandPalette.vue';
import { usePluginsStore } from '../../stores/plugins.store';
import { useUiStore } from '../../stores/ui.store';
import { useRealtimeEvents } from '../../composables/useRealtimeEvents';
import { cn } from '../../lib/utils';

useRealtimeEvents();

const route = useRoute();
const router = useRouter();
const isChatFocus = computed(() => route.meta.layout === 'chat-focus');

const pluginsStore = usePluginsStore();
const ui = useUiStore();

/** Keep in sync with AppSidebar `duration-200`. */
const RAIL_COLLAPSE_MS = 200;

/**
 * Collapse the rail before chat mounts. When coming from another page, wait for
 * the width transition on the current view so it does not fight AskKhirby mount.
 */
function collapseRailForChat(deferNavigation: boolean): true | Promise<void> {
  if (ui.railCollapsed) return true;
  ui.setRailCollapsed(true);
  if (!deferNavigation) return true;
  return new Promise((resolve) => setTimeout(resolve, RAIL_COLLAPSE_MS));
}

let removeChatRailGuard: (() => void) | undefined;

/** ⌘K / Ctrl+K toggles the command palette from anywhere in the app. */
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    ui.toggleCommand();
  }
}

onMounted(async () => {
  removeChatRailGuard = router.beforeEach((to, from) => {
    if (to.meta.layout !== 'chat-focus') return true;
    // Stay put on /ask → /ask/:id (first reply assigns a thread). Only collapse
    // when entering chat from another surface.
    if (from.meta.layout === 'chat-focus') return true;
    return collapseRailForChat(true);
  });

  window.addEventListener('keydown', onKeydown);
  if (!pluginsStore.plugins.length) {
    await pluginsStore.fetchPlugins();
  }
});

onBeforeUnmount(() => {
  removeChatRailGuard?.();
  window.removeEventListener('keydown', onKeydown);
});
</script>
