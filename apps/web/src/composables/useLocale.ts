import { computed, ref, watchEffect } from 'vue';
import { i18n, loadLocale } from '../i18n';
import {
  FALLBACK_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  describeLocale,
  isSupportedLocale,
  resolveLocale,
  type Locale,
} from '../i18n/locales';

/**
 * Locale switching — the shape of useTheme.ts, deliberately (ADR-0011).
 * The resolved locale is stamped as `lang`/`dir` on <html>; a matching inline
 * script in index.html pre-paints `lang` before CSS loads.
 *
 * Two sources, in this order:
 *
 * - **Device** (localStorage → navigator.language) decides the FIRST paint, and
 *   it has to: /login and /404 render before a session exists, so boot-time
 *   resolution can never depend on auth.user.
 * - **Account** (`users.locale`) wins as soon as the session is known, via
 *   `applyAccountLocale()` — and is mirrored back into localStorage, so the next
 *   boot and the login screen already speak the right language.
 */
export interface LocaleOption {
  value: Locale;
  /** Endonym. Rendered raw — never through t(). */
  label: string;
}

/** The switcher's options, in registry order. Shared by Settings and the account menu. */
export const LOCALE_OPTIONS: LocaleOption[] = SUPPORTED_LOCALES.map((l) => ({
  value: l.code,
  label: l.nativeName,
}));

const locale = ref<Locale>(FALLBACK_LOCALE);
let watching = false;

function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isSupportedLocale(stored) ? stored : null;
  } catch {
    // storage unavailable (private mode) — fall through to detection
    return null;
  }
}

function persistLocale(next: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // storage unavailable — the choice lives for this session only
  }
}

/**
 * An explicit choice wins; otherwise the browser decides. An unrecognised
 * browser language falls to FALLBACK_LOCALE, so a German browser gets English
 * rather than Polish.
 */
export function detectLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;
  const preferences =
    typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language];
  return resolveLocale(preferences);
}

/** Idempotent. Keeps <html lang>/<html dir> in sync with the active locale. */
function startLangWatcher(): void {
  if (watching) return;
  watching = true;
  watchEffect(() => {
    const descriptor = describeLocale(locale.value);
    document.documentElement.lang = descriptor.code;
    document.documentElement.dir = descriptor.dir;
  });
}

function apply(next: Locale): void {
  locale.value = next;
  i18n.global.locale.value = next;
}

/**
 * Async boot, awaited in main.ts before mount: the first paint is already in the
 * right language rather than flashing the fallback.
 */
export async function initLocale(): Promise<void> {
  const next = detectLocale();
  await loadLocale(next);
  apply(next);
  startLangWatcher();
}

/**
 * Switches to the language saved on the account, called once the session is
 * known. A `null` saved value means the account made no choice, so the device
 * resolution from `initLocale()` stands — it is never overwritten with a default.
 *
 * The choice is mirrored into localStorage on purpose: the pre-paint script in
 * index.html and the /login screen have no session to read, so without the mirror
 * every sign-in would flash the browser's language first.
 */
export async function applyAccountLocale(saved: string | null | undefined): Promise<void> {
  if (!isSupportedLocale(saved)) return;
  persistLocale(saved);
  if (saved === locale.value) return;
  await loadLocale(saved);
  apply(saved);
}

export function useLocale() {
  startLangWatcher();

  async function setLocale(next: Locale): Promise<void> {
    await loadLocale(next);
    apply(next);
    persistLocale(next);
  }

  return {
    locale: computed(() => locale.value),
    setLocale,
    options: LOCALE_OPTIONS,
  };
}
