<template>
  <div class="flex h-screen bg-surface-base text-text-secondary">
    <AppSidebar />

    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AppTopbar />
      <main class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base p-6">
        <RouterView v-slot="{ Component }">
          <div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <component :is="Component" />
          </div>
        </RouterView>
      </main>
    </div>

    <CommandPalette />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { RouterView } from 'vue-router';
import AppSidebar from '../../components/shell/AppSidebar.vue';
import AppTopbar from '../../components/shell/AppTopbar.vue';
import CommandPalette from '../../components/shell/CommandPalette.vue';
import { usePluginsStore } from '../../stores/plugins.store';
import { useUiStore } from '../../stores/ui.store';
import { useRealtimeEvents } from '../../composables/useRealtimeEvents';

useRealtimeEvents();

const pluginsStore = usePluginsStore();
const ui = useUiStore();

/** ⌘K / Ctrl+K toggles the command palette from anywhere in the app. */
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    ui.toggleCommand();
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  if (!pluginsStore.plugins.length) {
    await pluginsStore.fetchPlugins();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>
