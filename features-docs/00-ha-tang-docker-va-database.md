# 00. Hạ tầng Docker & Cơ sở dữ liệu PostgreSQL

## 1. Tổng quan
Thiết lập môi trường container hóa với **Docker Compose** gồm 3 dịch vụ (`db`, `backend`, `frontend`) và lược đồ cơ sở dữ liệu **PostgreSQL 16** ánh xạ trực tiếp từ bộ sơ đồ trong `thietke/` (`thietke/erd.drawio`, `thietke/bfd-dfd.drawio`). **Tên bảng và tên cột trùng tên thực thể/thuộc tính trên ERD**, viết thường, tiếng Việt không dấu (ví dụ `NHANVIEN.MaNV` → `nhanvien.manv`). Dữ liệu JSON của API dùng đúng các tên cột này.

## 2. Các File Mã nguồn Liên quan
- `thietke/`: bộ sơ đồ hiện hành — `bfd-dfd.drawio` (BFD, DFD ngữ cảnh, DFD mức 0, DFD mức 1 cho 1.0–6.0) và `erd.drawio` (10 thực thể nghiệp vụ + 5 thực thể hệ thống); kèm các ảnh/PDF thiết kế gốc.
- `docker-compose.yml`: Định nghĩa 3 container (`peopleops-db`, `peopleops-backend`, `peopleops-frontend`), healthcheck và volume `postgres_data`.
- `.env` / `.env.example`: Biến môi trường cấu hình cổng và chuỗi kết nối PostgreSQL.
- `backend/src/db/schema.sql`: Đổi tên bảng/cột của database cũ (tên tiếng Anh) sang tên ERD, rồi tạo 15 bảng theo cấu trúc cuối cùng; `backend/src/db/migrations.ts` giữ lịch sử migration và tạo View `v_songayphep`.
- `backend/src/db/pool.ts`: Quản lý kết nối `pg.Pool`, hàm giao dịch nguyên tử `withTransaction(fn)`, tự động nạp `schema.sql` và ghi `nhatkyhethong`.
- `backend/src/db/seed.ts`: Khởi tạo dữ liệu mẫu (6 phòng ban kèm `matruongphong`, 5 chức vụ, 12 nhân viên, 12 hợp đồng, 4 loại phép, 4 đơn phép, 4 quyết định mẫu, 3 quá trình công tác, 5 tài khoản mẫu, ngày lễ cố định).
- `backend/src/utils/crypto.ts`: Băm mật khẩu bằng `scrypt` + salt ngẫu nhiên, băm token `sha256`.
- `backend/src/utils/validation.ts`: Các hàm kiểm tra dữ liệu đầu vào (`text`, `optional`, `date`, `numeric`, `choice`), nhãn tiếng Việt của từng trường và xử lý ngày tháng (`today`, `shift`, `calendarDays`).

## 3. Ánh xạ 10 Thực thể nghiệp vụ ERD sang PostgreSQL

| STT | Thực thể trên ERD | Bảng | Khóa chính | Khóa ngoại & Ràng buộc chính |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `PHONGBAN` | `phongban` | `mapb` | `tenpb UNIQUE`, FK `matruongphong` → `nhanvien(manv)`, `hoatdong` |
| 2 | `CHUCVU` | `chucvu` | `macv` | `tencv UNIQUE`, `capbac BETWEEN 1 AND 10`, `ladieuhanh`, `vaitromacdinh`, `hoatdong` |
| 3 | `NHANVIEN` | `nhanvien` | `manv` | `email UNIQUE`, FK `mapb`, `macv` (`ON DELETE RESTRICT`), `trangthai` thuộc 4 giá trị, `phienban` (khóa lạc quan) |
| 4 | `HOPDONG` | `hopdong` | `mahd` | FK `manv`, FK `maqdchamdut` → `quyetdinh(maqd)`, `ngayketthucgoc`, `mucluong > 0`, `loaihd` thuộc 3 loại HĐ |
| 5 | `GIAHANHOPDONG` | `giahanhopdong` | `magh` | FK `mahd`, FK `maqd`, `UNIQUE(mahd, langiahan)`, `loaiphuluc`, `luongcu`, `luongmoi`, `daapdung` |
| 6 | `QUYETDINH` | `quyetdinh` | `maqd` | `soqd UNIQUE`; loại quyết định Bổ nhiệm/Điều chuyển/Miễn nhiệm/Gia hạn/Chấm dứt HĐ |
| 7 | `QUATRINHCONGTAC` | `quatrinhcongtac` | `maqt` | FK `manv`, `maqd`, `mapbcu`/`mapbmoi`, `macvcu`/`macvmoi`, `loaibiendong IN ('Điều chuyển', 'Bổ nhiệm', 'Miễn nhiệm', 'Điều chuyển và bổ nhiệm')`, `trangthai` |
| 8 | `LOAINGHIPHEP` | `loainghiphep` | `maloai` | `songaytoida > 0`, `truphepnam IN (0, 1)` |
| 9 | `DONNGHIPHEP` | `donnghiphep` | `madon` | FK `manv`, `maloai`, `manvduyet` (Trưởng phòng theo `phongban.matruongphong`) |
| 10 | `SONGAYPHEP` | `songayphep` + `v_songayphep` | `(manv, nam)` | Bảng lưu `tongsongayphep`; View `v_songayphep` tính `songaydanghi`, `songayconlai` |

### 5 Thực thể hệ thống (kho D6)
- `taikhoan` (`TAIKHOAN`): `matk`, `tendangnhap`, `matkhau` (đã băm), `vaitro`, `manv` (duy nhất — liên kết 1-1), `hoatdong`.
- `phiendangnhap` (`PHIENDANGNHAP`): `maphien` (băm token), `matk`, `thoihan`.
- `nhatkyhethong` (`NHATKYHETHONG`): `mank`, `matk`, `hanhdong`, `doituong`, `thoigian`, `chitiet` (giá trị trước/sau), `diachiip`.
- `ngayle` (`NGAYLE`): `ngay`, `tenngayle`.
- `dangnhapthatbai` (`DANGNHAPTHATBAI`): `khoa`, `solansai`, `khoaden`.

## 4. Hướng dẫn Chỉnh sửa / Mở rộng sau này
- **Thêm cột hoặc bảng mới**: Sửa trực tiếp trong `backend/src/db/schema.sql`. Khi khởi động lại container `backend`, hàm `initSchema()` trong `pool.ts` sẽ thực thi script này.
- **Thay đổi dữ liệu khởi tạo (Seed)**: Sửa trong `backend/src/db/seed.ts`. Lưu ý hàm `seedDatabase()` chỉ chạy khi bảng `phongban` đang trống để không ghi đè dữ liệu đang dùng. Muốn reset toàn bộ DB về mặc định: chạy `docker compose down -v && docker compose up -d`.

## 5. Cập nhật ngày 16/11/2026

- `schema.sql` có các lệnh `ALTER TABLE` để cập nhật database hiện có khi backend khởi động, giữ dữ liệu cũ: trạng thái **Đã nghỉ việc**, phòng ban nhân viên có thể `NULL`, phòng ban cũ trong công tác có thể `NULL`, tên đăng nhập dài 150 ký tự và các trường phụ lục lương.
- `audit_log.target` mở rộng lên 250 ký tự để ghi được tài khoản email dài.
- `npm run build` ở backend tự sao chép `schema.sql` sang `dist/db/schema.sql` sau khi biên dịch.
- `npm test` ở backend chạy kiểm thử HTTP và PostgreSQL trên database tạm do bộ kiểm thử tự tạo. Cần đặt `TEST_DATABASE_URL` tới PostgreSQL với quyền tạo database; database được chỉ định trong URL không bị sửa dữ liệu bởi bộ kiểm thử.

## Cập nhật ngày 16/11/2026 — Nâng cấp nền dữ liệu, migration và vận hành

- **Kiểu dữ liệu**: mọi cột ngày (`birth_date`, `join_date`, `start_date`, `end_date`, `effective_date`, `submitted_date`...) đổi từ `VARCHAR(10)` sang `DATE`; mọi cột tiền (`contracts.salary`, `extensions.old_salary/new_salary`) đổi từ `DOUBLE PRECISION` sang `NUMERIC(15,2)`. `pool.ts` đăng ký bộ đọc kiểu để `DATE` vẫn trả về chuỗi `YYYY-MM-DD` và `NUMERIC` trả về `number`, nên API và giao diện không đổi.
- **Migration có đánh số**: `backend/src/db/migrations.ts` (bảng `schema_migrations`, khóa advisory để chạy một lần, mỗi migration trong một transaction). `schema.sql` chỉ còn là **bản nền (baseline)**; mọi thay đổi cấu trúc mới thêm vào `migrations.ts`.
  - `001_date_and_numeric_types`: chuyển kiểu cột (không hoàn tác được — **sao lưu DB trước khi chạy trên dữ liệu thật**).
  - `002_domain_extensions`: thêm cột `employees.version`, `positions.is_executive/default_role/active`, `departments.head_id/active`, `contracts.contract_number/termination_type`, `extensions.effective_date/applied`, `assignments.status/cancelled_date/cancel_reason`, `audit_log.details/ip`; bảng `holidays`, `login_attempts`; ràng buộc `UNIQUE(users.employee_id)` (bỏ qua nếu dữ liệu cũ đang có trùng).
  - `003_leave_balance_view`: tạo lại View `v_songayphep` theo cột `DATE`.
  - `004_rewards_disciplines_and_model_enhancements`: tạo bảng `rewards_disciplines` (BFD 3.4), bổ sung `contracts.termination_decision_id` và `contracts.original_end_date`, mở rộng `assignments.type` hỗ trợ `'Miễn nhiệm'` (DFD 2.3/2.4), và bổ sung `extensions.decision_id`.
- **Bảng mới**: `rewards_disciplines` (khen thưởng & kỷ luật), `holidays` (ngày lễ), `login_attempts` (giới hạn đăng nhập lưu trong DB), `schema_migrations`.
- **Tầng service** (`backend/src/services/`): `employeeStatus.ts` (suy trạng thái nhân viên từ hợp đồng, chốt chấm dứt), `assignments.ts` (áp dụng/hoàn tác công tác, đồng bộ vai trò và trưởng phòng), `leave.ts` (ngày làm việc, quỹ phép, tuyến duyệt), `jobs.ts` (việc đến hạn theo ngày). Thêm `utils/http.ts` (`asyncHandler`, ngữ cảnh IP cho nhật ký).
- **Job theo ngày** (`runScheduledJobs`): chạy khi khởi động, mỗi 15 phút và khi gọi `GET /api/state` (tối đa 1 lần/phút); chốt chấm dứt hợp đồng đã hẹn, áp dụng phụ lục lương đến hạn, áp dụng quyết định công tác đến hạn, đồng bộ trạng thái nhân viên theo hợp đồng. Idempotent và có khóa advisory.
- **Docker Compose**: cổng DB và backend chỉ bind `127.0.0.1`; backend nhận `TRUST_PROXY=true` (tin `X-Forwarded-For` của nginx), `COOKIE_SECURE` (đặt `true` khi chạy sau HTTPS) và `ADMIN_PASSWORD` (mật khẩu admin của dữ liệu mẫu, mặc định `Demo@12345` — đổi trước khi triển khai thật). `.env.example` đã bổ sung các biến này.
- **Dữ liệu mẫu** (`seed.ts`): chức vụ có `is_executive`/`default_role`, phòng ban có trưởng phòng (`head_id`), đơn nghỉ phép tạo trên ngày làm việc, nạp ngày lễ cố định (01/01, 30/04, 01/05, 02/09) cho năm trước/nay/sau khi bảng `holidays` còn trống.
- **Cập nhật kiểm thử ngày 17/11/2026**:
  - Đồng bộ kiểu dữ liệu `contracts.original_end_date` (`DATE`), `rewards_disciplines.effective_date` (`DATE`) và `rewards_disciplines.amount` (`NUMERIC(15,2)`) giữa `schema.sql` và `migrations.ts` (`004`) để tránh lỗi xung đột kiểu tham số PostgreSQL (`42P08`).
  - Cho phép phương thức `DELETE` không có body không bắt buộc gửi header `Content-Type: application/json` trong `backend/src/app.ts`.
  - Mở rộng bộ kiểm thử tích hợp `backend/tests/workflows.test.mjs` lên **22 kịch bản con (23/23 pass)** bao phủ toàn bộ các file `00`–`07`.

## Cập nhật ngày 18/11/2026 — Tên bảng tiếng Việt theo ERD & bộ sơ đồ `thietke/`
- **Đổi tên bảng và tên cột** theo tên thực thể/thuộc tính trong thiết kế (tiếng Việt không dấu, viết thường): `departments → phongban`, `positions → chucvu`, `employees → nhanvien`, `contracts → hopdong`, `extensions → giahanhopdong`, `decisions → quyetdinh`, `assignments → quatrinhcongtac`, `leave_types → loainghiphep`, `leave_requests → donnghiphep`, `leave_balances → songayphep`; bảng hệ thống `users → taikhoan`, `sessions → phiendangnhap`, `audit_log → nhatkyhethong`, `holidays → ngayle`, `login_attempts → dangnhapthatbai`. Tên cột cũng đổi theo thuộc tính ERD (ví dụ `employees.id → nhanvien.manv`, `contracts.salary → hopdong.mucluong`, `users.password_hash → taikhoan.matkhau`); JSON của API, thân yêu cầu và giao diện dùng cùng tên này. Đường dẫn API (`/api/employees`...) giữ nguyên.
- **Nâng cấp database cũ**: hai khối `DO $$ ... $$` ở đầu `schema.sql` đổi tên bảng rồi đổi tên cột cũ sang tên mới (chỉ khi tên cũ còn và tên mới chưa có) trước mọi `CREATE TABLE`, nên dữ liệu giữ nguyên; View `v_songayphep` được tạo lại với cột thường (`manv`, `nam`, `tongsongayphep`, `songaydanghi`, `songayconlai`); ràng buộc CHECK đặt lại tên `nhanvien_trangthai_check`, `quatrinhcongtac_loaibiendong_check`.
- **Bộ sơ đồ** `thietke/bfd-dfd.drawio` (BFD, DFD ngữ cảnh, mức 0, mức 1 cho 1.0–6.0) và `thietke/erd.drawio` (10 thực thể nghiệp vụ + 5 thực thể hệ thống, 20 liên kết) giữ định dạng bản gốc và bổ sung: nhóm chức năng `6. Quản trị hệ thống` (6.1–6.4), tác nhân Quản trị viên, kho `D6 Tài khoản, nhật ký, ngày lễ`, các thuộc tính mới (`MaTruongPhong`, `SoHD`, `MaQDChamDut`, `LoaiPhuLuc`, `TrangThai` công tác, `TruPhepNam`...).
- **Loại bỏ khen thưởng, kỷ luật**: không còn chức năng, bảng `rewards_disciplines` bị xóa khi khởi động (nếu còn), bỏ mã sinh `KT/KL` và màu tag liên quan.
- Kiểm thử: `npm test` với `TEST_DATABASE_URL` — 22/22 kịch bản đạt trên database mới; đã thử nâng cấp một bản sao database cũ (bảng và cột tiếng Anh) và chạy lại `initSchema()` hai lần, dữ liệu giữ nguyên; đã chạy giao diện thật (đăng nhập, mở 8 trang, thêm phòng ban qua form).

