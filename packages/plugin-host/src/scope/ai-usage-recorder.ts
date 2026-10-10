/**
 * Optional token: Enterprise (or other) plugin records LLM usage.
 * AI Compose / Ask resolve at call time (ADR-0048 pattern).
 */

export const AI_USAGE_RECORDER = 'CRM_AI_USAGE_RECORDER';

export type AiUsageFeature =
  | 'ask_khirby'
  | 'lead_draft'
  | 'newsletter'
  | 'inquiry_intake'
  | 'rag_tool'
  | 'background'
  | 'other';

export type AiUsageEventInput = {
  operationId: string;
  callId: string;
  providerRequestId?: string | null;
  userId?: string | null;
  feature: AiUsageFeature | string;
  invocationType?: string;
  conversationId?: string | null;
  provider: string;
  modelId: string;
  modelRevision?: string | null;
  region?: string | null;
  inferenceProfile?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  reasoningTokens?: number | null;
  estimatedCostUsd?: number | null;
  priceVersion?: string | null;
  currency?: string;
  durationMs?: number | null;
  status: 'ok' | 'error' | 'cancelled' | 'uncertain';
  errorCode?: string | null;
  usageSource?: string;
  startedAt?: Date;
  finishedAt?: Date;
};

export type AiUsageReserveInput = {
  operationId: string;
  userId?: string | null;
  feature: AiUsageFeature | string;
  modelId: string;
  estimatedMaxTokens?: number;
  estimatedMaxCostUsd?: number;
};

export interface AiUsageRecorderLike {
  /** Preflight: reserve budget; throw if over limit. */
  reserve?(input: AiUsageReserveInput): Promise<{ reservationId: string } | void>;
  /** Record a physical model call (idempotent on callId). */
  record(event: AiUsageEventInput): Promise<void>;
  release?(reservationId: string): Promise<void>;
}
