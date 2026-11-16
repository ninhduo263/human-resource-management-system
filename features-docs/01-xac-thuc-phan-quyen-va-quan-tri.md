# 01. Xác thực, Phân quyền (RBAC/ABAC), Quản trị Tài khoản & Tổng quan

## 1. Mục tiêu & Đối chiếu Thiết kế
- **Tác nhân DFD Mức 0**: `Nhân viên`, `Cán bộ nhân sự`, `Trưởng phòng`, `Ban giám đốc` và mở rộng `Quản trị viên` phục vụ vận hành hệ thống.
- **Bảo mật & Phân quyền**: Kiểm soát truy cập theo vai trò (RBAC) và phạm vi dữ liệu phòng ban/cá nhân (ABAC) ngay tại tầng Backend API.

## 2. Các File Mã nguồn Liên quan
- **Backend**:
  - `backend/src/middleware/auth.ts`: Xác thực cookie `hr_session`, hàm `requireAuth`, `requireRole`, `canViewEmployee`.
  - `backend/src/routes/auth.routes.ts`: Đăng nhập (`POST /api/login`), đăng xuất (`POST /api/logout`), đổi mật khẩu (`POST /api/password`), lấy dữ liệu tổng thể theo phạm vi quyền (`GET /api/state`).
  - `backend/src/routes/users.routes.ts`: Tạo tài khoản (`POST /api/users`), khóa/mở khóa tài khoản (`POST /api/users/:id/toggle`).
- **Frontend (Ant Design `antd` + `@ant-design/icons`)**:
  - `frontend/src/App.tsx`: Bố cục `ConfigProvider` (tiếng Việt `viVN`, theme `#12584b`), `Layout`, `Sider`, `Header`, `Menu`, `Badge`, `message`.
  - `frontend/src/components/LoginView.tsx`: Trang đăng nhập sử dụng `Card`, `Form`, `Input`, `Input.Password`, `Button`, `Alert`, `Tag` và chọn nhanh 5 tài khoản mẫu.
  - `frontend/src/components/DashboardView.tsx`: Màn hình Tổng quan dùng `Row`, `Col`, `Card`, `Statistic`, `Progress`, `Alert`, `Table`, `Avatar`, `Tag`.
  - `frontend/src/components/SettingsView.tsx`: Màn hình Quản trị tài khoản dùng `Tabs`, `Table`, `Modal`, `Form`, `Popconfirm`, `Descriptions`.

## 3. Danh sách API Endpoints

| Phương thức | Endpoint | Quyền truy cập | Mô tả nghiệp vụ |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/login` | Công khai | Kiểm tra `username`/`password` (giới hạn 15 lần sai/10 phút), tạo phiên 8 giờ, gắn cookie `HttpOnly`. |
| `POST` | `/api/logout` | Đã đăng nhập | Xóa phiên trong bảng `sessions` và xóa cookie. |
| `POST` | `/api/password` | Đã đăng nhập | Đổi mật khẩu (tối thiểu 10 ký tự), thu hồi toàn bộ phiên đang mở của tài khoản đó. |
| `GET` | `/api/state` | Đã đăng nhập | Trả về tập dữ liệu đã lọc theo vai trò và che giấu lương (`salary = null`) nếu không đủ quyền. |
| `POST` | `/api/users` | `admin` | Tạo tài khoản mới liên kết với hồ sơ nhân viên đang hoạt động. |
| `POST` | `/api/users/:id/toggle` | `admin` | Khóa hoặc mở khóa tài khoản (chặn tự khóa chính mình), thu hồi phiên tức thì. |

## 4. Ma trận Phân quyền 5 Vai trò

| Vai trò | Tên đăng nhập mẫu | Phạm vi dữ liệu (`GET /api/state`) | Quyền thao tác chính |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (`admin`)** | `admin` | Toàn bộ tổ chức + `users` + `audit_log` | Toàn quyền nghiệp vụ, quản lý tài khoản, duyệt phép (không tự duyệt đơn của mình). |
| **Cán bộ nhân sự (`hr`)** | `nhansu` | Toàn bộ tổ chức (gồm mức lương) | Quản lý hồ sơ, danh mục, hợp đồng, công tác, quỹ phép; không duyệt phép, không quản trị tài khoản. |
| **Trưởng phòng (`manager`)** | `truongphong` | Chỉ nhân viên cùng `department_id`; chỉ thấy lương của bản thân | Xem nhân sự trong phòng, duyệt/từ chối đơn nghỉ của nhân viên trong phòng (không tự duyệt). |
| **Nhân viên (`employee`)** | `nhanvien` | Chỉ dữ liệu cá nhân (`employee_id` của mình) | Xem hồ sơ, hợp đồng, công tác, quỹ phép cá nhân; nộp và hủy đơn chờ duyệt của mình. |
| **Ban giám đốc (`director`)** | `giamdoc` | Toàn bộ tổ chức và báo cáo | Xem toàn bộ dữ liệu/báo cáo, ghi nhận quyết định công tác (điều chuyển/bổ nhiệm). |

## 5. Hướng dẫn Sửa đổi / Bảo trì sau này
- **Thay đổi thời gian hết hạn phiên**: Sửa hằng số `8 * 3600_000` và `Max-Age=28800` trong `backend/src/routes/auth.routes.ts`.
- **Thay đổi quy tắc lọc dữ liệu hoặc ẩn lương**: Chỉnh sửa hàm `canViewEmployee` trong `backend/src/middleware/auth.ts` và hàm `buildScopedState` trong `backend/src/routes/auth.routes.ts`.

## 6. Cập nhật ngày 16/11/2026

- Khi thêm hồ sơ, hệ thống tự tạo tài khoản với tên đăng nhập bằng email và hiển thị mật khẩu ban đầu một lần trên UI. Tài khoản mẫu cũ vẫn dùng tên đăng nhập hiện có.
- `users.username` hỗ trợ tối đa 150 ký tự; API tạo tài khoản quản trị chấp nhận email hoặc tên đăng nhập kiểu cũ.
- Cán bộ nhân sự có thể cấp tài khoản đi kèm hồ sơ mới với vai trò ngoài `admin`; việc quản trị tài khoản riêng vẫn chỉ dành cho `admin`.
- Nhân viên **Đã nghỉ việc** hoặc **Đã lưu trữ** không đăng nhập được. Khi chấm dứt hợp đồng cuối cùng đang hiệu lực, các phiên cũ được thu hồi.
- Giám đốc có thể không thuộc phòng ban (`department_id = NULL`). Trưởng phòng không có phòng ban chỉ xem được hồ sơ của chính mình, không được xem hoặc duyệt phép của người khác có phòng ban rỗng.
- Trưởng phòng không được xem lương cũ/mới trong phụ lục của người khác; quy tắc xem lương áp dụng cả hợp đồng và phụ lục.

### Thiết kế lại trang đăng nhập

`LoginView.tsx` sử dụng các lớp CSS `login-*` trong `index.css`: màn hình hai cột với phần giới thiệu xanh rừng, tiêu đề lớn, minh họa đội ngũ bằng HTML/CSS và form trên nền sáng. Dưới 901 px chuyển thành một cột, ẩn phần minh họa. Minh họa có `aria-hidden`, không chứa dữ liệu nhân viên hoặc số liệu thực. Giữ API đăng nhập và chọn tài khoản mẫu; bổ sung autocomplete và trạng thái nút vai trò. Đã kiểm tra đăng nhập và không tràn ngang ở 1440/768/390 px.

Nhận diện mới nhất của phần giới thiệu: **Nhân sự.**, biểu tượng **16**, dòng **NHÓM 16 · KẾT NỐI ĐỂ PHÁT TRIỂN**. Chân trang ghi **Cùng đội ngũ, tạo giá trị.** và **Nhóm 16 · Quản lý nhân sự**.
