import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle> | null = null;

/** Postgres NOTICE codes that are intentional noise from idempotent DDL. */
const SILENT_NOTICE_CODES = new Set([
  '42P06', // duplicate_schema (CREATE SCHEMA IF NOT EXISTS)
  '42P07', // duplicate_table / relation already exists (CREATE IF NOT EXISTS)
  '42701', // duplicate_column (ALTER TABLE … ADD COLUMN IF NOT EXISTS)
  '42710', // duplicate_object
]);

export function getDb() {
  if (!_db) {
    const client = postgres(process.env.DATABASE_URL!, {
      max: 10,
      idle_timeout: 20,
      // Safety net for ADR-0055 scoped txs: if a request leaves a connection
      // `idle in transaction` (ALS drop / hung handler), kill it before the
      // pool of 10 deadlocks and every authenticated call 504s.
      connection: {
        idle_in_transaction_session_timeout: '15000',
      },
      // Default postgres.js logs every NOTICE to console — plugin onMigrate
      // runs CREATE IF NOT EXISTS on every boot and floods the API log.
      onnotice: (notice) => {
        if (SILENT_NOTICE_CODES.has(notice.code)) return;
        console.log(notice);
      },
    });
    _db = drizzle(client, { schema });
  }
  return _db;
}

export type Db = ReturnType<typeof getDb>;
