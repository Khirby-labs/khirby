const DEV_SESSION_FALLBACK = 'dev-secret-change-in-prod';

/**
 * Resolve SESSION_SECRET for cookie signing.
 * - Unset in non-production → dev fallback.
 * - Set but shorter than 32 → always fail (even in dev).
 * - Production → required and ≥ 32.
 */
export function resolveSessionSecret(isDev: boolean): string {
  const secret = process.env.SESSION_SECRET;
  if (secret !== undefined && secret.length > 0 && secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters when set');
  }
  if (!isDev) {
    if (!secret || secret.length < 32) {
      throw new Error(
        'SESSION_SECRET env var is required in production and must be at least 32 characters long',
      );
    }
    return secret;
  }
  return secret && secret.length >= 32 ? secret : DEV_SESSION_FALLBACK;
}

/**
 * CORS_ORIGIN: comma-separated allowlist.
 * Dev default when unset: Vite. Production requires an explicit allowlist (* / empty → fail-fast).
 */
export function parseCorsOrigin(raw: string | undefined, isDev: boolean): string | string[] {
  const value = raw?.trim();
  if (!value || value === '*') {
    if (isDev) return 'http://localhost:5173';
    throw new Error(
      'CORS_ORIGIN env var is required in production (comma-separated allowlist; * is not allowed)',
    );
  }
  const list = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0 || list.includes('*')) {
    if (isDev) return 'http://localhost:5173';
    throw new Error(
      'CORS_ORIGIN env var is required in production (comma-separated allowlist; * is not allowed)',
    );
  }
  if (list.length === 1) return list[0];
  return list;
}
