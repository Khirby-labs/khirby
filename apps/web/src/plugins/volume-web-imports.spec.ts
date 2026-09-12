import { describe, expect, it } from 'vitest';
import { rewriteVolumeWebBareImports } from './volume-web-imports';

describe('rewriteVolumeWebBareImports', () => {
  it('rewrites the Listmonk 1.2.1 entry.js import lines onto /khirby-peers/', () => {
    const src = [
      'import { apiDelete as O, apiGet as k, apiPost as A, apiPut as ne } from "@khirby/web-api";',
      'import re from "@khirby/web-ui/AppTable";',
      'import { useConfirm as ie } from "@khirby/web-ui/useConfirm";',
      'import ae from "@khirby/web-ui/AppSelect";',
      'import oe from "@khirby/web-ui/AppDatePicker";',
      'import { ref } from "vue";',
      'import { RouterLink } from "vue-router";',
      'import { useI18n } from "vue-i18n";',
    ].join('\n');

    const out = rewriteVolumeWebBareImports(src, 'http://localhost:5173');
    expect(out).toContain('from "http://localhost:5173/khirby-peers/khirby-web-api.js?v=2"');
    expect(out).toContain('from "http://localhost:5173/khirby-peers/web-ui-AppTable.js?v=2"');
    expect(out).toContain('from "http://localhost:5173/khirby-peers/web-ui-useConfirm.js?v=2"');
    expect(out).toContain('from "http://localhost:5173/khirby-peers/web-ui-AppSelect.js?v=2"');
    expect(out).toContain('from "http://localhost:5173/khirby-peers/web-ui-AppDatePicker.js?v=2"');
    expect(out).toContain('from "http://localhost:5173/khirby-peers/vue.js?v=2"');
    expect(out).toContain('from "http://localhost:5173/khirby-peers/vue-router.js?v=2"');
    expect(out).toContain('from "http://localhost:5173/khirby-peers/vue-i18n.js?v=2"');
    expect(out).not.toContain('from "@khirby/web-api"');
    expect(out).not.toContain('from "vue"');
  });

  it('leaves unknown specifiers and already-absolute paths alone', () => {
    const src = `import x from "./chunk.js";\nimport y from "left-pad";`;
    expect(rewriteVolumeWebBareImports(src)).toBe(src);
  });
});
