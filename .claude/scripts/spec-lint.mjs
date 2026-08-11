// spec-lint.mjs — structural pre-pass on a Linear issue before any work starts.
// Establishes FACTS (are acceptance criteria present at all?); the agent then
// judges MEANING (are they measurable?). Garbage-in is the #1 cause of bad
// autonomous outcomes — this is the mechanical half of the intake spec gate.
//
// Usage: node .claude/scripts/spec-lint.mjs <issue-body.md>
//        ... | node .claude/scripts/spec-lint.mjs   (body on stdin)
// Exit 0 = structure ok · exit 1 = gaps listed on stdout (ask, don't guess).
import { readFileSync } from 'node:fs';

const arg = process.argv[2];
const body = arg ? readFileSync(arg, 'utf8') : readFileSync(0, 'utf8');
const gaps = [];

if (body.trim().length < 80) {
  gaps.push('description is empty or too thin (<80 chars) to implement against');
}

const hasAcHeading = /(acceptance criteria|kryteria akceptacji|definition of done)/i.test(body);
const checklistItems = (body.match(/^\s*[-*]\s*\[[ x]\]/gim) ?? []).length;
if (!hasAcHeading && checklistItems < 2) {
  gaps.push('no acceptance criteria: neither an AC/DoD heading nor a checklist (>=2 items) found');
}

if (gaps.length) {
  console.log('[spec-lint] SPEC GATE FAILED — do not start implementing. Ask on the issue instead of guessing:');
  for (const g of gaps) console.log(`  - ${g}`);
  process.exit(1);
}
console.log('[spec-lint] structure ok — now judge semantics: are the criteria measurable and complete?');
process.exit(0);
