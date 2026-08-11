import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { AppException } from '../../core/errors/app-exception';

/** Full mail scope required for IMAP/SMTP XOAUTH2 (not Gmail API granular scopes). */
export const GOOGLE_MAIL_SCOPE = 'https://mail.google.com/';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const GMAIL_IMAP = { host: 'imap.gmail.com', port: 993, secure: true } as const;
const GMAIL_SMTP = { host: 'smtp.gmail.com', port: 587, secure: false } as const;

export function isGoogleMailOAuthConfigured(): boolean {
  return !!(
    process.env.GOOGLE_MAIL_CLIENT_ID?.trim() && process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim()
  );
}

export function requireGoogleMailOAuthEnv(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_MAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw AppException.badRequest(
      'Google Mail OAuth is not configured. Set GOOGLE_MAIL_CLIENT_ID and GOOGLE_MAIL_CLIENT_SECRET.',
    );
  }
  return { clientId, clientSecret };
}

/** Public origin for OAuth redirect + SPA return (no trailing slash). */
export function mailPublicOrigin(): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const explicit = process.env.PUBLIC_URL?.trim() || process.env.APP_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    if (/^https?:\/\//i.test(appUrl)) return appUrl.replace(/\/$/, '');
    return `https://${appUrl.replace(/\/$/, '')}`;
  }
  if (isDev) return 'http://localhost:5173';
  throw AppException.badRequest(
    'Cannot build OAuth redirect URL: set APP_URL (host) or PUBLIC_URL (full origin).',
  );
}

/** API origin that Google redirects to after consent. */
export function mailApiOrigin(): string {
  // Override when the callback must hit the API host directly (no /api proxy).
  const explicit = process.env.API_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  // Same origin as the SPA: Vite (dev) and nginx (prod) both proxy `/api` → Nest.
  return mailPublicOrigin();
}

export function googleMailOAuthRedirectUri(): string {
  return `${mailApiOrigin()}/api/mail/mailbox/oauth/google/callback`;
}

export function gmailTransportDefaults() {
  return { imap: { ...GMAIL_IMAP }, smtp: { ...GMAIL_SMTP } };
}

function stateSigningKey(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret !== undefined && secret.length > 0 && secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters when set');
  }
  return secret && secret.length >= 32 ? secret : 'dev-secret-change-in-prod';
}

type OAuthStatePayload = { userId: string; nonce: string; exp: number };

/** HMAC-signed state — survives SameSite=strict (callback has no session cookie). */
export function signOAuthState(userId: string): string {
  const payload: OAuthStatePayload = {
    userId,
    nonce: randomBytes(16).toString('hex'),
    exp: Date.now() + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', stateSigningKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyOAuthState(state: string): { userId: string } {
  const [body, sig] = state.split('.');
  if (!body || !sig) throw AppException.badRequest('Invalid OAuth state.');
  const expected = createHmac('sha256', stateSigningKey()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw AppException.badRequest('Invalid OAuth state signature.');
  }
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
  } catch {
    throw AppException.badRequest('Invalid OAuth state payload.');
  }
  if (!payload.userId || !payload.exp || payload.exp < Date.now()) {
    throw AppException.badRequest('OAuth state expired. Try connecting again.');
  }
  return { userId: payload.userId };
}

export function createGoogleOAuthClient(redirectUri?: string): OAuth2Client {
  const { clientId, clientSecret } = requireGoogleMailOAuthEnv();
  return new OAuth2Client(clientId, clientSecret, redirectUri ?? googleMailOAuthRedirectUri());
}

export function buildGoogleAuthUrl(userId: string): string {
  const client = createGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GOOGLE_MAIL_SCOPE, 'openid', 'email'],
    state: signOAuthState(userId),
    include_granted_scopes: true,
  });
}

export type GoogleTokenResult = {
  refreshToken: string;
  accessToken: string;
  expiryDate: number | null;
  email: string;
};

export async function exchangeGoogleAuthCode(code: string): Promise<GoogleTokenResult> {
  const client = createGoogleOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw AppException.badRequest(
      'Google did not return a refresh token. Revoke app access in Google Account and try again.',
    );
  }
  if (!tokens.access_token) {
    throw AppException.badRequest('Google did not return an access token.');
  }
  client.setCredentials(tokens);
  const tokenInfo = await client.getTokenInfo(tokens.access_token);
  const email = tokenInfo.email;
  if (!email) {
    throw AppException.badRequest('Could not read the Google account email.');
  }
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiryDate: tokens.expiry_date ?? null,
    email,
  };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiryDate: number | null;
}> {
  const { clientId, clientSecret } = requireGoogleMailOAuthEnv();
  const client = new OAuth2Client(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  if (!credentials.access_token) {
    throw AppException.badRequest('Failed to refresh Google access token.');
  }
  return {
    accessToken: credentials.access_token,
    expiryDate: credentials.expiry_date ?? null,
  };
}

export function settingsOAuthReturnUrl(result: 'ok' | 'error', error?: string): string {
  const base = `${mailPublicOrigin()}/settings/mail`;
  const params = new URLSearchParams({ oauth: result });
  if (error) params.set('oauthError', error.slice(0, 200));
  return `${base}?${params}`;
}
