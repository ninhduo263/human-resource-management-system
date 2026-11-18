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
    ('phongban', 'id', 'MaPB'), ('phongban', 'mapb', 'MaPB'), ('phongban', 'name', 'TenPB'), ('phongban', 'tenpb', 'TenPB'), ('phongban', 'description', 'MoTa'), ('phongban', 'mota', 'MoTa'),
    ('phongban', 'founded_date', 'NgayThanhLap'), ('phongban', 'ngaythanhlap', 'NgayThanhLap'), ('phongban', 'head_id', 'MaTruongPhong'), ('phongban', 'matruongphong', 'MaTruongPhong'),
    ('phongban', 'active', 'HoatDong'), ('phongban', 'hoatdong', 'HoatDong'),
    ('chucvu', 'id', 'MaCV'), ('chucvu', 'macv', 'MaCV'), ('chucvu', 'name', 'TenCV'), ('chucvu', 'tencv', 'TenCV'), ('chucvu', 'description', 'MoTa'), ('chucvu', 'mota', 'MoTa'),
    ('chucvu', 'level', 'CapBac'), ('chucvu', 'capbac', 'CapBac'), ('chucvu', 'is_executive', 'LaDieuHanh'), ('chucvu', 'ladieuhanh', 'LaDieuHanh'),
    ('chucvu', 'default_role', 'VaiTroMacDinh'), ('chucvu', 'vaitromacdinh', 'VaiTroMacDinh'), ('chucvu', 'active', 'HoatDong'), ('chucvu', 'hoatdong', 'HoatDong'),
    ('nhanvien', 'id', 'MaNV'), ('nhanvien', 'manv', 'MaNV'), ('nhanvien', 'name', 'HoTen'), ('nhanvien', 'hoten', 'HoTen'), ('nhanvien', 'birth_date', 'NgaySinh'), ('nhanvien', 'ngaysinh', 'NgaySinh'),
    ('nhanvien', 'gender', 'GioiTinh'), ('nhanvien', 'gioitinh', 'GioiTinh'), ('nhanvien', 'address', 'DiaChi'), ('nhanvien', 'diachi', 'DiaChi'), ('nhanvien', 'phone', 'SoDienThoai'), ('nhanvien', 'sodienthoai', 'SoDienThoai'),
    ('nhanvien', 'join_date', 'NgayVaoLam'), ('nhanvien', 'ngayvaolam', 'NgayVaoLam'), ('nhanvien', 'status', 'TrangThai'), ('nhanvien', 'trangthai', 'TrangThai'),
    ('nhanvien', 'archived_date', 'NgayLuuTru'), ('nhanvien', 'ngayluutru', 'NgayLuuTru'), ('nhanvien', 'department_id', 'MaPB'), ('nhanvien', 'mapb', 'MaPB'),
    ('nhanvien', 'position_id', 'MaCV'), ('nhanvien', 'macv', 'MaCV'), ('nhanvien', 'version', 'PhienBan'), ('nhanvien', 'phienban', 'PhienBan'), ('nhanvien', 'email', 'Email'),
    ('hopdong', 'id', 'MaHD'), ('hopdong', 'mahd', 'MaHD'), ('hopdong', 'employee_id', 'MaNV'), ('hopdong', 'manv', 'MaNV'), ('hopdong', 'type', 'LoaiHD'), ('hopdong', 'loaihd', 'LoaiHD'),
    ('hopdong', 'start_date', 'NgayBatDau'), ('hopdong', 'ngaybatdau', 'NgayBatDau'), ('hopdong', 'end_date', 'NgayKetThuc'), ('hopdong', 'ngayketthuc', 'NgayKetThuc'), ('hopdong', 'salary', 'MucLuong'), ('hopdong', 'mucluong', 'MucLuong'),
    ('hopdong', 'status', 'TrangThai'), ('hopdong', 'trangthai', 'TrangThai'), ('hopdong', 'terminated_date', 'NgayChamDut'), ('hopdong', 'ngaychamdut', 'NgayChamDut'),
    ('hopdong', 'termination_reason', 'LyDoChamDut'), ('hopdong', 'lydochamdut', 'LyDoChamDut'), ('hopdong', 'contract_number', 'SoHD'), ('hopdong', 'sohd', 'SoHD'),
    ('hopdong', 'termination_type', 'LoaiChamDut'), ('hopdong', 'loaichamdut', 'LoaiChamDut'), ('hopdong', 'termination_decision_id', 'MaQDChamDut'), ('hopdong', 'maqdchamdut', 'MaQDChamDut'),
    ('hopdong', 'original_end_date', 'NgayKetThucGoc'), ('hopdong', 'ngayketthucgoc', 'NgayKetThucGoc'),
    ('giahanhopdong', 'id', 'MaGH'), ('giahanhopdong', 'magh', 'MaGH'), ('giahanhopdong', 'contract_id', 'MaHD'), ('giahanhopdong', 'mahd', 'MaHD'),
    ('giahanhopdong', 'sequence', 'LanGiaHan'), ('giahanhopdong', 'langiahan', 'LanGiaHan'), ('giahanhopdong', 'created_date', 'NgayLap'), ('giahanhopdong', 'ngaylap', 'NgayLap'),
    ('giahanhopdong', 'old_end_date', 'NgayKetThucCu'), ('giahanhopdong', 'ngayketthuccu', 'NgayKetThucCu'), ('giahanhopdong', 'new_end_date', 'NgayKetThucMoi'), ('giahanhopdong', 'ngayketthucmoi', 'NgayKetThucMoi'),
    ('giahanhopdong', 'reason', 'LyDo'), ('giahanhopdong', 'lydo', 'LyDo'), ('giahanhopdong', 'amendment_type', 'LoaiPhuLuc'), ('giahanhopdong', 'loaiphuluc', 'LoaiPhuLuc'),
    ('giahanhopdong', 'old_salary', 'LuongCu'), ('giahanhopdong', 'luongcu', 'LuongCu'), ('giahanhopdong', 'new_salary', 'LuongMoi'), ('giahanhopdong', 'luongmoi', 'LuongMoi'),
    ('giahanhopdong', 'effective_date', 'NgayHieuLuc'), ('giahanhopdong', 'ngayhieuluc', 'NgayHieuLuc'), ('giahanhopdong', 'applied', 'DaApDung'), ('giahanhopdong', 'daapdung', 'DaApDung'),
    ('giahanhopdong', 'decision_id', 'MaQD'), ('giahanhopdong', 'maqd', 'MaQD'),
    ('quyetdinh', 'id', 'MaQD'), ('quyetdinh', 'maqd', 'MaQD'), ('quyetdinh', 'number', 'SoQD'), ('quyetdinh', 'soqd', 'SoQD'), ('quyetdinh', 'type', 'LoaiQD'), ('quyetdinh', 'loaiqd', 'LoaiQD'),
    ('quyetdinh', 'signed_date', 'NgayKy'), ('quyetdinh', 'ngayky', 'NgayKy'), ('quyetdinh', 'effective_date', 'NgayHieuLuc'), ('quyetdinh', 'ngayhieuluc', 'NgayHieuLuc'),
    ('quyetdinh', 'signer', 'NguoiKy'), ('quyetdinh', 'nguoiky', 'NguoiKy'), ('quyetdinh', 'content', 'NoiDung'), ('quyetdinh', 'noidung', 'NoiDung'),
    ('quatrinhcongtac', 'id', 'MaQT'), ('quatrinhcongtac', 'maqt', 'MaQT'), ('quatrinhcongtac', 'employee_id', 'MaNV'), ('quatrinhcongtac', 'manv', 'MaNV'),
    ('quatrinhcongtac', 'decision_id', 'MaQD'), ('quatrinhcongtac', 'maqd', 'MaQD'), ('quatrinhcongtac', 'type', 'LoaiBienDong'), ('quatrinhcongtac', 'loaibiendong', 'LoaiBienDong'),
    ('quatrinhcongtac', 'old_department_id', 'MaPBCu'), ('quatrinhcongtac', 'mapbcu', 'MaPBCu'), ('quatrinhcongtac', 'new_department_id', 'MaPBMoi'), ('quatrinhcongtac', 'mapbmoi', 'MaPBMoi'),
    ('quatrinhcongtac', 'old_position_id', 'MaCVCu'), ('quatrinhcongtac', 'macvcu', 'MaCVCu'), ('quatrinhcongtac', 'new_position_id', 'MaCVMoi'), ('quatrinhcongtac', 'macvmoi', 'MaCVMoi'),
    ('quatrinhcongtac', 'effective_date', 'NgayHieuLuc'), ('quatrinhcongtac', 'ngayhieuluc', 'NgayHieuLuc'), ('quatrinhcongtac', 'reason', 'LyDo'), ('quatrinhcongtac', 'lydo', 'LyDo'),
    ('quatrinhcongtac', 'status', 'TrangThai'), ('quatrinhcongtac', 'trangthai', 'TrangThai'), ('quatrinhcongtac', 'cancelled_date', 'NgayHuy'), ('quatrinhcongtac', 'ngayhuy', 'NgayHuy'),
    ('quatrinhcongtac', 'cancel_reason', 'LyDoHuy'), ('quatrinhcongtac', 'lydohuy', 'LyDoHuy'),
    ('loainghiphep', 'id', 'MaLoai'), ('loainghiphep', 'maloai', 'MaLoai'), ('loainghiphep', 'name', 'TenLoai'), ('loainghiphep', 'tenloai', 'TenLoai'),
    ('loainghiphep', 'max_days', 'SoNgayToiDa'), ('loainghiphep', 'songaytoida', 'SoNgayToiDa'), ('loainghiphep', 'deduct_annual', 'TruPhepNam'), ('loainghiphep', 'truphepnam', 'TruPhepNam'),
    ('donnghiphep', 'id', 'MaDon'), ('donnghiphep', 'madon', 'MaDon'), ('donnghiphep', 'employee_id', 'MaNV'), ('donnghiphep', 'manv', 'MaNV'), ('donnghiphep', 'type_id', 'MaLoai'), ('donnghiphep', 'maloai', 'MaLoai'),
    ('donnghiphep', 'submitted_date', 'NgayNop'), ('donnghiphep', 'ngaynop', 'NgayNop'), ('donnghiphep', 'start_date', 'TuNgay'), ('donnghiphep', 'tungay', 'TuNgay'),
    ('donnghiphep', 'end_date', 'DenNgay'), ('donnghiphep', 'denngay', 'DenNgay'), ('donnghiphep', 'days', 'SoNgay'), ('donnghiphep', 'songay', 'SoNgay'), ('donnghiphep', 'reason', 'LyDo'), ('donnghiphep', 'lydo', 'LyDo'),
    ('donnghiphep', 'status', 'TrangThai'), ('donnghiphep', 'trangthai', 'TrangThai'), ('donnghiphep', 'approver_id', 'MaNVDuyet'), ('donnghiphep', 'manvduyet', 'MaNVDuyet'),
    ('donnghiphep', 'approved_date', 'NgayDuyet'), ('donnghiphep', 'ngayduyet', 'NgayDuyet'), ('donnghiphep', 'review_note', 'GhiChuDuyet'), ('donnghiphep', 'ghichuduyet', 'GhiChuDuyet'),
    ('songayphep', 'employee_id', 'MaNV'), ('songayphep', 'manv', 'MaNV'), ('songayphep', 'year', 'Nam'), ('songayphep', 'nam', 'Nam'), ('songayphep', 'total', 'TongSoNgayPhep'), ('songayphep', 'tongsongayphep', 'TongSoNgayPhep'),
    ('taikhoan', 'id', 'MaTK'), ('taikhoan', 'matk', 'MaTK'), ('taikhoan', 'username', 'TenDangNhap'), ('taikhoan', 'tendangnhap', 'TenDangNhap'), ('taikhoan', 'password_hash', 'MatKhau'), ('taikhoan', 'matkhau', 'MatKhau'),
    ('taikhoan', 'role', 'VaiTro'), ('taikhoan', 'vaitro', 'VaiTro'), ('taikhoan', 'employee_id', 'MaNV'), ('taikhoan', 'manv', 'MaNV'), ('taikhoan', 'active', 'HoatDong'), ('taikhoan', 'hoatdong', 'HoatDong'),
    ('phiendangnhap', 'token_hash', 'MaPhien'), ('phiendangnhap', 'maphien', 'MaPhien'), ('phiendangnhap', 'user_id', 'MaTK'), ('phiendangnhap', 'matk', 'MaTK'),
    ('phiendangnhap', 'expires', 'ThoiHan'), ('phiendangnhap', 'thoihan', 'ThoiHan'),
    ('nhatkyhethong', 'id', 'MaNK'), ('nhatkyhethong', 'mank', 'MaNK'), ('nhatkyhethong', 'user_id', 'MaTK'), ('nhatkyhethong', 'matk', 'MaTK'), ('nhatkyhethong', 'action', 'HanhDong'), ('nhatkyhethong', 'hanhdong', 'HanhDong'),
    ('nhatkyhethong', 'target', 'DoiTuong'), ('nhatkyhethong', 'doituong', 'DoiTuong'), ('nhatkyhethong', 'created_at', 'ThoiGian'), ('nhatkyhethong', 'thoigian', 'ThoiGian'),
    ('nhatkyhethong', 'details', 'ChiTiet'), ('nhatkyhethong', 'chitiet', 'ChiTiet'), ('nhatkyhethong', 'ip', 'DiaChiIP'), ('nhatkyhethong', 'diachiip', 'DiaChiIP'),
    ('ngayle', 'day', 'Ngay'), ('ngayle', 'ngay', 'Ngay'), ('ngayle', 'name', 'TenNgayLe'), ('ngayle', 'tenngayle', 'TenNgayLe'),
    ('dangnhapthatbai', 'key', 'Khoa'), ('dangnhapthatbai', 'khoa', 'Khoa'), ('dangnhapthatbai', 'count', 'SoLanSai'), ('dangnhapthatbai', 'solansai', 'SoLanSai'),
    ('dangnhapthatbai', 'until', 'KhoaDen'), ('dangnhapthatbai', 'khoaden', 'KhoaDen')
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
  "MaPB" VARCHAR(25) PRIMARY KEY,
  "TenPB" VARCHAR(120) NOT NULL UNIQUE,
  "MoTa" TEXT NOT NULL DEFAULT '',
  "NgayThanhLap" DATE NOT NULL,
  "MaTruongPhong" VARCHAR(25),
  "HoatDong" BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2. CHUCVU (Chức vụ)
CREATE TABLE IF NOT EXISTS chucvu (
  "MaCV" VARCHAR(25) PRIMARY KEY,
  "TenCV" VARCHAR(120) NOT NULL UNIQUE,
  "MoTa" TEXT NOT NULL DEFAULT '',
  "CapBac" INTEGER NOT NULL DEFAULT 2 CHECK ("CapBac" BETWEEN 1 AND 10),
  "LaDieuHanh" BOOLEAN NOT NULL DEFAULT FALSE,
  "VaiTroMacDinh" VARCHAR(20)
    CHECK ("VaiTroMacDinh" IS NULL OR "VaiTroMacDinh" IN ('admin', 'hr', 'manager', 'employee', 'director')),
  "HoatDong" BOOLEAN NOT NULL DEFAULT TRUE
);

-- 3. NHANVIEN (Nhân viên)
CREATE TABLE IF NOT EXISTS nhanvien (
  "MaNV" VARCHAR(25) PRIMARY KEY,
  "HoTen" VARCHAR(120) NOT NULL,
  "NgaySinh" DATE NOT NULL,
  "GioiTinh" VARCHAR(10) NOT NULL CHECK ("GioiTinh" IN ('Nam', 'Nữ', 'Khác')),
  "DiaChi" TEXT NOT NULL DEFAULT '',
  "SoDienThoai" VARCHAR(20) NOT NULL,
  "Email" VARCHAR(150) NOT NULL UNIQUE,
  "NgayVaoLam" DATE NOT NULL,
  "TrangThai" VARCHAR(30) NOT NULL,
  "NgayLuuTru" DATE,
  "MaPB" VARCHAR(25) REFERENCES phongban("MaPB") ON DELETE RESTRICT,
  "MaCV" VARCHAR(25) NOT NULL REFERENCES chucvu("MaCV") ON DELETE RESTRICT,
  "PhienBan" INTEGER NOT NULL DEFAULT 1
);

-- 4. QUYETDINH (Quyết định)
CREATE TABLE IF NOT EXISTS quyetdinh (
  "MaQD" VARCHAR(30) PRIMARY KEY,
  "SoQD" VARCHAR(60) NOT NULL UNIQUE,
  "LoaiQD" VARCHAR(40) NOT NULL,
  "NgayKy" DATE NOT NULL,
  "NgayHieuLuc" DATE NOT NULL,
  "NguoiKy" VARCHAR(120) NOT NULL,
  "NoiDung" TEXT NOT NULL
);

-- 5. HOPDONG (Hợp đồng lao động)
CREATE TABLE IF NOT EXISTS hopdong (
  "MaHD" VARCHAR(30) PRIMARY KEY,
  "MaNV" VARCHAR(25) NOT NULL REFERENCES nhanvien("MaNV") ON DELETE RESTRICT,
  "LoaiHD" VARCHAR(40) NOT NULL CHECK ("LoaiHD" IN ('Thử việc', 'Xác định thời hạn', 'Không xác định thời hạn')),
  "NgayBatDau" DATE NOT NULL,
  "NgayKetThuc" DATE,
  "MucLuong" NUMERIC(15,2) NOT NULL CHECK ("MucLuong" > 0),
  "TrangThai" VARCHAR(30) NOT NULL DEFAULT 'Hiệu lực',
  "NgayChamDut" DATE,
  "LyDoChamDut" TEXT,
  "SoHD" VARCHAR(60),
  "LoaiChamDut" VARCHAR(40),
  "MaQDChamDut" VARCHAR(30) REFERENCES quyetdinh("MaQD") ON DELETE SET NULL,
  "NgayKetThucGoc" DATE
);

-- 6. GIAHANHOPDONG (Gia hạn / phụ lục hợp đồng)
CREATE TABLE IF NOT EXISTS giahanhopdong (
  "MaGH" VARCHAR(30) PRIMARY KEY,
  "MaHD" VARCHAR(30) NOT NULL REFERENCES hopdong("MaHD") ON DELETE RESTRICT,
  "LanGiaHan" INTEGER NOT NULL,
  "NgayLap" DATE NOT NULL,
  "NgayKetThucCu" DATE,
  "NgayKetThucMoi" DATE,
  "LyDo" TEXT NOT NULL,
  "LoaiPhuLuc" VARCHAR(40) NOT NULL DEFAULT 'Gia hạn',
  "LuongCu" NUMERIC(15,2),
  "LuongMoi" NUMERIC(15,2),
  "NgayHieuLuc" DATE,
  "DaApDung" BOOLEAN NOT NULL DEFAULT TRUE,
  "MaQD" VARCHAR(30) REFERENCES quyetdinh("MaQD") ON DELETE SET NULL,
  UNIQUE ("MaHD", "LanGiaHan")
);

-- 7. QUATRINHCONGTAC (Quá trình công tác)
CREATE TABLE IF NOT EXISTS quatrinhcongtac (
  "MaQT" VARCHAR(30) PRIMARY KEY,
  "MaNV" VARCHAR(25) NOT NULL REFERENCES nhanvien("MaNV") ON DELETE RESTRICT,
  "MaQD" VARCHAR(30) NOT NULL REFERENCES quyetdinh("MaQD") ON DELETE RESTRICT,
  "LoaiBienDong" VARCHAR(40) NOT NULL,
  "MaPBCu" VARCHAR(25) REFERENCES phongban("MaPB") ON DELETE RESTRICT,
  "MaPBMoi" VARCHAR(25) NOT NULL REFERENCES phongban("MaPB") ON DELETE RESTRICT,
  "MaCVCu" VARCHAR(25) REFERENCES chucvu("MaCV") ON DELETE RESTRICT,
  "MaCVMoi" VARCHAR(25) NOT NULL REFERENCES chucvu("MaCV") ON DELETE RESTRICT,
  "NgayHieuLuc" DATE NOT NULL,
  "LyDo" TEXT NOT NULL,
  "TrangThai" VARCHAR(20) NOT NULL DEFAULT 'Hiệu lực',
  "NgayHuy" DATE,
  "LyDoHuy" TEXT
);

-- 8. LOAINGHIPHEP (Loại nghỉ phép)
CREATE TABLE IF NOT EXISTS loainghiphep (
  "MaLoai" VARCHAR(25) PRIMARY KEY,
  "TenLoai" VARCHAR(100) NOT NULL,
  "SoNgayToiDa" INTEGER NOT NULL CHECK ("SoNgayToiDa" > 0),
  "TruPhepNam" INTEGER NOT NULL DEFAULT 1 CHECK ("TruPhepNam" IN (0, 1))
);

-- 9. DONNGHIPHEP (Đơn nghỉ phép)
CREATE TABLE IF NOT EXISTS donnghiphep (
  "MaDon" VARCHAR(30) PRIMARY KEY,
  "MaNV" VARCHAR(25) NOT NULL REFERENCES nhanvien("MaNV") ON DELETE RESTRICT,
  "MaLoai" VARCHAR(25) NOT NULL REFERENCES loainghiphep("MaLoai") ON DELETE RESTRICT,
  "NgayNop" DATE NOT NULL,
  "TuNgay" DATE NOT NULL,
  "DenNgay" DATE NOT NULL,
  "SoNgay" INTEGER NOT NULL CHECK ("SoNgay" > 0),
  "LyDo" TEXT NOT NULL,
  "TrangThai" VARCHAR(30) NOT NULL DEFAULT 'Chờ duyệt'
    CHECK ("TrangThai" IN ('Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Đã hủy')),
  "MaNVDuyet" VARCHAR(25) REFERENCES nhanvien("MaNV") ON DELETE RESTRICT,
  "NgayDuyet" DATE,
  "GhiChuDuyet" TEXT
);

-- 10. SONGAYPHEP (Số ngày phép năm; số ngày đã nghỉ/còn lại tính ở view v_songayphep)
CREATE TABLE IF NOT EXISTS songayphep (
  "MaNV" VARCHAR(25) NOT NULL REFERENCES nhanvien("MaNV") ON DELETE RESTRICT,
  "Nam" INTEGER NOT NULL,
  "TongSoNgayPhep" INTEGER NOT NULL DEFAULT 12 CHECK ("TongSoNgayPhep" >= 0),
  PRIMARY KEY ("MaNV", "Nam")
);

-- Bảng hệ thống 1: TAIKHOAN (Tài khoản & Phân quyền)
CREATE TABLE IF NOT EXISTS taikhoan (
  "MaTK" VARCHAR(30) PRIMARY KEY,
  "TenDangNhap" VARCHAR(150) NOT NULL UNIQUE,
  "MatKhau" TEXT NOT NULL,
  "VaiTro" VARCHAR(20) NOT NULL CHECK ("VaiTro" IN ('admin', 'hr', 'manager', 'employee', 'director')),
  "MaNV" VARCHAR(25) NOT NULL REFERENCES nhanvien("MaNV") ON DELETE RESTRICT,
  "HoatDong" INTEGER NOT NULL DEFAULT 1
);

-- Bảng hệ thống 2: PHIENDANGNHAP (Phiên đăng nhập)
CREATE TABLE IF NOT EXISTS phiendangnhap (
  "MaPhien" VARCHAR(64) PRIMARY KEY,
  "MaTK" VARCHAR(30) NOT NULL REFERENCES taikhoan("MaTK") ON DELETE CASCADE,
  "ThoiHan" BIGINT NOT NULL
);

-- Bảng hệ thống 3: NHATKYHETHONG (Nhật ký hệ thống)
CREATE TABLE IF NOT EXISTS nhatkyhethong (
  "MaNK" SERIAL PRIMARY KEY,
  "MaTK" VARCHAR(30) REFERENCES taikhoan("MaTK") ON DELETE SET NULL,
  "HanhDong" VARCHAR(120) NOT NULL,
  "DoiTuong" VARCHAR(250) NOT NULL,
  "ThoiGian" VARCHAR(40) NOT NULL,
  "ChiTiet" JSONB,
  "DiaChiIP" VARCHAR(64)
);

-- Bảng hệ thống 4: NGAYLE (Ngày lễ)
CREATE TABLE IF NOT EXISTS ngayle (
  "Ngay" DATE PRIMARY KEY,
  "TenNgayLe" VARCHAR(120) NOT NULL
);

-- Bảng hệ thống 5: DANGNHAPTHATBAI (Giới hạn đăng nhập sai)
CREATE TABLE IF NOT EXISTS dangnhapthatbai (
  "Khoa" VARCHAR(250) PRIMARY KEY,
  "SoLanSai" INTEGER NOT NULL,
  "KhoaDen" BIGINT NOT NULL
);

-- Khóa ngoại trưởng phòng (tạo sau khi đã có bảng nhanvien)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'phongban' AND tc.constraint_type = 'FOREIGN KEY' AND k.column_name = 'MaTruongPhong'
  ) THEN
    ALTER TABLE phongban ADD CONSTRAINT phongban_matruongphong_fkey
      FOREIGN KEY ("MaTruongPhong") REFERENCES nhanvien("MaNV") ON DELETE SET NULL;
  END IF;
END $$;

-- Ràng buộc giá trị (đặt lại tên theo bảng mới, xóa tên cũ nếu có)
ALTER TABLE nhanvien DROP CONSTRAINT IF EXISTS employees_status_check;
ALTER TABLE nhanvien DROP CONSTRAINT IF EXISTS nhanvien_status_check;
ALTER TABLE nhanvien DROP CONSTRAINT IF EXISTS nhanvien_trangthai_check;
ALTER TABLE nhanvien ADD CONSTRAINT nhanvien_trangthai_check
  CHECK ("TrangThai" IN ('Đang làm việc', 'Thử việc', 'Đã nghỉ việc', 'Đã lưu trữ'));
ALTER TABLE quatrinhcongtac DROP CONSTRAINT IF EXISTS assignments_type_check;
ALTER TABLE quatrinhcongtac DROP CONSTRAINT IF EXISTS quatrinhcongtac_type_check;
ALTER TABLE quatrinhcongtac DROP CONSTRAINT IF EXISTS quatrinhcongtac_loaibiendong_check;
ALTER TABLE quatrinhcongtac ADD CONSTRAINT quatrinhcongtac_loaibiendong_check
  CHECK ("LoaiBienDong" IN ('Điều chuyển', 'Bổ nhiệm', 'Miễn nhiệm', 'Điều chuyển và bổ nhiệm'));

-- Mỗi nhân viên tối đa một tài khoản (liên kết 1-1 "Có tài khoản")
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('users_employee_unique', 'taikhoan_manv_unique'))
     AND NOT EXISTS (SELECT 1 FROM taikhoan GROUP BY "MaNV" HAVING COUNT(*) > 1) THEN
    ALTER TABLE taikhoan ADD CONSTRAINT taikhoan_manv_unique UNIQUE ("MaNV");
  END IF;
END $$;

-- View v_songayphep (SoNgayDaNghi, SoNgayConLai) được tạo sau migration: xem LEAVE_BALANCE_VIEW trong migrations.ts.

-- Indexes phục vụ truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_nhanvien_mapb ON nhanvien("MaPB");
CREATE INDEX IF NOT EXISTS idx_donnghiphep_manv ON donnghiphep("MaNV", "TuNgay", "DenNgay");
CREATE INDEX IF NOT EXISTS idx_hopdong_manv ON hopdong("MaNV");
CREATE INDEX IF NOT EXISTS idx_quatrinhcongtac_manv ON quatrinhcongtac("MaNV");
CREATE INDEX IF NOT EXISTS idx_quatrinhcongtac_cho ON quatrinhcongtac("TrangThai", "NgayHieuLuc");
CREATE INDEX IF NOT EXISTS idx_phongban_matruongphong ON phongban("MaTruongPhong");
CREATE INDEX IF NOT EXISTS idx_hopdong_maqdchamdut ON hopdong("MaQDChamDut");
CREATE INDEX IF NOT EXISTS idx_nhatkyhethong_mank ON nhatkyhethong("MaNK" DESC);
