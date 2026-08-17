// linear.mjs — the repo's only write path to Linear.
//
// Why a script and not the Linear MCP server: MCP needs an interactive OAuth
// flow (so it is dead in hooks, fan-out worktrees and CI) and its tool names are
// undocumented — `linear.app/developers/mcp` is 404 and `tools/list` needs auth.
// A personal API key + GraphQL is deterministic and works headless.
//
// The key is read from the environment or `.env` by THIS script — the agent never
// sees it (`Read(.env*)` stays denied in settings.json). Nothing here ever logs it.
//
// Scope: writes are pinned to ONE team, declared in `.claude/linear.json`
// (committed, not a secret). A key whose team access is wider is still blocked
// from writing elsewhere by the pin check in `resolveTeam()`.
//
// Usage:
//   linear.mjs meta [--refresh]                      resolve+cache team, states, labels
//   linear.mjs get --issue KBY-102                    read an issue (+ suggested branch)
//   linear.mjs create --json <file>                   create issue (+ sub-issues)
//   linear.mjs labels [--create]                      list / create the intake label set
//   linear.mjs comment --issue X --body-file <md>     post a report (markdown from a file)
//   linear.mjs status --issue X --state "In Review"   move the issue (state by name)
//   ... any command + --dry-run                       print variables, send nothing
// (prefix each with `node .claude/scripts/`)
//
// Exit 0 = ok · 1 = API/validation failure (message on stderr) · 2 = usage.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const API = 'https://api.linear.app/graphql';
const CONFIG_FILE = `${root}.claude/linear.json`;
const CACHE_FILE = `${root}.claude/.linear-meta.json`;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);
const dryRun = has('dry-run');

const fail = (msg) => {
  console.error(`[linear] ${msg}`);
  process.exit(1);
};
// Kept in sync with the header block, and printed on any usage error so the
// command list is one keystroke away instead of one file-read away.
const USAGE = `commands (prefix with \`node .claude/scripts/\`):
  linear.mjs meta [--refresh]                      resolve+cache team, states, labels
  linear.mjs get --issue KBY-102 [--body-file f]   read an issue (+ suggested branch)
  linear.mjs create --json <file>                  create issue (+ sub-issues)
  linear.mjs labels [--create]                     list / create the intake label set
  linear.mjs comment --issue X --body-file <md>    post a report (markdown from a file)
  linear.mjs status --issue X --state "In Review"  move the issue (state by name)
  linear.mjs search --query "<words>"              look for a duplicate before creating
  ... any command + --dry-run                      print variables, send nothing`;
const usage = (msg) => {
  console.error(`[linear] ${msg}\n${USAGE}`);
  process.exit(2);
};

// ── auth ────────────────────────────────────────────────────────────────────
// Personal API keys go in the Authorization header RAW — no `Bearer` prefix
// (that form is for OAuth access tokens). https://linear.app/developers/graphql
function apiKey() {
  if (!process.env.LINEAR_API_KEY) {
    try {
      process.loadEnvFile(`${root}.env`);
    } catch (err) {
      if (!process.env.LINEAR_API_KEY) {
        fail(
          `could not read ${root}.env (${err.code ?? err.message}) and LINEAR_API_KEY is not in the environment`,
        );
      }
    }
  }
  const key = process.env.LINEAR_API_KEY;
  if (!key) {
    fail(
      'LINEAR_API_KEY missing — create a key limited to the CRM team at ' +
        'https://linear.app/settings/account/security (scopes: Read + Write), then put it in .env',
    );
  }
  return key;
}

async function gql(query, variables = {}) {
  if (dryRun) {
    console.log(`[linear] dry-run — variables:\n${JSON.stringify(variables, null, 2)}`);
    return null;
  }
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey() },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    fail(`HTTP ${res.status} — response was not JSON: ${text.slice(0, 300)}`);
  }
  if (res.status === 401 || res.status === 403) {
    fail(
      `HTTP ${res.status} — key rejected. Check the key's scopes (Read + Write) and team access.`,
    );
  }
  if (!res.ok) {
    const limits = [
      'x-ratelimit-requests-remaining',
      'x-ratelimit-complexity-remaining',
      'retry-after',
    ]
      .map((h) => `${h}=${res.headers.get(h) ?? '—'}`)
      .join(' ');
    fail(`HTTP ${res.status} — ${json?.errors?.[0]?.message ?? text.slice(0, 300)}\n  ${limits}`);
  }
  if (json.errors?.length) fail(`GraphQL: ${json.errors.map((e) => e.message).join(' · ')}`);
  return json.data;
}

// ── config + cache ──────────────────────────────────────────────────────────
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const pinnedTeamKey = () => (existsSync(CONFIG_FILE) ? readJson(CONFIG_FILE).teamKey : undefined);

async function fetchMeta(teamKey) {
  const data = await gql(
    `query Meta($key: String!) {
       viewer { id name }
       teams(first: 50) { nodes { id key name } }
       workflowStates(filter: { team: { key: { eq: $key } } }, first: 100) {
         nodes { id name type position }
       }
       issueLabels(
         filter: { or: [{ team: { key: { eq: $key } } }, { team: { null: true } }] }
         first: 200
       ) {
         nodes { id name isGroup team { key } }
       }
     }`,
    { key: teamKey ?? '' },
  );
  const team = data.teams.nodes.find((t) => t.key === teamKey);
  return {
    fetchedAt: new Date().toISOString(),
    viewer: data.viewer,
    teams: data.teams.nodes,
    teamKey,
    team,
    states: data.workflowStates.nodes.sort((a, b) => a.position - b.position),
    labels: data.issueLabels.nodes,
  };
}

async function meta({ refresh = false, quiet = false } = {}) {
  const teamKey = pinnedTeamKey();
  if (!refresh && existsSync(CACHE_FILE)) {
    const cached = readJson(CACHE_FILE);
    const fresh = Date.now() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS;
    if (fresh && cached.teamKey === teamKey) return cached;
  }
  const m = await fetchMeta(teamKey);
  if (!dryRun) writeFileSync(CACHE_FILE, `${JSON.stringify(m, null, 2)}\n`);
  if (!quiet) {
    console.log(`[linear] viewer: ${m.viewer.name}`);
    console.log(`[linear] teams visible to this key (${m.teams.length}):`);
    for (const t of m.teams) console.log(`  - ${t.key}  ${t.name}  ${t.id}`);
    if (!teamKey) {
      console.log(
        '[linear] no team pinned yet — put one of the keys above in .claude/linear.json as {"teamKey":"..."}',
      );
    } else if (!m.team) {
      fail(`pinned team "${teamKey}" is not visible to this key`);
    } else {
      console.log(`[linear] pinned team: ${m.team.key} (${m.team.name})`);
      console.log(`[linear] states (${m.states.length}):`);
      for (const s of m.states) console.log(`  - ${s.name} [${s.type}]  ${s.id}`);
      console.log(
        `[linear] labels (${m.labels.length}): ${m.labels.map((l) => l.name).join(', ') || '—'}`,
      );
    }
  }
  return m;
}

// A write must land in the pinned team — never in whatever the key can reach.
async function resolveTeam() {
  const teamKey = pinnedTeamKey();
  if (!teamKey)
    fail(
      `no team pinned — create ${CONFIG_FILE} with {"teamKey":"<KEY>"} (run \`meta\` to list keys)`,
    );
  const m = await meta({ quiet: true });
  if (!m.team) fail(`pinned team "${teamKey}" is not visible to this key — write refused`);
  return m;
}

// ── commands ────────────────────────────────────────────────────────────────
const ISSUE_FIELDS = 'id identifier title url branchName state { name type }';

async function get() {
  const id = flag('issue') ?? usage('get needs --issue <identifier>');
  const data = await gql(
    `query Get($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} description } }`,
    { id },
  );
  if (!data) return;
  // --body-file keeps the description out of the printed JSON so spec-lint can be
  // pointed straight at a real markdown file (no shell-side JSON surgery).
  const out = flag('body-file');
  if (out) {
    writeFileSync(out, data.issue.description ?? '');
    const { description: _description, ...rest } = data.issue;
    console.log(JSON.stringify(rest, null, 2));
    console.log(`[linear] body → ${out}`);
    return;
  }
  console.log(JSON.stringify(data.issue, null, 2));
}

// Intake label set — created at TEAM level (a label with no team is workspace-wide
// and would show up in every other team). Only what the flow needs structurally:
// the bug/feature split and the tier. Area labels are left to the team's own
// taxonomy (KBY already has Backend/Frontend) — do not duplicate them here.
const LABEL_SET = [
  { name: 'bug', color: '#eb5757' },
  { name: 'feature', color: '#5e6ad2' },
  { name: 'tier:S', color: '#4cb782' },
  { name: 'tier:M', color: '#f2c94c' },
  { name: 'tier:L', color: '#eb5757' },
];

async function labels() {
  const m = await resolveTeam();
  // Linear rejects a duplicate name case-insensitively, and workspace-level
  // labels (team = null) already count — the stock set ships Bug/Feature.
  const existing = new Set(m.labels.map((l) => l.name.toLowerCase()));
  const missing = LABEL_SET.filter((l) => !existing.has(l.name.toLowerCase()));
  if (!has('create')) {
    console.log(`[linear] present: ${m.labels.map((l) => l.name).join(', ') || '—'}`);
    console.log(
      `[linear] missing: ${missing.map((l) => l.name).join(', ') || '—'} (re-run with --create)`,
    );
    return;
  }
  for (const l of missing) {
    const data = await gql(
      `mutation Label($input: IssueLabelCreateInput!) {
         issueLabelCreate(input: $input) { success issueLabel { id name } }
       }`,
      { input: { name: l.name, color: l.color, teamId: m.team.id } },
    );
    if (data) console.log(`[linear] + ${data.issueLabelCreate.issueLabel.name}`);
  }
  if (!dryRun) await meta({ refresh: true, quiet: true });
  console.log(`[linear] label set complete (${missing.length} created)`);
}

// Group labels cannot be applied to an issue; names match case-insensitively so a
// payload asking for `bug` resolves the workspace-level `Bug`.
function resolveLabelIds(m, names) {
  if (!names?.length) return undefined;
  const byName = new Map(
    m.labels.filter((l) => !l.isGroup).map((l) => [l.name.toLowerCase(), l.id]),
  );
  const missing = names.filter((n) => !byName.has(n.toLowerCase()));
  if (missing.length)
    fail(`labels not in team ${m.team.key}: ${missing.join(', ')} — run \`labels --create\` first`);
  return names.map((n) => byName.get(n.toLowerCase()));
}

// No state given → the team's first backlog-category state, resolved by CATEGORY
// (state names differ per team, so never hardcode a name).
function resolveStateId(m, name) {
  if (name) {
    const hit = m.states.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!hit)
      fail(`state "${name}" not in team ${m.team.key}: ${m.states.map((s) => s.name).join(', ')}`);
    return hit.id;
  }
  const backlog =
    m.states.find((s) => s.type === 'triage') ?? m.states.find((s) => s.type === 'backlog');
  return backlog?.id;
}

async function create() {
  const file = flag('json') ?? usage('create needs --json <payload-file>');
  if (!existsSync(file)) fail(`payload file not found: ${file}`);
  const payload = readJson(file);
  // The body is markdown, so it is authored as a sibling .md file rather than
  // escaped into JSON: `descriptionFile` is resolved next to the payload.
  const inlineBody = (node) => {
    if (!node.descriptionFile) return;
    const p = resolve(dirname(file), node.descriptionFile);
    if (!existsSync(p)) fail(`descriptionFile not found: ${p}`);
    node.description = readFileSync(p, 'utf8');
  };
  inlineBody(payload);
  for (const s of payload.subIssues ?? []) inlineBody(s);
  if (!payload.title) fail('payload has no title');
  if (!payload.description) fail('payload has no description (the issue body)');

  const m = await resolveTeam();
  const base = {
    teamId: m.team.id,
    title: payload.title,
    description: payload.description,
    labelIds: resolveLabelIds(m, payload.labels),
    stateId: resolveStateId(m, payload.state),
    priority: payload.priority,
  };
  for (const k of Object.keys(base)) if (base[k] === undefined) delete base[k];

  const data = await gql(
    `mutation Create($input: IssueCreateInput!) {
       issueCreate(input: $input) { success issue { ${ISSUE_FIELDS} } }
     }`,
    { input: base },
  );
  if (!data) return;
  if (!data.issueCreate.success) fail('issueCreate returned success=false');
  const parent = data.issueCreate.issue;
  console.log(`[linear] created ${parent.identifier} — ${parent.url}`);
  console.log(`[linear] branch: ${parent.branchName}`);

  const subs = payload.subIssues ?? [];
  if (subs.length) {
    const issues = subs.map((s) => {
      const input = {
        teamId: m.team.id,
        parentId: parent.id,
        title: s.title,
        description: s.description,
        labelIds: resolveLabelIds(m, s.labels),
        stateId: resolveStateId(m, s.state),
        priority: s.priority,
      };
      for (const k of Object.keys(input)) if (input[k] === undefined) delete input[k];
      return input;
    });
    const batch = await gql(
      `mutation Batch($input: IssueBatchCreateInput!) {
         issueBatchCreate(input: $input) { success issues { identifier url branchName } }
       }`,
      { input: { issues } },
    );
    for (const s of batch.issueBatchCreate.issues)
      console.log(`[linear]   ↳ ${s.identifier} — ${s.url}`);
  }
  console.log(`[linear] next: /task ${parent.identifier}`);
}

// Report back from /wrap. The body is a file, not an argv string — a shell-quoted
// multi-line markdown report is where `\n` ends up literal in the comment.
async function comment() {
  const id = flag('issue') ?? usage('comment needs --issue <identifier>');
  const bodyFile = flag('body-file') ?? usage('comment needs --body-file <file.md>');
  if (!existsSync(bodyFile)) fail(`body file not found: ${bodyFile}`);
  const body = readFileSync(bodyFile, 'utf8');
  if (!body.trim()) fail(`body file is empty: ${bodyFile}`);
  const data = await gql(
    `mutation Comment($input: CommentCreateInput!) {
       commentCreate(input: $input) { success comment { id url } }
     }`,
    { input: { issueId: id, body } },
  );
  if (!data) return;
  if (!data.commentCreate.success) fail('commentCreate returned success=false');
  console.log(`[linear] commented on ${id} — ${data.commentCreate.comment.url}`);
}

// State names differ per team, so this resolves by name against the cached list
// and prints what IS available instead of guessing a near-match.
async function status() {
  const id = flag('issue') ?? usage('status needs --issue <identifier>');
  const state = flag('state') ?? usage('status needs --state "<state name>"');
  const m = await resolveTeam();
  const stateId = resolveStateId(m, state);
  const data = await gql(
    `mutation Move($id: String!, $input: IssueUpdateInput!) {
       issueUpdate(id: $id, input: $input) { success issue { identifier state { name } } }
     }`,
    { id, input: { stateId } },
  );
  if (!data) return;
  if (!data.issueUpdate.success) fail('issueUpdate returned success=false');
  console.log(
    `[linear] ${data.issueUpdate.issue.identifier} → ${data.issueUpdate.issue.state.name}`,
  );
}

// Duplicate check for /intake: creating issues automatically means creating
// duplicates automatically unless something looks first. Scoring stays here (not
// in the model) so the same words always give the same verdict.
async function search() {
  const q = flag('query') ?? usage('search needs --query "<words from the title>"');
  const m = await resolveTeam();
  const CAP = 100;
  const data = await gql(
    `query Search($key: String!, $first: Int!) {
       issues(filter: { team: { key: { eq: $key } } }, first: $first, orderBy: updatedAt) {
         nodes { identifier title url state { name type } }
       }
     }`,
    { key: m.team.key, first: CAP },
  );
  if (!data) return;
  const nodes = data.issues.nodes;
  const open = nodes.filter((n) => !['completed', 'canceled'].includes(n.state.type));
  // Paths carry the signal in their parts, so `.github/workflows` has to yield
  // `github` and `workflows` as well as the whole token — otherwise a title full of
  // file names looks unrelated to a query full of words, and a twin gets created.
  const tokens = (s) => {
    const out = new Set();
    for (const whole of s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}/._-]+/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)) {
      if (whole.length >= 4) out.add(whole);
      for (const part of whole.split(/[/._-]+/)) if (part.length >= 4) out.add(part);
    }
    return out;
  };
  const want = tokens(q);
  const scored = open
    .map((n) => {
      const have = tokens(n.title);
      const shared = [...want].filter((t) => have.has(t));
      return { ...n, score: want.size ? shared.length / want.size : 0, shared };
    })
    .filter((n) => n.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  console.log(`[linear] scanned ${nodes.length} issues (cap ${CAP}), ${open.length} still open`);
  if (nodes.length === CAP)
    console.log(`[linear] NOTE: hit the ${CAP}-issue cap — older issues were not scanned`);
  if (!scored.length) {
    console.log('[linear] no title overlap — nothing that looks like a duplicate');
    return;
  }
  for (const n of scored)
    console.log(
      `  ${(n.score * 100).toFixed(0)}%  ${n.identifier} [${n.state.name}] ${n.title}\n         shared: ${n.shared.join(', ')} · ${n.url}`,
    );
  console.log('[linear] judge these before creating: comment on an existing issue beats a twin');
}

// ── dispatch ────────────────────────────────────────────────────────────────
const commands = {
  meta: () => meta({ refresh: has('refresh') }),
  get,
  create,
  labels,
  comment,
  status,
  search,
};
if (!commands[cmd]) usage(`unknown command: ${cmd ?? '(none)'}`);
await commands[cmd]();
