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
  ['phongban', 'ngaythanhlap'],
  ['nhanvien', 'ngaysinh'],
  ['nhanvien', 'ngayvaolam'],
  ['nhanvien', 'ngayluutru'],
  ['hopdong', 'ngaybatdau'],
  ['hopdong', 'ngayketthuc'],
  ['hopdong', 'ngaychamdut'],
  ['giahanhopdong', 'ngaylap'],
  ['giahanhopdong', 'ngayketthuccu'],
  ['giahanhopdong', 'ngayketthucmoi'],
  ['quyetdinh', 'ngayky'],
  ['quyetdinh', 'ngayhieuluc'],
  ['quatrinhcongtac', 'ngayhieuluc'],
  ['donnghiphep', 'ngaynop'],
  ['donnghiphep', 'tungay'],
  ['donnghiphep', 'denngay'],
  ['donnghiphep', 'ngayduyet'],
];

const MONEY_COLUMNS: [string, string][] = [
  ['hopdong', 'mucluong'],
  ['giahanhopdong', 'luongcu'],
  ['giahanhopdong', 'luongmoi'],
];

const typeConversion = [
  ...DATE_COLUMNS.map(([t, c]) => `ALTER TABLE ${t} ALTER COLUMN ${c} TYPE DATE USING ${c}::date;`),
  ...MONEY_COLUMNS.map(
    ([t, c]) => `ALTER TABLE ${t} ALTER COLUMN ${c} TYPE NUMERIC(15,2) USING ${c}::numeric;`
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
      UPDATE chucvu SET ladieuhanh = TRUE, vaitromacdinh = 'director' WHERE tencv = 'Giám đốc';
      UPDATE chucvu SET vaitromacdinh = 'manager' WHERE tencv = 'Trưởng phòng' AND vaitromacdinh IS NULL;
      UPDATE chucvu SET vaitromacdinh = 'employee'
        WHERE tencv IN ('Chuyên viên', 'Thực tập sinh') AND vaitromacdinh IS NULL;
      UPDATE phongban p SET matruongphong = t.manv
        FROM taikhoan t JOIN nhanvien n ON n.manv = t.manv
        WHERE t.vaitro = 'manager' AND t.hoatdong = 1 AND n.mapb = p.mapb
          AND n.trangthai NOT IN ('Đã lưu trữ', 'Đã nghỉ việc') AND p.matruongphong IS NULL;
      UPDATE hopdong SET ngayketthucgoc = ngayketthuc WHERE ngayketthucgoc IS NULL;
      UPDATE giahanhopdong SET ngayhieuluc = ngaylap WHERE ngayhieuluc IS NULL;
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
      INSERT INTO quyetdinh(maqd, soqd, loaiqd, ngayky, ngayhieuluc, nguoiky, noidung)
      VALUES
        ('QD001', '01/2026/QD-NS', 'Bổ nhiệm', CURRENT_DATE, CURRENT_DATE, 'Trần Hải Đăng', 'Bổ nhiệm Trưởng phòng Marketing'),
        ('QD002', '02/2026/QD-DC', 'Điều chuyển', CURRENT_DATE, CURRENT_DATE, 'Trần Hải Đăng', 'Điều chuyển nhân sự hỗ trợ dự án'),
        ('QD003', '03/2026/QD-MN', 'Miễn nhiệm', CURRENT_DATE, CURRENT_DATE, 'Trần Hải Đăng', 'Miễn nhiệm chức vụ phó phòng theo nguyện vọng')
      ON CONFLICT (maqd) DO NOTHING;
      UPDATE quatrinhcongtac SET maqd = 'QD001' WHERE maqd IS NULL;
    `,
  },
];

/** SONGAYPHEP đầy đủ thuộc tính ERD: số ngày đã nghỉ/còn lại tính từ các đơn phép năm đã duyệt. */
export const LEAVE_BALANCE_VIEW = `
CREATE OR REPLACE VIEW v_songayphep AS
WITH dadung AS (
  SELECT d.manv, EXTRACT(YEAR FROM d.tungay)::int AS nam, SUM(d.songay) AS songay
  FROM donnghiphep d
  JOIN loainghiphep l ON l.maloai = d.maloai
  WHERE d.trangthai = 'Đã duyệt' AND l.truphepnam = 1
  GROUP BY d.manv, EXTRACT(YEAR FROM d.tungay)
)
SELECT
  s.manv,
  s.nam,
  s.tongsongayphep,
  COALESCE(u.songay, 0) AS songaydanghi,
  s.tongsongayphep - COALESCE(u.songay, 0) AS songayconlai
FROM songayphep s
LEFT JOIN dadung u ON u.manv = s.manv AND u.nam = s.nam;`;

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
