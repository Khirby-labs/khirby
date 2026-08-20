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
  /** Width/transform transition on the sidebar. */
  const railAnimate = ref(true);
  /** Mobile: off-canvas sidebar drawer open. */
  const mobileNavOpen = ref(false);
  /** Global command palette (⌘K) visibility. */
  const commandOpen = ref(false);

  function persistRail() {
    try {
      localStorage.setItem(RAIL_STORAGE_KEY, railCollapsed.value ? '1' : '0');
    } catch {
      // storage unavailable — preference lives for this session only
    }
  }

  /** Programmatic rail toggle — animate defaults to true. */
  function setRailCollapsed(value: boolean, options?: { animate?: boolean; persist?: boolean }) {
    const animate = options?.animate !== false;
    if (!animate) railAnimate.value = false;
    railCollapsed.value = value;
    if (options?.persist) persistRail();
    if (!animate) {
      requestAnimationFrame(() => {
        railAnimate.value = true;
      });
    }
  }

  function toggleRail() {
    railAnimate.value = true;
    railCollapsed.value = !railCollapsed.value;
    persistRail();
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
    railAnimate,
    mobileNavOpen,
    commandOpen,
    setRailCollapsed,
    toggleRail,
    openCommand,
    closeCommand,
    toggleCommand,
  };
});
