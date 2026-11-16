import { DbExecutor } from '../db/pool.js';

// Khóa theo loại mã trong transaction để các yêu cầu đồng thời không nhận trùng mã.
export async function nextBusinessId(tx: DbExecutor, table: 'employees' | 'contracts' | 'departments'): Promise<string> {
  const prefix = table === 'employees' ? 'NV' : table === 'contracts' ? 'HD' : 'PB';
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`peopleops:${table}:id`]);
  const row = await tx.one<{ next: string }>(
    `SELECT COALESCE(MAX(SUBSTRING(id FROM 3)::NUMERIC), 0) + 1 AS next
     FROM ${table} WHERE id ~ $1`, [`^${prefix}[0-9]+$`]
  );
  return prefix + String(row!.next).padStart(table === 'departments' ? 2 : 3, '0');
}
