import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import {
  assertSafePackageInstallInput,
  assertWebBundlePresent,
  directoryFromPackage,
  hydrateWebBundleFromSiblingCheckout,
  PluginPackageInstaller,
} from './plugin-package.installer';

const tarball = jest.fn();
const extract = jest.fn();
const checkData = jest.fn();

jest.mock('pacote', () => ({
  tarball: (...args: unknown[]) => tarball(...args),
  extract: (...args: unknown[]) => extract(...args),
}));

jest.mock('ssri', () => ({
  checkData: (...args: unknown[]) => checkData(...args),
}));

jest.mock('../plugins/instance-plugins.loader', () => {
  const actual = jest.requireActual('../plugins/instance-plugins.loader');
  return {
    ...actual,
    defaultInstancePluginsDir: jest.fn(),
  };
});

import { defaultInstancePluginsDir } from '../plugins/instance-plugins.loader';

describe('directoryFromPackage', () => {
  it('keeps scope in the directory segment', () => {
    expect(directoryFromPackage('@khirby/plugin-demo')).toBe('khirby__plugin-demo');
    expect(directoryFromPackage('crm-plugin-hello')).toBe('crm-plugin-hello');
  });
});

describe('assertSafePackageInstallInput', () => {
  it('rejects git/url package names and non-semver versions', () => {
    expect(() =>
      assertSafePackageInstallInput({
        packageName: 'git+https://github.com/x/y.git',
        version: '1.0.0',
        checksum: 'sha512-abcd',
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      assertSafePackageInstallInput({
        packageName: '@khirby/plugin-demo',
        version: 'latest',
        checksum: 'sha512-abcd',
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      assertSafePackageInstallInput({
        packageName: '@khirby/plugin-demo',
        version: '1.0.0',
        checksum: 'not-ssri',
      }),
    ).toThrow(BadRequestException);
  });
});

describe('assertWebBundlePresent', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'web-bundle-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('allows packages without exports["./web"]', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', main: 'index.js' }));
    expect(() => assertWebBundlePresent(dir)).not.toThrow();
  });

  it('rejects ./web without dist/web assets', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'x', exports: { './web': './src/web.ts' } }),
    );
    expect(() => assertWebBundlePresent(dir)).toThrow(BadRequestException);
    try {
      assertWebBundlePresent(dir);
    } catch (err) {
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({
          params: expect.objectContaining({ code: 'web_bundle_required' }),
        }),
      );
    }
  });

  it('accepts dist/web/entry.js', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'x', exports: { './web': './src/web.ts' } }),
    );
    mkdirSync(join(dir, 'dist', 'web'), { recursive: true });
    writeFileSync(join(dir, 'dist', 'web', 'entry.js'), 'export default {}');
    expect(() => assertWebBundlePresent(dir)).not.toThrow();
  });

  it('rejects arbitrary dist/web/*.js when entry.js is absent', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'x', exports: { './web': './src/web.ts' } }),
    );
    mkdirSync(join(dir, 'dist', 'web'), { recursive: true });
    writeFileSync(join(dir, 'dist', 'web', 'chunk.js'), 'export default {}');
    expect(() => assertWebBundlePresent(dir)).toThrow(BadRequestException);
  });
});

describe('hydrateWebBundleFromSiblingCheckout', () => {
  let volume: string;

  beforeEach(() => {
    volume = mkdtempSync(join(tmpdir(), 'hydrate-vol-'));
  });

  afterEach(() => {
    rmSync(volume, { recursive: true, force: true });
  });

  it('copies dist/web from a sibling checkout with the same package name', () => {
    const checkout = join(volume, 'crm-plugin-listmonk');
    mkdirSync(join(checkout, 'dist', 'web'), { recursive: true });
    writeFileSync(
      join(checkout, 'package.json'),
      JSON.stringify({
        name: '@khirby/plugin-listmonk',
        exports: { './web': './dist/web/entry.js' },
      }),
    );
    writeFileSync(join(checkout, 'dist', 'web', 'entry.js'), 'export default {}');

    const extracted = join(volume, 'khirby__plugin-listmonk');
    mkdirSync(extracted, { recursive: true });
    writeFileSync(
      join(extracted, 'package.json'),
      JSON.stringify({
        name: '@khirby/plugin-listmonk',
        exports: { './web': './src/web/index.ts' },
      }),
    );

    expect(hydrateWebBundleFromSiblingCheckout(extracted, '@khirby/plugin-listmonk', volume)).toBe(
      true,
    );
    expect(existsSync(join(extracted, 'dist', 'web', 'entry.js'))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(extracted, 'package.json'), 'utf8')) as {
      exports: { './web': string };
    };
    expect(pkg.exports['./web']).toBe('./dist/web/entry.js');
    expect(() => assertWebBundlePresent(extracted)).not.toThrow();
  });

  it('returns false when no sibling has a built bundle', () => {
    const extracted = join(volume, 'khirby__plugin-listmonk');
    mkdirSync(extracted, { recursive: true });
    writeFileSync(
      join(extracted, 'package.json'),
      JSON.stringify({
        name: '@khirby/plugin-listmonk',
        exports: { './web': './src/web/index.ts' },
      }),
    );
    expect(hydrateWebBundleFromSiblingCheckout(extracted, '@khirby/plugin-listmonk', volume)).toBe(
      false,
    );
  });
});

describe('PluginPackageInstaller.extract', () => {
  let volume: string;

  beforeEach(() => {
    volume = mkdtempSync(join(tmpdir(), 'plugin-vol-'));
    (defaultInstancePluginsDir as jest.Mock).mockReturnValue(volume);
    tarball.mockResolvedValue(Buffer.from('tarball'));
    checkData.mockReturnValue(true);
    extract.mockImplementation(async (_spec: string, dest: string) => {
      writeFileSync(
        join(dest, 'package.json'),
        JSON.stringify({ name: '@khirby/plugin-demo', version: '1.0.0' }),
      );
      writeFileSync(join(dest, 'index.js'), 'module.exports = {}');
    });
  });

  afterEach(() => {
    rmSync(volume, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it('fetches, verifies integrity, and unpacks into plugins/<scope__name>', async () => {
    const installer = new PluginPackageInstaller();
    const result = await installer.extract({
      packageName: '@khirby/plugin-demo',
      version: '1.0.0',
      checksum: 'sha512-deadbeef',
    });

    expect(tarball).toHaveBeenCalledWith('@khirby/plugin-demo@1.0.0');
    expect(checkData).toHaveBeenCalledWith(Buffer.from('tarball'), 'sha512-deadbeef');
    expect(extract).toHaveBeenCalledWith('@khirby/plugin-demo@1.0.0', expect.any(String), {
      integrity: 'sha512-deadbeef',
    });
    expect(result.directory).toBe('khirby__plugin-demo');
    expect(result.packageName).toBe('@khirby/plugin-demo');
    expect(existsSync(join(volume, 'khirby__plugin-demo', 'package.json'))).toBe(true);
  });

  it('rejects on integrity mismatch when checkData returns false', async () => {
    checkData.mockReturnValue(false);
    const installer = new PluginPackageInstaller();
    await expect(
      installer.extract({
        packageName: '@khirby/plugin-demo',
        version: '1.0.0',
        checksum: 'sha512-bad',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('leaves the live package in place when the staged tarball is missing dist/web/entry.js', async () => {
    const target = join(volume, 'khirby__plugin-demo');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: '@khirby/plugin-demo' }));
    writeFileSync(join(target, 'KEEP.txt'), 'old');

    extract.mockImplementation(async (_spec: string, dest: string) => {
      writeFileSync(
        join(dest, 'package.json'),
        JSON.stringify({
          name: '@khirby/plugin-demo',
          version: '2.0.0',
          exports: { './web': './dist/web/entry.js' },
        }),
      );
    });

    const installer = new PluginPackageInstaller();
    await expect(
      installer.extract({
        packageName: '@khirby/plugin-demo',
        version: '2.0.0',
        checksum: 'sha512-deadbeef',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(existsSync(join(target, 'KEEP.txt'))).toBe(true);
    expect(JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')).name).toBe(
      '@khirby/plugin-demo',
    );
  });
});
