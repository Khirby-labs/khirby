import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

/** Host-provided modules — leave bare so the SPA import map resolves one Vue instance. */
function isExternal(id: string): boolean {
  if (
    id === 'vue' ||
    id === 'vue-router' ||
    id === 'vue-i18n' ||
    id === '@khirby/web-api' ||
    id === '@khirby/plugin-sdk'
  ) {
    return true;
  }
  return id.startsWith('@khirby/web-ui/');
}

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/web/index.ts'),
      formats: ['es'],
      fileName: () => 'entry.js',
    },
    outDir: 'dist/web',
    emptyOutDir: true,
    rollupOptions: {
      external: isExternal,
      output: {
        // One file for marketplace hot-load (`import(webBundleUrl)`).
        codeSplitting: false,
      },
    },
  },
});
