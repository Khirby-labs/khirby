import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke suite. Runs against a full, running stack (the production
 * docker compose in ../docker), NOT the unit-test harness — it exercises real
 * cookies, the nginx /api proxy, Postgres and Redis. Nothing here is mocked.
 *
 * Local run:
 *   docker compose -f docker/docker-compose.yml up -d --build
 *   E2E_BASE_URL=http://localhost:80 pnpm test:e2e
 *
 * Config is driven by env so the same suite runs locally and in CI:
 *   E2E_BASE_URL  — where the web app is served (default http://localhost:8080)
 *   E2E_EMAIL     — admin login (default matches the compose ADMIN_EMAIL default)
 *   E2E_PASSWORD  — admin password (default matches ADMIN_PASSWORD default)
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
