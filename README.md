# Hệ thống Quản lý Nhân sự (PeopleOps HRMS) - Nhóm 16

Hệ thống được thiết kế và xây dựng từ **các tài liệu thiết kế chuẩn hóa** (`thietke/bfd-dfd.drawio`, `thietke/erd.drawio`) sử dụng kiến trúc **Docker Compose**:

- **Database**: **PostgreSQL 16** (10 bảng nghiệp vụ + 5 bảng hệ thống, tên bảng/cột tiếng Việt không dấu theo ERD + View `v_songayphep`)
- **Backend**: **Node.js + Express + TypeScript** (`backend/`)
- **Frontend**: **React 18 + Ant Design + Vite + TypeScript + Tailwind CSS** (`frontend/`)
- **Container**: **Docker & Docker Compose** (`docker-compose.yml`)

---

## 1. Khởi chạy Hệ thống bằng Docker

1. Mở ứng dụng **Docker Desktop** trên máy.
2. Nhấp đúp vào `CHAY_HE_THONG.bat` (hoặc chạy `./chay_he_thong.sh` trên Linux/macOS) hoặc mở Terminal tại thư mục gốc và chạy:

```powershell
docker-compose up --build -d
```

3. Truy cập ứng dụng tại: **http://localhost:3000**
   - Xem trạng thái các container: `docker-compose ps`
   - Tắt hệ thống: `docker-compose down`
   - Xóa sạch dữ liệu và tạo lại dữ liệu mẫu từ đầu: `docker-compose down -v && docker-compose up -d`

---

## 2. Tài khoản Mẫu (5 Vai trò theo DFD)

Mật khẩu chung ban đầu: **`Demo@12345`** (có thể chọn nhanh ngay trên màn hình đăng nhập; mật khẩu `admin` đổi được bằng biến `ADMIN_PASSWORD`):

| Tên đăng nhập | Vai trò | Nhân viên liên kết | Phạm vi & Quyền hạn chính |
| :--- | :--- | :--- | :--- |
| `admin` | Quản trị viên | `NV001` - Nguyễn Minh Anh | Toàn quyền hệ thống, duyệt nghỉ phép, quản lý tài khoản & nhật ký |
| `nhansu` | Cán bộ nhân sự | `NV009` - Nguyễn Khánh Vy | Quản lý hồ sơ, phòng ban/chức vụ, hợp đồng, công tác, quỹ phép, ngày lễ, báo cáo; duyệt phép phòng chưa có trưởng phòng và giám đốc |
| `truongphong` | Trưởng phòng | `NV002` - Trần Quốc Bảo | Xem nhân sự trong phòng Công nghệ (ẩn lương người khác), duyệt phép nhân viên cùng phòng |
| `nhanvien` | Nhân viên | `NV003` - Lê Hoàng Nam | Xem thông tin cá nhân, cập nhật liên hệ, nộp/hủy đơn nghỉ phép của mình |
| `giamdoc` | Ban giám đốc | `NV010` - Trần Hải Đăng | Xem dữ liệu toàn tổ chức, 4 loại báo cáo, ghi nhận quyết định công tác; duyệt phép trưởng phòng và phòng chưa có trưởng phòng |

---

## 3. Thư mục Tài liệu Tính năng (`features-docs/`)

Mỗi tính năng sau khi hoàn thành và toàn bộ nhật ký thay đổi được lưu trữ độc lập trong thư mục [`features-docs/`](./features-docs/README.md). Khi cần sửa đổi hoặc mở rộng bất kỳ tính năng nào, chỉ cần đọc đúng file `.md` của tính năng đó và cập nhật lại sau khi sửa:

- [Mục lục, Quy trình bảo trì & Nhật ký cập nhật](./features-docs/README.md)
- [00. Hạ tầng Docker & Cơ sở dữ liệu PostgreSQL (15 thực thể ERD, tên bảng/cột theo ERD)](./features-docs/00-ha-tang-docker-va-database.md)
- [01. Xác thực, Phân quyền 5 vai trò, Quản trị & Tổng quan](./features-docs/01-xac-thuc-phan-quyen-va-quan-tri.md)
- [02. Phân hệ 1.0 - Quản lý Hồ sơ nhân viên (1.1 – 1.4)](./features-docs/02-ho-so-nhan-vien.md)
- [03. Phân hệ 2.0 - Quản lý Phòng ban & Chức vụ (2.1 – 2.4)](./features-docs/03-phong-ban-va-chuc-vu.md)
- [04. Phân hệ 3.0 - Quản lý Hợp đồng lao động (3.1 – 3.4)](./features-docs/04-hop-dong-lao-dong.md)
- [05. Phân hệ 4.0 - Quản lý Công tác & Nghỉ phép (4.1 – 4.4)](./features-docs/05-cong-tac-va-nghi-phep.md)
- [06. Phân hệ 5.0 - Báo cáo & Thống kê nhân sự (5.1 – 5.4)](./features-docs/06-bao-cao-nhan-su.md)
- [07. Thông báo realtime, Lịch nghỉ phép, Xuất Excel/PDF, Trợ lý HR (AI)](./features-docs/07-thong-bao-lich-nghi-xuat-file-tro-ly-ai.md) — bật AI bằng cách thêm `ANTHROPIC_API_KEY=...` vào `.env`; để trống thì trợ lý chạy chế độ ngoại tuyến.
