import { HttpException } from '@nestjs/common';
import { LlmUpstreamError } from './agent-llm.client';

export function httpExceptionParts(err: unknown): { code?: string; message: string } {
  if (!(err instanceof HttpException)) {
    return { message: err instanceof Error ? err.message : String(err ?? '') };
  }
  const resp = err.getResponse();
  if (typeof resp === 'string') return { message: resp };
  if (typeof resp === 'object' && resp !== null) {
    const body = resp as { code?: string; message?: unknown };
    const message = Array.isArray(body.message)
      ? body.message.join('; ')
      : typeof body.message === 'string'
        ? body.message
        : err.message;
    return { code: body.code, message };
  }
  return { message: err.message };
}

/**
 * Map a thrown failure onto an SSE error code. Prefer this over a blanket
 * `internal` so a decrypt miss is not shown as “AI Compose is not configured”.
 */
export function agentSseErrorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status?: number }).status;
    if (status === 409) return 'stream_in_progress';
  }

  const { code, message } = httpExceptionParts(err);

  if (code === 'PLUGIN_DISABLED') return 'ai_compose_disabled';
  if (code === 'PLUGIN_NOT_CONFIGURED') {
    if (/decrypt/i.test(message)) return 'ai_compose_decrypt_failed';
    if (/model/i.test(message)) return 'ai_compose_no_model';
    return 'ai_compose_not_configured';
  }

  if (
    /SECRETS_KEY is not set|cannot be decrypted|auth tag|Unsupported state|unable to authenticate/i.test(
      message,
    )
  ) {
    return 'ai_compose_decrypt_failed';
  }
  if (/API key is not configured/i.test(message)) return 'ai_compose_not_configured';
  if (/No default model/i.test(message)) return 'ai_compose_no_model';

  if (err instanceof LlmUpstreamError) {
    if (err.status === 401 || err.status === 403) return 'llm_auth';
    if (err.status === 400 || err.status === 422) return 'llm_request';
    return 'llm_upstream';
  }
  const upstream = /^LLM upstream (\d+)/.exec(message);
  if (upstream) {
    const status = Number(upstream[1]);
    if (status === 401 || status === 403) return 'llm_auth';
    if (status === 400 || status === 422) return 'llm_request';
    return 'llm_upstream';
  }

  return 'internal';
}
