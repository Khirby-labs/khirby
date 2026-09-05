import { getActivePinia } from 'pinia';
import type { ApiErrorBody, ErrorCode, ErrorParams, FieldError } from '@khirby/types';

// BASE_URL pusty gdy frontend i API na tej samej domenie (nginx /api proxy)
// Na dev VITE_API_URL=http://localhost:3000
const BASE_URL = import.meta.env?.VITE_API_URL ?? '';

let sessionController = new AbortController();
let sessionGeneration = 0;
export const getSessionGeneration = () => sessionGeneration;
export function invalidateSessionRequests() {
  sessionGeneration++;
  sessionController.abort();
  sessionController = new AbortController();
}
function sessionSignal(signal?: AbortSignal | null): AbortSignal {
  return signal ? AbortSignal.any([sessionController.signal, signal]) : sessionController.signal;
}

/**
 * A failed API call, carrying the machine-readable reason (ADR-0011).
 *
 * `message` is the server's English text and stays populated, so existing
 * `catch (e) { error.value = e.message }` call sites are unaffected. Branch on
 * `code` — never on `message`, which is prose and will be translated.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly params?: ErrorParams;
  /** Per-field detail, present only when `code === 'VALIDATION_FAILED'`. */
  readonly fields?: FieldError[];

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = body.statusCode;
    this.code = body.code;
    this.params = body.params;
    this.fields = body.fields;
  }
}

/**
 * 401s that mean "those credentials were wrong", not "your session ended".
 * These must not bounce the user to /login — they are already looking at the
 * form that produced them.
 */
const AUTH_ATTEMPT_CODES = new Set<ErrorCode>(['INVALID_CREDENTIALS', 'CURRENT_PASSWORD_INVALID']);

async function readErrorBody(res: Response): Promise<ApiErrorBody> {
  try {
    // `error` is Nest's own field name; kept as a fallback for any handler that
    // still replies without going through AllExceptionsFilter.
    const body = (await res.json()) as Partial<ApiErrorBody> & { error?: string };
    return {
      statusCode: res.status,
      code: body.code ?? 'INTERNAL',
      message: body.message ?? body.error ?? `HTTP ${res.status}`,
      params: body.params,
      fields: body.fields,
    };
  } catch {
    // Non-JSON body (proxy error page, empty 502…)
    return { statusCode: res.status, code: 'INTERNAL', message: `HTTP ${res.status}` };
  }
}

export async function apiClient<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const signal = sessionSignal(options.signal);
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) ?? {}),
  };

  // Fastify rejects empty body when Content-Type is application/json (e.g. DELETE)
  if (options.body != null && options.body !== '' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    signal,
    headers,
    credentials: 'include', // cookie session automatycznie dołączane
  });

  signal.throwIfAborted();
  if (!res.ok) {
    const body = await readErrorBody(res);
    signal.throwIfAborted();

    /*
     * A 401 means "log in again" — EXCEPT when it is a failed authentication
     * attempt, which must stay on the page and show why. This used to fire on
     * every 401 before the body was even read, so a rejected login and a wrong
     * current password were both replaced by "Session expired" plus a bounce to
     * /login, and the real reason never reached the screen.
     *
     * Unknown/absent code still redirects: a bare 401 from a proxy or from
     * Fastify itself is a session problem, and stranding the user is worse.
     */
    if (res.status === 401 && !AUTH_ATTEMPT_CODES.has(body.code)) {
      const { useAuthStore } = await import('../stores/auth.store');
      if (getActivePinia()) useAuthStore().clearSession();
      else invalidateSessionRequests();
      // Named export 'router' from router/index.ts
      import('../router').then((mod) => {
        mod.router.push('/login');
      });
      // Normalize: a bare Nest 401 says "Unauthorized", which is not copy.
      throw new ApiError({ ...body, code: 'SESSION_EXPIRED', message: 'Session expired' });
    }

    throw new ApiError(body);
  }

  // Nest void handlers often reply 200 with an empty body; 204 has no body by spec.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  signal.throwIfAborted();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function apiGet<T = unknown>(path: string): Promise<T> {
  return apiClient<T>(path, { method: 'GET' });
}

export function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return apiClient<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  return apiClient<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function apiDelete<T = unknown>(path: string): Promise<T> {
  return apiClient<T>(path, { method: 'DELETE' });
}

export function apiPut<T = unknown>(path: string, body: unknown): Promise<T> {
  return apiClient<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** POST that reads an SSE response line-by-line (Ask Khirby). */
export async function apiPostStream(
  path: string,
  body: unknown,
  onLine: (line: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  signal = sessionSignal(signal);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
    signal,
  });

  signal.throwIfAborted();
  if (!res.ok) {
    const errBody = await readErrorBody(res);
    signal.throwIfAborted();
    if (res.status === 401 && !AUTH_ATTEMPT_CODES.has(errBody.code)) {
      const { useAuthStore } = await import('../stores/auth.store');
      if (getActivePinia()) useAuthStore().clearSession();
      else invalidateSessionRequests();
      import('../router').then((mod) => mod.router.push('/login'));
      throw new ApiError({ ...errBody, code: 'SESSION_EXPIRED', message: 'Session expired' });
    }
    throw new ApiError(errBody);
  }

  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    signal.throwIfAborted();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) onLine(line);
  }
  if (buffer.trim()) onLine(buffer);
}
