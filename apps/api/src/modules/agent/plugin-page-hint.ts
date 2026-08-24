/** Pages reported by INSTANCE_PLUGINS.frontendPages — copy the path, never invent one. */
export type PluginPageRef = { path: string; navLabel: string };

/** Stable tool-summary fragment. Parser: `SPA page: none` or `SPA page: /path (Label)`. */
export function formatSpaPageHint(pages: PluginPageRef[]): string {
  if (!pages.length) return 'SPA page: none';
  return `SPA page: ${pages
    .map((page) => (page.navLabel ? `${page.path} (${page.navLabel})` : page.path))
    .join(', ')}`;
}

/** First in-app /plugins/ path from a tool summary, or null when none. */
export function spaPathFromSummary(summary: string): string | null {
  if (/SPA page:\s*none\b/i.test(summary)) return null;
  const match = summary.match(/SPA page:\s*(\/plugins\/[^,\s(]+)/);
  return match?.[1] ?? null;
}
