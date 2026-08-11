import {
  signOAuthState,
  verifyOAuthState,
  isGoogleMailOAuthConfigured,
  gmailTransportDefaults,
  googleMailOAuthRedirectUri,
  GOOGLE_MAIL_SCOPE,
} from './mail-google-oauth';
import { smtpTransportOptions } from './mail-smtp-options';

describe('mail-google-oauth', () => {
  const prevSecret = process.env.SESSION_SECRET;
  const prevClientId = process.env.GOOGLE_MAIL_CLIENT_ID;
  const prevClientSecret = process.env.GOOGLE_MAIL_CLIENT_SECRET;
  const prevAppUrl = process.env.APP_URL;
  const prevApiPublic = process.env.API_PUBLIC_URL;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars!!';
    delete process.env.GOOGLE_MAIL_CLIENT_ID;
    delete process.env.GOOGLE_MAIL_CLIENT_SECRET;
    delete process.env.APP_URL;
    delete process.env.API_PUBLIC_URL;
  });

  afterAll(() => {
    process.env.SESSION_SECRET = prevSecret;
    if (prevClientId === undefined) delete process.env.GOOGLE_MAIL_CLIENT_ID;
    else process.env.GOOGLE_MAIL_CLIENT_ID = prevClientId;
    if (prevClientSecret === undefined) delete process.env.GOOGLE_MAIL_CLIENT_SECRET;
    else process.env.GOOGLE_MAIL_CLIENT_SECRET = prevClientSecret;
    if (prevAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevAppUrl;
    if (prevApiPublic === undefined) delete process.env.API_PUBLIC_URL;
    else process.env.API_PUBLIC_URL = prevApiPublic;
  });

  it('exports the IMAP/SMTP mail scope', () => {
    expect(GOOGLE_MAIL_SCOPE).toBe('https://mail.google.com/');
  });

  it('reports OAuth as unconfigured without env', () => {
    expect(isGoogleMailOAuthConfigured()).toBe(false);
  });

  it('reports OAuth as configured when both env vars are set', () => {
    process.env.GOOGLE_MAIL_CLIENT_ID = 'client.apps.googleusercontent.com';
    process.env.GOOGLE_MAIL_CLIENT_SECRET = 'secret';
    expect(isGoogleMailOAuthConfigured()).toBe(true);
  });

  it('round-trips a signed OAuth state', () => {
    const state = signOAuthState('user-1');
    expect(verifyOAuthState(state)).toEqual({ userId: 'user-1' });
  });

  it('rejects a tampered OAuth state', () => {
    const state = signOAuthState('user-1');
    const [body] = state.split('.');
    expect(() => verifyOAuthState(`${body}.deadbeef`)).toThrow();
  });

  it('returns Gmail transport defaults', () => {
    expect(gmailTransportDefaults()).toEqual({
      imap: { host: 'imap.gmail.com', port: 993, secure: true },
      smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
    });
  });

  it('builds the OAuth callback from APP_URL (Vite / nginx same-origin /api proxy)', () => {
    process.env.APP_URL = 'http://localhost:5173';
    expect(googleMailOAuthRedirectUri()).toBe(
      'http://localhost:5173/api/mail/mailbox/oauth/google/callback',
    );
  });

  it('honours API_PUBLIC_URL for the OAuth callback', () => {
    process.env.APP_URL = 'http://localhost:5173';
    process.env.API_PUBLIC_URL = 'https://tunnel.example.com';
    expect(googleMailOAuthRedirectUri()).toBe(
      'https://tunnel.example.com/api/mail/mailbox/oauth/google/callback',
    );
  });
});

describe('smtpTransportOptions OAuth2', () => {
  it('builds nodemailer OAuth2 auth', () => {
    const opts = smtpTransportOptions({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      user: 'crm@example.com',
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'rt',
      accessToken: 'at',
    });
    expect(opts.auth).toMatchObject({
      type: 'OAuth2',
      user: 'crm@example.com',
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'rt',
      accessToken: 'at',
    });
    expect(opts.secure).toBe(false);
  });

  it('still builds password auth', () => {
    const opts = smtpTransportOptions({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'u',
      password: 'p',
    });
    expect(opts.auth).toEqual({ user: 'u', pass: 'p' });
  });
});
