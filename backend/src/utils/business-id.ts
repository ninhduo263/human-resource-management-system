import { DbExecutor } from '../db/pool.js';

/** Bảng có mã nghiệp vụ tự sinh: tiền tố mã, số chữ số và tên cột khóa chính. */
type IdTable = 'NHANVIEN' | 'HOPDONG' | 'PHONGBAN' | 'CHUCVU' | 'QUYETDINH';
const PREFIX: Record<IdTable, [string, number, string]> = {
  NHANVIEN: ['NV', 3, 'MaNV'],
  HOPDONG: ['HD', 3, 'MaHD'],
  PHONGBAN: ['PB', 2, 'MaPB'],
  CHUCVU: ['CV', 2, 'MaCV'],
  QUYETDINH: ['QD', 3, 'MaQD'],
};

// Khóa theo loại mã trong transaction để các yêu cầu đồng thời không nhận trùng mã.
export async function nextBusinessId(tx: DbExecutor, table: IdTable): Promise<string> {
  const [prefix, pad, pk] = PREFIX[table];
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`peopleops:${table}:id`]);
  const row = await tx.one<{ next: string }>(
    `SELECT COALESCE(MAX(SUBSTRING("${pk}" FROM 3)::NUMERIC), 0) + 1 AS next
     FROM "${table}" WHERE "${pk}" ~ $1`,
    [`^${prefix}[0-9]+$`]
  );
  return prefix + String(row!.next).padStart(pad, '0');
}
