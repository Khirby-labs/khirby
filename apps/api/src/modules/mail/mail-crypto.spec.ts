import { encrypt, decrypt, isMailSecretsKeyConfigured } from './mail-crypto';

const SECRET_ENVS = [
  'KHIRBY_SECRETS_KEY',
  'MAIL_SECRETS_KEY',
  'AI_COMPOSE_SECRETS_KEY',
  'POKELO_SECRETS_KEY',
] as const;

function clearSecretsEnv() {
  for (const name of SECRET_ENVS) {
    delete process.env[name];
  }
}

describe('mail-crypto', () => {
  const VALID_KEY_HEX = 'a'.repeat(64); // 32 bytes as hex

  beforeEach(() => {
    clearSecretsEnv();
    process.env.MAIL_SECRETS_KEY = VALID_KEY_HEX;
  });

  afterEach(() => {
    clearSecretsEnv();
  });

  describe('isMailSecretsKeyConfigured', () => {
    it('returns true when a legacy alias is set and valid', () => {
      expect(isMailSecretsKeyConfigured()).toBe(true);
    });

    it('returns true when KHIRBY_SECRETS_KEY is set', () => {
      delete process.env.MAIL_SECRETS_KEY;
      process.env.KHIRBY_SECRETS_KEY = VALID_KEY_HEX;
      expect(isMailSecretsKeyConfigured()).toBe(true);
    });

    it('returns false when key is missing', () => {
      delete process.env.MAIL_SECRETS_KEY;
      expect(isMailSecretsKeyConfigured()).toBe(false);
    });

    it('returns false when key decodes to wrong length', () => {
      process.env.MAIL_SECRETS_KEY = 'tooshort';
      expect(isMailSecretsKeyConfigured()).toBe(false);
    });
  });

  describe('encrypt / decrypt', () => {
    it('round-trips a plaintext string', () => {
      const plaintext = 'supersecretpassword!@#';
      const ciphertext = encrypt(plaintext);
      expect(ciphertext).not.toContain(plaintext);
      expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it('produces different ciphertext each call (random IV)', () => {
      const plaintext = 'same-password';
      const c1 = encrypt(plaintext);
      const c2 = encrypt(plaintext);
      expect(c1).not.toBe(c2);
    });

    it('handles empty string', () => {
      expect(decrypt(encrypt(''))).toBe('');
    });

    it('handles special characters and unicode', () => {
      const plaintext = 'пароль ñoño 🔑 <>"\'';
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    });

    it('decrypts a blob written under a legacy key after KHIRBY_SECRETS_KEY is added', () => {
      const ciphertext = encrypt('legacy-row');
      process.env.KHIRBY_SECRETS_KEY = 'b'.repeat(64);
      expect(decrypt(ciphertext)).toBe('legacy-row');
    });
  });

  describe('encrypt / decrypt error cases', () => {
    it('throws when KHIRBY_SECRETS_KEY is missing during encrypt', () => {
      delete process.env.MAIL_SECRETS_KEY;
      expect(() => encrypt('test')).toThrow('KHIRBY_SECRETS_KEY');
    });

    it('throws when KHIRBY_SECRETS_KEY is missing during decrypt', () => {
      const ct = encrypt('test');
      clearSecretsEnv();
      expect(() => decrypt(ct)).toThrow('KHIRBY_SECRETS_KEY');
    });
  });
});
