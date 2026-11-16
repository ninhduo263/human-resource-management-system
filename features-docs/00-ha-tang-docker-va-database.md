# 00. Hạ tầng Docker & Cơ sở dữ liệu PostgreSQL

## 1. Tổng quan
Thiết lập môi trường container hóa với **Docker Compose** gồm 3 dịch vụ (`db`, `backend`, `frontend`) và lược đồ cơ sở dữ liệu **PostgreSQL 16** ánh xạ 100% từ sơ đồ `ERD_QLNS_v2.drawio.pdf`.

## 2. Các File Mã nguồn Liên quan
- `docker-compose.yml`: Định nghĩa 3 container (`peopleops-db`, `peopleops-backend`, `peopleops-frontend`), healthcheck và volume `postgres_data`.
- `.env` / `.env.example`: Biến môi trường cấu hình cổng và chuỗi kết nối PostgreSQL.
- `backend/src/db/schema.sql`: Lược đồ DDL nền (baseline) tạo 10 bảng ERD + 3 bảng hệ thống; các thay đổi sau đó và View `v_songayphep` nằm trong `backend/src/db/migrations.ts`.
- `backend/src/db/pool.ts`: Quản lý kết nối `pg.Pool`, hàm giao dịch nguyên tử `withTransaction(fn)`, tự động nạp `schema.sql` và ghi `audit_log`.
- `backend/src/db/seed.ts`: Khởi tạo dữ liệu mẫu (6 phòng ban, 5 chức vụ, 12 nhân viên, 12 hợp đồng, 4 loại phép, 4 đơn phép, 1 quyết định bổ nhiệm, 5 tài khoản mẫu).
- `backend/src/utils/crypto.ts`: Băm mật khẩu bằng `scrypt` + salt ngẫu nhiên, băm token `sha256`.
- `backend/src/utils/validation.ts`: Các hàm kiểm tra dữ liệu đầu vào (`text`, `optional`, `date`, `numeric`, `choice`) và xử lý ngày tháng (`today`, `shift`, `calendarDays`).

## 3. Ánh xạ 10 Thực thể ERD sang PostgreSQL

| STT | Thực thể trên ERD | Bảng PostgreSQL | Khóa chính | Khóa ngoại & Ràng buộc chính |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `PHONGBAN` | `departments` | `id` (`MaPB`) | `name UNIQUE` |
| 2 | `CHUCVU` | `positions` | `id` (`MaCV`) | `name UNIQUE`, `level BETWEEN 1 AND 10` |
| 3 | `NHANVIEN` | `employees` | `id` (`MaNV`) | `email UNIQUE`, FK `department_id`, `position_id` (`ON DELETE RESTRICT`) |
| 4 | `HOPDONG` | `contracts` | `id` (`MaHD`) | FK `employee_id`, `salary > 0`, `type` thuộc 3 loại HĐ |
| 5 | `GIAHANHOPDONG` | `extensions` | `id` (`MaGH`) | FK `contract_id`, `UNIQUE(contract_id, sequence)` |
| 6 | `QUYETDINH` | `decisions` | `id` (`MaQD`) | `number` (`SoQD`) `UNIQUE` |
| 7 | `QUATRINHCONGTAC` | `assignments` | `id` (`MaQT`) | FK `employee_id`, `decision_id`, `old/new_department_id`, `old/new_position_id` |
| 8 | `LOAINGHIPHEP` | `leave_types` | `id` (`MaLoai`) | `max_days > 0`, `deduct_annual IN (0, 1)` |
| 9 | `DONNGHIPHEP` | `leave_requests` | `id` (`MaDon`) | FK `employee_id`, `type_id`, `approver_id` |
| 10 | `SONGAYPHEP` | `leave_balances` + `v_songayphep` | `(employee_id, year)` | Bảng vật lý lưu `total`; View `v_songayphep` tính động `SoNgayDaNghi`, `SoNgayConLai` |

### 3 Bảng Hệ thống bổ trợ
- `users`: Lưu tài khoản đăng nhập (`username`, `password_hash`, `role`, `employee_id`, `active`).
- `sessions`: Lưu phiên đăng nhập (`token_hash`, `user_id`, `expires`).
- `audit_log`: Lưu nhật ký thao tác hệ thống (`id`, `user_id`, `action`, `target`, `created_at`).

## 4. Hướng dẫn Chỉnh sửa / Mở rộng sau này
- **Thêm cột hoặc bảng mới**: Sửa trực tiếp trong `backend/src/db/schema.sql`. Khi khởi động lại container `backend`, hàm `initSchema()` trong `pool.ts` sẽ thực thi script này.
- **Thay đổi dữ liệu khởi tạo (Seed)**: Sửa trong `backend/src/db/seed.ts`. Lưu ý hàm `seedDatabase()` chỉ chạy khi bảng `departments` đang trống để không ghi đè dữ liệu đang dùng. Muốn reset toàn bộ DB về mặc định: chạy `docker compose down -v && docker compose up -d`.

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
- **Bảng mới**: `holidays` (ngày lễ), `login_attempts` (giới hạn đăng nhập lưu trong DB), `schema_migrations`.
- **Tầng service** (`backend/src/services/`): `employeeStatus.ts` (suy trạng thái nhân viên từ hợp đồng, chốt chấm dứt), `assignments.ts` (áp dụng/hoàn tác công tác, đồng bộ vai trò và trưởng phòng), `leave.ts` (ngày làm việc, quỹ phép, tuyến duyệt), `jobs.ts` (việc đến hạn theo ngày). Thêm `utils/http.ts` (`asyncHandler`, ngữ cảnh IP cho nhật ký).
- **Job theo ngày** (`runScheduledJobs`): chạy khi khởi động, mỗi 15 phút và khi gọi `GET /api/state` (tối đa 1 lần/phút); chốt chấm dứt hợp đồng đã hẹn, áp dụng phụ lục lương đến hạn, áp dụng quyết định công tác đến hạn, đồng bộ trạng thái nhân viên theo hợp đồng. Idempotent và có khóa advisory.
- **Docker Compose**: cổng DB và backend chỉ bind `127.0.0.1`; backend nhận `TRUST_PROXY=true` (tin `X-Forwarded-For` của nginx), `COOKIE_SECURE` (đặt `true` khi chạy sau HTTPS) và `ADMIN_PASSWORD` (mật khẩu admin của dữ liệu mẫu, mặc định `Demo@12345` — đổi trước khi triển khai thật). `.env.example` đã bổ sung các biến này.
- **Dữ liệu mẫu** (`seed.ts`): chức vụ có `is_executive`/`default_role`, phòng ban có trưởng phòng (`head_id`), đơn nghỉ phép tạo trên ngày làm việc, nạp ngày lễ cố định (01/01, 30/04, 01/05, 02/09) cho năm trước/nay/sau khi bảng `holidays` còn trống.
