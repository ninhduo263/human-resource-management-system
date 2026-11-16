-- ============================================================================
-- PeopleOps HRMS - Nhom 16
-- PostgreSQL Schema ánh xạ trực tiếp từ ERD_QLNS_v2.drawio.pdf (10 thực thể)
-- và 3 bảng hệ thống (users, sessions, audit_log)
-- ============================================================================

-- 1. PHONGBAN (departments)
CREATE TABLE IF NOT EXISTS departments (
  id VARCHAR(25) PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  founded_date VARCHAR(10) NOT NULL
);

-- 2. CHUCVU (positions)
CREATE TABLE IF NOT EXISTS positions (
  id VARCHAR(25) PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 10)
);

-- 3. NHANVIEN (employees)
CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(25) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  birth_date VARCHAR(10) NOT NULL,
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('Nam', 'Nữ', 'Khác')),
  address TEXT NOT NULL DEFAULT '',
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  join_date VARCHAR(10) NOT NULL,
  status VARCHAR(30) NOT NULL CHECK (status IN ('Đang làm việc', 'Thử việc', 'Đã nghỉ việc', 'Đã lưu trữ')),
  archived_date VARCHAR(10),
  department_id VARCHAR(25) REFERENCES departments(id) ON DELETE RESTRICT,
  position_id VARCHAR(25) NOT NULL REFERENCES positions(id) ON DELETE RESTRICT
);

-- 4. HOPDONG (contracts)
CREATE TABLE IF NOT EXISTS contracts (
  id VARCHAR(30) PRIMARY KEY,
  employee_id VARCHAR(25) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  type VARCHAR(40) NOT NULL CHECK (type IN ('Thử việc', 'Xác định thời hạn', 'Không xác định thời hạn')),
  start_date VARCHAR(10) NOT NULL,
  end_date VARCHAR(10),
  salary DOUBLE PRECISION NOT NULL CHECK (salary > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'Hiệu lực',
  terminated_date VARCHAR(10),
  termination_reason TEXT
);

-- 5. GIAHANHOPDONG (extensions)
CREATE TABLE IF NOT EXISTS extensions (
  id VARCHAR(30) PRIMARY KEY,
  contract_id VARCHAR(30) NOT NULL REFERENCES contracts(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL,
  created_date VARCHAR(10) NOT NULL,
  old_end_date VARCHAR(10),
  new_end_date VARCHAR(10),
  amendment_type VARCHAR(40) NOT NULL DEFAULT 'Gia hạn',
  old_salary DOUBLE PRECISION,
  new_salary DOUBLE PRECISION,
  reason TEXT NOT NULL,
  UNIQUE (contract_id, sequence)
);

-- 6. QUYETDINH (decisions)
CREATE TABLE IF NOT EXISTS decisions (
  id VARCHAR(30) PRIMARY KEY,
  number VARCHAR(60) NOT NULL UNIQUE,
  type VARCHAR(40) NOT NULL,
  signed_date VARCHAR(10) NOT NULL,
  effective_date VARCHAR(10) NOT NULL,
  signer VARCHAR(120) NOT NULL,
  content TEXT NOT NULL
);

-- 7. QUATRINHCONGTAC (assignments)
CREATE TABLE IF NOT EXISTS assignments (
  id VARCHAR(30) PRIMARY KEY,
  employee_id VARCHAR(25) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  decision_id VARCHAR(30) NOT NULL REFERENCES decisions(id) ON DELETE RESTRICT,
  type VARCHAR(40) NOT NULL CHECK (type IN ('Điều chuyển', 'Bổ nhiệm', 'Điều chuyển và bổ nhiệm')),
  old_department_id VARCHAR(25) REFERENCES departments(id) ON DELETE RESTRICT,
  new_department_id VARCHAR(25) NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  old_position_id VARCHAR(25) NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
  new_position_id VARCHAR(25) NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
  effective_date VARCHAR(10) NOT NULL,
  reason TEXT NOT NULL
);

-- 8. LOAINGHIPHEP (leave_types)
CREATE TABLE IF NOT EXISTS leave_types (
  id VARCHAR(25) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  max_days INTEGER NOT NULL CHECK (max_days > 0),
  deduct_annual INTEGER NOT NULL CHECK (deduct_annual IN (0, 1))
);

-- 9. DONNGHIPHEP (leave_requests)
CREATE TABLE IF NOT EXISTS leave_requests (
  id VARCHAR(30) PRIMARY KEY,
  employee_id VARCHAR(25) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  type_id VARCHAR(25) NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  submitted_date VARCHAR(10) NOT NULL,
  start_date VARCHAR(10) NOT NULL,
  end_date VARCHAR(10) NOT NULL,
  days INTEGER NOT NULL CHECK (days > 0),
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Chờ duyệt' CHECK (status IN ('Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Đã hủy')),
  approver_id VARCHAR(25) REFERENCES employees(id) ON DELETE RESTRICT,
  approved_date VARCHAR(10),
  review_note TEXT
);

-- 10. SONGAYPHEP (leave_balances)
CREATE TABLE IF NOT EXISTS leave_balances (
  employee_id VARCHAR(25) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  year INTEGER NOT NULL,
  total INTEGER NOT NULL DEFAULT 12 CHECK (total >= 0),
  PRIMARY KEY (employee_id, year)
);

-- Bảng hệ thống 1: users (Tài khoản & Phân quyền)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(30) PRIMARY KEY,
  username VARCHAR(150) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'hr', 'manager', 'employee', 'director')),
  employee_id VARCHAR(25) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  active INTEGER NOT NULL DEFAULT 1
);

-- Bảng hệ thống 2: sessions (Phiên đăng nhập)
CREATE TABLE IF NOT EXISTS sessions (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(30) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires BIGINT NOT NULL
);

-- Bảng hệ thống 3: audit_log (Nhật ký hệ thống)
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(30) REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  target VARCHAR(120) NOT NULL,
  created_at VARCHAR(40) NOT NULL
);

-- Indexes phục vụ truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_leave_employee ON leave_requests(employee_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_contract_employee ON contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_assignments_employee ON assignments(employee_id);

-- (View v_songayphep được tạo trong db/migrations.ts vì phụ thuộc kiểu dữ liệu cột ngày.)

-- Cập nhật tương thích cho database đã được khởi tạo trước đây.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_status_check;
ALTER TABLE employees ADD CONSTRAINT employees_status_check
  CHECK (status IN ('Đang làm việc', 'Thử việc', 'Đã nghỉ việc', 'Đã lưu trữ'));
ALTER TABLE employees ALTER COLUMN department_id DROP NOT NULL;
ALTER TABLE assignments ALTER COLUMN old_department_id DROP NOT NULL;
ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(150);
ALTER TABLE audit_log ALTER COLUMN target TYPE VARCHAR(250);
ALTER TABLE extensions ALTER COLUMN new_end_date DROP NOT NULL;
ALTER TABLE extensions ADD COLUMN IF NOT EXISTS amendment_type VARCHAR(40) NOT NULL DEFAULT 'Gia hạn';
ALTER TABLE extensions ADD COLUMN IF NOT EXISTS old_salary DOUBLE PRECISION;
ALTER TABLE extensions ADD COLUMN IF NOT EXISTS new_salary DOUBLE PRECISION;
