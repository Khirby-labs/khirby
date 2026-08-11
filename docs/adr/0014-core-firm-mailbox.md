# 0014 — Core firm mailbox (IMAP+SMTP), email threads as first-class CRM data

- **Status:** Accepted
- **Date:** 2026-07-29
- **Deciders:** Damian

## Context

Sales teams need to track real 1:1 email correspondence with contacts and leads alongside pipeline data. Today that context lives only in personal inboxes, making it invisible to the CRM. We have two existing email-adjacent pieces: the **Listmonk plugin** (marketing bulk email) and a planned AI-draft capability (plugin-space). Neither solves the core problem of surfacing transactional email threads inside the CRM timeline.

## Decision

We add a **core mail module** (`apps/api/src/modules/mail/`) that connects to a single firm IMAP+SMTP mailbox and stores email threads as first-class CRM objects, linked to contacts and leads.

Key choices:

| Topic | Decision |
|-------|----------|
| Scope | **One firm mailbox** (singleton row). Multi-mailbox, Gmail/Outlook OAuth, per-user inboxes are out of v1 scope. |
| Inbound sync | **IMAP IDLE** (RFC 2177) — event-driven, long-lived session. Not polling. |
| Threading | RFC Message-ID / In-Reply-To / References headers. Subject matching is forbidden. |
| Lead resolution | Match by `From`/`To` email → contact → most-recent open lead (`!isWon && !isLost`, `updated_at DESC`). Missing open lead → `leadId = null`; thread stays visible on contact and in the global `/mail` view. |
| Secrets | IMAP/SMTP passwords stored **AES-256-GCM encrypted** in dedicated columns (`imapPasswordEnc`, `smtpPasswordEnc`), keyed from env `MAIL_SECRETS_KEY` (32-byte hex/base64). Plaintext never returned by API; absent/wrong key blocks the worker with an explicit error. |
| Listmonk boundary | Listmonk plugin stays the **marketing / bulk email** channel. The core mail module is strictly for 1:1 transactional correspondence. They do not share tables or services. |
| AI drafts | AI compose helpers remain **plugin territory** (consume `email.received` / `email.sent` plugin events). Not bundled into core mail. |
| HTML safety | `bodyText` rendered in UI (plain text, `white-space: pre-wrap`). `bodyHtml` stored (capped 200 KB) but **not rendered in v1**; no `v-html` on mail body. |
| Outbound atomicity | `email_messages.status`: `pending → sent / failed`. Insert `pending`, attempt SMTP, update to `sent` (with transport Message-ID) or `failed` (+ `lastError`). Retry supported. |
| Permissions | Mailbox settings: `integrations:manage`. Read/send from lead: `leads:manage`. Read/send from contact: `contacts:manage`. Global `/mail` list: `leads:manage` OR `contacts:manage`. |

## Schema overview

Three new tables (see `schema.ts` + `drizzle/migrations/0004_core_firm_mailbox.sql`):

- **`mailboxes`** — singleton config: IMAP/SMTP credentials (encrypted), connection status, sync metadata, `backfillDays`.
- **`email_threads`** — one row per RFC conversation, linked to contact (CASCADE) and lead (SET NULL).
- **`email_messages`** — individual messages; unique on `(mailboxId, messageId)` and `(mailboxId, imapUid)` where uid not null.

## Consequences

- The IMAP IDLE worker runs as a NestJS lifecycle service (`onModuleInit`); restart is triggered by `MailboxService.save()` / disable so the worker never runs on stale credentials.
- `imapUidValidity` mismatch on reconnect → reset `imapLastUid = 0`, full catch-up FETCH (Message-ID dedupe prevents duplicates).
- Missing `MAIL_SECRETS_KEY` when mailbox is enabled → worker refuses to start and Settings shows a blocking error. No silent fallback.
- Initial backfill: first enable fetches the last `backfillDays` (default 30) to populate the inbox.
- Plugin authors can react to `email.received` / `email.sent` events without touching the core module.

## Considered alternatives

- **Plugin approach (like Listmonk)** — rejected: 1:1 email is a core CRM data type (timeline, lead attribution), not a marketing integration. Plugin sandboxing would prevent tight UI integration.
- **Polling instead of IDLE** — rejected: IDLE is the RFC-standard push mechanism, eliminates unnecessary traffic, and is supported by all modern IMAP servers. Servers without IDLE support get a clear error in Settings.
- **Store passwords in `plugins.config` jsonb** — rejected: `GET /api/plugins` leaks full config to anyone with `integrations:manage`; dedicated encrypted columns + env key is the correct secret storage pattern.
- **Shared AI drafts in core** — rejected: AI logic belongs in plugins to keep the core module minimal and allow different AI backends.
