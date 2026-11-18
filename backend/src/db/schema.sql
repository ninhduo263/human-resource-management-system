-- ============================================================================
-- PeopleOps HRMS - Nhom 16
-- PostgreSQL Schema ánh xạ trực tiếp từ thietke/erd.drawio:
--   10 thực thể nghiệp vụ + 5 thực thể hệ thống (taikhoan, phiendangnhap,
--   nhatkyhethong, ngayle, dangnhapthatbai).
-- Tên bảng và tên cột là tên thực thể/thuộc tính trong ERD, viết thường,
-- tiếng Việt không dấu (ví dụ NHANVIEN.MaNV -> nhanvien.manv).
-- ============================================================================

-- Đổi tên bảng cũ (tiếng Anh) sang tên tiếng Việt cho database đã khởi tạo trước đây.
-- Chạy trước mọi CREATE TABLE để không sinh bảng rỗng trùng tên.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('departments', 'phongban'),
    ('positions', 'chucvu'),
    ('employees', 'nhanvien'),
    ('contracts', 'hopdong'),
    ('extensions', 'giahanhopdong'),
    ('decisions', 'quyetdinh'),
    ('assignments', 'quatrinhcongtac'),
    ('leave_types', 'loainghiphep'),
    ('leave_requests', 'donnghiphep'),
    ('leave_balances', 'songayphep'),
    ('users', 'taikhoan'),
    ('sessions', 'phiendangnhap'),
    ('audit_log', 'nhatkyhethong'),
    ('holidays', 'ngayle'),
    ('login_attempts', 'dangnhapthatbai')
  ) AS m(old_name, new_name)
  LOOP
    IF to_regclass('public.' || r.old_name) IS NOT NULL
       AND to_regclass('public.' || r.new_name) IS NULL THEN
      EXECUTE format('ALTER TABLE public.%I RENAME TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;
END $$;

-- Đổi tên cột cũ (tiếng Anh) sang tên thuộc tính ERD cho database đã khởi tạo trước đây.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('phongban', 'id', 'mapb'), ('phongban', 'name', 'tenpb'), ('phongban', 'description', 'mota'),
    ('phongban', 'founded_date', 'ngaythanhlap'), ('phongban', 'head_id', 'matruongphong'),
    ('phongban', 'active', 'hoatdong'),
    ('chucvu', 'id', 'macv'), ('chucvu', 'name', 'tencv'), ('chucvu', 'description', 'mota'),
    ('chucvu', 'level', 'capbac'), ('chucvu', 'is_executive', 'ladieuhanh'),
    ('chucvu', 'default_role', 'vaitromacdinh'), ('chucvu', 'active', 'hoatdong'),
    ('nhanvien', 'id', 'manv'), ('nhanvien', 'name', 'hoten'), ('nhanvien', 'birth_date', 'ngaysinh'),
    ('nhanvien', 'gender', 'gioitinh'), ('nhanvien', 'address', 'diachi'), ('nhanvien', 'phone', 'sodienthoai'),
    ('nhanvien', 'join_date', 'ngayvaolam'), ('nhanvien', 'status', 'trangthai'),
    ('nhanvien', 'archived_date', 'ngayluutru'), ('nhanvien', 'department_id', 'mapb'),
    ('nhanvien', 'position_id', 'macv'), ('nhanvien', 'version', 'phienban'),
    ('hopdong', 'id', 'mahd'), ('hopdong', 'employee_id', 'manv'), ('hopdong', 'type', 'loaihd'),
    ('hopdong', 'start_date', 'ngaybatdau'), ('hopdong', 'end_date', 'ngayketthuc'), ('hopdong', 'salary', 'mucluong'),
    ('hopdong', 'status', 'trangthai'), ('hopdong', 'terminated_date', 'ngaychamdut'),
    ('hopdong', 'termination_reason', 'lydochamdut'), ('hopdong', 'contract_number', 'sohd'),
    ('hopdong', 'termination_type', 'loaichamdut'), ('hopdong', 'termination_decision_id', 'maqdchamdut'),
    ('hopdong', 'original_end_date', 'ngayketthucgoc'),
    ('giahanhopdong', 'id', 'magh'), ('giahanhopdong', 'contract_id', 'mahd'),
    ('giahanhopdong', 'sequence', 'langiahan'), ('giahanhopdong', 'created_date', 'ngaylap'),
    ('giahanhopdong', 'old_end_date', 'ngayketthuccu'), ('giahanhopdong', 'new_end_date', 'ngayketthucmoi'),
    ('giahanhopdong', 'reason', 'lydo'), ('giahanhopdong', 'amendment_type', 'loaiphuluc'),
    ('giahanhopdong', 'old_salary', 'luongcu'), ('giahanhopdong', 'new_salary', 'luongmoi'),
    ('giahanhopdong', 'effective_date', 'ngayhieuluc'), ('giahanhopdong', 'applied', 'daapdung'),
    ('giahanhopdong', 'decision_id', 'maqd'),
    ('quyetdinh', 'id', 'maqd'), ('quyetdinh', 'number', 'soqd'), ('quyetdinh', 'type', 'loaiqd'),
    ('quyetdinh', 'signed_date', 'ngayky'), ('quyetdinh', 'effective_date', 'ngayhieuluc'),
    ('quyetdinh', 'signer', 'nguoiky'), ('quyetdinh', 'content', 'noidung'),
    ('quatrinhcongtac', 'id', 'maqt'), ('quatrinhcongtac', 'employee_id', 'manv'),
    ('quatrinhcongtac', 'decision_id', 'maqd'), ('quatrinhcongtac', 'type', 'loaibiendong'),
    ('quatrinhcongtac', 'old_department_id', 'mapbcu'), ('quatrinhcongtac', 'new_department_id', 'mapbmoi'),
    ('quatrinhcongtac', 'old_position_id', 'macvcu'), ('quatrinhcongtac', 'new_position_id', 'macvmoi'),
    ('quatrinhcongtac', 'effective_date', 'ngayhieuluc'), ('quatrinhcongtac', 'reason', 'lydo'),
    ('quatrinhcongtac', 'status', 'trangthai'), ('quatrinhcongtac', 'cancelled_date', 'ngayhuy'),
    ('quatrinhcongtac', 'cancel_reason', 'lydohuy'),
    ('loainghiphep', 'id', 'maloai'), ('loainghiphep', 'name', 'tenloai'),
    ('loainghiphep', 'max_days', 'songaytoida'), ('loainghiphep', 'deduct_annual', 'truphepnam'),
    ('donnghiphep', 'id', 'madon'), ('donnghiphep', 'employee_id', 'manv'), ('donnghiphep', 'type_id', 'maloai'),
    ('donnghiphep', 'submitted_date', 'ngaynop'), ('donnghiphep', 'start_date', 'tungay'),
    ('donnghiphep', 'end_date', 'denngay'), ('donnghiphep', 'days', 'songay'), ('donnghiphep', 'reason', 'lydo'),
    ('donnghiphep', 'status', 'trangthai'), ('donnghiphep', 'approver_id', 'manvduyet'),
    ('donnghiphep', 'approved_date', 'ngayduyet'), ('donnghiphep', 'review_note', 'ghichuduyet'),
    ('songayphep', 'employee_id', 'manv'), ('songayphep', 'year', 'nam'), ('songayphep', 'total', 'tongsongayphep'),
    ('taikhoan', 'id', 'matk'), ('taikhoan', 'username', 'tendangnhap'), ('taikhoan', 'password_hash', 'matkhau'),
    ('taikhoan', 'role', 'vaitro'), ('taikhoan', 'employee_id', 'manv'), ('taikhoan', 'active', 'hoatdong'),
    ('phiendangnhap', 'token_hash', 'maphien'), ('phiendangnhap', 'user_id', 'matk'),
    ('phiendangnhap', 'expires', 'thoihan'),
    ('nhatkyhethong', 'id', 'mank'), ('nhatkyhethong', 'user_id', 'matk'), ('nhatkyhethong', 'action', 'hanhdong'),
    ('nhatkyhethong', 'target', 'doituong'), ('nhatkyhethong', 'created_at', 'thoigian'),
    ('nhatkyhethong', 'details', 'chitiet'), ('nhatkyhethong', 'ip', 'diachiip'),
    ('ngayle', 'day', 'ngay'), ('ngayle', 'name', 'tenngayle'),
    ('dangnhapthatbai', 'key', 'khoa'), ('dangnhapthatbai', 'count', 'solansai'),
    ('dangnhapthatbai', 'until', 'khoaden')
  ) AS m(tbl, old_col, new_col)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.old_col)
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.new_col) THEN
      EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I', r.tbl, r.old_col, r.new_col);
    END IF;
  END LOOP;
END $$;

-- View cũ dùng tên cột dạng "MaNV"; tạo lại bằng tên cột thường trong migration.
DROP VIEW IF EXISTS v_songayphep;

-- Bảng bị loại khỏi phạm vi (khen thưởng, kỷ luật).
DROP TABLE IF EXISTS rewards_disciplines CASCADE;
DROP TABLE IF EXISTS khenthuongkyluat CASCADE;

-- 1. PHONGBAN (Phòng ban)
CREATE TABLE IF NOT EXISTS phongban (
  mapb VARCHAR(25) PRIMARY KEY,
  tenpb VARCHAR(120) NOT NULL UNIQUE,
  mota TEXT NOT NULL DEFAULT '',
  ngaythanhlap DATE NOT NULL,
  matruongphong VARCHAR(25),
  hoatdong BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2. CHUCVU (Chức vụ)
CREATE TABLE IF NOT EXISTS chucvu (
  macv VARCHAR(25) PRIMARY KEY,
  tencv VARCHAR(120) NOT NULL UNIQUE,
  mota TEXT NOT NULL DEFAULT '',
  capbac INTEGER NOT NULL DEFAULT 2 CHECK (capbac BETWEEN 1 AND 10),
  ladieuhanh BOOLEAN NOT NULL DEFAULT FALSE,
  vaitromacdinh VARCHAR(20)
    CHECK (vaitromacdinh IS NULL OR vaitromacdinh IN ('admin', 'hr', 'manager', 'employee', 'director')),
  hoatdong BOOLEAN NOT NULL DEFAULT TRUE
);

-- 3. NHANVIEN (Nhân viên)
CREATE TABLE IF NOT EXISTS nhanvien (
  manv VARCHAR(25) PRIMARY KEY,
  hoten VARCHAR(120) NOT NULL,
  ngaysinh DATE NOT NULL,
  gioitinh VARCHAR(10) NOT NULL CHECK (gioitinh IN ('Nam', 'Nữ', 'Khác')),
  diachi TEXT NOT NULL DEFAULT '',
  sodienthoai VARCHAR(20) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  ngayvaolam DATE NOT NULL,
  trangthai VARCHAR(30) NOT NULL,
  ngayluutru DATE,
  mapb VARCHAR(25) REFERENCES phongban(mapb) ON DELETE RESTRICT,
  macv VARCHAR(25) NOT NULL REFERENCES chucvu(macv) ON DELETE RESTRICT,
  phienban INTEGER NOT NULL DEFAULT 1
);

-- 4. QUYETDINH (Quyết định)
CREATE TABLE IF NOT EXISTS quyetdinh (
  maqd VARCHAR(30) PRIMARY KEY,
  soqd VARCHAR(60) NOT NULL UNIQUE,
  loaiqd VARCHAR(40) NOT NULL,
  ngayky DATE NOT NULL,
  ngayhieuluc DATE NOT NULL,
  nguoiky VARCHAR(120) NOT NULL,
  noidung TEXT NOT NULL
);

-- 5. HOPDONG (Hợp đồng lao động)
CREATE TABLE IF NOT EXISTS hopdong (
  mahd VARCHAR(30) PRIMARY KEY,
  manv VARCHAR(25) NOT NULL REFERENCES nhanvien(manv) ON DELETE RESTRICT,
  loaihd VARCHAR(40) NOT NULL CHECK (loaihd IN ('Thử việc', 'Xác định thời hạn', 'Không xác định thời hạn')),
  ngaybatdau DATE NOT NULL,
  ngayketthuc DATE,
  mucluong NUMERIC(15,2) NOT NULL CHECK (mucluong > 0),
  trangthai VARCHAR(30) NOT NULL DEFAULT 'Hiệu lực',
  ngaychamdut DATE,
  lydochamdut TEXT,
  sohd VARCHAR(60),
  loaichamdut VARCHAR(40),
  maqdchamdut VARCHAR(30) REFERENCES quyetdinh(maqd) ON DELETE SET NULL,
  ngayketthucgoc DATE
);

-- 6. GIAHANHOPDONG (Gia hạn / phụ lục hợp đồng)
CREATE TABLE IF NOT EXISTS giahanhopdong (
  magh VARCHAR(30) PRIMARY KEY,
  mahd VARCHAR(30) NOT NULL REFERENCES hopdong(mahd) ON DELETE RESTRICT,
  langiahan INTEGER NOT NULL,
  ngaylap DATE NOT NULL,
  ngayketthuccu DATE,
  ngayketthucmoi DATE,
  lydo TEXT NOT NULL,
  loaiphuluc VARCHAR(40) NOT NULL DEFAULT 'Gia hạn',
  luongcu NUMERIC(15,2),
  luongmoi NUMERIC(15,2),
  ngayhieuluc DATE,
  daapdung BOOLEAN NOT NULL DEFAULT TRUE,
  maqd VARCHAR(30) REFERENCES quyetdinh(maqd) ON DELETE SET NULL,
  UNIQUE (mahd, langiahan)
);

-- 7. QUATRINHCONGTAC (Quá trình công tác)
CREATE TABLE IF NOT EXISTS quatrinhcongtac (
  maqt VARCHAR(30) PRIMARY KEY,
  manv VARCHAR(25) NOT NULL REFERENCES nhanvien(manv) ON DELETE RESTRICT,
  maqd VARCHAR(30) NOT NULL REFERENCES quyetdinh(maqd) ON DELETE RESTRICT,
  loaibiendong VARCHAR(40) NOT NULL,
  mapbcu VARCHAR(25) REFERENCES phongban(mapb) ON DELETE RESTRICT,
  mapbmoi VARCHAR(25) NOT NULL REFERENCES phongban(mapb) ON DELETE RESTRICT,
  macvcu VARCHAR(25) REFERENCES chucvu(macv) ON DELETE RESTRICT,
  macvmoi VARCHAR(25) NOT NULL REFERENCES chucvu(macv) ON DELETE RESTRICT,
  ngayhieuluc DATE NOT NULL,
  lydo TEXT NOT NULL,
  trangthai VARCHAR(20) NOT NULL DEFAULT 'Hiệu lực',
  ngayhuy DATE,
  lydohuy TEXT
);

-- 8. LOAINGHIPHEP (Loại nghỉ phép)
CREATE TABLE IF NOT EXISTS loainghiphep (
  maloai VARCHAR(25) PRIMARY KEY,
  tenloai VARCHAR(100) NOT NULL,
  songaytoida INTEGER NOT NULL CHECK (songaytoida > 0),
  truphepnam INTEGER NOT NULL DEFAULT 1 CHECK (truphepnam IN (0, 1))
);

-- 9. DONNGHIPHEP (Đơn nghỉ phép)
CREATE TABLE IF NOT EXISTS donnghiphep (
  madon VARCHAR(30) PRIMARY KEY,
  manv VARCHAR(25) NOT NULL REFERENCES nhanvien(manv) ON DELETE RESTRICT,
  maloai VARCHAR(25) NOT NULL REFERENCES loainghiphep(maloai) ON DELETE RESTRICT,
  ngaynop DATE NOT NULL,
  tungay DATE NOT NULL,
  denngay DATE NOT NULL,
  songay INTEGER NOT NULL CHECK (songay > 0),
  lydo TEXT NOT NULL,
  trangthai VARCHAR(30) NOT NULL DEFAULT 'Chờ duyệt'
    CHECK (trangthai IN ('Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Đã hủy')),
  manvduyet VARCHAR(25) REFERENCES nhanvien(manv) ON DELETE RESTRICT,
  ngayduyet DATE,
  ghichuduyet TEXT
);

-- 10. SONGAYPHEP (Số ngày phép năm; số ngày đã nghỉ/còn lại tính ở view v_songayphep)
CREATE TABLE IF NOT EXISTS songayphep (
  manv VARCHAR(25) NOT NULL REFERENCES nhanvien(manv) ON DELETE RESTRICT,
  nam INTEGER NOT NULL,
  tongsongayphep INTEGER NOT NULL DEFAULT 12 CHECK (tongsongayphep >= 0),
  PRIMARY KEY (manv, nam)
);

-- Bảng hệ thống 1: TAIKHOAN (Tài khoản & Phân quyền)
CREATE TABLE IF NOT EXISTS taikhoan (
  matk VARCHAR(30) PRIMARY KEY,
  tendangnhap VARCHAR(150) NOT NULL UNIQUE,
  matkhau TEXT NOT NULL,
  vaitro VARCHAR(20) NOT NULL CHECK (vaitro IN ('admin', 'hr', 'manager', 'employee', 'director')),
  manv VARCHAR(25) NOT NULL REFERENCES nhanvien(manv) ON DELETE RESTRICT,
  hoatdong INTEGER NOT NULL DEFAULT 1
);

-- Bảng hệ thống 2: PHIENDANGNHAP (Phiên đăng nhập)
CREATE TABLE IF NOT EXISTS phiendangnhap (
  maphien VARCHAR(64) PRIMARY KEY,
  matk VARCHAR(30) NOT NULL REFERENCES taikhoan(matk) ON DELETE CASCADE,
  thoihan BIGINT NOT NULL
);

-- Bảng hệ thống 3: NHATKYHETHONG (Nhật ký hệ thống)
CREATE TABLE IF NOT EXISTS nhatkyhethong (
  mank SERIAL PRIMARY KEY,
  matk VARCHAR(30) REFERENCES taikhoan(matk) ON DELETE SET NULL,
  hanhdong VARCHAR(120) NOT NULL,
  doituong VARCHAR(250) NOT NULL,
  thoigian VARCHAR(40) NOT NULL,
  chitiet JSONB,
  diachiip VARCHAR(64)
);

-- Bảng hệ thống 4: NGAYLE (Ngày lễ)
CREATE TABLE IF NOT EXISTS ngayle (
  ngay DATE PRIMARY KEY,
  tenngayle VARCHAR(120) NOT NULL
);

-- Bảng hệ thống 5: DANGNHAPTHATBAI (Giới hạn đăng nhập sai)
CREATE TABLE IF NOT EXISTS dangnhapthatbai (
  khoa VARCHAR(250) PRIMARY KEY,
  solansai INTEGER NOT NULL,
  khoaden BIGINT NOT NULL
);

-- Khóa ngoại trưởng phòng (tạo sau khi đã có bảng nhanvien)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'phongban' AND tc.constraint_type = 'FOREIGN KEY' AND k.column_name = 'matruongphong'
  ) THEN
    ALTER TABLE phongban ADD CONSTRAINT phongban_matruongphong_fkey
      FOREIGN KEY (matruongphong) REFERENCES nhanvien(manv) ON DELETE SET NULL;
  END IF;
END $$;

-- Ràng buộc giá trị (đặt lại tên theo bảng mới, xóa tên cũ nếu có)
ALTER TABLE nhanvien DROP CONSTRAINT IF EXISTS employees_status_check;
ALTER TABLE nhanvien DROP CONSTRAINT IF EXISTS nhanvien_status_check;
ALTER TABLE nhanvien DROP CONSTRAINT IF EXISTS nhanvien_trangthai_check;
ALTER TABLE nhanvien ADD CONSTRAINT nhanvien_trangthai_check
  CHECK (trangthai IN ('Đang làm việc', 'Thử việc', 'Đã nghỉ việc', 'Đã lưu trữ'));
ALTER TABLE quatrinhcongtac DROP CONSTRAINT IF EXISTS assignments_type_check;
ALTER TABLE quatrinhcongtac DROP CONSTRAINT IF EXISTS quatrinhcongtac_type_check;
ALTER TABLE quatrinhcongtac DROP CONSTRAINT IF EXISTS quatrinhcongtac_loaibiendong_check;
ALTER TABLE quatrinhcongtac ADD CONSTRAINT quatrinhcongtac_loaibiendong_check
  CHECK (loaibiendong IN ('Điều chuyển', 'Bổ nhiệm', 'Miễn nhiệm', 'Điều chuyển và bổ nhiệm'));

-- Mỗi nhân viên tối đa một tài khoản (liên kết 1-1 "Có tài khoản")
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('users_employee_unique', 'taikhoan_manv_unique'))
     AND NOT EXISTS (SELECT 1 FROM taikhoan GROUP BY manv HAVING COUNT(*) > 1) THEN
    ALTER TABLE taikhoan ADD CONSTRAINT taikhoan_manv_unique UNIQUE (manv);
  END IF;
END $$;

-- View v_songayphep (SoNgayDaNghi, SoNgayConLai) được tạo sau migration: xem LEAVE_BALANCE_VIEW trong migrations.ts.

-- Indexes phục vụ truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_nhanvien_mapb ON nhanvien(mapb);
CREATE INDEX IF NOT EXISTS idx_donnghiphep_manv ON donnghiphep(manv, tungay, denngay);
CREATE INDEX IF NOT EXISTS idx_hopdong_manv ON hopdong(manv);
CREATE INDEX IF NOT EXISTS idx_quatrinhcongtac_manv ON quatrinhcongtac(manv);
CREATE INDEX IF NOT EXISTS idx_quatrinhcongtac_cho ON quatrinhcongtac(trangthai, ngayhieuluc);
CREATE INDEX IF NOT EXISTS idx_phongban_matruongphong ON phongban(matruongphong);
CREATE INDEX IF NOT EXISTS idx_hopdong_maqdchamdut ON hopdong(maqdchamdut);
CREATE INDEX IF NOT EXISTS idx_nhatkyhethong_mank ON nhatkyhethong(mank DESC);
