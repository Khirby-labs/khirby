#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fetchPublicForm, generateFormModule } from './generate.js';

function printUsage(): void {
  console.error(`Usage: khirby-forms-codegen --base-url <url> --form <endpointToken> --out <file.ts> [--name exportName]

Example:
  khirby-forms-codegen \\
    --base-url https://crm.example.com \\
    --form abc-123-uuid \\
    --out ./src/generated/contact-form.ts
`);
}

function parseArgs(argv: string[]): {
  baseUrl?: string;
  formToken?: string;
  outFile?: string;
  exportName?: string;
} {
  const result: ReturnType<typeof parseArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--base-url' && next) {
      result.baseUrl = next;
      i++;
    } else if (arg === '--form' && next) {
      result.formToken = next;
      i++;
    } else if (arg === '--out' && next) {
      result.outFile = next;
      i++;
    } else if (arg === '--name' && next) {
      result.exportName = next;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  return result;
}

async function main(): Promise<void> {
  const { baseUrl, formToken, outFile, exportName } = parseArgs(process.argv.slice(2));
  if (!baseUrl || !formToken || !outFile) {
    printUsage();
    process.exit(1);
  }

  const form = await fetchPublicForm(baseUrl, formToken);
  const { code } = generateFormModule(form, formToken, exportName);
  const dir = path.dirname(outFile);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outFile, code, 'utf8');
  console.error(`Wrote ${outFile} (${form.name}, ${form.fields.length} fields)`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
