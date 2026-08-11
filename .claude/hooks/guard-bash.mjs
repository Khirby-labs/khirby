// guard-bash.mjs — PreToolUse(Bash): deny destructive command patterns.
// Every deny pairs the prohibition with the correct move (pairing rule).
import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const cmd = input.tool_input?.command ?? '';

// Rules match at COMMAND POSITION only (start of string/line, after ; & |,
// or inside $()), never inside prose arguments — a commit message *mentioning*
// `rm -r -f` must not trip the guard (it did; see INCIDENTS 2026-07-24).
const AT_CMD = /(^|[\n;&|]|\$\()\s*/.source;
const atCmd = (body) => new RegExp(AT_CMD + body);

const RULES = [
  {
    // Two lookaheads: the command has a recursive flag token AND a force flag
    // token — catches -rf, -fr, -r -f, -f -r, -r --force (panel finding P2).
    re: atCmd(
      String.raw`rm\b(?=[^\n]*\s(-[a-zA-Z]*r[a-zA-Z]*|--recursive)\b)(?=[^\n]*\s(-[a-zA-Z]*f[a-zA-Z]*|--force)\b)`,
    ),
    reason:
      'Recursive force-delete (rm -rf and equivalents) is blocked. Instead: delete specific paths non-recursively (rm <file>), use the scratchpad for throwaway dirs, or ask the user for bulk deletions.',
  },
  {
    // (?!-) keeps --force-with-lease / --force-if-includes allowed — they fall
    // through to the normal permission prompt (panel finding P1).
    re: atCmd(String.raw`git\s+push\b[^\n]*(\s--force(?!-)\b|\s-f\b)`),
    reason:
      'Force-push is blocked. Instead: on a feature branch use --force-with-lease after confirming with the user; never rewrite main.',
  },
  {
    re: atCmd(String.raw`(npx\s+|pnpm\s+(exec\s+)?|yarn\s+)?drizzle-kit\s+push`),
    reason:
      'Manual drizzle-kit push is blocked (destructive-capable). Instead: migrations auto-apply on API startup in dev; for prod follow docs/DEPLOY.md.',
  },
  {
    re: atCmd(String.raw`git\s+clean\b[^\n]*\s-[a-zA-Z]*f`),
    reason:
      'git clean -f is blocked (would delete untracked work: plan files, new modules). Instead: remove specific files explicitly, or git stash -u to set work aside recoverably.',
  },
];

for (const rule of RULES) {
  if (rule.re.test(cmd)) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: rule.reason,
        },
      }),
    );
    process.exit(0);
  }
}
process.exit(0);
