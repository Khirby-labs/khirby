import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { Readable } from 'stream';
import { MailboxService } from './mailbox.service';
import { MailThreadService } from './mail-thread.service';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { EventsService } from '../../core/events/events.service';
import { mailSecretsKeyProblem } from './mail-crypto';
import { formatImapError } from './mail-imap-error';

const BACKOFF_INITIAL_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60 * 1000; // 5 minutes
/** Re-issue IDLE before typical server 29-min cutoff (ImapFlow auto-idle). */
const MAX_IDLE_TIME_MS = 20 * 60 * 1000;

@Injectable()
export class MailIdleWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailIdleWorker.name);

  private client: ImapFlow | null = null;
  private restartRequested = false;
  private destroyed = false;
  private running: Promise<void> | null = null;
  /** Serialise exists-driven fetches so we don't overlap IMAP commands. */
  private fetchQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly mailboxSvc: MailboxService,
    private readonly threadSvc: MailThreadService,
    private readonly plugins: PluginRegistryService,
    private readonly events: EventsService,
  ) {}

  async onModuleInit() {
    this.mailboxSvc.setIdleWorker(this);
    this.ensureRunning();
  }

  async onModuleDestroy() {
    this.destroyed = true;
    await this.stopSession();
  }

  async restartSession() {
    this.restartRequested = true;
    await this.stopSession();
    if (!this.destroyed) {
      this.ensureRunning();
    }
  }

  private ensureRunning() {
    if (this.running || this.destroyed) return;
    this.running = this.startWithRetry().finally(() => {
      this.running = null;
    });
  }

  private async startWithRetry() {
    let backoff = BACKOFF_INITIAL_MS;
    while (!this.destroyed) {
      try {
        await this.runSession();
        if (this.destroyed) break;
        backoff = BACKOFF_INITIAL_MS;
      } catch (err) {
        if (this.destroyed) break;
        this.logger.warn(
          `IMAP session error: ${formatImapError(err)}; reconnecting in ${backoff}ms`,
        );
        const retryAt = Date.now() + backoff;
        await waitUntil(() => this.destroyed || this.restartRequested || Date.now() >= retryAt);
        backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
      }
    }
  }

  private async runSession() {
    this.restartRequested = false;

    const secretsProblem = mailSecretsKeyProblem();
    if (secretsProblem) {
      this.logger.warn(`${secretsProblem}; IMAP worker staying idle`);
      await waitUntil(() => this.restartRequested || this.destroyed);
      return;
    }

    const creds = await this.mailboxSvc.getDecryptedCredentials();
    if (!creds) {
      this.logger.log('No enabled mailbox configured; IMAP worker staying idle');
      await this.waitWhileMailboxDisabled();
      return;
    }

    if (this.destroyed || this.restartRequested) return;
    const { mailbox } = creds;
    const mailboxId = mailbox.id;

    const auth =
      creds.authMethod === 'google_oauth'
        ? { user: mailbox.imapUser, accessToken: creds.accessToken }
        : { user: mailbox.imapUser, pass: creds.imapPassword };

    // Auto-IDLE is on by default — do NOT hold getMailboxLock across the session
    // (ImapFlow maintainers: lock blocks / breaks IDLE). Listen for `exists` instead.
    const client = new ImapFlow({
      host: mailbox.imapHost,
      port: mailbox.imapPort,
      secure: mailbox.imapSecure,
      auth,
      logger: false,
      maxIdleTime: MAX_IDLE_TIME_MS,
    });

    this.client = client;
    let closed = false;
    let ready = false;
    let socketError: Error | undefined;
    const onClose = () => {
      closed = true;
    };

    const onExists = () => {
      if (!ready) return;
      this.enqueueFetch(
        async () => {
          const row = await this.mailboxSvc.getRawRow();
          if (!row || this.destroyed || this.restartRequested || closed || this.client !== client)
            return;
          await this.fetchSinceUid(mailboxId, row.imapLastUid ?? 0);
        },
        async (err) => {
          socketError = err instanceof Error ? err : new Error(String(err));
          closed = true;
          client.close();
          await this.mailboxSvc.updateConnectionStatus(mailboxId, 'error', {
            lastSyncError: formatImapError(err),
          });
        },
      );
    };

    const onError = (err: Error) => {
      socketError = err;
      closed = true;
      client.close();
      this.logger.error(`IMAP socket error: ${formatImapError(err)}`);
    };

    client.on('exists', onExists);
    client.on('error', onError);
    client.on('close', onClose);

    try {
      await client.connect();

      // SELECT INBOX without holding a long-lived lock
      await client.mailboxOpen('INBOX');

      const opened = client.mailbox;
      if (!opened) {
        throw new Error('Failed to open INBOX');
      }

      await this.mailboxSvc.updateConnectionStatus(mailboxId, 'connected', {
        lastSyncError: null,
      });

      const liveUidValidity = Number(opened.uidValidity ?? 0) || undefined;

      if (
        liveUidValidity !== undefined &&
        mailbox.imapUidValidity != null &&
        liveUidValidity !== mailbox.imapUidValidity
      ) {
        this.logger.warn(
          `uidValidity mismatch (stored=${mailbox.imapUidValidity}, live=${liveUidValidity}); resetting lastUid`,
        );
        await this.mailboxSvc.updateSyncPointer(mailboxId, {
          imapUidValidity: liveUidValidity,
          imapLastUid: 0,
        });
        mailbox.imapLastUid = 0;
      } else if (liveUidValidity !== undefined && !mailbox.imapUidValidity) {
        await this.mailboxSvc.updateSyncPointer(mailboxId, { imapUidValidity: liveUidValidity });
      }

      const lastUid = mailbox.imapLastUid ?? 0;
      if (lastUid === 0) {
        await this.performBackfill(mailboxId, mailbox.backfillDays);
      } else {
        await this.fetchSinceUid(mailboxId, lastUid);
      }

      const hasIdle = Boolean(client.capabilities?.has?.('IDLE'));
      this.logger.log(
        `IMAP watching INBOX (${hasIdle ? 'auto-idle' : 'NOOP fallback — server has no IDLE'})`,
      );

      ready = true;
      // Catch messages arriving during initial sync, then let auto-IDLE drive fetches.
      onExists();
      await waitUntil(() => closed || this.restartRequested || this.destroyed);
      if (!this.restartRequested && !this.destroyed) {
        throw socketError ?? new Error('IMAP connection closed');
      }
    } catch (err) {
      if (this.destroyed || this.restartRequested) return;
      const errMsg = formatImapError(err);
      this.logger.error(`IMAP error: ${errMsg}`);
      await this.mailboxSvc.updateConnectionStatus(mailboxId, 'error', {
        lastSyncError: errMsg,
      });
      throw err;
    } finally {
      ready = false;
      closed = true;
      client.off('exists', onExists);
      client.close();
      await this.fetchQueue;
      client.off('error', onError);
      client.off('close', onClose);
      if (this.client === client) this.client = null;
    }
  }

  private enqueueFetch(job: () => Promise<void>, onFailure: (err: unknown) => Promise<void>) {
    this.fetchQueue = this.fetchQueue
      .then(job)
      .catch(async (err) => {
        try {
          await onFailure(err);
        } finally {
          this.logger.error(`IMAP fetch queue error: ${formatImapError(err)}`);
        }
      })
      .catch((err) => this.logger.error(`IMAP status update error: ${formatImapError(err)}`));
  }

  private async performBackfill(mailboxId: string, backfillDays: number) {
    if (!this.client) throw new Error('IMAP session is not connected');
    const since = new Date();
    since.setDate(since.getDate() - backfillDays);

    this.logger.log(`Performing backfill for last ${backfillDays} days`);
    try {
      const uids = await this.client.search({ since }, { uid: true });
      if (!uids || uids.length === 0) {
        // Advance pointer past empty so we don't re-backfill every reconnect.
        // Use uidNext-1 when available so catch-up starts from current tip.
        const mb = this.client.mailbox;
        const uidNext = mb ? Number(mb.uidNext ?? 1) : 1;
        await this.mailboxSvc.updateSyncPointer(mailboxId, {
          imapLastUid: Math.max(0, uidNext - 1),
        });
        return;
      }

      // Cap initial ingest so huge inboxes don't stall boot
      const ordered = [...uids].sort((a, b) => a - b);
      const capped = ordered.length > 500 ? ordered.slice(-500) : ordered;
      let maxUid = 0;
      for (const uid of capped) {
        await this.fetchAndIngestUid(mailboxId, uid);
        if (uid > maxUid) maxUid = uid;
        await this.mailboxSvc.updateSyncPointer(mailboxId, { imapLastUid: maxUid });
      }

      await this.mailboxSvc.updateSyncPointer(mailboxId, { imapLastUid: maxUid });
      await this.mailboxSvc.updateConnectionStatus(mailboxId, 'connected', {
        lastSyncAt: new Date(),
        lastSyncError: null,
      });
    } catch (err) {
      this.logger.error(`Backfill error: ${formatImapError(err)}`);
      throw err;
    }
  }

  private async fetchSinceUid(mailboxId: string, lastUid: number) {
    if (!this.client) throw new Error('IMAP session is not connected');
    try {
      const uids = await this.client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
      if (!uids || uids.length === 0) return;

      let maxUid = lastUid;
      for (const uid of [...uids].sort((a, b) => a - b)) {
        if (uid <= lastUid) continue;
        await this.fetchAndIngestUid(mailboxId, uid);
        if (uid > maxUid) maxUid = uid;
        await this.mailboxSvc.updateSyncPointer(mailboxId, { imapLastUid: maxUid });
      }

      if (maxUid > lastUid) {
        await this.mailboxSvc.updateSyncPointer(mailboxId, { imapLastUid: maxUid });
        await this.mailboxSvc.updateConnectionStatus(mailboxId, 'connected', {
          lastSyncAt: new Date(),
          lastSyncError: null,
        });
      }
    } catch (err) {
      this.logger.error(`Fetch since UID error: ${formatImapError(err)}`);
      throw err;
    }
  }

  private async fetchAndIngestUid(mailboxId: string, uid: number) {
    if (!this.client) throw new Error('IMAP session is not connected');
    try {
      const message = await this.client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!message) return;
      const msgObj = message as {
        source?: Buffer | Readable;
      };
      if (!msgObj.source) throw new Error(`IMAP UID ${uid} has no source`);

      const source =
        msgObj.source instanceof Buffer
          ? Readable.from(msgObj.source)
          : (msgObj.source as Readable);

      const parsed = await simpleParser(source);

      const fromAddress =
        parsed.from?.value?.[0]?.address ?? parsed.from?.text ?? 'unknown@unknown';
      const toAddresses = (
        parsed.to
          ? Array.isArray(parsed.to)
            ? parsed.to.flatMap(
                (a: { value?: Array<{ address?: string }> }) =>
                  a.value?.map((v) => v.address ?? '') ?? [],
              )
            : (((parsed.to as { value?: Array<{ address?: string }> }).value?.map(
                (v) => v.address ?? '',
              ) ?? []) as string[])
          : []
      ).filter(Boolean);

      const ccAddresses = (
        parsed.cc
          ? Array.isArray(parsed.cc)
            ? parsed.cc.flatMap(
                (a: { value?: Array<{ address?: string }> }) =>
                  a.value?.map((v) => v.address ?? '') ?? [],
              )
            : (((parsed.cc as { value?: Array<{ address?: string }> }).value?.map(
                (v) => v.address ?? '',
              ) ?? []) as string[])
          : []
      ).filter(Boolean);

      const result = await this.threadSvc.ingestMessage({
        mailboxId,
        rawMessageId: parsed.messageId,
        inReplyTo: parsed.inReplyTo,
        references: Array.isArray(parsed.references)
          ? parsed.references.join(' ')
          : (parsed.references ?? undefined),
        fromAddress,
        toAddresses,
        ccAddresses,
        subject: parsed.subject ?? '(no subject)',
        bodyText: parsed.text ?? '',
        bodyHtml: parsed.html || undefined,
        sentAt: parsed.date ?? undefined,
        receivedAt: new Date(),
        imapUid: uid,
        hasAttachments: (parsed.attachments?.length ?? 0) > 0,
      });

      if (result.isNew) {
        void this.plugins.emit({
          type: 'email.received',
          payload: {
            messageId: parsed.messageId ?? result.messageId,
            threadId: result.threadId,
            mailboxId,
            fromAddress,
            toAddresses,
            subject: parsed.subject ?? '(no subject)',
            bodyText: parsed.text ?? '',
            contactId: result.contactId,
            leadId: result.leadId,
            receivedAt: new Date(),
          },
        });
        this.events.emit('email.received', {
          threadId: result.threadId,
          contactId: result.contactId,
          leadId: result.leadId,
          messageId: result.messageId,
        });
      }
    } catch (err) {
      this.logger.error(`Ingest UID ${uid} error: ${formatImapError(err)}`);
      throw err;
    }
  }

  private async stopSession() {
    await this.safeLogout();
  }

  /**
   * Park until the firm mailbox is enabled (or restart/destroy).
   * Polling matters: enabling via SQL / another process / UI without
   * `restartSession()` used to leave the worker stuck forever.
   */
  private async waitWhileMailboxDisabled() {
    while (!this.destroyed && !this.restartRequested) {
      await sleep(3_000);
      if (this.destroyed || this.restartRequested) return;
      const row = await this.mailboxSvc.getRawRow();
      if (row?.enabled) {
        this.logger.log('Mailbox became enabled; starting IMAP session');
        return;
      }
    }
  }

  private async safeLogout() {
    // Close immediately so a stuck IMAP command cannot block restart/shutdown.
    // The sole retry loop drains the old fetch queue before opening a new client.
    this.client?.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}

function waitUntil(condition: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval);
        resolve();
      }
    }, 500);
    interval.unref();
  });
}
