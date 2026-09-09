import { isNewerThan, normalizeVersion, parseSemver } from './semver';

describe('normalizeVersion', () => {
  it('strips a leading v and build metadata', () => {
    expect(normalizeVersion('v1.2.3+build.9')).toBe('1.2.3');
    expect(normalizeVersion('  V2.0.0  ')).toBe('2.0.0');
  });
});

describe('parseSemver', () => {
  it('parses X.Y.Z and ignores prerelease for the core tuple', () => {
    expect(parseSemver('v1.1.5')).toEqual({ major: 1, minor: 1, patch: 5 });
    expect(parseSemver('1.0.0-rc.1')).toEqual({ major: 1, minor: 0, patch: 0 });
  });

  it('rejects non-semver labels', () => {
    expect(parseSemver('dev')).toBeNull();
    expect(parseSemver('latest')).toBeNull();
    expect(parseSemver('1.2')).toBeNull();
  });
});

describe('isNewerThan', () => {
  it('compares major, then minor, then patch', () => {
    expect(isNewerThan('1.1.5', '1.1.4')).toBe(true);
    expect(isNewerThan('2.0.0', '1.9.9')).toBe(true);
    expect(isNewerThan('1.1.5', '1.1.5')).toBe(false);
    expect(isNewerThan('1.1.4', '1.1.5')).toBe(false);
  });

  it('returns false when either side is not semver', () => {
    expect(isNewerThan('1.1.5', 'dev')).toBe(false);
    expect(isNewerThan('latest', '1.0.0')).toBe(false);
  });
});
