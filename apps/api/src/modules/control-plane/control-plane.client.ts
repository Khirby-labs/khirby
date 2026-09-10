import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../core/errors/app-exception';
import {
  HeartbeatPayload,
  HeartbeatResponse,
  HeartbeatResponseSchema,
  ListMarketplacePluginsQuery,
  MarketplacePlugin,
  MarketplacePluginSchema,
  MarketplacePluginVersion,
  MarketplacePluginVersionSchema,
  RegisterInstance,
  RegisterInstanceResponse,
  RegisterInstanceResponseSchema,
  SubmitPlugin,
  SubmitPluginResponse,
  SubmitPluginResponseSchema,
} from './contracts';
import { z } from 'zod';

export const CONTROL_PLANE_FETCH_TIMEOUT_MS = 10_000;
export const CONTROL_PLANE_RETRY_BACKOFF_MS = 500;

/** Production Control Plane (telemetry + marketplace). Trailing slash is stripped. */
export const DEFAULT_CONTROL_PLANE_URL = 'https://ctrl.bearly.pro';

@Injectable()
export class ControlPlaneClient {
  private readonly logger = new Logger(ControlPlaneClient.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Trimmed base URL without trailing slash. Unset env falls back to
   * {@link DEFAULT_CONTROL_PLANE_URL}; an explicit empty value disables outbound
   * Control Plane calls (ADR-0051).
   */
  baseUrl(): string {
    const raw = (this.config.get<string>('CONTROL_PLANE_URL') ?? DEFAULT_CONTROL_PLANE_URL).trim();
    if (!raw) return '';
    this.assertValidUrl(raw);
    return raw.replace(/\/+$/, '');
  }

  isConfigured(): boolean {
    return this.baseUrl().length > 0;
  }

  /**
   * When set, CONTROL_PLANE_URL must be https (http only in development) with a
   * non-empty host — empty / junk values must not soft-fail into fetch.
   */
  private assertValidUrl(raw: string): void {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw AppException.badRequest('CONTROL_PLANE_URL is not a valid URL', {
        code: 'CONTROL_PLANE_URL_INVALID',
      });
    }
    if (!parsed.hostname) {
      throw AppException.badRequest('CONTROL_PLANE_URL host is empty', {
        code: 'CONTROL_PLANE_URL_INVALID',
      });
    }
    // Match main.ts: anything except production is local/dev (NODE_ENV=dev is common).
    const isProd = (this.config.get<string>('NODE_ENV') ?? '').trim() === 'production';
    if (parsed.protocol === 'https:') return;
    if (parsed.protocol === 'http:' && !isProd) return;
    throw AppException.badRequest('CONTROL_PLANE_URL must use https', {
      code: 'CONTROL_PLANE_URL_INSECURE',
    });
  }

  async heartbeat(payload: HeartbeatPayload): Promise<HeartbeatResponse | null> {
    if (!this.isConfigured()) return null;
    const data = await this.request('POST', '/v1/telemetry/heartbeat', {
      body: payload,
      soft: true,
    });
    if (data == null) return null;
    return this.parse(HeartbeatResponseSchema, data, 'heartbeat');
  }

  async register(body: RegisterInstance): Promise<RegisterInstanceResponse> {
    if (!this.isConfigured()) {
      throw AppException.badRequest('CONTROL_PLANE_URL is not configured', {
        code: 'CONTROL_PLANE_NOT_CONFIGURED',
      });
    }
    const data = await this.request('POST', '/v1/instances/register', { body });
    return this.parse(RegisterInstanceResponseSchema, data, 'register');
  }

  async submitPlugin(body: SubmitPlugin): Promise<SubmitPluginResponse | null> {
    if (!this.isConfigured()) return null;
    const data = await this.request('POST', '/v1/marketplace/submissions', {
      body,
      soft: true,
    });
    if (data == null) return null;
    return this.parse(SubmitPluginResponseSchema, data, 'submitPlugin');
  }

  async listPlugins(query: ListMarketplacePluginsQuery = {}): Promise<MarketplacePlugin[] | null> {
    if (!this.isConfigured()) return null;
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.verified !== undefined) params.set('verified', String(query.verified));
    if (query.compatibleWith) params.set('compatibleWith', query.compatibleWith);
    const qs = params.toString();
    const path = `/v1/marketplace/plugins${qs ? `?${qs}` : ''}`;
    const data = await this.request('GET', path, { soft: true });
    if (data == null) return null;
    return this.parse(z.array(MarketplacePluginSchema), data, 'listPlugins');
  }

  async getPlugin(slug: string): Promise<MarketplacePlugin | null> {
    if (!this.isConfigured()) return null;
    const data = await this.request('GET', `/v1/marketplace/plugins/${encodeURIComponent(slug)}`, {
      soft: true,
    });
    if (data == null) return null;
    return this.parse(MarketplacePluginSchema, data, 'getPlugin');
  }

  async getPluginVersions(slug: string): Promise<MarketplacePluginVersion[] | null> {
    if (!this.isConfigured()) return null;
    const data = await this.request(
      'GET',
      `/v1/marketplace/plugins/${encodeURIComponent(slug)}/versions`,
      { soft: true },
    );
    if (data == null) return null;
    return this.parse(z.array(MarketplacePluginVersionSchema), data, 'getPluginVersions');
  }

  async getPluginVersion(slug: string, version: string): Promise<MarketplacePluginVersion | null> {
    if (!this.isConfigured()) return null;
    const data = await this.request(
      'GET',
      `/v1/marketplace/plugins/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}`,
      { soft: true },
    );
    if (data == null) return null;
    return this.parse(MarketplacePluginVersionSchema, data, 'getPluginVersion');
  }

  private parse<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      this.logger.warn(`Control Plane ${label} response failed validation`);
      throw AppException.upstreamFailed('controlPlane');
    }
    return result.data;
  }

  private async request(
    method: string,
    path: string,
    opts: { body?: unknown; soft?: boolean } = {},
  ): Promise<unknown> {
    const url = `${this.baseUrl()}${path}`;
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await sleep(CONTROL_PLANE_RETRY_BACKOFF_MS);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CONTROL_PLANE_FETCH_TIMEOUT_MS);

      try {
        const res = await fetch(url, {
          method,
          signal: controller.signal,
          headers: opts.body
            ? { 'content-type': 'application/json', accept: 'application/json' }
            : { accept: 'application/json' },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          this.logger.warn(`Control Plane ${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
          if (opts.soft) return null;
          throw AppException.upstreamFailed('controlPlane');
        }

        if (res.status === 204) return null;
        return await res.json();
      } catch (err) {
        lastError = err;
        if (err instanceof HttpException) {
          throw err;
        }
        if (isAbortOrNetwork(err) && attempt === 0) {
          this.logger.warn(`Control Plane network error on ${method} ${path}; retrying once`);
          continue;
        }
        this.logger.warn(
          `Control Plane ${method} ${path} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (opts.soft) return null;
        throw AppException.upstreamFailed('controlPlane');
      } finally {
        clearTimeout(timer);
      }
    }

    if (opts.soft) return null;
    throw lastError instanceof Error
      ? AppException.upstreamFailed('controlPlane')
      : AppException.upstreamFailed('controlPlane');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortOrNetwork(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  if (name === 'AbortError' || name === 'TimeoutError' || name === 'TypeError') return true;
  const cause = (err as { cause?: { code?: string } }).cause;
  if (
    cause?.code &&
    ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'].includes(cause.code)
  ) {
    return true;
  }
  return false;
}
