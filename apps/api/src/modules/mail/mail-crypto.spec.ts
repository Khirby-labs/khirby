import { encrypt, decrypt, isMailSecretsKeyConfigured } from './mail-crypto';

describe('mail-crypto', () => {
  const VALID_KEY_HEX = 'a'.repeat(64); // 32 bytes as hex

  beforeEach(() => {
    process.env.MAIL_SECRETS_KEY = VALID_KEY_HEX;
  });

  afterEach(() => {
    delete process.env.MAIL_SECRETS_KEY;
  });

  describe('isMailSecretsKeyConfigured', () => {
    it('returns true when key is set and valid', () => {
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
  });

  describe('encrypt / decrypt error cases', () => {
    it('throws when MAIL_SECRETS_KEY is missing during encrypt', () => {
      delete process.env.MAIL_SECRETS_KEY;
      expect(() => encrypt('test')).toThrow('MAIL_SECRETS_KEY');
    });

    it('throws when MAIL_SECRETS_KEY is missing during decrypt', () => {
      const ct = encrypt('test');
      delete process.env.MAIL_SECRETS_KEY;
      expect(() => decrypt(ct)).toThrow('MAIL_SECRETS_KEY');
    });
  });
});
