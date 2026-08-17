export const meta = {
  name: 'review-panel',
  description: 'Blind 3-perspective review of a diff; every finding adversarially verified before it counts',
  whenToUse: 'Stage 5 of /task for L tasks, or standalone via /review on any diff',
  phases: [
    { title: 'Review', detail: 'correctness / security / architecture — blind, in parallel' },
    { title: 'Verify', detail: 'independent refutation attempt per finding' },
  ],
}

// args: { base?: string, tier?: 'S'|'M'|'L', planFile?: string|null }
const base = (args && args.base) || 'main'
const tier = (args && args.tier) || 'M'
const planFile = (args && args.planFile) || null

const planNote = planFile
  ? `The task plan (acceptance criteria, edge cases) is at ${planFile} — read it first.`
  : 'No plan file given — judge the diff on its own merits and repo conventions.'

const COMMON = `You are one member of a blind review panel for Khirby CRM (NestJS + Vue 3 + Drizzle pnpm monorepo, repo root = cwd).
Review ONLY the changes: run \`git diff ${base}...HEAD\` plus \`git diff ${base}\` if the working tree is dirty, and \`git log ${base}..HEAD --oneline\` for intent. ${planNote}
Ground rules: read AGENTS.md and the relevant .claude/rules/* for conventions; check docs/adr/README.md before calling a design choice a flaw — deliberate decisions (ADRs) are NOT findings. You cannot see the other reviewers. Only report findings you can pin to file:line. Skip style nits that prettier/eslint already enforce. An empty findings list is a perfectly good answer.`

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'severity', 'desc'],
        properties: {
          file: { type: 'string', description: 'repo-relative path' },
          line: { type: 'number' },
          severity: { enum: ['high', 'med', 'low'] },
          desc: { type: 'string', description: 'one-line defect statement, concrete' },
          repro_hint: { type: 'string', description: 'how a verifier could confirm this (command, scenario)' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['confirmed', 'evidence'],
  properties: {
    confirmed: { type: 'boolean' },
    evidence: { type: 'string', description: 'repro output / code citation, or the reason the finding is refuted' },
  },
}

const PERSPECTIVES = [
  {
    key: 'correctness',
    model: 'sonnet',
    prompt: `${COMMON}
Your lens: CORRECTNESS. Hunt real defects only: logic errors, unhandled edge cases (empty states, failure mid-flow, concurrent updates), error paths that swallow or mislabel failures, off-by-one/boundary bugs, tests that assert the wrong behavior or cannot fail.`,
  },
  {
    key: 'security',
    model: tier === 'L' ? 'opus' : 'sonnet',
    prompt: `${COMMON}
Your lens: SECURITY. This repo uses Redis session cookies (NO JWT) and RBAC. Check: every new endpoint has SessionGuard + PermissionGuard + @RequirePermission; public surface (public/forms controllers, forms-client SDK) treats all input as hostile; no secrets in code, logs, or error messages; no raw SQL fragments assembled from input; session handling stays httpOnly/sameSite-strict.`,
  },
  {
    key: 'architecture',
    model: 'sonnet',
    prompt: `${COMMON}
Your lens: ARCHITECTURE & CONVENTIONS. Check against AGENTS.md and docs/adr/: schema changes outside apps/api/src/core/database/schema.ts; modules wired off-pattern (service/controller/module + DB_TOKEN DI); frontend calls missing the /api prefix or adding auth headers; duplication of an existing helper instead of reuse; anything that quietly "fixes" a deliberate ADR decision.`,
  },
]

phase('Review')
log(`Reviewing diff vs ${base} (tier ${tier}) — 3 blind perspectives`)
const reviews = await parallel(
  PERSPECTIVES.map((p) => () =>
    agent(p.prompt, { label: `review:${p.key}`, phase: 'Review', schema: FINDINGS_SCHEMA, model: p.model }).then(
      (r) => (r ? r.findings.map((f) => ({ ...f, source: `panel/${p.key}` })) : []),
    ),
  ),
)

// Barrier is deliberate: dedupe across all reviewers before paying for verification.
const all = reviews.filter(Boolean).flat()
const seen = new Set()
const unique = []
for (const f of all) {
  const key = `${f.file}:${f.line}:${(f.desc || '').slice(0, 40).toLowerCase()}`
  if (seen.has(key)) continue
  seen.add(key)
  unique.push(f)
}
log(`${all.length} raw findings → ${unique.length} unique`)
if (!unique.length) {
  return { confirmed: [], rejected: [], ledgerRows: [], note: 'PANEL CLEAN — no findings from any perspective.' }
}

phase('Verify')
const verified = await parallel(
  unique.map((f, i) => () =>
    agent(
      `Adversarially verify ONE review finding on the Khirby CRM diff (vs ${base}, repo root = cwd). Your default stance: REFUTE it. Confirm only with evidence.
Finding: ${f.file}:${f.line} [${f.severity}] ${f.desc}
Repro hint: ${f.repro_hint || 'none given'}
Method: read the code around ${f.file}:${f.line} and its callers; check docs/adr/ and AGENTS.md — a deliberate, documented choice refutes the finding; if testable, run a targeted check (e.g. \`npx jest <spec> --no-coverage\` from apps/api, or \`node <script>\` for tooling). Uncertain → confirmed=false. Matter of taste → confirmed=false.`,
      { label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'sonnet' },
    ).then((v) => ({
      ...f,
      id: `P${i + 1}`,
      confirmed: v ? v.confirmed : false,
      evidence: v ? v.evidence : 'verifier unavailable — treated as unconfirmed',
    })),
  ),
)

const done = verified.filter(Boolean)
const confirmed = done.filter((f) => f.confirmed)
const rejected = done.filter((f) => !f.confirmed)
log(`${confirmed.length} confirmed, ${rejected.length} refuted`)

return {
  confirmed,
  rejected: rejected.map((f) => ({ id: f.id, file: f.file, line: f.line, desc: f.desc, why: f.evidence })),
  ledgerRows: confirmed.map(
    (f) => `| ${f.id} | ${f.source} | ${f.severity} | ${f.desc} (${f.file}:${f.line}) | CONFIRMED | ${(f.evidence || '').replace(/\|/g, '/').slice(0, 120)} |`,
  ),
}
