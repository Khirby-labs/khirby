import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.MAIL_SECRETS_KEY?.trim();
  if (!raw) {
    throw new Error('MAIL_SECRETS_KEY is not set');
  }
  let buf: Buffer;
  // Support hex (64 chars) or base64 encodings for a 32-byte key
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    buf = Buffer.from(raw, 'hex');
  } else {
    buf = Buffer.from(raw, 'base64');
  }
  if (buf.length !== 32) {
    throw new Error(
      "MAIL_SECRETS_KEY must be 32 bytes as hex (64 chars) or base64 — generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return buf;
}

/** Why the key is unusable, or null if OK. Prefer this over a bare boolean for logs. */
export function mailSecretsKeyProblem(): string | null {
  try {
    getKey();
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

export function isMailSecretsKeyConfigured(): boolean {
  return mailSecretsKeyProblem() === null;
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a base64 string: iv(12) + ciphertext + tag(16)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

/**
 * Decrypts a base64 blob produced by `encrypt`.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const encrypted = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
