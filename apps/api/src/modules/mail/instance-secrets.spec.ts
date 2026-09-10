import {
  decrypt,
  encrypt,
  instanceSecretsKeyCandidates,
  isInstanceSecretsKeyConfigured,
} from '../../../../../packages/plugin-host/src/instance-secrets';

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

describe('instance secrets key (ADR-0046)', () => {
  const KHIRBY = 'a'.repeat(64);
  const MAIL = 'b'.repeat(64);

  afterEach(() => {
    clearSecretsEnv();
  });

  it('prefers KHIRBY_SECRETS_KEY over a different legacy alias for encrypt', () => {
    process.env.MAIL_SECRETS_KEY = MAIL;
    process.env.KHIRBY_SECRETS_KEY = KHIRBY;
    const keys = instanceSecretsKeyCandidates();
    expect(keys[0].toString('hex')).toBe(KHIRBY);
    expect(decrypt(encrypt('plain'))).toBe('plain');
  });

  it('accepts MAIL_SECRETS_KEY as the only configured key', () => {
    process.env.MAIL_SECRETS_KEY = MAIL;
    expect(isInstanceSecretsKeyConfigured()).toBe(true);
    expect(decrypt(encrypt('mail-only'))).toBe('mail-only');
  });

  it('rejects an invalid KHIRBY_SECRETS_KEY even if a legacy alias is valid', () => {
    process.env.KHIRBY_SECRETS_KEY = 'tooshort';
    process.env.MAIL_SECRETS_KEY = MAIL;
    expect(() => encrypt('x')).toThrow('KHIRBY_SECRETS_KEY');
  });
});
