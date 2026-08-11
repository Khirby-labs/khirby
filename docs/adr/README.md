# Architecture Decision Records

Significant architectural decisions, one file per decision, MADR-minimal format
(Context → Decision → Consequences). Numbered chronologically. Immutable once
accepted — a reversal is a *new* ADR that supersedes the old one, never an edit.

New decision? Use the `/adr` skill (copies `template.md`, assigns the next number).
Check here **before changing architecture**: `AGENTS.md` says what not to do, ADRs
say why — so a deliberate choice doesn't get "fixed".

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-session-cookies-not-jwt.md) | Redis-backed session cookies, not JWT | Accepted |
| [0003](0003-drizzle-orm-not-typeorm-prisma.md) | Drizzle ORM, not TypeORM or Prisma | Accepted |
| [0004](0004-single-tenant-by-design.md) | Single-tenant by design | Accepted |
| [0005](0005-fastify-http-adapter.md) | Fastify HTTP adapter for NestJS | Accepted |
| [0006](0006-plugins-consumed-as-ts-source.md) | In-repo plugins/packages consumed as TS source | Accepted |
| [0007](0007-honey-graphite-design-system.md) | "Honey & Graphite" design system, CSS variable tokens, headless UI | Accepted |
| [0008](0008-navigation-shell-architecture.md) | Navigation shell architecture (sidebar, topbar, ⌘K, Settings console) | Accepted |
| [0009](0009-role-mutations-super-admin-only.md) | Role mutations require super-admin | Accepted |
| [0010](0010-web-tests-measure-the-boundary.md) | Web tests measure the boundary (MSW / DOM), not our own code | Accepted |
| [0011](0011-i18n-architecture.md) | i18n: two authored locales, keys as the contract | Accepted |
| [0012](0012-date-input-standard.md) | One date-input standard: Reka Calendar over native date inputs | Accepted |
| [0013](0013-mcp-plugin-bearer-tokens.md) | MCP plugin: Streamable HTTP + hashed bearer token (OAuth later) | Accepted |
| [0014](0014-core-firm-mailbox.md) | Core firm mailbox (IMAP+SMTP), email threads as first-class CRM data | Accepted |
| [0015](0015-public-vitepress-docs.md) | Public VitePress docs vs internal `docs/` | Superseded by [0029](0029-public-docs-on-landing.md) |
| [0016](0016-npm-community-plugins.md) | npm-installable community plugins (manifest + host package) | Accepted |
| [0017](0017-mail-compose-assistant-slot.md) | Mail compose assistant slot (plugin UI in core mail) | Accepted |
| [0018](0018-mailbox-google-oauth.md) | Google OAuth (XOAUTH2) for the firm mailbox | Accepted |
| [0019](0019-mcp-mail-tools.md) | MCP mail tools: read threads + attributed send/reply | Accepted |
| [0020](0020-listmonk-plugin-web-and-ai-generate.md) | Listmonk campaign UI in plugin `./web` + AI body generate | Accepted |
| [0021](0021-listmonk-list-form-mapping.md) | Listmonk list ↔ CRM form mapping in plugin DB | Accepted |
| [0022](0022-pokelo-rag-context-token.md) | Optional Pokelo RAG context via plugin-host token | Accepted |
| [0023](0023-plugin-settings-embed-in-plugins-list.md) | Settings-only plugin UIs embed in Settings → Plugins | Accepted |
| [0024](0024-pokelo-settings-encrypted-multi-project.md) | Pokelo settings: encrypted token + multi-project binding | Accepted |
| [0025](0025-public-form-field-labels-i18n.md) | Public form field labels as multilingual persisted content (`?locale=`) | Accepted |
| [0026](0026-boards-in-core.md) | Work boards are core; sales pipeline stays domain-specific | Accepted |
| [0027](0027-mcp-boards-tools.md) | MCP boards tools: read + create/update (no delete) | Accepted |
| [0028](0028-mcp-contacts-leads-write.md) | MCP contacts/leads create + update (no delete) | Accepted |
| [0029](0029-public-docs-on-landing.md) | Public product docs live on the landing site | Accepted |
| [0030](0030-first-party-plugins-from-npm.md) | First-party plugins install from npm (out of monorepo) | Accepted |
