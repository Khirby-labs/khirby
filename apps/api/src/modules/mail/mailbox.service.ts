import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ImapFlow } from 'imapflow';
import * as nodemailer from 'nodemailer';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { mailboxes, type MailboxAuthMethod } from '../../core/database/schema';
import { encrypt, decrypt, isMailSecretsKeyConfigured } from './mail-crypto';
import { UpsertMailboxDto } from './dto/upsert-mailbox.dto';
import { AppException } from '../../core/errors/app-exception';
import { formatImapError } from './mail-imap-error';
import { formatSmtpError, smtpTransportOptions } from './mail-smtp-options';
import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  gmailTransportDefaults,
  isGoogleMailOAuthConfigured,
  refreshGoogleAccessToken,
  requireGoogleMailOAuthEnv,
  settingsOAuthReturnUrl,
  verifyOAuthState,
} from './mail-google-oauth';

type MailboxRow = typeof mailboxes.$inferSelect;

export type MailboxPublic = {
  id: string;
  name: string;
  fromName: string;
  fromAddress: string;
  authMethod: MailboxAuthMethod;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  hasImapPassword: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hasSmtpPassword: boolean;
  hasOauthToken: boolean;
  enabled: boolean;
  backfillDays: number;
  connectionStatus: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  secretsKeyConfigured: boolean;
  googleOAuthConfigured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MailboxGetResponse = {
  mailbox: MailboxPublic | null;
  googleOAuthConfigured: boolean;
  secretsKeyConfigured: boolean;
};

export type DecryptedMailboxCredentials = {
  mailbox: MailboxRow;
} & (
  | { authMethod: 'password'; imapPassword: string; smtpPassword: string }
  | {
      authMethod: 'google_oauth';
      refreshToken: string;
      accessToken: string;
      clientId: string;
      clientSecret: string;
    }
);

function toPublic(row: MailboxRow): MailboxPublic {
  return {
    id: row.id,
    name: row.name,
    fromName: row.fromName,
    fromAddress: row.fromAddress,
    authMethod: row.authMethod,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    imapSecure: row.imapSecure,
    imapUser: row.imapUser,
    hasImapPassword: !!row.imapPasswordEnc,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpSecure: row.smtpSecure,
    smtpUser: row.smtpUser,
    hasSmtpPassword: !!row.smtpPasswordEnc,
    hasOauthToken: !!row.oauthRefreshTokenEnc,
    enabled: row.enabled,
    backfillDays: row.backfillDays,
    connectionStatus: row.connectionStatus,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncError: row.lastSyncError ?? null,
    secretsKeyConfigured: isMailSecretsKeyConfigured(),
    googleOAuthConfigured: isGoogleMailOAuthConfigured(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class MailboxService {
  private readonly logger = new Logger(MailboxService.name);
  private idleWorkerRef?: { restartSession(): Promise<void> };

  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /** Called by MailIdleWorker to register itself (avoids circular dep at constructor time) */
  setIdleWorker(worker: { restartSession(): Promise<void> }) {
    this.idleWorkerRef = worker;
  }

  async get(): Promise<MailboxGetResponse> {
    const [row] = await this.db.select().from(mailboxes).limit(1);
    return {
      mailbox: row ? toPublic(row) : null,
      googleOAuthConfigured: isGoogleMailOAuthConfigured(),
      secretsKeyConfigured: isMailSecretsKeyConfigured(),
    };
  }

  async upsert(dto: UpsertMailboxDto): Promise<MailboxPublic> {
    if (dto.enabled && !isMailSecretsKeyConfigured()) {
      throw AppException.badRequest('Cannot enable mailbox: MAIL_SECRETS_KEY is not configured.');
    }

    const [existing] = await this.db.select().from(mailboxes).limit(1);

    let authMethod: MailboxAuthMethod = existing?.authMethod ?? 'password';
    let imapPasswordEnc = existing?.imapPasswordEnc ?? null;
    let smtpPasswordEnc = existing?.smtpPasswordEnc ?? null;
    let oauthRefreshTokenEnc = existing?.oauthRefreshTokenEnc ?? null;

    if (dto.imapPassword !== undefined && dto.imapPassword !== '') {
      imapPasswordEnc = encrypt(dto.imapPassword);
    }
    if (dto.smtpPassword !== undefined && dto.smtpPassword !== '') {
      smtpPasswordEnc = encrypt(dto.smtpPassword);
    }

    // Explicit password credentials switch away from Google OAuth.
    if (dto.imapPassword && dto.smtpPassword) {
      authMethod = 'password';
      oauthRefreshTokenEnc = null;
    }

    if (authMethod === 'password') {
      if (!imapPasswordEnc || !smtpPasswordEnc) {
        throw AppException.badRequest('IMAP and SMTP passwords are required for a new mailbox.');
      }
    } else if (authMethod === 'google_oauth') {
      if (!oauthRefreshTokenEnc) {
        throw AppException.badRequest('Connect with Google before enabling this mailbox.');
      }
    }

    const patch = {
      name: dto.name,
      fromName: dto.fromName,
      fromAddress: dto.fromAddress,
      authMethod,
      imapHost: dto.imapHost,
      imapPort: dto.imapPort,
      imapSecure: dto.imapSecure,
      imapUser: dto.imapUser,
      imapPasswordEnc,
      smtpHost: dto.smtpHost,
      smtpPort: dto.smtpPort,
      smtpSecure: dto.smtpSecure,
      smtpUser: dto.smtpUser,
      smtpPasswordEnc,
      oauthRefreshTokenEnc,
      enabled: dto.enabled,
      backfillDays: dto.backfillDays ?? existing?.backfillDays ?? 30,
      updatedAt: new Date(),
    };

    let row: MailboxRow;
    if (!existing) {
      const [created] = await this.db
        .insert(mailboxes)
        .values(patch as any)
        .returning();
      row = created;
    } else {
      const [updated] = await this.db
        .update(mailboxes)
        .set(patch as any)
        .where(eq(mailboxes.id, existing.id))
        .returning();
      row = updated;
    }

    await this.triggerWorkerRestart();
    return toPublic(row);
  }

  startGoogleOAuth(userId: string): { url: string } {
    if (!isMailSecretsKeyConfigured()) {
      throw AppException.badRequest('MAIL_SECRETS_KEY is not configured.');
    }
    return { url: buildGoogleAuthUrl(userId) };
  }

  async handleGoogleOAuthCallback(query: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<string> {
    if (query.error) {
      return settingsOAuthReturnUrl('error', query.error);
    }
    if (!query.code || !query.state) {
      return settingsOAuthReturnUrl('error', 'missing_code_or_state');
    }

    let auditUserId: string | undefined;
    try {
      const { userId } = verifyOAuthState(query.state);
      auditUserId = userId;
      if (!isMailSecretsKeyConfigured()) {
        this.logger.warn(`Google OAuth callback rejected: secrets_key_missing userId=${userId}`);
        return settingsOAuthReturnUrl('error', 'secrets_key_missing');
      }

      const tokens = await exchangeGoogleAuthCode(query.code);
      const gmail = gmailTransportDefaults();
      const localPart = tokens.email.split('@')[0] || 'CRM';

      const [existing] = await this.db.select().from(mailboxes).limit(1);
      const oauthRefreshTokenEnc = encrypt(tokens.refreshToken);
      const oauthTokenExpiresAt = tokens.expiryDate ? new Date(tokens.expiryDate) : null;

      const patch = {
        authMethod: 'google_oauth' as const,
        name: existing?.name || tokens.email,
        fromName: existing?.fromName || localPart,
        fromAddress: tokens.email,
        imapHost: gmail.imap.host,
        imapPort: gmail.imap.port,
        imapSecure: gmail.imap.secure,
        imapUser: tokens.email,
        imapPasswordEnc: null,
        smtpHost: gmail.smtp.host,
        smtpPort: gmail.smtp.port,
        smtpSecure: gmail.smtp.secure,
        smtpUser: tokens.email,
        smtpPasswordEnc: null,
        oauthRefreshTokenEnc,
        oauthTokenExpiresAt,
        updatedAt: new Date(),
        // OAuth success is enough to go live — matches “Sign in with Google and the rest configures itself”.
        enabled: true,
        backfillDays: existing?.backfillDays ?? 30,
        connectionStatus: 'reconnecting',
        lastSyncError: null,
      };

      if (!existing) {
        await this.db.insert(mailboxes).values(patch as any);
      } else {
        await this.db
          .update(mailboxes)
          .set(patch as any)
          .where(eq(mailboxes.id, existing.id));
      }

      await this.triggerWorkerRestart();
      this.logger.log(`Google OAuth mailbox connected userId=${userId} email=${tokens.email}`);
      return settingsOAuthReturnUrl('ok');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Google OAuth callback failed userId=${auditUserId ?? 'unknown'}: ${msg}`);
      return settingsOAuthReturnUrl('error', msg);
    }
  }

  async disconnectGoogleOAuth(): Promise<MailboxPublic | null> {
    const [existing] = await this.db.select().from(mailboxes).limit(1);
    if (!existing) return null;

    const [updated] = await this.db
      .update(mailboxes)
      .set({
        authMethod: 'password',
        oauthRefreshTokenEnc: null,
        oauthTokenExpiresAt: null,
        enabled: false,
        connectionStatus: 'disconnected',
        lastSyncError: null,
        updatedAt: new Date(),
      } as any)
      .where(eq(mailboxes.id, existing.id))
      .returning();

    await this.triggerWorkerRestart();
    return toPublic(updated);
  }

  async getDecryptedCredentials(): Promise<DecryptedMailboxCredentials | null> {
    const [row] = await this.db.select().from(mailboxes).limit(1);
    if (!row || !row.enabled) return null;

    if (row.authMethod === 'google_oauth') {
      if (!row.oauthRefreshTokenEnc) return null;
      const refreshToken = decrypt(row.oauthRefreshTokenEnc);
      const { clientId, clientSecret } = requireGoogleMailOAuthEnv();
      const refreshed = await refreshGoogleAccessToken(refreshToken);
      if (refreshed.expiryDate) {
        await this.db
          .update(mailboxes)
          .set({
            oauthTokenExpiresAt: new Date(refreshed.expiryDate),
            updatedAt: new Date(),
          } as any)
          .where(eq(mailboxes.id, row.id));
      }
      return {
        mailbox: row,
        authMethod: 'google_oauth',
        refreshToken,
        accessToken: refreshed.accessToken,
        clientId,
        clientSecret,
      };
    }

    if (!row.imapPasswordEnc || !row.smtpPasswordEnc) return null;
    return {
      mailbox: row,
      authMethod: 'password',
      imapPassword: decrypt(row.imapPasswordEnc),
      smtpPassword: decrypt(row.smtpPasswordEnc),
    };
  }

  async getRawRow(): Promise<MailboxRow | null> {
    const [row] = await this.db.select().from(mailboxes).limit(1);
    return row ?? null;
  }

  async updateConnectionStatus(
    id: string,
    status: string,
    opts?: { lastSyncAt?: Date; lastSyncError?: string | null },
  ) {
    const patch: Record<string, unknown> = { connectionStatus: status, updatedAt: new Date() };
    if (opts?.lastSyncAt !== undefined) patch.lastSyncAt = opts.lastSyncAt;
    if (opts?.lastSyncError !== undefined) patch.lastSyncError = opts.lastSyncError;
    await this.db
      .update(mailboxes)
      .set(patch as any)
      .where(eq(mailboxes.id, id));
  }

  async updateSyncPointer(id: string, opts: { imapUidValidity?: number; imapLastUid?: number }) {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (opts.imapUidValidity !== undefined) patch.imapUidValidity = opts.imapUidValidity;
    if (opts.imapLastUid !== undefined) patch.imapLastUid = opts.imapLastUid;
    await this.db
      .update(mailboxes)
      .set(patch as any)
      .where(eq(mailboxes.id, id));
  }

  async testStoredConnection(): Promise<{
    imap: boolean;
    smtp: boolean;
    imapError?: string;
    smtpError?: string;
  }> {
    if (!isMailSecretsKeyConfigured()) {
      throw AppException.badRequest('MAIL_SECRETS_KEY is not configured.');
    }

    const creds = await this.resolveCredentialsForTest();
    const imapResult = await this.testImap(creds.imap);
    const smtpResult = await this.testSmtp(creds.smtp);

    if (!imapResult.ok || !smtpResult.ok) {
      const parts: string[] = [];
      if (!imapResult.ok) parts.push(`IMAP: ${imapResult.error ?? 'failed'}`);
      if (!smtpResult.ok) parts.push(`SMTP: ${smtpResult.error ?? 'failed'}`);
      throw AppException.badRequest(parts.join(' · '));
    }

    return { imap: true, smtp: true };
  }

  async testConnection(
    dto: UpsertMailboxDto,
  ): Promise<{ imap: boolean; smtp: boolean; imapError?: string; smtpError?: string }> {
    if (!isMailSecretsKeyConfigured()) {
      throw AppException.badRequest('MAIL_SECRETS_KEY is not configured.');
    }

    const [existing] = await this.db.select().from(mailboxes).limit(1);

    if (
      existing?.authMethod === 'google_oauth' &&
      existing.oauthRefreshTokenEnc &&
      !dto.imapPassword
    ) {
      const creds = await this.resolveCredentialsForTest();
      const imapResult = await this.testImap({
        ...creds.imap,
        host: dto.imapHost,
        port: dto.imapPort,
        secure: dto.imapSecure,
        user: dto.imapUser,
      });
      const smtpResult = await this.testSmtp({
        ...creds.smtp,
        host: dto.smtpHost,
        port: dto.smtpPort,
        secure: dto.smtpSecure,
        user: dto.smtpUser,
      });
      return {
        imap: imapResult.ok,
        smtp: smtpResult.ok,
        imapError: imapResult.error,
        smtpError: smtpResult.error,
      };
    }

    let imapPassword: string;
    let smtpPassword: string;

    if (dto.imapPassword) {
      imapPassword = dto.imapPassword;
    } else if (existing?.imapPasswordEnc) {
      imapPassword = decrypt(existing.imapPasswordEnc);
    } else {
      throw AppException.badRequest('IMAP password is required for connection test.');
    }

    if (dto.smtpPassword) {
      smtpPassword = dto.smtpPassword;
    } else if (existing?.smtpPasswordEnc) {
      smtpPassword = decrypt(existing.smtpPasswordEnc);
    } else {
      throw AppException.badRequest('SMTP password is required for connection test.');
    }

    const imapResult = await this.testImap({
      host: dto.imapHost,
      port: dto.imapPort,
      secure: dto.imapSecure,
      user: dto.imapUser,
      password: imapPassword,
    });

    const smtpResult = await this.testSmtp({
      host: dto.smtpHost,
      port: dto.smtpPort,
      secure: dto.smtpSecure,
      user: dto.smtpUser,
      password: smtpPassword,
    });

    return {
      imap: imapResult.ok,
      smtp: smtpResult.ok,
      imapError: imapResult.error,
      smtpError: smtpResult.error,
    };
  }

  private async resolveCredentialsForTest(): Promise<{
    imap: { host: string; port: number; secure: boolean; user: string } & (
      { password: string } | { accessToken: string }
    );
    smtp:
      | {
          host: string;
          port: number;
          secure: boolean;
          user: string;
          password: string;
        }
      | {
          host: string;
          port: number;
          secure: boolean;
          user: string;
          clientId: string;
          clientSecret: string;
          refreshToken: string;
          accessToken: string;
        };
  }> {
    const [row] = await this.db.select().from(mailboxes).limit(1);
    if (!row) {
      throw AppException.badRequest('No mailbox configured.');
    }

    if (row.authMethod === 'google_oauth') {
      if (!row.oauthRefreshTokenEnc) {
        throw AppException.badRequest('Google OAuth token not set.');
      }
      const refreshToken = decrypt(row.oauthRefreshTokenEnc);
      const { clientId, clientSecret } = requireGoogleMailOAuthEnv();
      const { accessToken } = await refreshGoogleAccessToken(refreshToken);
      return {
        imap: {
          host: row.imapHost,
          port: row.imapPort,
          secure: row.imapSecure,
          user: row.imapUser,
          accessToken,
        },
        smtp: {
          host: row.smtpHost,
          port: row.smtpPort,
          secure: row.smtpSecure,
          user: row.smtpUser,
          clientId,
          clientSecret,
          refreshToken,
          accessToken,
        },
      };
    }

    if (!row.imapPasswordEnc || !row.smtpPasswordEnc) {
      throw AppException.badRequest('Mailbox passwords not set.');
    }
    return {
      imap: {
        host: row.imapHost,
        port: row.imapPort,
        secure: row.imapSecure,
        user: row.imapUser,
        password: decrypt(row.imapPasswordEnc),
      },
      smtp: {
        host: row.smtpHost,
        port: row.smtpPort,
        secure: row.smtpSecure,
        user: row.smtpUser,
        password: decrypt(row.smtpPasswordEnc),
      },
    };
  }

  private async testImap(cfg: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password?: string;
    accessToken?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const auth = cfg.accessToken
      ? { user: cfg.user, accessToken: cfg.accessToken }
      : { user: cfg.user, pass: cfg.password! };
    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth,
      logger: false,
    });
    try {
      await client.connect();
      await client.logout();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: formatImapError(err) };
    }
  }

  private async testSmtp(cfg: Parameters<typeof smtpTransportOptions>[0]): Promise<{
    ok: boolean;
    error?: string;
  }> {
    const transporter = nodemailer.createTransport(smtpTransportOptions(cfg));
    try {
      await transporter.verify();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: formatSmtpError(err) };
    } finally {
      transporter.close();
    }
  }

  private async triggerWorkerRestart() {
    if (this.idleWorkerRef) {
      try {
        await this.idleWorkerRef.restartSession();
      } catch (err) {
        this.logger.warn(`Worker restart failed: ${(err as Error).message}`);
      }
    }
  }
}
