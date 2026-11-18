import type { Pool } from 'pg';

/**
 * Migration có đánh số, chạy đúng một lần và được ghi vào bảng schema_migrations.
 *
 * Từ bản đổi tên tiếng Việt, schema.sql đã tạo đúng cấu trúc cuối cùng (bảng và cột theo
 * thietke/erd.drawio) và tự đổi tên bảng/cột của database cũ trước khi chạy. Các migration
 * dưới đây giữ nguyên mã để lịch sử schema_migrations của database cũ vẫn khớp; nội dung chỉ
 * còn các bước idempotent viết theo tên cột mới (database mới chạy không làm thay đổi gì thêm).
 */
interface Migration {
  id: string;
  sql: string;
}

const DATE_COLUMNS: [string, string][] = [
  ['PHONGBAN', 'NgayThanhLap'],
  ['NHANVIEN', 'NgaySinh'],
  ['NHANVIEN', 'NgayVaoLam'],
  ['NHANVIEN', 'NgayLuuTru'],
  ['HOPDONG', 'NgayBatDau'],
  ['HOPDONG', 'NgayKetThuc'],
  ['HOPDONG', 'NgayChamDut'],
  ['GIAHANHOPDONG', 'NgayLap'],
  ['GIAHANHOPDONG', 'NgayKetThucCu'],
  ['GIAHANHOPDONG', 'NgayKetThucMoi'],
  ['QUYETDINH', 'NgayKy'],
  ['QUYETDINH', 'NgayHieuLuc'],
  ['QUATRINHCONGTAC', 'NgayHieuLuc'],
  ['DONNGHIPHEP', 'NgayNop'],
  ['DONNGHIPHEP', 'TuNgay'],
  ['DONNGHIPHEP', 'DenNgay'],
  ['DONNGHIPHEP', 'NgayDuyet'],
];

const MONEY_COLUMNS: [string, string][] = [
  ['HOPDONG', 'MucLuong'],
  ['GIAHANHOPDONG', 'LuongCu'],
  ['GIAHANHOPDONG', 'LuongMoi'],
];

const typeConversion = [
  ...DATE_COLUMNS.map(([t, c]) => `ALTER TABLE "${t}" ALTER COLUMN "${c}" TYPE DATE USING "${c}"::date;`),
  ...MONEY_COLUMNS.map(
    ([t, c]) => `ALTER TABLE "${t}" ALTER COLUMN "${c}" TYPE NUMERIC(15,2) USING "${c}"::numeric;`
  ),
].join('\n');

export const migrations: Migration[] = [
  {
    id: '001_date_and_numeric_types',
    // v_songayphep phụ thuộc các cột ngày; view được tạo lại sau khi chạy migration.
    sql: 'DROP VIEW IF EXISTS v_songayphep;\n' + typeConversion,
  },
  {
    id: '002_domain_extensions',
    sql: `
      UPDATE "CHUCVU" SET "LaDieuHanh" = TRUE, "VaiTroMacDinh" = 'director' WHERE "TenCV" = 'Giám đốc';
      UPDATE "CHUCVU" SET "VaiTroMacDinh" = 'manager' WHERE "TenCV" = 'Trưởng phòng' AND "VaiTroMacDinh" IS NULL;
      UPDATE "CHUCVU" SET "VaiTroMacDinh" = 'employee'
        WHERE "TenCV" IN ('Chuyên viên', 'Thực tập sinh') AND "VaiTroMacDinh" IS NULL;
      UPDATE "PHONGBAN" p SET "MaTruongPhong" = t."MaNV"
        FROM "TAIKHOAN" t JOIN "NHANVIEN" n ON n."MaNV" = t."MaNV"
        WHERE t."VaiTro" = 'manager' AND t."HoatDong" = 1 AND n."MaPB" = p."MaPB"
          AND n."TrangThai" NOT IN ('Đã lưu trữ', 'Đã nghỉ việc') AND p."MaTruongPhong" IS NULL;
      UPDATE "HOPDONG" SET "NgayKetThucGoc" = "NgayKetThuc" WHERE "NgayKetThucGoc" IS NULL;
      UPDATE "GIAHANHOPDONG" SET "NgayHieuLuc" = "NgayLap" WHERE "NgayHieuLuc" IS NULL;
    `,
  },
  {
    id: '003_leave_balance_view',
    // View v_songayphep được tạo lại sau mỗi lần chạy migration (LEAVE_BALANCE_VIEW).
    sql: 'SELECT 1;',
  },
  {
    id: '006_restore_10_entity_erd_tables',
    sql: `
      INSERT INTO "QUYETDINH"("MaQD", "SoQD", "LoaiQD", "NgayKy", "NgayHieuLuc", "NguoiKy", "NoiDung")
      VALUES
        ('QD001', '01/2026/QD-NS', 'Bổ nhiệm', CURRENT_DATE, CURRENT_DATE, 'Trần Hải Đăng', 'Bổ nhiệm Trưởng phòng Marketing'),
        ('QD002', '02/2026/QD-DC', 'Điều chuyển', CURRENT_DATE, CURRENT_DATE, 'Trần Hải Đăng', 'Điều chuyển nhân sự hỗ trợ dự án'),
        ('QD003', '03/2026/QD-MN', 'Miễn nhiệm', CURRENT_DATE, CURRENT_DATE, 'Trần Hải Đăng', 'Miễn nhiệm chức vụ phó phòng theo nguyện vọng')
      ON CONFLICT ("MaQD") DO NOTHING;
      UPDATE "QUATRINHCONGTAC" SET "MaQD" = 'QD001' WHERE "MaQD" IS NULL;
    `,
  },
];

/** SONGAYPHEP đầy đủ thuộc tính ERD: số ngày đã nghỉ/còn lại tính từ các đơn phép năm đã duyệt. */
export const LEAVE_BALANCE_VIEW = `
CREATE OR REPLACE VIEW v_songayphep AS
WITH dadung AS (
  SELECT d."MaNV", EXTRACT(YEAR FROM d."TuNgay")::int AS "Nam", SUM(d."SoNgay") AS "SoNgay"
  FROM "DONNGHIPHEP" d
  JOIN "LOAINGHIPHEP" l ON l."MaLoai" = d."MaLoai"
  WHERE d."TrangThai" = 'Đã duyệt' AND l."TruPhepNam" = 1
  GROUP BY d."MaNV", EXTRACT(YEAR FROM d."TuNgay")
)
SELECT
  s."MaNV",
  s."Nam",
  s."TongSoNgayPhep",
  COALESCE(u."SoNgay", 0) AS "SoNgayDaNghi",
  s."TongSoNgayPhep" - COALESCE(u."SoNgay", 0) AS "SoNgayConLai"
FROM "SONGAYPHEP" s
LEFT JOIN dadung u ON u."MaNV" = s."MaNV" AND u."Nam" = s."Nam";`;

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['peopleops:migrations']);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id VARCHAR(100) PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    const done = new Set(
      (await client.query('SELECT id FROM schema_migrations')).rows.map((r) => r.id as string)
    );
    for (const m of migrations) {
      if (done.has(m.id)) continue;
      try {
        await client.query('BEGIN');
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations(id) VALUES($1)', [m.id]);
        await client.query('COMMIT');
        console.log(`[migration] Đã áp dụng ${m.id}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    await client.query(LEAVE_BALANCE_VIEW);
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['peopleops:migrations']).catch(() => undefined);
    client.release();
  }
}
