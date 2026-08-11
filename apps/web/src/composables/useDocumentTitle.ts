import { watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

/**
 * Product name. Not a message: a brand is not translated, and `i18n-guard` lists
 * "CRM" as NOT_COPY for exactly that reason. Keep it equal to the static
 * `<title>` in index.html, which is what a viewer sees before the bundle boots.
 */
const APP_NAME = 'CRM';

/**
 * Keeps `document.title` in step with the route *and* the active locale
 * (ADR-0011). Nothing set the tab title before this: every screen read "CRM", so
 * a reader with several tabs open had no way to tell them apart, and switching
 * language left the title behind.
 *
 * The page name comes from `route.meta.titleKey` — the same key the breadcrumb
 * uses, so a route names itself once. Plugin routes are registered at runtime and
 * may carry only a literal (`meta.title`) when the plugin declares no key; that
 * literal is then used as-is, the same fallback the rest of the plugin metadata
 * gets. A route with neither is just the product name.
 *
 * Called once, from App.vue: /login and /404 render outside the app shell, so a
 * layout-level call would leave them untitled.
 */
export function useDocumentTitle(): void {
  const route = useRoute();
  const { t, te } = useI18n();

  watchEffect(() => {
    const key = route.meta.titleKey as string | undefined;
    const literal = route.meta.title as string | undefined;
    const page = key && te(key) ? t(key) : literal;
    // The separator lives in the message, not here: `document.title` is plain
    // text with no markup to hold a glyph, and its spacing is a typographic
    // choice that belongs to the locale.
    document.title = page ? t('route.documentTitle', { page, app: APP_NAME }) : APP_NAME;
  });
}
