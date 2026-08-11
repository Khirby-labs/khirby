import { parseCorsOrigin, resolveSessionSecret } from './bootstrap-env';

describe('resolveSessionSecret', () => {
  const prev = process.env.SESSION_SECRET;

  afterEach(() => {
    if (prev === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prev;
  });

  it('uses dev fallback when unset in non-production', () => {
    delete process.env.SESSION_SECRET;
    expect(resolveSessionSecret(true)).toBe('dev-secret-change-in-prod');
  });

  it('rejects a short secret even in dev', () => {
    process.env.SESSION_SECRET = 'too-short';
    expect(() => resolveSessionSecret(true)).toThrow(/at least 32/);
  });

  it('requires a strong secret in production', () => {
    delete process.env.SESSION_SECRET;
    expect(() => resolveSessionSecret(false)).toThrow(/required in production/);
  });

  it('accepts a long secret', () => {
    process.env.SESSION_SECRET = 'x'.repeat(32);
    expect(resolveSessionSecret(false)).toBe('x'.repeat(32));
  });
});

describe('parseCorsOrigin', () => {
  it('defaults to Vite origin in dev when unset', () => {
    expect(parseCorsOrigin(undefined, true)).toBe('http://localhost:5173');
  });

  it('rejects missing allowlist in production', () => {
    expect(() => parseCorsOrigin(undefined, false)).toThrow(/CORS_ORIGIN/);
    expect(() => parseCorsOrigin('*', false)).toThrow(/CORS_ORIGIN/);
    expect(() => parseCorsOrigin('', false)).toThrow(/CORS_ORIGIN/);
  });

  it('parses a single origin and a list', () => {
    expect(parseCorsOrigin('https://crm.example.com', false)).toBe('https://crm.example.com');
    expect(parseCorsOrigin('https://a.com, https://b.com', false)).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
});
