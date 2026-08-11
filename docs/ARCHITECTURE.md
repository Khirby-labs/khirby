# Architecture — Khirby

This document describes the architecture of Khirby and explains the reasoning behind key design decisions.

> **Frontend design system?** See [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md). This file is backend/system architecture only.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
  - [Monorepo Layout](#monorepo-layout)
  - [Request Flow](#request-flow)
  - [Plugin Event Flow](#plugin-event-flow)
- [Key Design Decisions](#key-design-decisions)
- [Database Schema](#database-schema)
- [API Design](#api-design)

---

## Architecture Overview

### Monorepo Layout

```
khirby/
├── apps/
│   ├── api/                    ← NestJS backend   (port 3000)
│   └── web/                    ← Vue 3 SPA        (port 5173)
│
├── packages/
│   ├── plugin-sdk/             ← CrmPlugin interface + CrmEvent types
│   └── types/                  ← shared TypeScript types (DTOs, enums)
│
└── plugins/
    ├── crm-plugin-webhook/     ← @khirby/plugin-webhook
    └── crm-plugin-listmonk/    ← Listmonk email marketing plugin
```

Packages are wired together via `pnpm-workspace.yaml` and TypeScript path aliases.  
`@khirby/plugin-sdk` and `@khirby/types` are referenced with `workspace:*` in each package's `package.json`.

Public product documentation is published from the **landing-site repository** (see ADR-0029). The root `docs/` tree (ADRs, journal, design system, deploy) is internal to this repo.
---

### Request Flow

```
 Browser
   │
   │  HTTP/JSON + session cookie (httpOnly)
   ▼
┌──────────────────────────────────────┐
│  nginx                               │  port 80
│  /          → Vue 3 SPA (static)     │
│  /api/      → proxy → NestJS         │
└──────────────┬───────────────────────┘
               │  REST API calls (cookie forwarded)
               ▼
┌──────────────────────────────────────┐
│  NestJS API                          │  port 3000
│  ├─ SessionGuard (validates cookie)  │
│  ├─ PermissionGuard (RBAC check)     │
│  ├─ Controller (route handler)       │
│  ├─ Service (business logic)         │
│  └─ Drizzle ORM (SQL builder)        │
└──────────────┬────────────┬──────────┘
               │            │  session lookup
               │            ▼
               │  ┌──────────────────────┐
               │  │  Redis               │  session store
               │  └──────────────────────┘
               │  SQL (postgres.js)
               ▼
┌──────────────────────────────────────┐
│  PostgreSQL                          │  port 5432
└──────────────────────────────────────┘
```

Auto-migrations (`drizzle-kit push`) run on API startup, keeping the schema in sync with `schema.ts` without manual migration files.

---

### Plugin Event Flow

```
ContactsService.create()
        │
        │  emits 'contact.created'
        ▼
PluginRegistryService.emit(event)
        │
        ├──► Plugin A (enabled)  → plugin.onEvent(event, ctx)
        ├──► Plugin B (enabled)  → plugin.onEvent(event, ctx)
        └──► Plugin C (disabled) → skipped
```

Each enabled plugin receives the full event payload and its own `PluginContext` which includes a logger and the plugin's config values loaded from the `plugins` table in the database.

Plugins run **asynchronously** — a failing plugin does not block the API response to the caller.

---

## Key Design Decisions

### 1. Single-tenant

**Decision:** The system has exactly one tenant (one organisation, one admin).

**Rationale:** Multi-tenancy adds significant complexity (row-level security, tenant isolation, billing). For a self-hosted CRM targeting small teams, single-tenant keeps the codebase lean, the data model simple, and the security surface small. Each deployment serves one organisation.

---

### 2. Plugin SDK as a separate workspace package

**Decision:** The `CrmPlugin` interface lives in `packages/plugin-sdk`, not in `apps/api`.

**Rationale:** Third-party plugin authors should be able to implement `CrmPlugin` without depending on NestJS internals. By keeping the SDK package dependency-free (pure TypeScript types + a minimal interface), any npm package can implement it. Plugins only need `@khirby/plugin-sdk` as a peer dependency.

---

### 3. Auto-migration on startup

**Decision:** `drizzle-kit push` runs when the API boots, applying any schema changes automatically.

**Rationale:** For a self-hosted single-tenant application, keeping a folder of migration files is unnecessary ceremony. Auto-push keeps the schema in sync with `schema.ts` with zero operator effort on updates. The trade-off (no migration history, no rollback) is acceptable given the deployment model.

---

### 4. Plugin configuration stored in the database (jsonb)

**Decision:** Each plugin's configuration (API keys, URLs, etc.) is stored in a `config jsonb` column in the `plugins` table, editable via the UI.

**Rationale:** Environment variables are a pain for end users who are not developers. Storing config in the DB and exposing an edit UI means operators can reconfigure a plugin without touching environment files, restarting containers, or re-deploying. Sensitive values (API keys) should be treated as secrets by the operator at the DB level.

---

### 5. Plugin `subscribeOn` pattern

**Decision:** The Listmonk plugin (and others) can declare which contacts/events trigger a subscription via a configurable `subscribeOn` key in their config.

**Rationale:** Plugins need flexible trigger logic without code changes. Externalising the trigger condition into config lets operators tune plugin behaviour (e.g., "only subscribe contacts from form X") via the UI.

---

### 6. Rate limiting on public form endpoint + honeypot

**Decision:** `POST /public/forms/:token/submit` is rate-limited to **5 requests/min per IP** and includes a honeypot field check.

**Rationale:** The public form submission endpoint is unauthenticated by design (it's meant to be embedded in public-facing websites). Without rate limiting it would be trivially spammable. The honeypot field (`_hp`) silently drops submissions where bots fill in the hidden field, with no CAPTCHA UX cost for real users.

---

### 7. Redis session auth (no JWT)

**Decision:** Authentication uses Redis-backed httpOnly session cookies. No JWT, no refresh tokens, no localStorage.

**Rationale:** JWT without a revocation mechanism means logout is fake — the token stays valid until expiry. For an internal CRM, proper logout and session invalidation on password change are non-negotiable. Redis sessions solve this: `POST /auth/logout` calls `session.destroy()` which removes the session from Redis immediately. Changing a password can also wipe all active sessions. The added complexity (one Redis container) is trivial in a Docker-compose stack.

- Cookie: `httpOnly: true` (XSS can't steal it), `SameSite: strict` (CSRF protection), `secure: true` in production
- Session TTL: 7 days rolling

---

### 8. Drizzle ORM

**Decision:** Drizzle ORM 0.40 with `postgres.js` driver, not TypeORM or Prisma.

**Rationale:**

| Criterion       | Drizzle                        | Prisma                        | TypeORM                       |
|-----------------|--------------------------------|-------------------------------|-------------------------------|
| Type safety     | Full, no codegen at runtime    | Full, requires codegen step   | Partial (decorators)          |
| Bundle size     | Lightweight                    | Heavy (Prisma engine binary)  | Medium                        |
| Schema location | Single `schema.ts` file        | `schema.prisma` DSL           | Decorator-scattered           |
| Raw SQL escape  | First-class (`sql` tagged tmpl)| `$queryRaw`                   | `query()`                     |
| Migration       | `push` for dev, `generate` opt | `migrate dev`                 | `synchronize` (risky) or CLI  |

Drizzle gives full TypeScript inference from a single schema file with no binary dependencies and minimal magic.

---

## Database Schema

All tables are defined in `apps/api/src/core/database/schema.ts`.

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   users     │     │     roles        │     │ role_permissions │
│─────────────│     │─────────────────│     │──────────────────│
│ id (pk)     │     │ id (pk)          │     │ id (pk)          │
│ email       │     │ name             │     │ roleId (fk)      │
│ password    │     │ description      │     │ permission       │
│ createdAt   │     │ createdAt        │     └──────────────────┘
└──────┬──────┘     └────────┬────────┘
       │                     │
       └──────────┬──────────┘
                  │
           ┌──────▼──────┐
           │  user_roles  │
           │─────────────│
           │ userId (fk)  │
           │ roleId (fk)  │
           └─────────────┘

┌─────────────────┐     ┌──────────────────────┐
│    contacts     │     │       forms           │
│─────────────────│     │──────────────────────│
│ id (pk)         │     │ id (pk)               │
│ email           │     │ name                  │
│ name            │     │ slug (unique)          │
│ phone           │     │ token (unique)         │
│ company         │     │ fields (jsonb)         │
│ notes           │     │ createdAt             │
│ createdAt       │     └──────────┬───────────┘
└─────────────────┘                │
                                   │
                    ┌──────────────▼──────────────┐
                    │       form_submissions        │
                    │──────────────────────────────│
                    │ id (pk)                       │
                    │ formId (fk)                   │
                    │ contactId (fk, nullable)      │
                    │ data (jsonb)                  │
                    │ createdAt                     │
                    └──────────────────────────────┘

┌──────────────────────┐     ┌──────────────────────┐
│   newsletter_lists   │     │       plugins         │
│──────────────────────│     │──────────────────────│
│ id (pk)              │     │ id (pk)               │
│ name                 │     │ name (unique)          │
│ listmonkId           │     │ enabled (bool)         │
│ createdAt            │     │ config (jsonb)         │
└──────────────────────┘     │ createdAt             │
                             └──────────────────────┘
```

---

## Mail Module

The **core mail module** (`apps/api/src/modules/mail/`) connects the CRM to a single firm IMAP+SMTP mailbox and stores email threads as first-class CRM data, linked to contacts and leads. See [ADR-0014](./adr/0014-core-firm-mailbox.md) for the full decision record.

### Key points

- **IMAP IDLE** — a long-lived session (`imapflow`) receives push notifications from the mail server. No polling.
- **Threading** — uses RFC Message-ID / In-Reply-To / References headers; never subject-based.
- **Lead resolution** — inbound messages are matched to contacts by email address, then to the most-recent open lead (`!isWon && !isLost`, ordered by `updated_at DESC`).
- **Secrets** — IMAP/SMTP passwords and Google OAuth refresh tokens stored AES-256-GCM encrypted (`imapPasswordEnc` / `smtpPasswordEnc` / `oauthRefreshTokenEnc`), keyed from env `MAIL_SECRETS_KEY`. Never returned by API.
- **Auth methods** — `password` (generic IMAP/SMTP) or `google_oauth` (XOAUTH2 via “Sign in with Google”; see [ADR-0018](./adr/0018-mailbox-google-oauth.md)).
- **Outbound atomicity** — messages insert as `pending`, transition to `sent` or `failed` after SMTP delivery.
- **Listmonk boundary** — Listmonk plugin handles marketing/bulk email; the mail module handles 1:1 transactional correspondence. They share no tables or services.
- **Plugin events** — `email.received` / `email.sent` are emitted so plugins (AI drafts, etc.) can react without touching the core module.

### Tables

| Table | Purpose |
|-------|---------|
| `mailboxes` | Singleton config: encrypted credentials, connection status, sync metadata |
| `email_threads` | One row per RFC conversation; FK → `contacts` (CASCADE), `leads` (SET NULL) |
| `email_messages` | Individual messages; unique on `(mailboxId, messageId)` |

---

## API Design

### Principles

- **REST** conventions — resources are nouns, HTTP methods express actions
- **JSON** request and response bodies throughout
- **Session cookie** authentication — httpOnly, set on login, destroyed on logout
- **Consistent error shape:** `{ statusCode, message, error }`

### Public vs Protected

```
POST /api/public/forms/:token/submit   — unauthenticated, rate-limited (5/min/IP)
                                         honeypot field: _hp (must be empty)

All other endpoints                    — require valid session cookie (set by POST /api/auth/login)
```

### Typical response shapes

**List:**
```json
[
  { "id": 1, "email": "alice@example.com", "name": "Alice" },
  { "id": 2, "email": "bob@example.com",   "name": "Bob"   }
]
```

**Single resource:**
```json
{ "id": 1, "email": "alice@example.com", "name": "Alice", "createdAt": "2024-01-15T10:00:00Z" }
```

**Error:**
```json
{ "statusCode": 404, "message": "Contact not found", "error": "Not Found" }
```

### Versioning

There is currently no API version prefix. The API is considered internal (consumed only by the bundled Vue SPA and configured plugins). Breaking changes will be coordinated with frontend updates in the same release.
