import { DbExecutor } from '../db/pool.js';

type IdTable = 'employees' | 'contracts' | 'departments' | 'positions';
const PREFIX: Record<IdTable, [string, number]> = {
  employees: ['NV', 3],
  contracts: ['HD', 3],
  departments: ['PB', 2],
  positions: ['CV', 2],
};

// Khóa theo loại mã trong transaction để các yêu cầu đồng thời không nhận trùng mã.
export async function nextBusinessId(tx: DbExecutor, table: IdTable): Promise<string> {
  const [prefix, pad] = PREFIX[table];
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`peopleops:${table}:id`]);
  const row = await tx.one<{ next: string }>(
    `SELECT COALESCE(MAX(SUBSTRING(id FROM 3)::NUMERIC), 0) + 1 AS next
     FROM ${table} WHERE id ~ $1`,
    [`^${prefix}[0-9]+$`]
  );
  return prefix + String(row!.next).padStart(pad, '0');
}
