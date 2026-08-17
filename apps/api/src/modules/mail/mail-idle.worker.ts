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
    void this.startWithRetry();
  }

  async onModuleDestroy() {
    this.destroyed = true;
    await this.stopSession();
  }

  async restartSession() {
    this.restartRequested = true;
    await this.stopSession();
    if (!this.destroyed) {
      void this.startWithRetry();
    }
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
        await sleep(backoff);
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

    const { mailbox } = creds;
    const mailboxId = mailbox.id;

    const auth =
      creds.authMethod === 'google_oauth'
        ? { user: mailbox.imapUser, accessToken: creds.accessToken }
        : { user: mailbox.imapUser, pass: creds.imapPassword };

    // Auto-IDLE is on by default — do NOT hold getMailboxLock across the session
    // (ImapFlow maintainers: lock blocks / breaks IDLE). Listen for `exists` instead.
    this.client = new ImapFlow({
      host: mailbox.imapHost,
      port: mailbox.imapPort,
      secure: mailbox.imapSecure,
      auth,
      logger: false,
      maxIdleTime: MAX_IDLE_TIME_MS,
    });

    const onExists = () => {
      this.enqueueFetch(async () => {
        const row = await this.mailboxSvc.getRawRow();
        if (!row || this.destroyed || this.restartRequested) return;
        await this.fetchSinceUid(mailboxId, row.imapLastUid ?? 0);
      });
    };

    const onError = (err: Error) => {
      this.logger.error(`IMAP socket error: ${formatImapError(err)}`);
    };

    this.client.on('exists', onExists);
    this.client.on('error', onError);

    try {
      await this.client.connect();

      // SELECT INBOX without holding a long-lived lock
      await this.client.mailboxOpen('INBOX');

      const opened = this.client.mailbox;
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

      const hasIdle = Boolean(this.client.capabilities?.has?.('IDLE'));
      this.logger.log(
        `IMAP watching INBOX (${hasIdle ? 'auto-idle' : 'NOOP fallback — server has no IDLE'})`,
      );

      // Stay connected until restart/destroy — ImapFlow auto-idles after inactivity.
      await waitUntil(() => this.restartRequested || this.destroyed);
    } catch (err) {
      if (this.destroyed || this.restartRequested) return;
      const errMsg = formatImapError(err);
      this.logger.error(`IMAP error: ${errMsg}`);
      await this.mailboxSvc.updateConnectionStatus(mailboxId, 'error', {
        lastSyncError: errMsg,
      });
      throw err;
    } finally {
      this.client?.off('exists', onExists);
      this.client?.off('error', onError);
      await this.safeLogout();
    }
  }

  private enqueueFetch(job: () => Promise<void>) {
    this.fetchQueue = this.fetchQueue
      .then(job)
      .catch((err) => this.logger.error(`IMAP fetch queue error: ${formatImapError(err)}`));
  }

  private async performBackfill(mailboxId: string, backfillDays: number) {
    if (!this.client) return;
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
      const capped = uids.length > 500 ? uids.slice(-500) : uids;
      let maxUid = 0;
      for (const uid of capped) {
        await this.fetchAndIngestUid(mailboxId, uid);
        if (uid > maxUid) maxUid = uid;
      }

      await this.mailboxSvc.updateSyncPointer(mailboxId, { imapLastUid: maxUid });
      await this.mailboxSvc.updateConnectionStatus(mailboxId, 'connected', {
        lastSyncAt: new Date(),
        lastSyncError: null,
      });
    } catch (err) {
      this.logger.error(`Backfill error: ${formatImapError(err)}`);
    }
  }

  private async fetchSinceUid(mailboxId: string, lastUid: number) {
    if (!this.client) return;
    try {
      const uids = await this.client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
      if (!uids || uids.length === 0) return;

      let maxUid = lastUid;
      for (const uid of uids) {
        if (uid <= lastUid) continue;
        await this.fetchAndIngestUid(mailboxId, uid);
        if (uid > maxUid) maxUid = uid;
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
    }
  }

  private async fetchAndIngestUid(mailboxId: string, uid: number) {
    if (!this.client) return;
    try {
      const message = await this.client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!message) return;
      const msgObj = message as {
        source?: Buffer | Readable;
      };
      if (!msgObj.source) return;

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
    const client = this.client;
    this.client = null;
    if (!client) return;
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {
        // ignore
      }
    }
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
