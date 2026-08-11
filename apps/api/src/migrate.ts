import { existsSync } from 'fs';
import { Logger } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { resolve } from 'path';

const logger = new Logger('Migrate');

/** Repo root (Docker WORKDIR=/app) or apps/api (local `pnpm migrate`). */
function resolveMigrationsFolder(): string {
  const candidates = [
    resolve(process.cwd(), 'drizzle/migrations'),
    resolve(process.cwd(), '../../drizzle/migrations'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(`Migrations folder not found. Tried: ${candidates.join(', ')}`);
  }
  return found;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql);
  const migrationsFolder = resolveMigrationsFolder();

  logger.log(`Running migrations from ${migrationsFolder}...`);
  await migrate(db, { migrationsFolder });
  logger.log('Done.');

  await sql.end();
}

main().catch((err) => {
  logger.error(`Failed: ${(err as Error).message}`);
  process.exit(1);
});
