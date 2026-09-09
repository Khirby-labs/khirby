import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppVersionInfo } from '../../../../../packages/types/src';
import { isNewerThan, normalizeVersion } from './semver';

/** One hour — releases ship on a human cadence, not per request. */
export const VERSION_CACHE_TTL_MS = 60 * 60 * 1000;

/** Five minutes of negative cache so a down GitHub does not repay the timeout. */
export const VERSION_FAILURE_TTL_MS = 5 * 60 * 1000;

/** Three seconds — this runs inside a Settings panel request. */
export const VERSION_FETCH_TIMEOUT_MS = 3_000;

/** 64 KiB — a release JSON document is tiny; anything larger is not one. */
export const VERSION_MAX_BYTES = 64 * 1024;

export const DEFAULT_RELEASES_URL =
  'https://api.github.com/repos/Khirby-labs/khirby/releases/latest';

type CachedRelease = {
  latest: string;
  releaseUrl: string;
  checkedAt: string;
  expiresAt: number;
};

/**
 * Reports the baked `APP_VERSION` and, when reachable, the latest GitHub Release
 * for Khirby (ADR-0042). Mirrors the Marketplace catalog fetch discipline:
 * in-request, capped, positively and negatively cached, never blocks boot.
 */
@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);
  private cached: CachedRelease | null = null;
  private failedUntil = 0;

  constructor(private readonly config: ConfigService) {}

  async getVersionInfo(): Promise<AppVersionInfo> {
    const current = this.currentVersion();
    const remote = await this.loadLatest();

    if (!remote) {
      return {
        current,
        latest: null,
        updateAvailable: false,
        releaseUrl: null,
        checkedAt: null,
        checkFailed: this.failedUntil > Date.now(),
      };
    }

    return {
      current,
      latest: remote.latest,
      updateAvailable: isNewerThan(remote.latest, current),
      releaseUrl: remote.releaseUrl,
      checkedAt: remote.checkedAt,
      checkFailed: false,
    };
  }

  currentVersion(): string {
    const raw = (this.config.get<string>('APP_VERSION') ?? '').trim();
    if (!raw) return 'dev';
    return normalizeVersion(raw) || 'dev';
  }

  private async loadLatest(): Promise<CachedRelease | null> {
    const url = (
      this.config.get<string>('KHIRBY_RELEASES_URL', DEFAULT_RELEASES_URL) ?? DEFAULT_RELEASES_URL
    ).trim();
    if (!url) return null;

    const now = Date.now();
    if (this.cached && now < this.cached.expiresAt) return this.cached;
    if (now < this.failedUntil) return null;

    const remote = await this.fetchLatest(url);
    if (!remote) {
      this.failedUntil = now + VERSION_FAILURE_TTL_MS;
      return null;
    }

    this.cached = {
      ...remote,
      expiresAt: now + VERSION_CACHE_TTL_MS,
    };
    this.failedUntil = 0;
    return this.cached;
  }

  private async fetchLatest(
    url: string,
  ): Promise<{ latest: string; releaseUrl: string; checkedAt: string } | null> {
    if (!this.schemeAllowed(url)) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERSION_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'khirby-version-check',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!res.ok) return this.reject(`GitHub releases answered ${res.status}`);

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) {
        return this.reject(`GitHub releases content-type is ${contentType || 'absent'}`);
      }

      const body = await this.readCapped(res);
      if (body === null)
        return this.reject(`GitHub releases body exceeds ${VERSION_MAX_BYTES} bytes`);

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return this.reject('GitHub releases body is not parsable JSON');
      }

      return this.validate(parsed);
    } catch (err) {
      const reason = controller.signal.aborted
        ? `timed out after ${VERSION_FETCH_TIMEOUT_MS}ms`
        : (err as Error).message;
      return this.reject(`GitHub releases unreachable — ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private validate(
    parsed: unknown,
  ): { latest: string; releaseUrl: string; checkedAt: string } | null {
    if (!parsed || typeof parsed !== 'object') {
      return this.reject('GitHub releases payload is not an object');
    }
    const row = parsed as Record<string, unknown>;
    const tag = typeof row.tag_name === 'string' ? normalizeVersion(row.tag_name) : '';
    if (!tag) return this.reject('GitHub releases payload missing tag_name');

    const releaseUrl =
      typeof row.html_url === 'string' && row.html_url.startsWith('https://')
        ? row.html_url
        : `https://github.com/Khirby-labs/khirby/releases/tag/v${tag}`;

    return {
      latest: tag,
      releaseUrl,
      checkedAt: new Date().toISOString(),
    };
  }

  private schemeAllowed(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      this.logger.warn('KHIRBY_RELEASES_URL is not a valid URL — skipping version check');
      return false;
    }
    if (parsed.protocol !== 'https:') {
      this.logger.warn(
        `KHIRBY_RELEASES_URL must use https (got ${parsed.protocol}) — skipping version check`,
      );
      return false;
    }
    return true;
  }

  private async readCapped(res: Response): Promise<string | null> {
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > VERSION_MAX_BYTES) return null;

    // Release JSON is tiny; buffer then reject rather than stream-cancel (Jest's
    // Response body locks awkwardly after a cancelled reader).
    const text = await res.text();
    return text.length > VERSION_MAX_BYTES ? null : text;
  }

  private reject(reason: string): null {
    this.logger.warn(reason);
    return null;
  }
}
