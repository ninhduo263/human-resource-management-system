# 05. Phân hệ 4.0 - Quản lý Công tác và Nghỉ phép (`4.1` – `4.4`)

## 1. Đối chiếu 4 Tài liệu Thiết kế
- **BFD**: Nhóm `4. Công tác và nghỉ phép`:
  - `4.1 Ghi nhận công tác`
  - `4.2 Đăng ký nghỉ phép`
  - `4.3 Duyệt nghỉ phép`
  - `4.4 Theo dõi ngày phép`
- **DFD Mức 0 & Mức 1 (Trang 2)**:
  - Tác nhân: `Cán bộ nhân sự` (ghi nhận quá trình công tác), `Nhân viên` (nộp đơn xin nghỉ phép, nhận kết quả duyệt), `Trưởng phòng` (xem danh sách đơn chờ duyệt, ra quyết định duyệt/từ chối).
  - Kho dữ liệu: `D4 - Quá trình công tác`, `D5 - Nghỉ phép`.
- **ERD**:
  - `QUYETDINH` (`decisions`) — quan hệ `1-N` với `QUATRINHCONGTAC` (`assignments`).
  - `LOAINGHIPHEP` (`leave_types`), `DONNGHIPHEP` (`leave_requests`), `SONGAYPHEP` (`leave_balances` & View `v_songayphep`).

## 2. Các File Mã nguồn Liên quan
- **Backend**:
  - `backend/src/routes/assignments.routes.ts` (`4.1 Ghi nhận công tác` & dùng chung Quyết định 1-N)
  - `backend/src/routes/leaves.routes.ts` (`4.2 Đăng ký`, `4.3 Duyệt`, `4.4 Quỹ phép`)
- **Frontend**:
  - `frontend/src/components/AssignmentsView.tsx`
  - `frontend/src/components/LeavesView.tsx`

## 3. Danh sách API Endpoints & Quy tắc Nghiệp vụ

| Mã BFD | Phương thức & Đường dẫn | Quyền hạn | Quy tắc Kiểm tra & Xử lý |
| :--- | :--- | :--- | :--- |
| `4.1` | `POST /api/assignments` | `admin`, `hr`, `director` | - Hỗ trợ tạo quyết định mới hoặc **tái sử dụng quyết định đã có** (nhiều nhân viên chung 1 `SoQD` khi khớp thông tin quyết định).<br>- Kiểm tra `type` (`Điều chuyển`, `Bổ nhiệm`, `Điều chuyển và bổ nhiệm`) khớp chính xác với thay đổi thực tế.<br>- Transaction nguyên tử: lưu `decisions` + lưu `assignments` (giữ `old_department_id`/`old_position_id`) + cập nhật `employees`. |
| `4.2` | `POST /api/leaves`<br>`POST /api/leaves/:id/cancel` | `admin`, `hr`, `manager`, `employee` | - `start_date >= today`, `start_date >= join_date`, `end_date >= start_date`, cùng năm dương lịch.<br>- `days <= leave_types.max_days`.<br>- Chặn trùng lịch với đơn đang `Chờ duyệt` hoặc `Đã duyệt`.<br>- Cho phép hủy đơn đang `Chờ duyệt`. |
| `4.3` | `POST /api/leaves/:id/review` | `admin`, `manager` | - Chặn tự duyệt đơn của chính mình.<br>- `manager` chỉ duyệt được đơn của nhân viên cùng `department_id`.<br>- Khi `Từ chối` bắt buộc nhập `review_note`.<br>- Khi `Đã duyệt` đơn loại `Phép năm` (`deduct_annual = 1`): kiểm tra quỹ phép còn đủ trong transaction trước khi duyệt. |
| `4.4` | `POST /api/balances`<br>`GET /api/state` | `admin`, `hr` (điều chỉnh)<br>Tất cả (xem theo phạm vi) | - Hỗ trợ theo dõi và điều chỉnh quỹ phép đa năm (`2000`–`2100`).<br>- `total` không được nhỏ hơn số ngày đã sử dụng (`used`) trong năm đó. |

## 4. Hướng dẫn Sửa đổi / Bảo trì sau này
- **Thêm loại nghỉ phép mới (ví dụ: Nghỉ thai sản)**: Thêm vào `backend/src/db/seed.ts` hoặc bảng `leave_types` (`deduct_annual = 0` nếu không trừ phép năm, `deduct_annual = 1` nếu trừ phép năm).
- **Sửa logic tính ngày nghỉ (ví dụ: trừ Thứ 7, Chủ nhật)**: Sửa hàm `calendarDays(start, end)` trong `backend/src/utils/validation.ts`.
