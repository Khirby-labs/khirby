import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Shell UI state — sidebar rail (icon-only) mode, mobile drawer, and the
 * command palette. Rail preference persists per device (localStorage), like
 * the theme preference (see composables/useTheme.ts).
 */
const RAIL_STORAGE_KEY = 'crm-sidebar-rail';

function readRail(): boolean {
  try {
    return localStorage.getItem(RAIL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export const useUiStore = defineStore('ui', () => {
  /** Desktop: sidebar collapsed to an icon rail. */
  const railCollapsed = ref(readRail());
  /** Mobile: off-canvas sidebar drawer open. */
  const mobileNavOpen = ref(false);
  /** Global command palette (⌘K) visibility. */
  const commandOpen = ref(false);

  function toggleRail() {
    railCollapsed.value = !railCollapsed.value;
    try {
      localStorage.setItem(RAIL_STORAGE_KEY, railCollapsed.value ? '1' : '0');
    } catch {
      // storage unavailable — preference lives for this session only
    }
  }

  function openCommand() {
    commandOpen.value = true;
  }
  function closeCommand() {
    commandOpen.value = false;
  }
  function toggleCommand() {
    commandOpen.value = !commandOpen.value;
  }

  return {
    railCollapsed,
    mobileNavOpen,
    commandOpen,
    toggleRail,
    openCommand,
    closeCommand,
    toggleCommand,
  };
});
