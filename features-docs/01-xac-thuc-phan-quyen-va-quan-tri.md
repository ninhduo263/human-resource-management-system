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
| `POST` | `/api/login` | Công khai | Kiểm tra `tendangnhap`/`password` (giới hạn 15 lần sai/10 phút), tạo phiên 8 giờ, gắn cookie `HttpOnly`. |
| `POST` | `/api/logout` | Đã đăng nhập | Xóa phiên trong bảng `phiendangnhap` và xóa cookie. |
| `POST` | `/api/password` | Đã đăng nhập | Đổi mật khẩu (tối thiểu 10 ký tự), thu hồi toàn bộ phiên đang mở của tài khoản đó. |
| `GET` | `/api/state` | Đã đăng nhập | Trả về tập dữ liệu đã lọc theo vai trò và che giấu lương (`salary = null`) nếu không đủ quyền. |
| `POST` | `/api/users` | `admin` | Tạo tài khoản mới liên kết với hồ sơ nhân viên đang hoạt động. |
| `POST` | `/api/users/:id/toggle` | `admin` | Khóa hoặc mở khóa tài khoản (chặn tự khóa chính mình), thu hồi phiên tức thì. |

## 4. Ma trận Phân quyền 5 Vai trò

| Vai trò | Tên đăng nhập mẫu | Phạm vi dữ liệu (`GET /api/state`) | Quyền thao tác chính |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (`admin`)** | `admin` | Toàn bộ tổ chức + `taikhoan` + `nhatkyhethong` | Toàn quyền nghiệp vụ, quản lý tài khoản, duyệt phép (không tự duyệt đơn của mình). |
| **Cán bộ nhân sự (`hr`)** | `nhansu` | Toàn bộ tổ chức (gồm mức lương) | Quản lý hồ sơ, danh mục, hợp đồng, công tác, quỹ phép; không duyệt phép, không quản trị tài khoản. |
| **Trưởng phòng (`manager`)** | `truongphong` | Chỉ nhân viên cùng `mapb`; chỉ thấy lương của bản thân | Xem nhân sự trong phòng, duyệt/từ chối đơn nghỉ của nhân viên trong phòng (không tự duyệt). |
| **Nhân viên (`employee`)** | `nhanvien` | Chỉ dữ liệu cá nhân (`manv` của mình) | Xem hồ sơ, hợp đồng, công tác, quỹ phép cá nhân; nộp và hủy đơn chờ duyệt của mình. |
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

### Nâng cấp Giao diện Responsive Đa thiết bị (Mobile, Tablet, Fold, Smart Devices)

Hệ thống được tối ưu hóa toàn diện để tương thích linh hoạt trên mọi kích thước màn hình và thiết bị:
- **Khung điều hướng thích ứng (Adaptive Navigation)**:
  - Trên Desktop/Laptop ($\ge 1024\text{px}$): Giữ nguyên `Sider` cố định bên trái hỗ trợ thu gọn tiện lợi.
  - Trên Mobile, Tablet và Foldable Phone ($< 1024\text{px}$): Ẩn Sider cố định, thay bằng **Menu trượt (Drawer)** của Ant Design mở qua nút hamburger ở Header. Drawer tích hợp sẵn danh mục tính năng, thông tin tài khoản người dùng và nút Đăng xuất nhanh.
  - Bổ sung **Thanh điều hướng dưới đáy (Bottom Navigation Bar)** cố định ở chân màn hình di động cho các trang thường dùng: *Tổng quan, Hồ sơ, Phòng ban, Nghỉ phép (kèm Badge đỏ đếm đơn chờ duyệt) và nút Thêm (mở Drawer)*.
- **Tối ưu thiết bị gập (Foldable Devices - Galaxy Z Fold, Pixel Fold)**:
  - Hỗ trợ màn hình ngoài siêu hẹp ($\le 360\text{px}$): Lưới nút chọn tài khoản mẫu tự động chuyển sang 2 cột hoặc 1 cột; font chữ tiêu đề tự động co giãn (`clamp`).
  - Hỗ trợ màn hình trong khi mở rộng ($700\text{px} - 880\text{px}$) với bố cục co giãn mượt mà.
- **Vùng an toàn cảm ứng (Safe Area Insets & Touch Optimizations)**:
  - Khai báo biến CSS `--sat`, `--sab`, `--sal`, `--sar` dựa trên `env(safe-area-inset-*)` để thanh bottom bar và nội dung không bị che khuất bởi tai thỏ, Dynamic Island hay thanh cử chỉ vuốt của iOS/Android.
  - Bổ sung meta tag PWA/Web App trong `index.html`: `viewport-fit=cover`, `mobile-web-app-capable`.
- **Header & Tìm kiếm**: Ô tìm kiếm co giãn linh hoạt (`xs:w-36 sm:w-56 md:w-72`), các trường văn bản phụ tự ẩn trên màn hình nhỏ để tránh tràn giao diện.
- **Màn hình Tổng quan (`DashboardView.tsx`)**: Bảng nhân sự hỗ trợ cuộn ngang cảm ứng `scroll={{ x: 600 }}` và thanh nút thao tác `Space flex-wrap`.
- **Màn hình Cài đặt & Quản trị (`SettingsView.tsx`)**: Bảng người dùng (`scroll={{ x: 650 }}`) và bảng nhật ký (`scroll={{ x: 750 }}`) hỗ trợ cuộn ngang; thông tin tài khoản cá nhân dùng `Descriptions column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}`.

## Cập nhật ngày 16/11/2026 — Bảo mật, tài khoản và nhật ký

- **Giới hạn đăng nhập** lưu trong bảng `login_attempts` (không mất khi khởi động lại): khóa 10 phút sau **8 lần sai theo tài khoản** hoặc **40 lần sai theo IP**.
- **Cookie phiên** `SameSite=Strict`, thêm `Secure` khi `COOKIE_SECURE=true` hoặc request qua HTTPS. Thêm header `Content-Security-Policy`, `Cross-Origin-Resource-Policy`, và `Strict-Transport-Security` khi chạy HTTPS. `TRUST_PROXY=true` để lấy IP thật phía sau nginx.
- **Tài khoản** (`users.routes.ts`):
  - `POST /api/users/:id/reset-password` (admin): sinh mật khẩu ngẫu nhiên, hiển thị **một lần**, hủy mọi phiên của tài khoản.
  - `PUT /api/users/:id/role` (admin): đổi vai trò, hủy phiên; không tự đổi vai trò của chính mình; đồng bộ `departments.head_id`.
  - Mỗi nhân viên chỉ có **một** tài khoản (`UNIQUE(employee_id)`); mở lại tài khoản của hồ sơ đã nghỉ/lưu trữ bị chặn.
  - Giao diện **Quản trị → Tài khoản** có đổi vai trò trực tiếp và nút **Đặt lại mật khẩu**.
  - *Chưa làm theo yêu cầu*: bắt đổi mật khẩu ở lần đăng nhập đầu.
- **Nhật ký** (`audit_log`): thêm `details` (JSON giá trị trước/sau) và `ip`; ghi trong cùng transaction với thay đổi. `GET /api/audit?limit&offset&q` (admin) trả nhật ký có phân trang và tìm kiếm; `GET /api/state` vẫn trả 100 bản ghi gần nhất cho màn hình hiện tại.
- **`GET /api/state`**: lọc phạm vi dữ liệu theo vai trò **ngay trong SQL** (không đọc toàn bảng rồi lọc bằng JS); quỹ phép gộp bằng một truy vấn. Mỗi đơn nghỉ phép có cờ `can_review` do máy chủ tính theo vai trò, phòng ban và tuyến duyệt; giao diện dùng cờ này thay vì tự suy luận.
- **Chưa làm**: tách `GET /api/state` thành API phân trang theo từng màn hình (cần viết lại phần lớn frontend).

## Cập nhật ngày 17/11/2026 — Nâng cấp Giao diện theo `frontend-design` (Botanical Forest & Warm Ivory)

- **Thống nhất bảng màu & Nhận diện**: Chuyển toàn bộ không gian làm việc sau đăng nhập từ nền mặc định sang bảng màu **Botanical Forest & Warm Ivory** đồng bộ với trang đăng nhập (`#0d392f` Deep Forest cho Sider/Drawer, `#155e4b` Botanical Pine cho hành động chính, `#c9f3bd` Spring Mint cho điểm nhấn, `#f6f7f3` Warm Alabaster cho nền tổng thể, và đường viền hairline `#e4e9e0`).
- **Typography**: Tích hợp font `Plus Jakarta Sans` trong `frontend/index.html` và `tabular-nums` cho toàn bộ số liệu thống kê, lương, ngày phép.
- **Dashboard bất đối xứng (`DashboardView.tsx`)**: Thay 4 thẻ thống kê đồng dạng bằng 1 thẻ chính nổi bật (*Nhân sự đang làm việc* nền xanh rừng kèm tỷ lệ Chính thức/Thử việc) kết hợp 3 thẻ phụ tương tác nhanh; bỏ các nhãn ALL-CAPS thừa ở tiêu đề trang (`DashboardView.tsx`, `LoginView.tsx`, `SettingsView.tsx`).
- **Tùy chỉnh Ant Design (`App.tsx`, `index.css`)**: Tinh chỉnh `ConfigProvider` tokens (`colorPrimary: '#155e4b'`, `colorBgLayout: '#f6f7f3'`, `borderRadiusLG: 16`) và CSS cho `Table`, `Card`, `Modal`, `Menu` mà vẫn giữ nguyên toàn bộ quy chuẩn Responsive & Print.
