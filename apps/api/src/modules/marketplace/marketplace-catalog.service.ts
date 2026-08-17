import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CATALOG_FORMAT_VERSION,
  CatalogDocument,
  CatalogEntry,
  LOCAL_CATALOG,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_ICONS,
  MarketplaceCategory,
  MarketplaceIcon,
} from './catalog';

/** Fifteen minutes: the catalog changes on release cadence, not per request. */
export const CATALOG_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * One minute. Without a negative cache, a remote that is down would repay the
 * full fetch timeout on EVERY request — the endpoint would technically still
 * answer from the local copy while feeling broken.
 */
export const CATALOG_FAILURE_TTL_MS = 60 * 1000;

/** Three seconds — this runs inside a user's HTTP request, not a background job. */
export const CATALOG_FETCH_TIMEOUT_MS = 3_000;

/** 256 KiB. A catalog is a short metadata list; anything larger is not one. */
export const CATALOG_MAX_BYTES = 256 * 1024;

/**
 * Source of the catalog document: the remote one when configured and trustworthy,
 * the in-image copy otherwise.
 *
 * This service answers exactly one question — "what does the catalog say?" — and
 * deliberately knows nothing about installation state. Statuses are resolved per
 * request by MarketplaceService, because caching them here would leave a plugin
 * the operator just installed reading `available` for up to fifteen minutes,
 * in production only, with every test still green.
 *
 * Nothing here runs at boot: the first fetch happens on the first request, so a
 * slow or unreachable catalog can never delay application start.
 */
@Injectable()
export class MarketplaceCatalogService {
  private readonly logger = new Logger(MarketplaceCatalogService.name);
  private cached: { document: CatalogDocument; expiresAt: number } | null = null;
  private failedUntil = 0;

  constructor(private readonly config: ConfigService) {}

  async load(): Promise<CatalogDocument> {
    const url = (this.config.get<string>('MARKETPLACE_CATALOG_URL', '') ?? '').trim();

    // Not configured is the normal single-instance case, not a failure: skip the
    // network layer entirely and say nothing about it.
    if (!url) return LOCAL_CATALOG;

    const now = Date.now();
    if (this.cached && now < this.cached.expiresAt) return this.cached.document;
    if (now < this.failedUntil) return LOCAL_CATALOG;

    const document = await this.fetchRemote(url);
    if (!document) {
      this.failedUntil = now + CATALOG_FAILURE_TTL_MS;
      return LOCAL_CATALOG;
    }

    this.cached = { document, expiresAt: now + CATALOG_CACHE_TTL_MS };
    return document;
  }

  private async fetchRemote(url: string): Promise<CatalogDocument | null> {
    if (!this.schemeAllowed(url)) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CATALOG_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) return this.reject(`remote catalog answered ${res.status}`);

      // An HTML error page parses as "not JSON" only after we have buffered it;
      // the declared type rules it out first.
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) {
        return this.reject(`remote catalog content-type is ${contentType || 'absent'}`);
      }

      const body = await this.readCapped(res);
      if (body === null) return this.reject(`remote catalog exceeds ${CATALOG_MAX_BYTES} bytes`);

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return this.reject('remote catalog is not parsable JSON');
      }

      return this.validate(parsed);
    } catch (err) {
      const reason = controller.signal.aborted
        ? `timed out after ${CATALOG_FETCH_TIMEOUT_MS}ms`
        : (err as Error).message;
      return this.reject(`remote catalog unreachable — ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Read the body but stop at the cap instead of buffering whatever arrives.
   * `content-length` is a hint a hostile or misconfigured server can omit or
   * understate, so the running total is what actually enforces the limit.
   */
  private async readCapped(res: Response): Promise<string | null> {
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > CATALOG_MAX_BYTES) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;

    const chunks: Buffer[] = [];
    let total = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > CATALOG_MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks).toString('utf8');
  }

  /**
   * https only. The operator supplies this address, so plain http is tolerated in
   * development — where a local catalog fixture is the whole point — and refused
   * in production.
   */
  private schemeAllowed(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      this.logger.warn(`MARKETPLACE_CATALOG_URL is not a valid URL — using the in-image catalog`);
      return false;
    }

    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol === 'http:' && process.env.NODE_ENV !== 'production') return true;

    this.logger.warn(
      `MARKETPLACE_CATALOG_URL must use https (got ${parsed.protocol}) — using the in-image catalog`,
    );
    return false;
  }

  /**
   * Validate the whole document or reject the whole document.
   *
   * Never admit the entries that happen to parse: a half-accepted catalog looks
   * correct on screen and silently drops positions, which is far harder to notice
   * than falling back to the copy in the image.
   */
  private validate(input: unknown): CatalogDocument | null {
    if (!isRecord(input)) return this.reject('remote catalog is not an object');

    if (input.version !== CATALOG_FORMAT_VERSION) {
      return this.reject(
        `remote catalog declares format version ${String(input.version)}, this build reads ${CATALOG_FORMAT_VERSION}`,
      );
    }

    if (!Array.isArray(input.entries)) return this.reject('remote catalog has no entries array');

    const entries: CatalogEntry[] = [];
    const seen = new Set<string>();

    for (const raw of input.entries) {
      const entry = this.validateEntry(raw);
      if (!entry) return null;
      if (seen.has(entry.name)) {
        return this.reject(`remote catalog lists ${entry.name} twice`);
      }
      seen.add(entry.name);
      entries.push(entry);
    }

    return { version: CATALOG_FORMAT_VERSION, entries };
  }

  /**
   * Unknown extra fields on an entry are IGNORED, not rejected. A later format
   * that adds a field must not blind every deployed instance still reading its
   * own copy — that is the failure mode this whole fallback exists to avoid.
   */
  private validateEntry(raw: unknown): CatalogEntry | null {
    if (!isRecord(raw)) return this.reject('remote catalog entry is not an object');

    for (const field of ['package', 'name', 'version', 'vendor'] as const) {
      if (typeof raw[field] !== 'string' || !(raw[field] as string).trim()) {
        return this.reject(`remote catalog entry is missing ${field}`);
      }
    }

    const name = raw.name as string;

    if (!MARKETPLACE_CATEGORIES.includes(raw.category as MarketplaceCategory)) {
      return this.reject(
        `remote catalog entry ${name} has unknown category ${String(raw.category)}`,
      );
    }

    if (!MARKETPLACE_ICONS.includes(raw.icon as MarketplaceIcon)) {
      return this.reject(`remote catalog entry ${name} has unknown icon ${String(raw.icon)}`);
    }

    // Rejects the document, not just the entry — same level as every other rule.
    // In V2 the catalog becomes third-party content and this is the first place a
    // hostile link would arrive.
    if (typeof raw.docsUrl !== 'string' || !raw.docsUrl.startsWith('https://')) {
      return this.reject(`remote catalog entry ${name} has a non-https docsUrl`);
    }

    return {
      package: raw.package as string,
      name,
      version: raw.version as string,
      category: raw.category as MarketplaceCategory,
      vendor: raw.vendor as string,
      icon: raw.icon as MarketplaceIcon,
      docsUrl: raw.docsUrl,
    };
  }

  /** One line, one reason, then the in-image copy. Never a 500 for the operator. */
  private reject(reason: string): null {
    this.logger.warn(`${reason} — using the in-image catalog`);
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
