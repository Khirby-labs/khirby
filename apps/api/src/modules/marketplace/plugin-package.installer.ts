import { Injectable, Logger, HttpException } from '@nestjs/common';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { AppException } from '../../core/errors/app-exception';
import {
  defaultInstancePluginsDir,
  hasWebEntryBundle,
  isSafeLocalSegment,
  packageDeclaresWeb,
  pluginVolumeRoot,
} from '../plugins/instance-plugins.loader';

export type PackageInstallInput = {
  packageName: string;
  version: string;
  /** ssri integrity string from the Control Plane (e.g. sha512-...). */
  checksum: string;
};

export type PackageInstallResult = {
  /** Relative segment under `plugins/` (e.g. `crm-plugin-webhook`). */
  directory: string;
  absDir: string;
  packageName: string;
};

/** npm package name (optional @scope/) — rejects URLs and path segments. */
const NPM_PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]{0,213}\/)?[a-z0-9][a-z0-9._-]{0,213}$/;

/** ssri integrity prefix + base64/url-safe payload (e.g. sha512-…). */
const SSRI_CHECKSUM_RE = /^(sha1|sha256|sha384|sha512|sha3-\d+|blake2b\d+|md5)-[A-Za-z0-9+/_=-]+$/;

/** Lazy requires keep Jest from parsing pacote's ESM dependency graph at import time. */
function loadPacote(): typeof import('pacote') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('pacote');
}

function loadSsri(): typeof import('ssri') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('ssri');
}

function loadSemver(): typeof import('semver') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('semver');
}

export function assertSafePackageInstallInput(input: PackageInstallInput): {
  packageName: string;
  version: string;
  checksum: string;
} {
  const packageName = input.packageName.trim();
  const version = input.version.trim();
  const checksum = input.checksum.trim();

  if (!packageName || !version || !checksum) {
    throw AppException.badRequest('packageName, version, and checksum are required');
  }
  if (
    !NPM_PACKAGE_NAME_RE.test(packageName) ||
    packageName.includes('://') ||
    packageName.includes('git+')
  ) {
    throw AppException.badRequest('Invalid npm package name', { code: 'invalid_package_name' });
  }
  const semver = loadSemver();
  if (!semver.valid(version)) {
    throw AppException.badRequest('Invalid package version (semver required)', {
      code: 'invalid_package_version',
    });
  }
  if (!SSRI_CHECKSUM_RE.test(checksum)) {
    throw AppException.badRequest('Invalid package checksum (ssri integrity required)', {
      code: 'invalid_checksum',
    });
  }

  return { packageName, version, checksum };
}

/**
 * Fetch a published npm package, verify its integrity, and unpack into `plugins/`.
 * Marketplace installs may land on former first-party dir names
 * (`allowReservedScaffoldDirs`).
 */
@Injectable()
export class PluginPackageInstaller {
  private readonly logger = new Logger(PluginPackageInstaller.name);

  async extract(input: PackageInstallInput): Promise<PackageInstallResult> {
    const { packageName, version, checksum } = assertSafePackageInstallInput(input);

    const pacote = loadPacote();
    const ssri = loadSsri();
    const spec = `${packageName}@${version}`;
    const volumeDir = defaultInstancePluginsDir();
    mkdirSync(volumeDir, { recursive: true });

    // Stage under the volume so rename stays on the same filesystem.
    const staging = mkdtempSync(join(volumeDir, '.pkg-'));
    let moved = false;
    try {
      const tarball = await pacote.tarball(spec);
      if (!ssri.checkData(tarball, checksum)) {
        throw AppException.badRequest('Package integrity check failed', {
          code: 'integrity_mismatch',
        });
      }

      await pacote.extract(spec, staging, { integrity: checksum });

      const pkg = readPackageJson(staging);
      const incomingName = typeof pkg.name === 'string' ? pkg.name : packageName;
      const dirName = directoryFromPackage(incomingName);
      if (!isSafeLocalSegment(dirName)) {
        throw AppException.badRequest(`Unsafe plugin directory name: ${dirName}`);
      }

      const absDir = pluginVolumeRoot(volumeDir, dirName, { allowReservedScaffoldDirs: true });
      if (existsSync(absDir)) {
        const existing = readPackageJson(absDir);
        const existingName = typeof existing.name === 'string' ? existing.name : null;
        if (existingName && existingName !== incomingName) {
          throw AppException.badRequest(
            `Refusing to overwrite plugins/${dirName}: different package ${existingName}`,
            { code: 'package_dir_conflict' },
          );
        }
      }

      if (hydrateWebBundleFromSiblingCheckout(staging, incomingName, volumeDir)) {
        this.logger.log(
          `Hydrated dist/web for ${incomingName} from a local plugins/ checkout (npm tarball had none)`,
        );
      }
      assertWebBundlePresent(staging);

      let backup: string | null = null;
      if (existsSync(absDir)) {
        backup = join(volumeDir, `.prev-${dirName}-${process.pid}-${Date.now()}`);
        renameSync(absDir, backup);
      }
      try {
        renameSync(staging, absDir);
        moved = true;
      } catch (swapErr) {
        if (backup && existsSync(backup) && !existsSync(absDir)) {
          renameSync(backup, absDir);
          backup = null;
        }
        throw swapErr;
      }
      if (backup && existsSync(backup)) {
        rmSync(backup, { recursive: true, force: true });
      }

      this.logger.log(`Extracted ${spec} → plugins/${dirName}`);
      return {
        directory: dirName,
        absDir,
        packageName: incomingName,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(
        `Failed to fetch ${spec}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw AppException.upstreamFailed('npm');
    } finally {
      if (!moved && existsSync(staging)) {
        rmSync(staging, { recursive: true, force: true });
      }
    }
  }
}

function readPackageJson(dir: string): Record<string, unknown> {
  const path = join(dir, 'package.json');
  if (!existsSync(path)) {
    throw AppException.badRequest('Extracted package has no package.json');
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

/**
 * Safe single-segment directory from a full package name.
 * `@scope/pkg` → `scope__pkg` (never the bare last segment alone).
 */
export function directoryFromPackage(packageName: string): string {
  const trimmed = packageName.trim();
  if (trimmed.startsWith('@')) {
    const withoutAt = trimmed.slice(1);
    const slash = withoutAt.indexOf('/');
    if (slash <= 0 || slash === withoutAt.length - 1) {
      return withoutAt.replace(/\//g, '__');
    }
    const scope = withoutAt.slice(0, slash);
    const name = withoutAt.slice(slash + 1).replace(/\//g, '-');
    return `${scope}__${name}`;
  }
  return trimmed.replace(/\//g, '-');
}

/**
 * Plugins that declare `exports["./web"]` must ship `dist/web/entry.js` —
 * sources or arbitrary `dist/web/*.js` alone are not enough for the SPA registry.
 */
export function assertWebBundlePresent(absDir: string): void {
  const pkgPath = join(absDir, 'package.json');
  if (!existsSync(pkgPath)) return;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
  if (!packageDeclaresWeb(pkg)) return;

  if (hasWebEntryBundle(absDir)) return;

  // AppException is a 400 — Nest does not log a stack. Callers often miss this
  // in the API log; keep an explicit warn so install failures are visible.
  const logger = new Logger('PluginPackageInstaller');
  logger.warn(
    `web_bundle_required: ${absDir} declares exports["./web"] but dist/web/entry.js is missing (republish the npm package with files including dist/, or build:web in a local checkout)`,
  );

  throw AppException.badRequest('Plugin declares exports["./web"] but dist/web bundle is missing', {
    code: 'web_bundle_required',
  });
}

/**
 * Dev / monorepo: npm may still publish listmonk-style packages with
 * `exports["./web"]` pointing at sources and `files: ["src"]` only. When a
 * sibling under `plugins/` (e.g. `crm-plugin-listmonk`) has the same package
 * name and a built `dist/web/entry.js`, copy that bundle into the extract and
 * rewrite the export so Marketplace install can proceed without a republish.
 *
 * Production empty images have no checkout — this is a no-op and assert still fails.
 */
export function hydrateWebBundleFromSiblingCheckout(
  absDir: string,
  packageName: string,
  volumeDir: string = defaultInstancePluginsDir(),
): boolean {
  if (hasWebEntryBundle(absDir)) return false;
  const pkgPath = join(absDir, 'package.json');
  if (!existsSync(pkgPath)) return false;
  const pkg = readPackageJson(absDir);
  if (!packageDeclaresWeb(pkg)) return false;

  const target = resolve(absDir);
  let donor: string | null = null;
  for (const name of readdirSync(volumeDir)) {
    if (name.startsWith('.')) continue;
    const candidate = join(volumeDir, name);
    if (resolve(candidate) === target) continue;
    if (!statSync(candidate).isDirectory()) continue;
    if (!existsSync(join(candidate, 'package.json'))) continue;
    const other = readPackageJson(candidate);
    if (other.name !== packageName) continue;
    if (!hasWebEntryBundle(candidate)) continue;
    donor = candidate;
    break;
  }
  if (!donor) return false;

  const destWeb = join(absDir, 'dist', 'web');
  mkdirSync(join(absDir, 'dist'), { recursive: true });
  if (existsSync(destWeb)) rmSync(destWeb, { recursive: true, force: true });
  cpSync(join(donor, 'dist', 'web'), destWeb, { recursive: true });

  const exportsField =
    pkg.exports && typeof pkg.exports === 'object' && !Array.isArray(pkg.exports)
      ? { ...(pkg.exports as Record<string, unknown>) }
      : {};
  exportsField['./web'] = './dist/web/entry.js';
  writeFileSync(pkgPath, `${JSON.stringify({ ...pkg, exports: exportsField }, null, 2)}\n`);
  return hasWebEntryBundle(absDir);
}
