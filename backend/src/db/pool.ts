import pg from 'pg';
import type { Pool, PoolClient } from 'pg';
import { requestContext } from '../utils/http.js';
import { runMigrations } from './migrations.js';

// DATE trả về chuỗi 'YYYY-MM-DD' (không bị lệch múi giờ), NUMERIC trả về number.
pg.types.setTypeParser(1082, (v: string) => v);
pg.types.setTypeParser(1700, (v: string) => Number(v));

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://peopleops:peopleops_secret@localhost:5432/peopleops_hrms',
});

export interface DbExecutor {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }>;
  one<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  run(sql: string, params?: any[]): Promise<void>;
}

function wrapExecutor(clientOrPool: Pool | PoolClient): DbExecutor {
  return {
    async query<T = any>(sql: string, params: any[] = []) {
      const res = await clientOrPool.query(sql, params);
      return { rows: res.rows as T[], rowCount: res.rowCount };
    },
    async one<T = any>(sql: string, params: any[] = []) {
      const res = await clientOrPool.query(sql, params);
      return res.rows[0] as T | undefined;
    },
    async all<T = any>(sql: string, params: any[] = []) {
      const res = await clientOrPool.query(sql, params);
      return res.rows as T[];
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
  await runMigrations(pool);
}

export async function auditLog(
  executor: DbExecutor,
  userId: string | null,
  action: string,
  target: string,
  details?: Record<string, unknown>
): Promise<void> {
  await executor.run(
    'INSERT INTO audit_log(user_id, action, target, created_at, details, ip) VALUES($1, $2, $3, $4, $5, $6)',
    [
      userId,
      action,
      target,
      new Date().toISOString(),
      details ? JSON.stringify(details) : null,
      requestContext.getStore()?.ip ?? null,
    ]
  );
}

/** Tạo bản ghi {trường: {from, to}} cho các trường thay đổi, dùng làm chi tiết nhật ký. */
export function diffFields(
  before: Record<string, any>,
  after: Record<string, any>
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (String(before[key] ?? '') !== String(after[key] ?? '')) {
      out[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }
  return out;
}
