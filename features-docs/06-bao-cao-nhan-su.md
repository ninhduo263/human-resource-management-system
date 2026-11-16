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
- **Frontend (Ant Design)**:
  - `frontend/src/components/ReportsView.tsx`: Màn hình chọn loại báo cáo (`5.1` – `5.4`) dùng `Card`, `Statistic`, `Table`, `Select`, `Button` của `antd`, lọc theo Phòng ban và Khoảng thời gian (`Từ ngày` – `Đến ngày`), in báo cáo (`window.print()`) và xuất CSV UTF-8 BOM.
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

## 5. Cập nhật ngày 16/11/2026 — Nâng cấp Giao diện Responsive Đa thiết bị (Mobile, Tablet, Fold, Smart Devices)

- **Bộ lọc Báo cáo đa chiều**:
  - Hộp chọn loại báo cáo và phòng ban chuyển sang dạng fluid (`className="w-full sm:w-64"`, `className="w-full sm:w-52"`).
  - Khoảng thời gian lọc (`Từ ngày` – `Đến ngày`) tự động căn chỉnh ngang/dọc linh hoạt theo bề rộng màn hình.
  - Nút "Đặt lại bộ lọc", "In / Lưu PDF" và "Tải báo cáo CSV" hỗ trợ wrap tự động (`Space flex-wrap`).
- **Thẻ Tóm tắt Số liệu Thống kê (`Card`)**:
  - Sử dụng `Col xs={24} sm={8}`: trên điện thoại hiển thị 1 cột thẻ trực quan, trên tablet và desktop dàn đều 3 cột (Số lượng bản ghi, Phạm vi phòng ban, Ngày lập báo cáo).
- **Bảng Dữ liệu Báo cáo (`Table`)**:
  - Bổ sung cấu hình `scroll={{ x: 800 }}` đảm bảo các báo cáo có nhiều cột (như Biến động, Hợp đồng, Nghỉ phép) cuộn ngang mượt mà mà không làm méo cỡ chữ hoặc vỡ bố cục trên màn hình nhỏ.
  - Phân trang gọn gàng tự căn giữa trên mobile.
- **In ấn & Xuất file**:
  - Tiếp tục hỗ trợ in ấn tối ưu qua `@media print`, ẩn toàn bộ các thanh điều hướng (Sider, Header, Bottom Navigation, nút thao tác) để tạo bản in PDF chuẩn chỉnh.

## Cập nhật ngày 16/11/2026

- **Báo cáo biến động nhân sự** chỉ liệt kê quyết định công tác `Hiệu lực` (bỏ qua quyết định `Chờ hiệu lực` và `Đã hủy`).
- **Báo cáo hợp đồng** hiển thị thêm trạng thái `Đã hủy bỏ`; thẻ màu và bộ lọc ở màn hình Hợp đồng đã bổ sung trạng thái này.
- Số ngày nghỉ trong báo cáo nghỉ phép nay là **ngày làm việc** (không còn tính cả cuối tuần/ngày lễ) và quỹ phép dùng quy tắc mặc định mới ở tài liệu 05.
- Báo cáo vẫn tính ở frontend từ `GET /api/state`; xuất báo cáo từ máy chủ có phân trang chưa được làm.
