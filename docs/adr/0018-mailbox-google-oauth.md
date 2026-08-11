# 0018 — Google OAuth (XOAUTH2) for the firm mailbox

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Damian

## Context

Google Workspace disabled basic authentication for IMAP/SMTP (March 2025). Firm CRM mailboxes on Google can no longer use username+password; App Passwords are often blocked by admin policy. ADR-0014 deferred Gmail/Outlook OAuth from v1. Operators now need a one-click “Sign in with Google” path that stores a refresh token and speaks SASL XOAUTH2.

## Decision

We add `authMethod: 'password' | 'google_oauth'` on the singleton `mailboxes` row. Google uses 3-legged OAuth with scope `https://mail.google.com/` (required for IMAP/SMTP XOAUTH2), stores an AES-GCM encrypted refresh token (`oauthRefreshTokenEnc`), and auto-fills `imap.gmail.com` / `smtp.gmail.com`. Password auth remains for non-Google servers. OAuth client id/secret live in env (`GOOGLE_MAIL_CLIENT_ID` / `GOOGLE_MAIL_CLIENT_SECRET`), not in the UI. Callback auth uses an HMAC-signed `state` (not the session cookie) because sessions are `SameSite=strict`.

## Consequences

- A successful Google OAuth callback stores the refresh token, auto-fills Gmail hosts, and **enables** the mailbox (requires `MAIL_SECRETS_KEY` + Google client env).
- Internal Google Cloud OAuth apps (Workspace-only) avoid Google’s restricted-scope verification; External/public apps need verification for `mail.google.com`.
- ImapFlow uses `auth.accessToken`; Nodemailer uses `auth.type: 'OAuth2'` with the stored refresh token.
- Disconnecting Google clears the token, sets `authMethod=password`, and disables the mailbox until passwords are set.
- Do not request narrower Gmail API scopes for IMAP/SMTP — they will not authenticate XOAUTH2.

## Considered alternatives

- **Service account + domain-wide delegation** — rejected for the primary UX: no “Sign in with Google” button; requires Admin Console delegation. May be added later as an admin-only path.
- **Gmail API instead of IMAP** — rejected for now: would replace the IDLE worker and threading model from ADR-0014; XOAUTH2 over existing IMAP/SMTP is enough for Internal apps.
- **App passwords only** — rejected: unreliable under Workspace policy and already failing for the CRM subaccount use case.
