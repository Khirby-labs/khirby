// format.mjs — PostToolUse(Edit|Write): prettier on the touched file.
// Formatting stops being a conversation topic; failures never block the edit.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const fp = input.tool_input?.file_path;
if (!fp || !/\.(ts|tsx|js|jsx|mjs|cjs|vue|json|css|scss|html|yml|yaml)$/i.test(fp)) process.exit(0);

try {
  execSync(`pnpm exec prettier --write --ignore-unknown ${JSON.stringify(fp)}`, {
    cwd: input.cwd || process.cwd(),
    stdio: 'ignore',
    timeout: 15000,
  });
} catch {
  /* formatting must never block an edit */
}
process.exit(0);
