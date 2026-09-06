import { sql } from 'drizzle-orm';
import type { Db } from './db';

export type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Connection = Db | Transaction;

/** Serialize related mutations across API processes, for the duration of the transaction. */
export async function lockMutation(tx: Connection, domain: 'identity' | 'boards' | 'pipeline') {
  const key = { identity: 48492002, boards: 48492003, pipeline: 48492001 }[domain];
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${key})`);
}
