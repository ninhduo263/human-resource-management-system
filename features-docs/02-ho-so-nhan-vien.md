# 02. Phân hệ 1.0 - Quản lý Hồ sơ Nhân viên (`1.1` – `1.4`)

## 1. Đối chiếu 4 Tài liệu Thiết kế
- **BFD**: Nhóm `1. Hồ sơ nhân viên`:
  - `1.1 Thêm hồ sơ mới`
  - `1.2 Cập nhật hồ sơ`
  - `1.3 Tra cứu hồ sơ`
  - `1.4 Lưu trữ hồ sơ`
- **DFD Mức 0 & Mức 1 (Trang 1)**:
  - Tác nhân: `Cán bộ nhân sự` (lập mới, cập nhật, tra cứu, lưu trữ), `Nhân viên` (cung cấp/cập nhật thông tin cá nhân).
  - Kho dữ liệu: `D1 - Hồ sơ nhân viên`.
- **ERD**: Thực thể `NHANVIEN` (`nhanvien`) liên kết `PHONGBAN` (`phongban`), `CHUCVU` (`chucvu`), `HOPDONG` (`hopdong`), `QUATRINHCONGTAC` (`quatrinhcongtac`), `DONNGHIPHEP` (`donnghiphep`), `SONGAYPHEP` (`songayphep`).

## 2. Các File Mã nguồn Liên quan
- **Backend**: `backend/src/routes/employees.routes.ts`
- **Frontend (Ant Design)**: `frontend/src/components/EmployeesView.tsx` (Sử dụng `Table`, `Tabs`, `Input`, `Select`, `Modal`, `Form`, `Descriptions`, `Popconfirm`, `Avatar`, `Tag` của `antd`)
- **Database**: Bảng `nhanvien` và `songayphep` trong `backend/src/db/schema.sql`

## 3. Danh sách API Endpoints & Quy tắc Nghiệp vụ

| Mã BFD | Phương thức & Đường dẫn | Quyền hạn | Quy tắc Kiểm tra & Xử lý |
| :--- | :--- | :--- | :--- |
| `1.1` | `POST /api/employees` | `admin`, `hr` | - Kiểm tra mã `manv` duy nhất, `email` duy nhất, `birth_date < join_date` và `< today`.<br>- Cấp tự động quỹ phép năm hiện tại (`12 ngày`) trong cùng transaction. |
| `1.2` | `PUT /api/employees/:id` | `admin`, `hr` (hoặc `self_contact` cho chính nhân viên đó) | - Chặn đổi `ngayvaolam` thành sau ngày bắt đầu hợp đồng/công tác/đơn phép đã có.<br>- Chặn sửa trực tiếp `mapb` hoặc `macv` (bắt buộc qua chức năng Công tác `4.1` để lưu quyết định).<br>- Hỗ trợ nhân viên tự cập nhật thông tin liên hệ cá nhân (`phone`, `email`, `address`). |
| `1.3` | `GET /api/state` (Lọc/Tra cứu trên UI) | Tất cả vai trò (theo phạm vi) | - Tìm kiếm theo `manv`, `hoten`, `email`.<br>- Lọc theo `mapb`, `trangthai` (`Đang làm việc`, `Thử việc`, `Đã lưu trữ`).<br>- Xem hồ sơ chi tiết kèm danh sách hợp đồng, lịch sử công tác, số ngày phép còn lại. |
| `1.4` | `POST /api/employees/:id/archive`<br>`POST /api/employees/:id/restore` | `admin`, `hr` | - Không được tự lưu trữ chính mình.<br>- Chỉ lưu trữ khi không còn hợp đồng hiệu lực/tương lai và không còn đơn nghỉ phép `Chờ duyệt`.<br>- Chuyển trạng thái sang `Đã lưu trữ`, ghi `ngayluutru`, thu hồi mọi phiên đăng nhập của nhân viên đó.<br>- Cho phép khôi phục (`restore`) hồ sơ đã lưu trữ về `Đang làm việc`. |

## 4. Hướng dẫn Sửa đổi / Bảo trì sau này
- **Thêm trường mới vào hồ sơ nhân viên (ví dụ: CCCD, trình độ học vấn)**:
  1. Thêm cột vào bảng `nhanvien` trong `backend/src/db/schema.sql`.
  2. Bổ sung validate và câu lệnh `INSERT`/`UPDATE` trong `backend/src/routes/employees.routes.ts`.
  3. Thêm input vào form trong `frontend/src/components/EmployeesView.tsx`.
  4. Cập nhật lại mục 3 trong file `02-ho-so-nhan-vien.md` này.

## 5. Cập nhật ngày 16/11/2026

- `POST /api/employees` nhận thêm `role` và tạo đồng thời hồ sơ, quỹ phép, tài khoản trong một transaction. `users.username` bằng email nhân viên; mật khẩu ngẫu nhiên được băm bằng `scrypt` trước khi lưu.
- Phản hồi tạo mới có `account: { username, password, role }`. UI hiển thị email và mật khẩu ban đầu trong hộp thoại có nút sao chép sau khi lưu thành công. Mật khẩu rõ không xuất hiện trong `/api/state` hoặc nhật ký.
- Form thêm mới có vai trò tài khoản. Chọn vai trò Giám đốc hoặc chức vụ Giám đốc sẽ ẩn phòng ban; backend lưu `department_id = NULL` kể cả khi request gửi kèm phòng ban. Nhân viên thông thường vẫn phải có phòng ban.
- Nhân sự được cấp tài khoản khi tạo hồ sơ; chỉ quản trị viên được tạo vai trò `admin`.
- Bổ sung trạng thái và tab **Đã nghỉ việc**. Nhân viên nghỉ việc không được tính vào danh sách đang làm, không đăng nhập và không được chọn để tạo công tác, hợp đồng hoặc nghỉ phép mới. Vẫn có thể xem lịch sử và lưu trữ hồ sơ.
- Hợp đồng chấm dứt sẽ cập nhật trạng thái nhân viên trong cùng transaction; xem quy tắc chi tiết ở tài liệu hợp đồng.

### Tự sinh mã nhân viên

`POST /api/employees` tự cấp mã dạng `NV001` nối tiếp số lớn nhất hiện có, không nhận mã nhập tay. `nextBusinessId` trong `backend/src/utils/business-id.ts` khóa theo loại mã trong transaction trước khi cấp; tạo đồng thời không trùng mã. API trả `id` thực tế; mã cũ được giữ nguyên. Theo điều chỉnh mới nhất, mã không hiển thị trên frontend (kể cả form, chi tiết, thông báo, bộ chọn và báo cáo); dùng tên và email để nhận diện. Các số chỉ mục nghiệp vụ được bỏ khỏi nhãn giao diện.

### Nâng cấp Giao diện Responsive Đa thiết bị (Mobile, Tablet, Fold, Smart Devices)

- **Bảng danh sách hồ sơ (`Table`)**: Thêm cấu hình `scroll={{ x: 800 }}` và hỗ trợ vuốt chạm mượt mà trên di động (`-webkit-overflow-scrolling: touch`), giúp xem đầy đủ các cột mà không làm méo hay vỡ bảng trên điện thoại và thiết bị gập.
- **Thanh công cụ & Bộ lọc đa tiêu chí**:
  - Hàng nút hành động ("Xuất danh sách", "Thêm nhân viên") hỗ trợ tự động xuống dòng trên màn hình hẹp (`Space flex-wrap`).
  - Ô tìm kiếm và các bộ lọc Phòng ban, Trạng thái chuyển sang dạng co giãn thích ứng fluid (`className="w-full xs:w-48 sm:w-56"`, `className="w-full xs:w-44 sm:w-48"`), không bị tràn chiều ngang màn hình.
- **Hộp thoại Chi tiết hồ sơ (`Modal`)**:
  - Sử dụng `Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}`: cố định 2 cột cân đối trên màn hình lớn và 1 cột trên điện thoại, không bị nhảy sang 3 cột làm méo thông tin.
  - Vùng nút chân trang (Đóng, Lưu trữ, Khôi phục, Chỉnh sửa) sử dụng `<Space wrap>` để không bị đẩy lệch ra ngoài màn hình.
- **Form Thêm mới & Chỉnh sửa hồ sơ**:
  - Lưới thông tin sử dụng `grid grid-cols-1 sm:grid-cols-2 gap-x-4` tối ưu cho cả thao tác nhập liệu bàn phím máy tính lẫn bàn phím ảo trên điện thoại.
  - Modal điều chỉnh thông tin liên hệ cá nhân (`selfContactModal`) co giãn linh hoạt 100% chiều rộng trên di động.

## Cập nhật ngày 16/11/2026 — Hồ sơ nhân viên

- **Trạng thái do hợp đồng quyết định**: hợp đồng hiện hành loại *Thử việc* → `Thử việc`, loại khác → `Đang làm việc` (hàm `syncEmployeeStatuses`, chạy sau mỗi thay đổi hợp đồng và trong job theo ngày). Khi **sửa** hồ sơ không còn nhập tay trạng thái (API bỏ qua trường `status`); chỉ chọn trạng thái ban đầu lúc **thêm** hồ sơ.
- **Khóa lạc quan**: cột `employees.version` tăng mỗi lần sửa; `PUT /api/employees/:id` nhận `version` và trả `409` nếu hồ sơ đã bị người khác sửa. Giao diện gửi kèm `version`.
- **Đồng bộ tên đăng nhập**: khi đổi email (HR sửa hoặc nhân viên tự cập nhật liên hệ), tài khoản tạo theo email đổi tên đăng nhập theo, trong cùng transaction.
- **Kiểm tra dữ liệu**: nhân viên phải đủ **15 tuổi** tại ngày vào làm; số điện thoại dạng `0xxxxxxxxx` hoặc `+84xxxxxxxxx`; dùng chung bộ kiểm tra email/điện thoại (`assertContact`).
- **Cảnh báo trùng hồ sơ**: thêm hồ sơ trùng *họ tên + ngày sinh* hoặc *số điện thoại* trả `409`; giao diện hỏi xác nhận rồi gửi lại với `confirm_duplicate: true`.
- **Lưu trữ / khôi phục** chạy trong transaction có khóa dòng:
  - Lưu trữ chặn khi còn hợp đồng hiệu lực, đơn nghỉ chờ duyệt hoặc quyết định công tác chờ hiệu lực; khóa tài khoản (`users.active = 0`), hủy phiên, gỡ vai trò trưởng phòng.
  - Khôi phục tính lại trạng thái từ hợp đồng; **tài khoản không tự mở lại** — quản trị viên mở lại tường minh ở mục Tài khoản.
- Chức vụ điều hành (Giám đốc) nay xác định bằng cờ `positions.is_executive` thay vì so sánh chuỗi tên.
