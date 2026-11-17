import type { Pool } from 'pg';

/**
 * Migration có đánh số, chạy đúng một lần và được ghi vào bảng schema_migrations.
 * schema.sql chỉ là bản nền (baseline); mọi thay đổi cấu trúc mới thêm vào đây.
 */
interface Migration {
  id: string;
  sql: string;
}

const DATE_COLUMNS: [string, string][] = [
  ['departments', 'founded_date'],
  ['employees', 'birth_date'],
  ['employees', 'join_date'],
  ['employees', 'archived_date'],
  ['contracts', 'start_date'],
  ['contracts', 'end_date'],
  ['contracts', 'terminated_date'],
  ['extensions', 'created_date'],
  ['extensions', 'old_end_date'],
  ['extensions', 'new_end_date'],
  ['decisions', 'signed_date'],
  ['decisions', 'effective_date'],
  ['assignments', 'effective_date'],
  ['leave_requests', 'submitted_date'],
  ['leave_requests', 'start_date'],
  ['leave_requests', 'end_date'],
  ['leave_requests', 'approved_date'],
];

const MONEY_COLUMNS: [string, string][] = [
  ['contracts', 'salary'],
  ['extensions', 'old_salary'],
  ['extensions', 'new_salary'],
];

const typeConversion = [
  'DROP VIEW IF EXISTS v_songayphep;',
  ...DATE_COLUMNS.map(
    ([t, c]) => `ALTER TABLE ${t} ALTER COLUMN ${c} TYPE DATE USING ${c}::date;`
  ),
  ...MONEY_COLUMNS.map(
    ([t, c]) => `ALTER TABLE ${t} ALTER COLUMN ${c} TYPE NUMERIC(15,2) USING ${c}::numeric;`
  ),
].join('\n');

export const migrations: Migration[] = [
  {
    id: '001_date_and_numeric_types',
    sql: typeConversion,
  },
  {
    id: '002_domain_extensions',
    sql: `
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

      ALTER TABLE positions ADD COLUMN IF NOT EXISTS is_executive BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE positions ADD COLUMN IF NOT EXISTS default_role VARCHAR(20)
        CHECK (default_role IS NULL OR default_role IN ('admin','hr','manager','employee','director'));
      ALTER TABLE positions ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
      UPDATE positions SET is_executive = TRUE, default_role = 'director' WHERE name = 'Giám đốc';
      UPDATE positions SET default_role = 'manager' WHERE name = 'Trưởng phòng' AND default_role IS NULL;
      UPDATE positions SET default_role = 'employee'
        WHERE name IN ('Chuyên viên', 'Thực tập sinh') AND default_role IS NULL;

      ALTER TABLE departments ADD COLUMN IF NOT EXISTS head_id VARCHAR(25)
        REFERENCES employees(id) ON DELETE SET NULL;
      ALTER TABLE departments ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
      UPDATE departments d SET head_id = u.employee_id
        FROM users u JOIN employees e ON e.id = u.employee_id
        WHERE u.role = 'manager' AND u.active = 1 AND e.department_id = d.id
          AND e.status NOT IN ('Đã lưu trữ', 'Đã nghỉ việc') AND d.head_id IS NULL;

      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_number VARCHAR(60);
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS termination_type VARCHAR(40);

      ALTER TABLE extensions ADD COLUMN IF NOT EXISTS effective_date DATE;
      UPDATE extensions SET effective_date = created_date WHERE effective_date IS NULL;
      ALTER TABLE extensions ADD COLUMN IF NOT EXISTS applied BOOLEAN NOT NULL DEFAULT TRUE;

      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Hiệu lực';
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS cancelled_date DATE;
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

      ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS details JSONB;
      ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip VARCHAR(64);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(id DESC);

      CREATE TABLE IF NOT EXISTS holidays (
        day DATE PRIMARY KEY,
        name VARCHAR(120) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS login_attempts (
        key VARCHAR(250) PRIMARY KEY,
        count INTEGER NOT NULL,
        until BIGINT NOT NULL
      );

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_employee_unique')
           AND NOT EXISTS (SELECT 1 FROM users GROUP BY employee_id HAVING COUNT(*) > 1) THEN
          ALTER TABLE users ADD CONSTRAINT users_employee_unique UNIQUE (employee_id);
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_assignments_pending ON assignments(status, effective_date);
    `,
  },
  {
    id: '003_leave_balance_view',
    sql: `
      CREATE OR REPLACE VIEW v_songayphep AS
      WITH used AS (
        SELECT lr.employee_id, EXTRACT(YEAR FROM lr.start_date)::int AS year, SUM(lr.days) AS days
        FROM leave_requests lr
        JOIN leave_types lt ON lt.id = lr.type_id
        WHERE lr.status = 'Đã duyệt' AND lt.deduct_annual = 1
        GROUP BY lr.employee_id, EXTRACT(YEAR FROM lr.start_date)
      )
      SELECT
        lb.employee_id AS "MaNV",
        lb.year AS "Nam",
        lb.total AS "TongSoNgayPhep",
        COALESCE(u.days, 0) AS "SoNgayDaNghi",
        lb.total - COALESCE(u.days, 0) AS "SoNgayConLai"
      FROM leave_balances lb
      LEFT JOIN used u ON u.employee_id = lb.employee_id AND u.year = lb.year;
    `,
  },
  {
    id: '004_rewards_disciplines_and_model_enhancements',
    sql: `
      -- 1. Thêm thực thể KHENTHUONG_KYLUAT (rewards_disciplines) cho BFD 3.4
      CREATE TABLE IF NOT EXISTS rewards_disciplines (
        id VARCHAR(30) PRIMARY KEY,
        employee_id VARCHAR(25) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
        decision_id VARCHAR(30) NOT NULL REFERENCES decisions(id) ON DELETE RESTRICT,
        type VARCHAR(40) NOT NULL CHECK (type IN ('Khen thưởng', 'Kỷ luật')),
        category VARCHAR(100) NOT NULL,
        amount NUMERIC(15,2) DEFAULT 0 CHECK (amount >= 0),
        effective_date DATE NOT NULL,
        reason TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_rewards_employee ON rewards_disciplines(employee_id);
      CREATE INDEX IF NOT EXISTS idx_rewards_decision ON rewards_disciplines(decision_id);
      CREATE INDEX IF NOT EXISTS idx_rewards_type ON rewards_disciplines(type);

      -- 2. Hỗ trợ Quyết định chấm dứt hợp đồng và Phụ lục hợp đồng (bảo toàn lịch sử HĐ gốc)
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS termination_decision_id VARCHAR(30)
        REFERENCES decisions(id) ON DELETE SET NULL;
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS original_end_date DATE;
      ALTER TABLE contracts ALTER COLUMN original_end_date TYPE DATE USING original_end_date::date;
      UPDATE contracts SET original_end_date = end_date WHERE original_end_date IS NULL;

      ALTER TABLE rewards_disciplines ALTER COLUMN effective_date TYPE DATE USING effective_date::date;
      ALTER TABLE rewards_disciplines ALTER COLUMN amount TYPE NUMERIC(15,2) USING amount::numeric;

      ALTER TABLE extensions ADD COLUMN IF NOT EXISTS decision_id VARCHAR(30)
        REFERENCES decisions(id) ON DELETE SET NULL;

      -- 3. Mở rộng ràng buộc cho assignments hỗ trợ 'Miễn nhiệm' (DFD 2.3, 2.4)
      ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_type_check;
      ALTER TABLE assignments ADD CONSTRAINT assignments_type_check
        CHECK (type IN ('Điều chuyển', 'Bổ nhiệm', 'Miễn nhiệm', 'Điều chuyển và bổ nhiệm'));

      -- 4. Đảm bảo ràng buộc Trưởng phòng quản lý phòng ban
      CREATE INDEX IF NOT EXISTS idx_departments_head ON departments(head_id);
      CREATE INDEX IF NOT EXISTS idx_contracts_termination_decision ON contracts(termination_decision_id);
    `,
  },
];

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // Khóa toàn cục để nhiều tiến trình khởi động cùng lúc không chạy migration song song.
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
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['peopleops:migrations']).catch(() => undefined);
    client.release();
  }
}
