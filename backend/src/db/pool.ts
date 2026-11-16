import { Pool, PoolClient, QueryResultRow } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://peopleops:peopleops_secret@localhost:5432/peopleops_hrms',
});

export interface DbExecutor {
  query<T extends QueryResultRow = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }>;
  one<T extends QueryResultRow = any>(sql: string, params?: any[]): Promise<T | undefined>;
  all<T extends QueryResultRow = any>(sql: string, params?: any[]): Promise<T[]>;
  run(sql: string, params?: any[]): Promise<void>;
}

function wrapExecutor(clientOrPool: Pool | PoolClient): DbExecutor {
  return {
    async query<T extends QueryResultRow = any>(sql: string, params: any[] = []) {
      const res = await clientOrPool.query<T>(sql, params);
      return { rows: res.rows, rowCount: res.rowCount };
    },
    async one<T extends QueryResultRow = any>(sql: string, params: any[] = []) {
      const res = await clientOrPool.query<T>(sql, params);
      return res.rows[0];
    },
    async all<T extends QueryResultRow = any>(sql: string, params: any[] = []) {
      const res = await clientOrPool.query<T>(sql, params);
      return res.rows;
    },
    async run(sql: string, params: any[] = []) {
      await clientOrPool.query(sql, params);
    },
  };
}

export const db: DbExecutor = wrapExecutor(pool);

export async function withTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = wrapExecutor(client);
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function initSchema(): Promise<void> {
  const schemaPath = resolve(__dirname, 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf-8');
  await pool.query(sql);
}

export async function auditLog(
  executor: DbExecutor,
  userId: string | null,
  action: string,
  target: string
): Promise<void> {
  await executor.run(
    'INSERT INTO audit_log(user_id, action, target, created_at) VALUES($1, $2, $3, $4)',
    [userId, action, target, new Date().toISOString()]
  );
}
