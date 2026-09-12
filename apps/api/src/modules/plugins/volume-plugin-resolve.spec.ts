import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  findApiNodeModules,
  hostJitiAlias,
  hostPackageSrc,
  rewriteVolumePluginSpecifier,
} from './volume-plugin-resolve';

describe('rewriteVolumePluginSpecifier', () => {
  const hostSrc = hostPackageSrc('plugin-host');
  const sdkSrc = hostPackageSrc('plugin-sdk');

  it('maps first-party relative plugin-host imports onto the host package', () => {
    const root = rewriteVolumePluginSpecifier('../../../packages/plugin-host/src');
    expect(root).toBeTruthy();
    expect(root!.startsWith(hostSrc)).toBe(true);
    expect(existsSync(root!)).toBe(true);
  });

  it('maps a subpath used by published plugins (tokens / instance-secrets)', () => {
    const tokens = rewriteVolumePluginSpecifier('../../../packages/plugin-host/src/tokens');
    expect(tokens).toBeTruthy();
    expect(existsSync(tokens!)).toBe(true);

    const secrets = rewriteVolumePluginSpecifier(
      '../../../../packages/plugin-host/src/instance-secrets',
    );
    expect(secrets).toBeTruthy();
    expect(existsSync(secrets!)).toBe(true);
  });

  it('maps bare @khirby/plugin-sdk onto the host package', () => {
    const sdk = rewriteVolumePluginSpecifier('@khirby/plugin-sdk');
    expect(sdk).toBeTruthy();
    expect(sdk!.startsWith(sdkSrc)).toBe(true);
    expect(existsSync(sdk!)).toBe(true);
  });

  it('leaves unrelated specifiers alone', () => {
    expect(rewriteVolumePluginSpecifier('@nestjs/common')).toBeNull();
    expect(rewriteVolumePluginSpecifier('./nest-module')).toBeNull();
    expect(rewriteVolumePluginSpecifier('drizzle-orm')).toBeNull();
  });

  it('hostJitiAlias maps relative plugin-host prefixes onto the host src dir', () => {
    const alias = hostJitiAlias();
    expect(alias['../../../packages/plugin-host/src']).toBe(hostSrc);
    expect(alias['@khirby/plugin-sdk']).toBe(sdkSrc);
  });
});

describe('findApiNodeModules', () => {
  it('finds @nestjs/common from this spec file', () => {
    const nm = findApiNodeModules();
    expect(nm).toBeTruthy();
    expect(existsSync(join(nm!, '@nestjs', 'common'))).toBe(true);
  });
});
