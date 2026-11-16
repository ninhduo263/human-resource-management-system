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
- **ERD**: Thực thể `NHANVIEN` (`employees`) liên kết `PHONGBAN` (`departments`), `CHUCVU` (`positions`), `HOPDONG` (`contracts`), `QUATRINHCONGTAC` (`assignments`), `DONNGHIPHEP` (`leave_requests`), `SONGAYPHEP` (`leave_balances`).

## 2. Các File Mã nguồn Liên quan
- **Backend**: `backend/src/routes/employees.routes.ts`
- **Frontend (Ant Design)**: `frontend/src/components/EmployeesView.tsx` (Sử dụng `Table`, `Tabs`, `Input`, `Select`, `Modal`, `Form`, `Descriptions`, `Popconfirm`, `Avatar`, `Tag` của `antd`)
- **Database**: Bảng `employees` và `leave_balances` trong `backend/src/db/schema.sql`

## 3. Danh sách API Endpoints & Quy tắc Nghiệp vụ

| Mã BFD | Phương thức & Đường dẫn | Quyền hạn | Quy tắc Kiểm tra & Xử lý |
| :--- | :--- | :--- | :--- |
| `1.1` | `POST /api/employees` | `admin`, `hr` | - Kiểm tra mã `id` duy nhất, `email` duy nhất, `birth_date < join_date` và `< today`.<br>- Cấp tự động quỹ phép năm hiện tại (`12 ngày`) trong cùng transaction. |
| `1.2` | `PUT /api/employees/:id` | `admin`, `hr` (hoặc `self_contact` cho chính nhân viên đó) | - Chặn đổi `join_date` thành sau ngày bắt đầu hợp đồng/công tác/đơn phép đã có.<br>- Chặn sửa trực tiếp `department_id` hoặc `position_id` (bắt buộc qua chức năng Công tác `4.1` để lưu quyết định).<br>- Hỗ trợ nhân viên tự cập nhật thông tin liên hệ cá nhân (`phone`, `email`, `address`). |
| `1.3` | `GET /api/state` (Lọc/Tra cứu trên UI) | Tất cả vai trò (theo phạm vi) | - Tìm kiếm theo `id`, `name`, `email`.<br>- Lọc theo `department_id`, `status` (`Đang làm việc`, `Thử việc`, `Đã lưu trữ`).<br>- Xem hồ sơ chi tiết kèm danh sách hợp đồng, lịch sử công tác, số ngày phép còn lại. |
| `1.4` | `POST /api/employees/:id/archive`<br>`POST /api/employees/:id/restore` | `admin`, `hr` | - Không được tự lưu trữ chính mình.<br>- Chỉ lưu trữ khi không còn hợp đồng hiệu lực/tương lai và không còn đơn nghỉ phép `Chờ duyệt`.<br>- Chuyển trạng thái sang `Đã lưu trữ`, ghi `archived_date`, thu hồi mọi phiên đăng nhập của nhân viên đó.<br>- Cho phép khôi phục (`restore`) hồ sơ đã lưu trữ về `Đang làm việc`. |

## 4. Hướng dẫn Sửa đổi / Bảo trì sau này
- **Thêm trường mới vào hồ sơ nhân viên (ví dụ: CCCD, trình độ học vấn)**:
  1. Thêm cột vào bảng `employees` trong `backend/src/db/schema.sql`.
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
