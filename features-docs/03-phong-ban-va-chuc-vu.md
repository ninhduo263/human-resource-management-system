# 03. Phân hệ 2.0 - Quản lý Phòng ban và Chức vụ (`2.1` – `2.4`)

## 1. Đối chiếu 4 Tài liệu Thiết kế
- **BFD**: Nhóm `2. Phòng ban và chức vụ`:
  - `2.1 Quản lý phòng ban`
  - `2.2 Quản lý chức vụ`
  - `2.3 Phân bổ nhân sự` (Điều chuyển phòng ban theo Quyết định)
  - `2.4 Bổ nhiệm chức vụ` (Bổ nhiệm chức danh theo Quyết định)
- **DFD Mức 0 & Mức 1 (Trang 1)**:
  - Tác nhân: `Cán bộ nhân sự` (quản lý danh mục phòng ban `2.1`, chức vụ `2.2`), `Ban giám đốc` (ban hành Quyết định điều chuyển `2.3`, Quyết định bổ nhiệm `2.4`).
  - Kho dữ liệu: `D2 - Phòng ban, chức vụ`.
- **ERD**: Thực thể `PHONGBAN` (`departments`), `CHUCVU` (`positions`), liên kết với `NHANVIEN` (`employees`), `QUYETDINH` (`decisions`) và `QUATRINHCONGTAC` (`assignments`).

## 2. Các File Mã nguồn Liên quan
- **Backend**:
  - `backend/src/routes/catalogs.routes.ts` (Quản lý danh mục Phòng ban `2.1` & Chức vụ `2.2`)
  - `backend/src/routes/assignments.routes.ts` (Thực thi Phân bổ nhân sự `2.3` & Bổ nhiệm chức vụ `2.4`)
- **Frontend (Ant Design)**:
  - `frontend/src/components/DepartmentsView.tsx` (Sử dụng `Row`, `Col`, `Card`, `Avatar.Group`, `Table`, `Tabs`, `Modal`, `Form`, `InputNumber`, `Popconfirm` của `antd`)
  - `frontend/src/components/AssignmentsView.tsx`

## 3. Danh sách API Endpoints & Quy tắc Nghiệp vụ

| Mã BFD | Phương thức & Đường dẫn | Quyền hạn | Quy tắc Kiểm tra & Xử lý |
| :--- | :--- | :--- | :--- |
| `2.1` | `POST /api/departments`<br>`PUT /api/departments/:id`<br>`DELETE /api/departments/:id` | `admin`, `hr` | - Mã `id` và `name` duy nhất; yêu cầu `founded_date` hợp lệ.<br>- Chặn xóa (`409 Conflict`) nếu phòng ban đang có nhân viên hoặc lịch sử công tác tham chiếu (`ON DELETE RESTRICT`). |
| `2.2` | `POST /api/positions`<br>`PUT /api/positions/:id`<br>`DELETE /api/positions/:id` | `admin`, `hr` | - Mã `id` và `name` duy nhất; `level` là số nguyên từ `1` đến `10`.<br>- Chặn xóa (`409 Conflict`) nếu chức vụ đang được gán cho nhân viên hoặc lịch sử công tác. |
| `2.3` | `POST /api/assignments` (`type = 'Điều chuyển'`) | `admin`, `hr`, `director` | - Ghi nhận quyết định điều chuyển từ `old_department_id` sang `new_department_id` và cập nhật đồng thời hồ sơ nhân viên trong 1 transaction. |
| `2.4` | `POST /api/assignments` (`type = 'Bổ nhiệm'` / `'Điều chuyển và bổ nhiệm'`) | `admin`, `hr`, `director` | - Ghi nhận quyết định bổ nhiệm từ `old_position_id` sang `new_position_id` và cập nhật đồng thời hồ sơ nhân viên. |

## 4. Hướng dẫn Sửa đổi / Bảo trì sau này
- **Thay đổi thang cấp bậc chức vụ**: Sửa ràng buộc `CHECK (level BETWEEN 1 AND 10)` trong `backend/src/db/schema.sql` và hàm `numeric(b, 'level', 1, 10)` trong `backend/src/routes/catalogs.routes.ts`.
- **Giao diện Phòng ban / Chức vụ**: Chỉnh sửa trực tiếp trong `frontend/src/components/DepartmentsView.tsx`.
