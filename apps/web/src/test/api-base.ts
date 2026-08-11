// Absolute origin used by the api client during tests.
//
// `client.ts` builds request URLs as `${import.meta.env.VITE_API_URL ?? ''}${path}`.
// Under Node/undici a relative URL (empty base) throws "Failed to parse URL", so
// MSW would never see the request. We give the client an absolute base here and
// mount MSW handlers on the SAME origin — keep this in sync with the
// `test.env.VITE_API_URL` value in `vite.config.ts`.
export const API_BASE = 'http://localhost:3000';

/** Build an absolute test URL for an `/api/...` path. */
export const api = (path: string) => `${API_BASE}${path}`;
