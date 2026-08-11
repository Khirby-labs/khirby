import { test, expect, type Page } from '@playwright/test';

/**
 * Production-path smoke: real cookies, the nginx /api proxy, Postgres and Redis.
 * Scope is deliberately the auth spine + API boundary — the flows that are
 * idempotent and robust against a shared database. Deeper data flows (contact
 * CRUD, pipeline drag-and-drop, a non-super-admin getting 403 on a role
 * mutation) need per-test data seeding/teardown and a second seeded user; those
 * are the next E2E increment, tracked separately — not stubbed here.
 */

const EMAIL = process.env.E2E_EMAIL ?? 'admin@example.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'changeme123';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/contacts/);
}

test('the API is reachable through the web proxy', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
});

test('an unauthenticated role mutation is rejected', async ({ request }) => {
  // No session cookie on the isolated request context → the guard must reject.
  const res = await request.post('/api/roles', { data: { name: 'e2e-should-fail' } });
  expect(res.status()).toBe(401);
});

test('an unauthenticated visitor is redirected to login', async ({ page }) => {
  await page.goto('/contacts');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('an admin can sign in and reach the contacts workspace', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
});

test('a cleared session forces re-login', async ({ page, context }) => {
  await signIn(page);
  await context.clearCookies();
  await page.goto('/contacts');
  await expect(page).toHaveURL(/\/login/);
});
