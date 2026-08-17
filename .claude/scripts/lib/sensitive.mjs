// sensitive.mjs — the single source of truth for "this path means tier L".
//
// Two consumers must agree or the tiering is theatre: /intake proposes a tier
// from a code map before any code exists, and tier-guard.mjs enforces it against
// the real diff later. When they read different lists, intake happily labels an
// auth change tier S and the guard only objects once the work is already done.
//
// KNOWN STALE: `.gitlab-ci.yml` no longer exists (CI moved to .github/workflows/
// in commit e92212e) and `.github/workflows/**` is missing from the list, so a CI
// change currently escapes tier L. That is deliberately NOT fixed here — it is
// tracked as KBY-102 and is the first issue driven through /task end to end.
// Do not "tidy" it in passing: fix it there, with the acceptance criteria that
// issue already carries.

export const SENSITIVE = [
  /^apps\/api\/src\/core\/auth\//,
  /^apps\/api\/src\/core\/database\/schema\.ts$/,
  /^apps\/api\/src\/modules\/roles\//,
  /public-forms/,
  /^packages\/forms-client\//,
  /^packages\/payload-forms\//,
  /^docker\//,
  /^\.gitlab-ci\.yml$/,
];

/** Source files whose count decides whether a change is still "an obvious S fix". */
export const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|vue)$/i;

/** Paths that carry no runtime risk, so they never force a tier up. */
export const EXEMPT = /^(docs\/|\.claude\/)/;

/** Repo-relative paths (forward slashes) that land in a sensitive area. */
export function sensitiveHits(paths) {
  return paths.filter((p) => SENSITIVE.some((re) => re.test(p.replace(/\\/g, '/'))));
}
