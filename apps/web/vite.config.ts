import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, REPO_ROOT, '');
  const apiPort = process.env.API_PORT || rootEnv.API_PORT || '3000';
  const apiTarget =
    process.env.VITE_API_URL || rootEnv.VITE_API_URL || `http://localhost:${apiPort}`;

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@khirby/web-api': resolve(__dirname, 'src/api/client'),
        '@khirby/types': resolve(__dirname, '../../packages/types/src'),
        '@khirby/plugin-sdk': resolve(__dirname, '../../packages/plugin-sdk/src'),
        // Host UI primitives for plugin `./web` packages (ADR-0016) — not feature code.
        '@khirby/web-ui/AppTable': resolve(__dirname, 'src/components/AppTable.vue'),
        '@khirby/web-ui/AppModal': resolve(__dirname, 'src/components/AppModal.vue'),
        '@khirby/web-ui/AppSelect': resolve(__dirname, 'src/components/ui/AppSelect.vue'),
        '@khirby/web-ui/AppDatePicker': resolve(__dirname, 'src/components/ui/AppDatePicker.vue'),
        '@khirby/web-ui/useConfirm': resolve(__dirname, 'src/composables/useConfirm.ts'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['src/test/setup.ts'],
      // Give the api client an absolute origin so requests are real URLs that MSW
      // can intercept under Node. Must match `API_BASE` in src/test/api-base.ts.
      env: {
        VITE_API_URL: 'http://localhost:3000',
      },
      // Coverage is a radar only — reported, never a gate (no thresholds yet).
      // Enabled on demand via `pnpm --filter web test:coverage`.
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'html'],
        reportsDirectory: './coverage',
        include: ['src/**/*.{ts,vue}'],
        exclude: ['src/**/*.spec.ts', 'src/test/**', 'src/**/*.d.ts', 'src/main.ts'],
      },
    },
  };
});
