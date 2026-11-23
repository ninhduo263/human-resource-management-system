-- ============================================================================
-- PeopleOps HRMS - Nhom 16
-- PostgreSQL Schema ánh xạ trực tiếp từ diagrams/erd.drawio:
--   10 thực thể nghiệp vụ + 5 thực thể hệ thống (TAIKHOAN, PHIENDANGNHAP,
--   NHATKYHETHONG, NGAYLE, DANGNHAPTHATBAI).
-- Tên bảng viết IN HOA và tên cột viết PascalCase có dấu ngoặc kép trùng khớp
-- 100% với tên thực thể/thuộc tính trong ERD (ví dụ "NHANVIEN"."MaNV").
-- ============================================================================

-- Đổi tên bảng cũ (tiếng Anh) sang tên tiếng Việt cho database đã khởi tạo trước đây.
-- Chạy trước mọi CREATE TABLE để không sinh bảng rỗng trùng tên.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('departments', 'PHONGBAN'), ('phongban', 'PHONGBAN'),
    ('positions', 'CHUCVU'), ('chucvu', 'CHUCVU'),
    ('employees', 'NHANVIEN'), ('nhanvien', 'NHANVIEN'),
    ('contracts', 'HOPDONG'), ('hopdong', 'HOPDONG'),
    ('extensions', 'GIAHANHOPDONG'), ('giahanhopdong', 'GIAHANHOPDONG'),
    ('decisions', 'QUYETDINH'), ('quyetdinh', 'QUYETDINH'),
    ('assignments', 'QUATRINHCONGTAC'), ('quatrinhcongtac', 'QUATRINHCONGTAC'),
    ('leave_types', 'LOAINGHIPHEP'), ('loainghiphep', 'LOAINGHIPHEP'),
    ('leave_requests', 'DONNGHIPHEP'), ('donnghiphep', 'DONNGHIPHEP'),
    ('leave_balances', 'SONGAYPHEP'), ('songayphep', 'SONGAYPHEP'),
    ('users', 'TAIKHOAN'), ('taikhoan', 'TAIKHOAN'),
    ('sessions', 'PHIENDANGNHAP'), ('phiendangnhap', 'PHIENDANGNHAP'),
    ('audit_log', 'NHATKYHETHONG'), ('nhatkyhethong', 'NHATKYHETHONG'),
    ('holidays', 'NGAYLE'), ('ngayle', 'NGAYLE'),
    ('login_attempts', 'DANGNHAPTHATBAI'), ('dangnhapthatbai', 'DANGNHAPTHATBAI')
  ) AS m(old_name, new_name)
  LOOP
    IF to_regclass('public.' || quote_ident(r.old_name)) IS NOT NULL
       AND to_regclass('public.' || quote_ident(r.new_name)) IS NULL THEN
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
    ('PHONGBAN', 'id', 'MaPB'), ('PHONGBAN', 'mapb', 'MaPB'), ('PHONGBAN', 'name', 'TenPB'), ('PHONGBAN', 'tenpb', 'TenPB'), ('PHONGBAN', 'description', 'MoTa'), ('PHONGBAN', 'mota', 'MoTa'),
    ('PHONGBAN', 'founded_date', 'NgayThanhLap'), ('PHONGBAN', 'ngaythanhlap', 'NgayThanhLap'), ('PHONGBAN', 'head_id', 'MaTruongPhong'), ('PHONGBAN', 'matruongphong', 'MaTruongPhong'),
    ('PHONGBAN', 'active', 'HoatDong'), ('PHONGBAN', 'hoatdong', 'HoatDong'),
    ('CHUCVU', 'id', 'MaCV'), ('CHUCVU', 'macv', 'MaCV'), ('CHUCVU', 'name', 'TenCV'), ('CHUCVU', 'tencv', 'TenCV'), ('CHUCVU', 'description', 'MoTa'), ('CHUCVU', 'mota', 'MoTa'),
    ('CHUCVU', 'level', 'CapBac'), ('CHUCVU', 'capbac', 'CapBac'), ('CHUCVU', 'is_executive', 'LaDieuHanh'), ('CHUCVU', 'ladieuhanh', 'LaDieuHanh'),
    ('CHUCVU', 'default_role', 'VaiTroMacDinh'), ('CHUCVU', 'vaitromacdinh', 'VaiTroMacDinh'), ('CHUCVU', 'active', 'HoatDong'), ('CHUCVU', 'hoatdong', 'HoatDong'),
    ('NHANVIEN', 'id', 'MaNV'), ('NHANVIEN', 'manv', 'MaNV'), ('NHANVIEN', 'name', 'HoTen'), ('NHANVIEN', 'hoten', 'HoTen'), ('NHANVIEN', 'birth_date', 'NgaySinh'), ('NHANVIEN', 'ngaysinh', 'NgaySinh'),
    ('NHANVIEN', 'gender', 'GioiTinh'), ('NHANVIEN', 'gioitinh', 'GioiTinh'), ('NHANVIEN', 'address', 'DiaChi'), ('NHANVIEN', 'diachi', 'DiaChi'), ('NHANVIEN', 'phone', 'SoDienThoai'), ('NHANVIEN', 'sodienthoai', 'SoDienThoai'),
    ('NHANVIEN', 'join_date', 'NgayVaoLam'), ('NHANVIEN', 'ngayvaolam', 'NgayVaoLam'), ('NHANVIEN', 'status', 'TrangThai'), ('NHANVIEN', 'trangthai', 'TrangThai'),
    ('NHANVIEN', 'archived_date', 'NgayLuuTru'), ('NHANVIEN', 'ngayluutru', 'NgayLuuTru'), ('NHANVIEN', 'department_id', 'MaPB'), ('NHANVIEN', 'mapb', 'MaPB'),
    ('NHANVIEN', 'position_id', 'MaCV'), ('NHANVIEN', 'macv', 'MaCV'), ('NHANVIEN', 'version', 'PhienBan'), ('NHANVIEN', 'phienban', 'PhienBan'), ('NHANVIEN', 'email', 'Email'),
    ('HOPDONG', 'id', 'MaHD'), ('HOPDONG', 'mahd', 'MaHD'), ('HOPDONG', 'employee_id', 'MaNV'), ('HOPDONG', 'manv', 'MaNV'), ('HOPDONG', 'type', 'LoaiHD'), ('HOPDONG', 'loaihd', 'LoaiHD'),
    ('HOPDONG', 'start_date', 'NgayBatDau'), ('HOPDONG', 'ngaybatdau', 'NgayBatDau'), ('HOPDONG', 'end_date', 'NgayKetThuc'), ('HOPDONG', 'ngayketthuc', 'NgayKetThuc'), ('HOPDONG', 'salary', 'MucLuong'), ('HOPDONG', 'mucluong', 'MucLuong'),
    ('HOPDONG', 'status', 'TrangThai'), ('HOPDONG', 'trangthai', 'TrangThai'), ('HOPDONG', 'terminated_date', 'NgayChamDut'), ('HOPDONG', 'ngaychamdut', 'NgayChamDut'),
    ('HOPDONG', 'termination_reason', 'LyDoChamDut'), ('HOPDONG', 'lydochamdut', 'LyDoChamDut'), ('HOPDONG', 'contract_number', 'SoHD'), ('HOPDONG', 'sohd', 'SoHD'),
    ('HOPDONG', 'termination_type', 'LoaiChamDut'), ('HOPDONG', 'loaichamdut', 'LoaiChamDut'), ('HOPDONG', 'termination_decision_id', 'MaQDChamDut'), ('HOPDONG', 'maqdchamdut', 'MaQDChamDut'),
    ('HOPDONG', 'original_end_date', 'NgayKetThucGoc'), ('HOPDONG', 'ngayketthucgoc', 'NgayKetThucGoc'),
    ('GIAHANHOPDONG', 'id', 'MaGH'), ('GIAHANHOPDONG', 'magh', 'MaGH'), ('GIAHANHOPDONG', 'contract_id', 'MaHD'), ('GIAHANHOPDONG', 'mahd', 'MaHD'),
    ('GIAHANHOPDONG', 'sequence', 'LanGiaHan'), ('GIAHANHOPDONG', 'langiahan', 'LanGiaHan'), ('GIAHANHOPDONG', 'created_date', 'NgayLap'), ('GIAHANHOPDONG', 'ngaylap', 'NgayLap'),
    ('GIAHANHOPDONG', 'old_end_date', 'NgayKetThucCu'), ('GIAHANHOPDONG', 'ngayketthuccu', 'NgayKetThucCu'), ('GIAHANHOPDONG', 'new_end_date', 'NgayKetThucMoi'), ('GIAHANHOPDONG', 'ngayketthucmoi', 'NgayKetThucMoi'),
    ('GIAHANHOPDONG', 'reason', 'LyDo'), ('GIAHANHOPDONG', 'lydo', 'LyDo'), ('GIAHANHOPDONG', 'amendment_type', 'LoaiPhuLuc'), ('GIAHANHOPDONG', 'loaiphuluc', 'LoaiPhuLuc'),
    ('GIAHANHOPDONG', 'old_salary', 'LuongCu'), ('GIAHANHOPDONG', 'luongcu', 'LuongCu'), ('GIAHANHOPDONG', 'new_salary', 'LuongMoi'), ('GIAHANHOPDONG', 'luongmoi', 'LuongMoi'),
    ('GIAHANHOPDONG', 'effective_date', 'NgayHieuLuc'), ('GIAHANHOPDONG', 'ngayhieuluc', 'NgayHieuLuc'), ('GIAHANHOPDONG', 'applied', 'DaApDung'), ('GIAHANHOPDONG', 'daapdung', 'DaApDung'),
    ('GIAHANHOPDONG', 'decision_id', 'MaQD'), ('GIAHANHOPDONG', 'maqd', 'MaQD'),
    ('QUYETDINH', 'id', 'MaQD'), ('QUYETDINH', 'maqd', 'MaQD'), ('QUYETDINH', 'number', 'SoQD'), ('QUYETDINH', 'soqd', 'SoQD'), ('QUYETDINH', 'type', 'LoaiQD'), ('QUYETDINH', 'loaiqd', 'LoaiQD'),
    ('QUYETDINH', 'signed_date', 'NgayKy'), ('QUYETDINH', 'ngayky', 'NgayKy'), ('QUYETDINH', 'effective_date', 'NgayHieuLuc'), ('QUYETDINH', 'ngayhieuluc', 'NgayHieuLuc'),
    ('QUYETDINH', 'signer', 'NguoiKy'), ('QUYETDINH', 'nguoiky', 'NguoiKy'), ('QUYETDINH', 'content', 'NoiDung'), ('QUYETDINH', 'noidung', 'NoiDung'),
    ('QUATRINHCONGTAC', 'id', 'MaQT'), ('QUATRINHCONGTAC', 'maqt', 'MaQT'), ('QUATRINHCONGTAC', 'employee_id', 'MaNV'), ('QUATRINHCONGTAC', 'manv', 'MaNV'),
    ('QUATRINHCONGTAC', 'decision_id', 'MaQD'), ('QUATRINHCONGTAC', 'maqd', 'MaQD'), ('QUATRINHCONGTAC', 'type', 'LoaiBienDong'), ('QUATRINHCONGTAC', 'loaibiendong', 'LoaiBienDong'),
    ('QUATRINHCONGTAC', 'old_department_id', 'MaPBCu'), ('QUATRINHCONGTAC', 'mapbcu', 'MaPBCu'), ('QUATRINHCONGTAC', 'new_department_id', 'MaPBMoi'), ('QUATRINHCONGTAC', 'mapbmoi', 'MaPBMoi'),
    ('QUATRINHCONGTAC', 'old_position_id', 'MaCVCu'), ('QUATRINHCONGTAC', 'macvcu', 'MaCVCu'), ('QUATRINHCONGTAC', 'new_position_id', 'MaCVMoi'), ('QUATRINHCONGTAC', 'macvmoi', 'MaCVMoi'),
    ('QUATRINHCONGTAC', 'effective_date', 'NgayHieuLuc'), ('QUATRINHCONGTAC', 'ngayhieuluc', 'NgayHieuLuc'), ('QUATRINHCONGTAC', 'reason', 'LyDo'), ('QUATRINHCONGTAC', 'lydo', 'LyDo'),
    ('QUATRINHCONGTAC', 'status', 'TrangThai'), ('QUATRINHCONGTAC', 'trangthai', 'TrangThai'), ('QUATRINHCONGTAC', 'cancelled_date', 'NgayHuy'), ('QUATRINHCONGTAC', 'ngayhuy', 'NgayHuy'),
    ('QUATRINHCONGTAC', 'cancel_reason', 'LyDoHuy'), ('QUATRINHCONGTAC', 'lydohuy', 'LyDoHuy'),
    ('LOAINGHIPHEP', 'id', 'MaLoai'), ('LOAINGHIPHEP', 'maloai', 'MaLoai'), ('LOAINGHIPHEP', 'name', 'TenLoai'), ('LOAINGHIPHEP', 'tenloai', 'TenLoai'),
    ('LOAINGHIPHEP', 'max_days', 'SoNgayToiDa'), ('LOAINGHIPHEP', 'songaytoida', 'SoNgayToiDa'), ('LOAINGHIPHEP', 'deduct_annual', 'TruPhepNam'), ('LOAINGHIPHEP', 'truphepnam', 'TruPhepNam'),
    ('DONNGHIPHEP', 'id', 'MaDon'), ('DONNGHIPHEP', 'madon', 'MaDon'), ('DONNGHIPHEP', 'employee_id', 'MaNV'), ('DONNGHIPHEP', 'manv', 'MaNV'), ('DONNGHIPHEP', 'type_id', 'MaLoai'), ('DONNGHIPHEP', 'maloai', 'MaLoai'),
    ('DONNGHIPHEP', 'submitted_date', 'NgayNop'), ('DONNGHIPHEP', 'ngaynop', 'NgayNop'), ('DONNGHIPHEP', 'start_date', 'TuNgay'), ('DONNGHIPHEP', 'tungay', 'TuNgay'),
    ('DONNGHIPHEP', 'end_date', 'DenNgay'), ('DONNGHIPHEP', 'denngay', 'DenNgay'), ('DONNGHIPHEP', 'days', 'SoNgay'), ('DONNGHIPHEP', 'songay', 'SoNgay'), ('DONNGHIPHEP', 'reason', 'LyDo'), ('DONNGHIPHEP', 'lydo', 'LyDo'),
    ('DONNGHIPHEP', 'status', 'TrangThai'), ('DONNGHIPHEP', 'trangthai', 'TrangThai'), ('DONNGHIPHEP', 'approver_id', 'MaNVDuyet'), ('DONNGHIPHEP', 'manvduyet', 'MaNVDuyet'),
    ('DONNGHIPHEP', 'approved_date', 'NgayDuyet'), ('DONNGHIPHEP', 'ngayduyet', 'NgayDuyet'), ('DONNGHIPHEP', 'review_note', 'GhiChuDuyet'), ('DONNGHIPHEP', 'ghichuduyet', 'GhiChuDuyet'),
    ('SONGAYPHEP', 'employee_id', 'MaNV'), ('SONGAYPHEP', 'manv', 'MaNV'), ('SONGAYPHEP', 'year', 'Nam'), ('SONGAYPHEP', 'nam', 'Nam'), ('SONGAYPHEP', 'total', 'TongSoNgayPhep'), ('SONGAYPHEP', 'tongsongayphep', 'TongSoNgayPhep'),
    ('TAIKHOAN', 'id', 'MaTK'), ('TAIKHOAN', 'matk', 'MaTK'), ('TAIKHOAN', 'username', 'TenDangNhap'), ('TAIKHOAN', 'tendangnhap', 'TenDangNhap'), ('TAIKHOAN', 'password_hash', 'MatKhau'), ('TAIKHOAN', 'matkhau', 'MatKhau'),
    ('TAIKHOAN', 'role', 'VaiTro'), ('TAIKHOAN', 'vaitro', 'VaiTro'), ('TAIKHOAN', 'employee_id', 'MaNV'), ('TAIKHOAN', 'manv', 'MaNV'), ('TAIKHOAN', 'active', 'HoatDong'), ('TAIKHOAN', 'hoatdong', 'HoatDong'),
    ('PHIENDANGNHAP', 'token_hash', 'MaPhien'), ('PHIENDANGNHAP', 'maphien', 'MaPhien'), ('PHIENDANGNHAP', 'user_id', 'MaTK'), ('PHIENDANGNHAP', 'matk', 'MaTK'),
    ('PHIENDANGNHAP', 'expires', 'ThoiHan'), ('PHIENDANGNHAP', 'thoihan', 'ThoiHan'),
    ('NHATKYHETHONG', 'id', 'MaNK'), ('NHATKYHETHONG', 'mank', 'MaNK'), ('NHATKYHETHONG', 'user_id', 'MaTK'), ('NHATKYHETHONG', 'matk', 'MaTK'), ('NHATKYHETHONG', 'action', 'HanhDong'), ('NHATKYHETHONG', 'hanhdong', 'HanhDong'),
    ('NHATKYHETHONG', 'target', 'DoiTuong'), ('NHATKYHETHONG', 'doituong', 'DoiTuong'), ('NHATKYHETHONG', 'created_at', 'ThoiGian'), ('NHATKYHETHONG', 'thoigian', 'ThoiGian'),
    ('NHATKYHETHONG', 'details', 'ChiTiet'), ('NHATKYHETHONG', 'chitiet', 'ChiTiet'), ('NHATKYHETHONG', 'ip', 'DiaChiIP'), ('NHATKYHETHONG', 'diachiip', 'DiaChiIP'),
    ('NGAYLE', 'day', 'Ngay'), ('NGAYLE', 'ngay', 'Ngay'), ('NGAYLE', 'name', 'TenNgayLe'), ('NGAYLE', 'tenngayle', 'TenNgayLe'),
    ('DANGNHAPTHATBAI', 'key', 'Khoa'), ('DANGNHAPTHATBAI', 'khoa', 'Khoa'), ('DANGNHAPTHATBAI', 'count', 'SoLanSai'), ('DANGNHAPTHATBAI', 'solansai', 'SoLanSai'),
    ('DANGNHAPTHATBAI', 'until', 'KhoaDen'), ('DANGNHAPTHATBAI', 'khoaden', 'KhoaDen')
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
CREATE TABLE IF NOT EXISTS "PHONGBAN" (
  "MaPB" VARCHAR(25) PRIMARY KEY,
  "TenPB" VARCHAR(120) NOT NULL UNIQUE,
  "MoTa" TEXT NOT NULL DEFAULT '',
  "NgayThanhLap" DATE NOT NULL,
  "MaTruongPhong" VARCHAR(25),
  "HoatDong" BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2. CHUCVU (Chức vụ)
CREATE TABLE IF NOT EXISTS "CHUCVU" (
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
CREATE TABLE IF NOT EXISTS "NHANVIEN" (
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
  "MaPB" VARCHAR(25) REFERENCES "PHONGBAN"("MaPB") ON DELETE RESTRICT,
  "MaCV" VARCHAR(25) NOT NULL REFERENCES "CHUCVU"("MaCV") ON DELETE RESTRICT,
  "PhienBan" INTEGER NOT NULL DEFAULT 1
);

-- 4. QUYETDINH (Quyết định)
CREATE TABLE IF NOT EXISTS "QUYETDINH" (
  "MaQD" VARCHAR(30) PRIMARY KEY,
  "SoQD" VARCHAR(60) NOT NULL UNIQUE,
  "LoaiQD" VARCHAR(40) NOT NULL,
  "NgayKy" DATE NOT NULL,
  "NgayHieuLuc" DATE NOT NULL,
  "NguoiKy" VARCHAR(120) NOT NULL,
  "NoiDung" TEXT NOT NULL
);

-- 5. HOPDONG (Hợp đồng lao động)
CREATE TABLE IF NOT EXISTS "HOPDONG" (
  "MaHD" VARCHAR(30) PRIMARY KEY,
  "MaNV" VARCHAR(25) NOT NULL REFERENCES "NHANVIEN"("MaNV") ON DELETE RESTRICT,
  "LoaiHD" VARCHAR(40) NOT NULL CHECK ("LoaiHD" IN ('Thử việc', 'Xác định thời hạn', 'Không xác định thời hạn')),
  "NgayBatDau" DATE NOT NULL,
  "NgayKetThuc" DATE,
  "MucLuong" NUMERIC(15,2) NOT NULL CHECK ("MucLuong" > 0),
  "TrangThai" VARCHAR(30) NOT NULL DEFAULT 'Hiệu lực',
  "NgayChamDut" DATE,
  "LyDoChamDut" TEXT,
  "SoHD" VARCHAR(60),
  "LoaiChamDut" VARCHAR(40),
  "MaQDChamDut" VARCHAR(30) REFERENCES "QUYETDINH"("MaQD") ON DELETE SET NULL,
  "NgayKetThucGoc" DATE
);

-- 6. GIAHANHOPDONG (Gia hạn / phụ lục hợp đồng)
CREATE TABLE IF NOT EXISTS "GIAHANHOPDONG" (
  "MaGH" VARCHAR(30) PRIMARY KEY,
  "MaHD" VARCHAR(30) NOT NULL REFERENCES "HOPDONG"("MaHD") ON DELETE RESTRICT,
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
  "MaQD" VARCHAR(30) REFERENCES "QUYETDINH"("MaQD") ON DELETE SET NULL,
  UNIQUE ("MaHD", "LanGiaHan")
);

-- 7. QUATRINHCONGTAC (Quá trình công tác)
CREATE TABLE IF NOT EXISTS "QUATRINHCONGTAC" (
  "MaQT" VARCHAR(30) PRIMARY KEY,
  "MaNV" VARCHAR(25) NOT NULL REFERENCES "NHANVIEN"("MaNV") ON DELETE RESTRICT,
  "MaQD" VARCHAR(30) NOT NULL REFERENCES "QUYETDINH"("MaQD") ON DELETE RESTRICT,
  "LoaiBienDong" VARCHAR(40) NOT NULL,
  "MaPBCu" VARCHAR(25) REFERENCES "PHONGBAN"("MaPB") ON DELETE RESTRICT,
  "MaPBMoi" VARCHAR(25) NOT NULL REFERENCES "PHONGBAN"("MaPB") ON DELETE RESTRICT,
  "MaCVCu" VARCHAR(25) REFERENCES "CHUCVU"("MaCV") ON DELETE RESTRICT,
  "MaCVMoi" VARCHAR(25) NOT NULL REFERENCES "CHUCVU"("MaCV") ON DELETE RESTRICT,
  "NgayHieuLuc" DATE NOT NULL,
  "LyDo" TEXT NOT NULL,
  "TrangThai" VARCHAR(20) NOT NULL DEFAULT 'Hiệu lực',
  "NgayHuy" DATE,
  "LyDoHuy" TEXT
);

-- 8. LOAINGHIPHEP (Loại nghỉ phép)
CREATE TABLE IF NOT EXISTS "LOAINGHIPHEP" (
  "MaLoai" VARCHAR(25) PRIMARY KEY,
  "TenLoai" VARCHAR(100) NOT NULL,
  "SoNgayToiDa" INTEGER NOT NULL CHECK ("SoNgayToiDa" > 0),
  "TruPhepNam" INTEGER NOT NULL DEFAULT 1 CHECK ("TruPhepNam" IN (0, 1))
);

-- 9. DONNGHIPHEP (Đơn nghỉ phép)
CREATE TABLE IF NOT EXISTS "DONNGHIPHEP" (
  "MaDon" VARCHAR(30) PRIMARY KEY,
  "MaNV" VARCHAR(25) NOT NULL REFERENCES "NHANVIEN"("MaNV") ON DELETE RESTRICT,
  "MaLoai" VARCHAR(25) NOT NULL REFERENCES "LOAINGHIPHEP"("MaLoai") ON DELETE RESTRICT,
  "NgayNop" DATE NOT NULL,
  "TuNgay" DATE NOT NULL,
  "DenNgay" DATE NOT NULL,
  "SoNgay" INTEGER NOT NULL CHECK ("SoNgay" > 0),
  "LyDo" TEXT NOT NULL,
  "TrangThai" VARCHAR(30) NOT NULL DEFAULT 'Chờ duyệt'
    CHECK ("TrangThai" IN ('Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Đã hủy')),
  "MaNVDuyet" VARCHAR(25) REFERENCES "NHANVIEN"("MaNV") ON DELETE RESTRICT,
  "NgayDuyet" DATE,
  "GhiChuDuyet" TEXT
);

-- 10. SONGAYPHEP (Số ngày phép năm; số ngày đã nghỉ/còn lại tính ở view v_songayphep)
CREATE TABLE IF NOT EXISTS "SONGAYPHEP" (
  "MaNV" VARCHAR(25) NOT NULL REFERENCES "NHANVIEN"("MaNV") ON DELETE RESTRICT,
  "Nam" INTEGER NOT NULL,
  "TongSoNgayPhep" INTEGER NOT NULL DEFAULT 12 CHECK ("TongSoNgayPhep" >= 0),
  PRIMARY KEY ("MaNV", "Nam")
);

-- Bảng hệ thống 1: TAIKHOAN (Tài khoản & Phân quyền)
CREATE TABLE IF NOT EXISTS "TAIKHOAN" (
  "MaTK" VARCHAR(30) PRIMARY KEY,
  "TenDangNhap" VARCHAR(150) NOT NULL UNIQUE,
  "MatKhau" TEXT NOT NULL,
  "VaiTro" VARCHAR(20) NOT NULL CHECK ("VaiTro" IN ('admin', 'hr', 'manager', 'employee', 'director')),
  "MaNV" VARCHAR(25) NOT NULL REFERENCES "NHANVIEN"("MaNV") ON DELETE RESTRICT,
  "HoatDong" INTEGER NOT NULL DEFAULT 1
);

-- Bảng hệ thống 2: PHIENDANGNHAP (Phiên đăng nhập)
CREATE TABLE IF NOT EXISTS "PHIENDANGNHAP" (
  "MaPhien" VARCHAR(64) PRIMARY KEY,
  "MaTK" VARCHAR(30) NOT NULL REFERENCES "TAIKHOAN"("MaTK") ON DELETE CASCADE,
  "ThoiHan" BIGINT NOT NULL
);

-- Bảng hệ thống 3: NHATKYHETHONG (Nhật ký hệ thống)
CREATE TABLE IF NOT EXISTS "NHATKYHETHONG" (
  "MaNK" SERIAL PRIMARY KEY,
  "MaTK" VARCHAR(30) REFERENCES "TAIKHOAN"("MaTK") ON DELETE SET NULL,
  "HanhDong" VARCHAR(120) NOT NULL,
  "DoiTuong" VARCHAR(250) NOT NULL,
  "ThoiGian" VARCHAR(40) NOT NULL,
  "ChiTiet" JSONB,
  "DiaChiIP" VARCHAR(64)
);

-- Bảng hệ thống 4: NGAYLE (Ngày lễ)
CREATE TABLE IF NOT EXISTS "NGAYLE" (
  "Ngay" DATE PRIMARY KEY,
  "TenNgayLe" VARCHAR(120) NOT NULL
);

-- Bảng hệ thống 5: DANGNHAPTHATBAI (Giới hạn đăng nhập sai)
CREATE TABLE IF NOT EXISTS "DANGNHAPTHATBAI" (
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
    WHERE tc.table_name = 'PHONGBAN' AND tc.constraint_type = 'FOREIGN KEY' AND k.column_name = 'MaTruongPhong'
  ) THEN
    ALTER TABLE "PHONGBAN" ADD CONSTRAINT phongban_matruongphong_fkey
      FOREIGN KEY ("MaTruongPhong") REFERENCES "NHANVIEN"("MaNV") ON DELETE SET NULL;
  END IF;
END $$;

-- Ràng buộc giá trị (đặt lại tên theo bảng mới, xóa tên cũ nếu có)
ALTER TABLE "NHANVIEN" DROP CONSTRAINT IF EXISTS employees_status_check;
ALTER TABLE "NHANVIEN" DROP CONSTRAINT IF EXISTS nhanvien_status_check;
ALTER TABLE "NHANVIEN" DROP CONSTRAINT IF EXISTS nhanvien_trangthai_check;
ALTER TABLE "NHANVIEN" ADD CONSTRAINT nhanvien_trangthai_check
  CHECK ("TrangThai" IN ('Đang làm việc', 'Thử việc', 'Đã nghỉ việc', 'Đã lưu trữ'));
ALTER TABLE "QUATRINHCONGTAC" DROP CONSTRAINT IF EXISTS assignments_type_check;
ALTER TABLE "QUATRINHCONGTAC" DROP CONSTRAINT IF EXISTS quatrinhcongtac_type_check;
ALTER TABLE "QUATRINHCONGTAC" DROP CONSTRAINT IF EXISTS quatrinhcongtac_loaibiendong_check;
ALTER TABLE "QUATRINHCONGTAC" ADD CONSTRAINT quatrinhcongtac_loaibiendong_check
  CHECK ("LoaiBienDong" IN ('Điều chuyển', 'Bổ nhiệm', 'Miễn nhiệm', 'Điều chuyển và bổ nhiệm'));

-- Mỗi nhân viên tối đa một tài khoản (liên kết 1-1 "Có tài khoản")
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('users_employee_unique', 'taikhoan_manv_unique'))
     AND NOT EXISTS (SELECT 1 FROM "TAIKHOAN" GROUP BY "MaNV" HAVING COUNT(*) > 1) THEN
    ALTER TABLE "TAIKHOAN" ADD CONSTRAINT taikhoan_manv_unique UNIQUE ("MaNV");
  END IF;
END $$;

-- View v_songayphep (SoNgayDaNghi, SoNgayConLai) được tạo sau migration: xem LEAVE_BALANCE_VIEW trong migrations.ts.

-- Indexes phục vụ truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_nhanvien_mapb ON "NHANVIEN"("MaPB");
CREATE INDEX IF NOT EXISTS idx_donnghiphep_manv ON "DONNGHIPHEP"("MaNV", "TuNgay", "DenNgay");
CREATE INDEX IF NOT EXISTS idx_hopdong_manv ON "HOPDONG"("MaNV");
CREATE INDEX IF NOT EXISTS idx_quatrinhcongtac_manv ON "QUATRINHCONGTAC"("MaNV");
CREATE INDEX IF NOT EXISTS idx_quatrinhcongtac_cho ON "QUATRINHCONGTAC"("TrangThai", "NgayHieuLuc");
CREATE INDEX IF NOT EXISTS idx_phongban_matruongphong ON "PHONGBAN"("MaTruongPhong");
CREATE INDEX IF NOT EXISTS idx_hopdong_maqdchamdut ON "HOPDONG"("MaQDChamDut");
CREATE INDEX IF NOT EXISTS idx_nhatkyhethong_mank ON "NHATKYHETHONG"("MaNK" DESC);
