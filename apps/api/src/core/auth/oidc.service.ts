import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Db } from '../database/db';
import { DB_TOKEN } from '../database/database.module';
import { users, roles, userRoles } from '../database/schema';
import { RbacService } from '../rbac/rbac.service';

type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

export type OidcLinkStatus = {
  status: 'unlinked' | 'linked' | 'disabled';
  issuer: string | null;
  subject: string | null;
};

export type OidcPending = {
  mode: 'login' | 'link';
  nonce: string;
  verifier: string;
  redirectUri: string;
  /** Set for link mode so completion cannot bind this IdP subject to a different session. */
  userId?: string;
};

const PENDING_TTL_SEC = 10 * 60;

@Injectable()
export class OidcService implements OnModuleDestroy {
  private readonly logger = new Logger(OidcService.name);
  private discoveryCache: { at: number; doc: OidcDiscovery } | null = null;
  private readonly redis: Redis;

  constructor(
    private readonly config: ConfigService,
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly rbac: RbacService,
  ) {
    this.redis = new Redis(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }

  /** Persist PKCE/state outside the browser cookie — survives CP round-trip. */
  async savePending(state: string, pending: OidcPending): Promise<void> {
    await this.redis.set(`oidc:pending:${state}`, JSON.stringify(pending), 'EX', PENDING_TTL_SEC);
  }

  async takePending(state: string): Promise<OidcPending | null> {
    const key = `oidc:pending:${state}`;
    const raw = await this.redis.getdel(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OidcPending;
    } catch {
      return null;
    }
  }

  enabled(): boolean {
    return (this.config.get<string>('OIDC_ENABLED') ?? '').toLowerCase() === 'true';
  }

  status(): { enabled: boolean; issuer: string | null } {
    if (!this.enabled()) return { enabled: false, issuer: null };
    return { enabled: true, issuer: this.config.get<string>('OIDC_ISSUER') ?? null };
  }

  async linkStatus(userId: string): Promise<OidcLinkStatus> {
    if (!this.enabled()) {
      return { status: 'disabled', issuer: null, subject: null };
    }
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new UnauthorizedException('Session expired');
    if (user.oidcIssuer && user.oidcSubject) {
      return { status: 'linked', issuer: user.oidcIssuer, subject: user.oidcSubject };
    }
    return { status: 'unlinked', issuer: null, subject: null };
  }

  async buildAuthorizationUrl(opts: {
    mode: 'login' | 'link';
    redirectUri: string;
    state: string;
    nonce: string;
    codeChallenge: string;
  }): Promise<string> {
    const disc = await this.discovery();
    const clientId = this.require('OIDC_CLIENT_ID');
    const url = new URL(disc.authorization_endpoint);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('redirect_uri', opts.redirectUri);
    url.searchParams.set('state', opts.state);
    url.searchParams.set('nonce', opts.nonce);
    url.searchParams.set('code_challenge', opts.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (opts.mode === 'link') {
      url.searchParams.set('prompt', 'login');
    }
    return url.toString();
  }

  createPkce(): { verifier: string; challenge: string } {
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
  }

  createStateNonce(): { state: string; nonce: string } {
    return { state: base64url(randomBytes(24)), nonce: base64url(randomBytes(24)) };
  }

  /**
   * Complete OIDC login or link. Never auto-links by email alone.
   * - login: find by (iss,sub) or provision new user
   * - link: require localUserId; bind (iss,sub) to that userId
   */
  async complete(opts: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
    expectedNonce: string;
    mode: 'login' | 'link';
    localUserId?: string;
  }): Promise<{ id: string; email: string; locale: string | null }> {
    if (!this.enabled()) {
      throw new ServiceUnavailableException('OIDC is disabled');
    }
    const disc = await this.discovery();
    const token = await this.exchangeCode(opts.code, opts.redirectUri, opts.codeVerifier, disc);
    const claims = await this.verifyIdToken(token.id_token, disc, opts.expectedNonce);
    const issuer = claims.iss;
    const subject = claims.sub;
    const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
    if (!issuer || !subject) {
      throw new UnauthorizedException('Invalid ID token');
    }

    if (opts.mode === 'link') {
      if (!opts.localUserId) {
        throw new BadRequestException('localUserId required for link');
      }
      return this.linkExisting(opts.localUserId, issuer, subject, email);
    }

    const [bySub] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.oidcIssuer, issuer), eq(users.oidcSubject, subject)))
      .limit(1);
    if (bySub) {
      // Heal accounts provisioned before default-role assignment existed.
      await this.ensureDefaultRole(bySub.id);
      return { id: bySub.id, email: bySub.email, locale: bySub.locale };
    }

    if (!email) {
      throw new BadRequestException('IdP did not return email; cannot provision');
    }
    const [byEmail] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (byEmail) {
      // Existing local account — must use explicit link flow (ADR-0010).
      throw new ConflictException({
        code: 'ACCOUNT_LINK_REQUIRED',
        message: 'Local account exists; complete account linking while signed in',
      });
    }

    const [created] = await this.db
      .insert(users)
      .values({
        email,
        passwordHash: null,
        oidcIssuer: issuer,
        oidcSubject: subject,
      } as never)
      .returning();
    // Suite SSO users land with no invite flow yet — without a role every API
    // returns Nest's "Forbidden resource". Default to super-admin (only seeded
    // role); override with OIDC_DEFAULT_ROLE when a weaker role exists.
    await this.ensureDefaultRole(created.id);
    return { id: created.id, email: created.email, locale: created.locale };
  }

  /**
   * Assign the configured default role when the user has none.
   * Idempotent — existing role bindings are left alone.
   */
  private async ensureDefaultRole(userId: string): Promise<void> {
    const [existing] = await this.db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, userId))
      .limit(1);
    if (existing) return;

    // Never super-admin. Operators set OIDC_DEFAULT_ROLE; otherwise the seeded sso-user role.
    const roleName = this.config.get<string>('OIDC_DEFAULT_ROLE')?.trim() || 'sso-user';
    const [role] = await this.db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
    if (!role) {
      this.logger.warn(
        `OIDC default role "${roleName}" missing — SSO user ${userId.slice(0, 8)} has no permissions`,
      );
      return;
    }
    await this.db.insert(userRoles).values({ userId, roleId: role.id }).onConflictDoNothing();
    this.rbac.invalidate(userId);
    this.logger.log(`Assigned role "${roleName}" to SSO user ${userId.slice(0, 8)}`);
  }

  private async linkExisting(
    localUserId: string,
    issuer: string,
    subject: string,
    email: string | null,
  ) {
    const [local] = await this.db.select().from(users).where(eq(users.id, localUserId)).limit(1);
    if (!local) throw new UnauthorizedException('Session expired');

    const [taken] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.oidcIssuer, issuer), eq(users.oidcSubject, subject), isNotNull(users.oidcIssuer)))
      .limit(1);
    if (taken && taken.id !== localUserId) {
      throw new ConflictException({
        code: 'IDENTITY_ALREADY_LINKED',
        message: '(issuer, subject) already bound to another user',
      });
    }

    if (local.oidcIssuer && local.oidcSubject) {
      if (local.oidcIssuer === issuer && local.oidcSubject === subject) {
        return { id: local.id, email: local.email, locale: local.locale };
      }
      throw new ConflictException({
        code: 'ALREADY_LINKED_OTHER',
        message: 'Account already linked to a different IdP identity',
      });
    }

    // Optional soft check: warn if emails differ but do not block if local proved session.
    if (email && local.email.toLowerCase() !== email.toLowerCase()) {
      this.logger.warn(`OIDC link email mismatch for user ${localUserId.slice(0, 8)}`);
    }

    await this.db
      .update(users)
      .set({ oidcIssuer: issuer, oidcSubject: subject } as never)
      .where(eq(users.id, localUserId));
    return { id: local.id, email: local.email, locale: local.locale };
  }

  /**
   * Local passwords must be re-entered before binding an IdP subject.
   * SSO-only accounts have no password to check.
   */
  async assertPassword(userId: string, password: string | undefined): Promise<void> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new UnauthorizedException('Session expired');
    if (!user.passwordHash) return;
    if (!password) throw new UnauthorizedException('Password required to link this account');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid password');
  }

  private async discovery(): Promise<OidcDiscovery> {
    const issuer = this.require('OIDC_ISSUER').replace(/\/$/, '');
    const now = Date.now();
    if (this.discoveryCache && now - this.discoveryCache.at < 300_000) {
      return this.discoveryCache.doc;
    }
    const res = await fetch(`${issuer}/.well-known/openid-configuration`);
    if (!res.ok) {
      throw new ServiceUnavailableException('OIDC discovery failed');
    }
    const doc = (await res.json()) as OidcDiscovery;
    this.discoveryCache = { at: now, doc };
    return doc;
  }

  private async exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier: string,
    disc: OidcDiscovery,
  ): Promise<{ id_token: string }> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: this.require('OIDC_CLIENT_ID'),
      client_secret: this.require('OIDC_CLIENT_SECRET'),
      code_verifier: codeVerifier,
    });
    const res = await fetch(disc.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      this.logger.warn(`OIDC token exchange failed: ${res.status}`);
      throw new UnauthorizedException('OIDC token exchange failed');
    }
    const json = (await res.json()) as { id_token?: string };
    if (!json.id_token) throw new UnauthorizedException('Missing id_token');
    return { id_token: json.id_token };
  }

  private async verifyIdToken(idToken: string, disc: OidcDiscovery, nonce: string) {
    const jwks = createRemoteJWKSet(new URL(disc.jwks_uri));
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: disc.issuer,
      audience: this.require('OIDC_CLIENT_ID'),
    });
    if (payload.nonce !== nonce) {
      throw new UnauthorizedException('OIDC nonce mismatch');
    }
    return payload;
  }

  private require(key: string): string {
    const v = this.config.get<string>(key);
    if (!v) throw new ServiceUnavailableException(`${key} is not configured`);
    return v;
  }
}

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}
