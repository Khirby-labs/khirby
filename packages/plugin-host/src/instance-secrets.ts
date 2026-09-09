import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export const INSTANCE_SECRETS_KEY_ENV = 'KHIRBY_SECRETS_KEY';

/** Accepted until operators migrate. Prefer KHIRBY_SECRETS_KEY (ADR-0046). */
export const LEGACY_SECRETS_KEY_ENVS = [
  'MAIL_SECRETS_KEY',
  'AI_COMPOSE_SECRETS_KEY',
  'POKELO_SECRETS_KEY',
] as const;

const KEY_FORMAT_HINT =
  "must be 32 bytes as hex (64 chars) or base64 — generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"";

function rawFromEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw || undefined;
}

function parseKeyBytes(raw: string): Buffer | null {
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return buf.length === KEY_BYTES ? buf : null;
}

/**
 * Unique 32-byte keys in preference order: KHIRBY_SECRETS_KEY, then legacy aliases.
 * An invalid KHIRBY_SECRETS_KEY is a hard error (do not silently fall through).
 */
export function instanceSecretsKeyCandidates(env: NodeJS.ProcessEnv = process.env): Buffer[] {
  const out: Buffer[] = [];
  const seen = new Set<string>();

  const primary = rawFromEnv(env, INSTANCE_SECRETS_KEY_ENV);
  if (primary) {
    const buf = parseKeyBytes(primary);
    if (!buf) {
      throw new Error(`${INSTANCE_SECRETS_KEY_ENV} ${KEY_FORMAT_HINT}`);
    }
    out.push(buf);
    seen.add(buf.toString('hex'));
  }

  for (const name of LEGACY_SECRETS_KEY_ENVS) {
    const raw = rawFromEnv(env, name);
    if (!raw) continue;
    const buf = parseKeyBytes(raw);
    if (!buf) continue;
    const id = buf.toString('hex');
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(buf);
  }

  return out;
}

export function getInstanceSecretsKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const keys = instanceSecretsKeyCandidates(env);
  if (!keys.length) {
    throw new Error(`${INSTANCE_SECRETS_KEY_ENV} is not set`);
  }
  return keys[0];
}

/** Why the key is unusable, or null if OK. Prefer this over a bare boolean for logs. */
export function instanceSecretsKeyProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    getInstanceSecretsKey(env);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

export function isInstanceSecretsKeyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return instanceSecretsKeyProblem(env) === null;
}

/**
 * Encrypts plaintext using AES-256-GCM with the instance key.
 * Returns a base64 string: iv(12) + ciphertext + tag(16)
 */
export function encrypt(plaintext: string): string {
  const key = getInstanceSecretsKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

function decryptWith(key: Buffer, ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const encrypted = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

/**
 * Decrypts a base64 blob produced by `encrypt`. Tries each configured key so a
 * leftover plugin-specific env can still open rows written before KHIRBY_SECRETS_KEY.
 */
export function decrypt(ciphertext: string): string {
  const keys = instanceSecretsKeyCandidates();
  if (!keys.length) {
    throw new Error(`${INSTANCE_SECRETS_KEY_ENV} is not set`);
  }
  let last: Error | undefined;
  for (const key of keys) {
    try {
      return decryptWith(key, ciphertext);
    } catch (err) {
      last = err as Error;
    }
  }
  throw last ?? new Error(`${INSTANCE_SECRETS_KEY_ENV} is not set`);
}
