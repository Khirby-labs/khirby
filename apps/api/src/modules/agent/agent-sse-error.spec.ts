import { HttpException } from '@nestjs/common';
import { AppException } from '../../../../../packages/plugin-host/src';
import { LlmUpstreamError } from './agent-llm.client';
import { agentSseErrorCode } from './agent-sse-error';

describe('agentSseErrorCode', () => {
  it('maps a missing API key, decrypt failure, and missing model separately', () => {
    expect(
      agentSseErrorCode(
        AppException.pluginNotConfigured('ai-compose', 'AI Compose API key is not configured'),
      ),
    ).toBe('ai_compose_not_configured');
    expect(
      agentSseErrorCode(
        AppException.pluginNotConfigured('ai-compose', 'AI Compose API key cannot be decrypted'),
      ),
    ).toBe('ai_compose_decrypt_failed');
    expect(
      agentSseErrorCode(
        AppException.pluginNotConfigured('ai-compose', 'No default model configured'),
      ),
    ).toBe('ai_compose_no_model');
    expect(agentSseErrorCode(AppException.pluginDisabled('ai-compose'))).toBe(
      'ai_compose_disabled',
    );
  });

  it('maps LLM upstream status onto llm_auth, llm_request, and llm_upstream', () => {
    expect(agentSseErrorCode(new LlmUpstreamError(401))).toBe('llm_auth');
    expect(agentSseErrorCode(new LlmUpstreamError(400, '{"error":"bad reasoning_effort"}'))).toBe(
      'llm_request',
    );
    expect(agentSseErrorCode(new LlmUpstreamError(500))).toBe('llm_upstream');
    expect(agentSseErrorCode(new Error('LLM upstream 403'))).toBe('llm_auth');
    expect(agentSseErrorCode(new Error('LLM upstream 400: unrecognized argument'))).toBe(
      'llm_request',
    );
  });

  it('falls back to internal for unknown failures', () => {
    expect(agentSseErrorCode(new Error('boom'))).toBe('internal');
    expect(agentSseErrorCode(new HttpException('nope', 418))).toBe('internal');
  });
});
