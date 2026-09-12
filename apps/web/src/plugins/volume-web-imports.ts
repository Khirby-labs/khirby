/**
 * Bare specifiers volume Vue bundles leave external (vite.web.config.ts).
 * Mapped to host `/khirby-peers/` shims so a native `import()` of
 * `/api/plugins/:name/web/entry.js` does not depend on the document import map
 * (Chromium does not apply `imports` to that module URL).
 */
export const VOLUME_WEB_PEERS: Readonly<Record<string, string>> = {
  vue: '/khirby-peers/vue.js?v=2',
  'vue-router': '/khirby-peers/vue-router.js?v=2',
  'vue-i18n': '/khirby-peers/vue-i18n.js?v=2',
  '@khirby/web-api': '/khirby-peers/khirby-web-api.js?v=2',
  '@khirby/web-ui': '/khirby-peers/khirby-web-ui.js?v=2',
  '@khirby/web-ui/AppTable': '/khirby-peers/web-ui-AppTable.js?v=2',
  '@khirby/web-ui/AppModal': '/khirby-peers/web-ui-AppModal.js?v=2',
  '@khirby/web-ui/AppSelect': '/khirby-peers/web-ui-AppSelect.js?v=2',
  '@khirby/web-ui/AppDatePicker': '/khirby-peers/web-ui-AppDatePicker.js?v=2',
  '@khirby/web-ui/useConfirm': '/khirby-peers/web-ui-useConfirm.js?v=2',
};

/** Rewrite `from "vue"` / `import("vue")` onto host peer URLs.
 * `origin` must be the page origin (e.g. `http://localhost:5173`). A blob:
 * module cannot resolve path-absolute `/khirby-peers/…` specifiers.
 */
export function rewriteVolumeWebBareImports(source: string, origin = ''): string {
  const base = origin.replace(/\/$/, '');
  return source.replace(
    /(\bfrom\s+|import\s*\(\s*)(['"])([^'"]+)\2/g,
    (full, prefix: string, quote: string, spec: string) => {
      const mapped = VOLUME_WEB_PEERS[spec];
      if (!mapped) return full;
      const abs = mapped.startsWith('http') ? mapped : `${base}${mapped}`;
      return `${prefix}${quote}${abs}${quote}`;
    },
  );
}
