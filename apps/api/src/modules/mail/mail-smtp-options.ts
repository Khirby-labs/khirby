import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export type SmtpPasswordAuth = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

export type SmtpOAuth2Auth = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
};

/**
 * Nodemailer `secure: true` = TLS from the first byte (typical port 465).
 * Port 587 expects plain connect + STARTTLS — `secure: true` there yields
 * OpenSSL "wrong version number".
 */
function resolveImplicitTls(port: number, secure: boolean): boolean {
  if (port === 465) return true;
  if (port === 587 || port === 25 || port === 2525) return false;
  return secure;
}

function baseTransport(cfg: { host: string; port: number; secure: boolean }): {
  host: string;
  port: number;
  secure: boolean;
  requireTLS?: boolean;
} {
  const port = cfg.port;
  const implicitTls = resolveImplicitTls(port, cfg.secure);
  return {
    host: cfg.host,
    port,
    secure: implicitTls,
    ...(implicitTls
      ? {}
      : {
          requireTLS: port === 587 || port === 2525,
        }),
  };
}

export function smtpTransportOptions(
  cfg: SmtpPasswordAuth | SmtpOAuth2Auth,
): SMTPTransport.Options {
  const base = baseTransport(cfg);

  if ('password' in cfg) {
    return {
      ...base,
      auth: { user: cfg.user, pass: cfg.password },
    };
  }

  return {
    ...base,
    auth: {
      type: 'OAuth2',
      user: cfg.user,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      refreshToken: cfg.refreshToken,
      ...(cfg.accessToken ? { accessToken: cfg.accessToken } : {}),
    },
  };
}

export function formatSmtpError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/wrong version number/i.test(msg)) {
    return `${msg} — usually port/TLS mismatch: use port 587 without “Use TLS/SSL” (STARTTLS), or port 465 with it on`;
  }
  return msg;
}
