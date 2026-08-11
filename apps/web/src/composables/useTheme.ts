import { ref, computed, watchEffect } from 'vue';

/**
 * Theme switching — docs/DESIGN-SYSTEM.md §9.
 * Dark is the token default (:root); light is :root[data-theme="light"].
 * The resolved theme is stamped as data-theme on <html>. A matching inline
 * script in index.html pre-paints the attribute before CSS loads (no flash).
 */
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'crm-theme';

export interface ThemeOption {
  value: ThemePreference;
  /**
   * Message key, not copy. This array is a module-level constant evaluated at
   * import — before `app.use(i18n)` — so calling t() here would return the key
   * and pin the label to the boot locale. Consumers translate at render
   * (`.claude/rules/i18n.md`).
   *
   * Typed as a template literal so a typo fails `vue-tsc` and so the narrow
   * union survives into the typed `t()` at the call site.
   */
  labelKey: `settings.appearance.theme.${ThemePreference}`;
  /** Static Lucide outline paths rendered via v-html — no user input. */
  icon: string;
}

/** The three theme choices, shared by the Settings panel and the account menu. */
export const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'system',
    labelKey: 'settings.appearance.theme.system',
    icon: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  },
  {
    value: 'light',
    labelKey: 'settings.appearance.theme.light',
    icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  },
  {
    value: 'dark',
    labelKey: 'settings.appearance.theme.dark',
    icon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  },
];

const preference = ref<ThemePreference>('system');
const systemPrefersDark = ref(true);
let initialized = false;

const resolvedTheme = computed<ResolvedTheme>(() =>
  preference.value === 'system' ? (systemPrefersDark.value ? 'dark' : 'light') : preference.value,
);

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // storage unavailable (private mode) — fall through to system
  }
  return 'system';
}

/** Idempotent; called from main.ts and by useTheme(). */
export function initTheme() {
  if (initialized) return;
  initialized = true;

  preference.value = readStoredPreference();

  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (mq) {
    systemPrefersDark.value = mq.matches;
    mq.addEventListener('change', (e) => {
      systemPrefersDark.value = e.matches;
    });
  }

  watchEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme.value;
  });
}

export function useTheme() {
  initTheme();

  function setPreference(next: ThemePreference) {
    preference.value = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage unavailable — preference lives for this session only
    }
  }

  return { preference, resolvedTheme, setPreference };
}
