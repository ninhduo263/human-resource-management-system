# 06. Phân hệ 5.0 - Báo cáo và Thống kê Nhân sự (`5.1` – `5.4`)

## 1. Đối chiếu 4 Tài liệu Thiết kế
- **BFD**: Nhóm `5. Báo cáo nhân sự`:
  - `5.1 Thống kê nhân sự`
  - `5.2 Báo cáo biến động`
  - `5.3 Báo cáo hợp đồng`
  - `5.4 Báo cáo nghỉ phép`
- **DFD Mức 0 & Mức 1 (Trang 3)**:
  - Tác nhân: `Ban giám đốc` (gửi yêu cầu báo cáo, nhận cả 4 loại báo cáo), `Cán bộ nhân sự` (nhận báo cáo phục vụ quản lý).
  - Kho dữ liệu đầu vào:
    - `5.1 Thống kê nhân sự`: Đọc từ `D1 (Hồ sơ nhân viên)` + `D2 (Phòng ban, chức vụ)`.
    - `5.2 Báo cáo biến động`: Đọc từ `D1 (Hồ sơ nhân viên)` + `D4 (Quá trình công tác)`.
    - `5.3 Báo cáo hợp đồng`: Đọc từ `D3 (Hợp đồng)`.
    - `5.4 Báo cáo nghỉ phép`: Đọc từ `D5 (Nghỉ phép)`.

## 2. Các File Mã nguồn Liên quan
- **Backend**: `backend/src/routes/auth.routes.ts` (`buildScopedState` trả dữ liệu tổng hợp từ 5 nhóm kho D1–D5 theo đúng thẩm quyền người dùng).
- **Frontend**:
  - `frontend/src/components/ReportsView.tsx`: Màn hình chọn loại báo cáo (`5.1` – `5.4`), lọc theo Phòng ban và Khoảng thời gian (`Từ ngày` – `Đến ngày`), in báo cáo (`window.print()`) và xuất CSV UTF-8 BOM.
  - `frontend/src/utils/format.ts`: Hàm `downloadCsv` hỗ trợ tiếng Việt có dấu mở trực tiếp trên Microsoft Excel và chống CSV Formula Injection.

## 3. Chi tiết 4 Loại Báo cáo (`5.1` – `5.4`)

| Mã BFD | Tên báo cáo | Tiêu chí thời gian lọc | Các cột dữ liệu xuất / hiển thị |
| :--- | :--- | :--- | :--- |
| `5.1` | **Thống kê nhân sự** | `join_date` (Ngày vào làm) | Mã nhân viên, Họ tên, Giới tính, Phòng ban, Chức vụ, Ngày vào làm, Trạng thái |
| `5.2` | **Báo cáo biến động nhân sự** | `effective_date` (Ngày hiệu lực QĐ) | Nhân viên, Loại biến động, Phòng ban cũ, Phòng ban mới, Chức vụ mới, Ngày hiệu lực |
| `5.3` | **Báo cáo hợp đồng lao động** | `start_date` (Ngày bắt đầu HĐ) | Mã hợp đồng, Nhân viên, Loại hợp đồng, Ngày bắt đầu, Ngày kết thúc, Mức lương, Trạng thái |
| `5.4` | **Báo cáo nghỉ phép** | `start_date` (Ngày bắt đầu nghỉ) | Nhân viên, Loại nghỉ, Từ ngày, Đến ngày, Số ngày, Trạng thái, Người duyệt |

## 4. Hướng dẫn Sửa đổi / Bảo trì sau này
- **Thêm loại báo cáo thứ 5 hoặc thêm cột vào báo cáo**: Chỉnh sửa hàm `buildReportData()` và hằng số `REPORT_LABELS` trong `frontend/src/components/ReportsView.tsx`.
- **Chỉnh sửa định dạng khi in ấn / xuất PDF**: Sửa các quy tắc `@media print` trong `frontend/src/index.css`.
