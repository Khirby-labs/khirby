export const REASONING_EFFORTS = ['none', 'low', 'medium', 'high'] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && (REASONING_EFFORTS as readonly string[]).includes(value);
}

const REASONING_PARAM_NAMES = new Set(['reasoning', 'reasoning_effort', 'include_reasoning']);

function paramNames(list: unknown): string[] | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.map((p) => String(p).toLowerCase().replace(/-/g, '_'));
}

/**
 * Read advertised reasoning support from a `/models` row.
 * OpenAI's catalog has no capabilities — returns undefined so the caller can try
 * `reasoning_effort` and drop it on HTTP 400. OpenRouter-style catalogs publish
 * `supported_parameters`; a non-empty list without a reasoning param is false.
 */
export function parseModelReasoningSupport(raw: unknown): boolean | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const rec = raw as Record<string, unknown>;

  if (rec.supports_reasoning === true) return true;
  if (rec.supports_reasoning === false) return false;

  const caps = rec.capabilities;
  if (caps && typeof caps === 'object') {
    const c = caps as Record<string, unknown>;
    if (c.reasoning === true || c.reasoning_effort === true) return true;
    if (c.reasoning === false) return false;
  }

  for (const list of [rec.supported_parameters, rec.supported_params]) {
    const names = paramNames(list);
    if (!names) continue;
    return names.some((n) => REASONING_PARAM_NAMES.has(n));
  }

  return undefined;
}

/**
 * Attach `reasoning_effort` when the catalog says yes, or when it is silent
 * (OpenAI). Never attach when the catalog said the model does not support it.
 * Reasoning models often reject `temperature` — drop it whenever we send effort
 * or the catalog confirmed reasoning.
 */
export function applyReasoningEffort<T extends Record<string, unknown>>(
  body: T,
  effort: string | null | undefined,
  supportsReasoning?: boolean | null,
): T {
  if (supportsReasoning === false) return body;
  const hasEffort = isReasoningEffort(effort);
  if (!hasEffort && supportsReasoning !== true) return body;
  const next: Record<string, unknown> = { ...body };
  delete next.temperature;
  if (hasEffort) next.reasoning_effort = effort;
  return next as T;
}
