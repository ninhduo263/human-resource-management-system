# 00. Hạ tầng Docker & Cơ sở dữ liệu PostgreSQL

## 1. Tổng quan
Thiết lập môi trường container hóa với **Docker Compose** gồm 3 dịch vụ (`db`, `backend`, `frontend`) và lược đồ cơ sở dữ liệu **PostgreSQL 16** ánh xạ 100% từ sơ đồ `ERD_QLNS_v2.drawio.pdf`.

## 2. Các File Mã nguồn Liên quan
- `docker-compose.yml`: Định nghĩa 3 container (`peopleops-db`, `peopleops-backend`, `peopleops-frontend`), healthcheck và volume `postgres_data`.
- `.env` / `.env.example`: Biến môi trường cấu hình cổng và chuỗi kết nối PostgreSQL.
- `backend/src/db/schema.sql`: Lược đồ DDL tạo 10 bảng ERD + 3 bảng hệ thống + View `v_songayphep`.
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
