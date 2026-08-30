/**
 * In-app path from a click on sanitized markdown, or null to let the browser handle it.
 * Same-origin site-relative hrefs only — no protocol, no //, no modified / new-tab clicks.
 * Chat uses this with vue-router.push so navigation stays inside the SPA (no full reload).
 */
export function inAppPathFromClick(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const el = event.target;
  if (!(el instanceof Element)) return null;
  const anchor = el.closest('a');
  if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return null;
  const href = anchor.getAttribute('href');
  if (!href || !href.startsWith('/') || href.startsWith('//')) return null;
  return href;
}
