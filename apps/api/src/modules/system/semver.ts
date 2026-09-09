/** Strip a leading `v`/`V` and any build metadata; keep `X.Y.Z[-prerelease]`. */
export function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, '').split('+')[0] ?? '';
}

export type ParsedSemver = { major: number; minor: number; patch: number };

/**
 * Parse `X.Y.Z` (optional prerelease ignored for ordering). Returns null for
 * non-semver labels such as `dev` or `latest`.
 */
export function parseSemver(raw: string): ParsedSemver | null {
  const core = normalizeVersion(raw).split('-')[0] ?? '';
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(core);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** True when `latest` is a higher X.Y.Z than `current`. Non-semver → false. */
export function isNewerThan(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) return false;
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch > b.patch;
}
