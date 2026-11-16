# 04. Phân hệ 3.0 - Quản lý Hợp đồng Lao động (`3.1` – `3.4`)

## 1. Đối chiếu 4 Tài liệu Thiết kế
- **BFD**: Nhóm `3. Hợp đồng lao động`:
  - `3.1 Lập hợp đồng`
  - `3.2 Gia hạn hợp đồng`
  - `3.3 Chấm dứt hợp đồng`
  - `3.4 Theo dõi hết hạn HĐ`
- **DFD Mức 0 & Mức 1 (Trang 2)**:
  - Tác nhân: `Cán bộ nhân sự` (lập hợp đồng mới, gia hạn, chấm dứt, nhận cảnh báo hợp đồng sắp hết hạn).
  - Kho dữ liệu: `D3 - Hợp đồng`.
- **ERD**: Thực thể `HOPDONG` (`contracts`) và `GIAHANHOPDONG` (`extensions`, quan hệ 1-N lưu lịch sử từng lần gia hạn).

## 2. Các File Mã nguồn Liên quan
- **Backend**:
  - `backend/src/routes/contracts.routes.ts`
  - `backend/src/routes/auth.routes.ts` (Xử lý trạng thái hiệu lực và ẩn lương `salary` theo vai trò)
- **Frontend**: `frontend/src/components/ContractsView.tsx`
- **Database**: Bảng `contracts` và `extensions` trong `backend/src/db/schema.sql`

## 3. Danh sách API Endpoints & Quy tắc Nghiệp vụ

| Mã BFD | Phương thức & Đường dẫn | Quyền hạn | Quy tắc Kiểm tra & Xử lý |
| :--- | :--- | :--- | :--- |
| `3.1` | `POST /api/contracts` | `admin`, `hr` | - Hỗ trợ 3 loại HĐ: `Thử việc`, `Xác định thời hạn`, `Không xác định thời hạn`.<br>- `start_date >= employee.join_date`, `salary > 0`.<br>- Chặn lập hợp đồng trùng khoảng thời gian với các hợp đồng chưa chấm dứt của cùng nhân viên. |
| `3.2` | `POST /api/contracts/:id/extend` | `admin`, `hr` | - Chỉ gia hạn hợp đồng đang hoạt động và có `end_date`.<br>- `new_end_date` phải sau `old_end_date` và `>= today`.<br>- Tạo bản ghi `extensions` với `sequence = MAX(sequence) + 1` và cập nhật `contracts.end_date` trong cùng 1 transaction. |
| `3.3` | `POST /api/contracts/:id/terminate` | `admin`, `hr` | - Ghi nhận `terminated_date` (từ `start_date` đến `today` và `<= end_date`) cùng `termination_reason`.<br>- Đổi trạng thái thành `Đã chấm dứt`. |
| `3.4` | `GET /api/state` (Tự động cảnh báo) | Tất cả vai trò (theo phạm vi) | - Tự động suy diễn trạng thái: `Chưa hiệu lực`, `Hiệu lực`, `Sắp hết hạn` (còn $\le 30$ ngày), `Hết hạn`, `Đã chấm dứt`.<br>- Hiển thị danh sách cảnh báo 30 ngày trên Dashboard và tab `Sắp hết hạn`. |

## 4. Hướng dẫn Sửa đổi / Bảo trì sau này
- **Thay đổi ngưỡng cảnh báo sắp hết hạn (hiện tại 30 ngày)**: Chỉnh sửa hàm `contractStatus` trong `frontend/src/utils/format.ts` (hoặc `ContractsView.tsx`).
- **Thêm loại hợp đồng mới**: Cập nhật `CHECK (type IN (...))` trong `backend/src/db/schema.sql` và mảng `choice` trong `backend/src/routes/contracts.routes.ts`.
