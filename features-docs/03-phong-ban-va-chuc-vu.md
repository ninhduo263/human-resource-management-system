# 03. Phân hệ 2.0 - Quản lý Phòng ban và Chức vụ (`2.1` – `2.4`)

## 1. Đối chiếu 4 Tài liệu Thiết kế
- **BFD**: Nhóm `2. Phòng ban và chức vụ`:
  - `2.1 Quản lý phòng ban` (kèm chỉ định Trưởng phòng `MaTruongPhong` / `matruongphong`)
  - `2.2 Quản lý chức vụ`
  - `2.3 Phân bổ nhân sự` (Điều chuyển phòng ban theo Quyết định từ Ban giám đốc)
  - `2.4 Bổ nhiệm / Miễn nhiệm chức vụ` (Bổ nhiệm hoặc miễn nhiệm chức danh theo Quyết định từ Ban giám đốc)
- **DFD Mức 0 & Mức 1 (Trang 1 - `BFD_DFD_QLNS_v2.drawio`)**:
  - Tác nhân: `Cán bộ nhân sự` (quản lý danh mục phòng ban `2.1`, chức vụ `2.2`), `Ban giám đốc` (ban hành Quyết định điều chuyển `2.3`, Quyết định bổ nhiệm / miễn nhiệm `2.4`).
  - Kho dữ liệu: `D2 - Phòng ban, chức vụ`, `D4 - Quá trình công tác & Quyết định` (liên kết `D1 - Hồ sơ nhân viên`).
- **ERD (`ERD_QLNS_v2.drawio`)**: Thực thể `PHONGBAN` (`phongban`, có khóa ngoại `MaTruongPhong` / `matruongphong` và mối kết hợp `Là Trưởng phòng` 1-1 với `NHANVIEN`), `CHUCVU` (`chucvu`), liên kết với `NHANVIEN` (`nhanvien`), `QUYETDINH` (`quyetdinh`) và `QUATRINHCONGTAC` (`quatrinhcongtac`).

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
| `2.1` | `POST /api/departments`<br>`PUT /api/departments/:id`<br>`DELETE /api/departments/:id` | `admin`, `hr` | - Mã `mapb/macv` và `tenpb/tencv` duy nhất; yêu cầu `ngaythanhlap` hợp lệ.<br>- Chặn xóa (`409 Conflict`) nếu phòng ban đang có nhân viên hoặc lịch sử công tác tham chiếu (`ON DELETE RESTRICT`). |
| `2.2` | `POST /api/positions`<br>`PUT /api/positions/:id`<br>`DELETE /api/positions/:id` | `admin`, `hr` | - Mã `mapb/macv` và `tenpb/tencv` duy nhất; `capbac` là số nguyên từ `1` đến `10`.<br>- Chặn xóa (`409 Conflict`) nếu chức vụ đang được gán cho nhân viên hoặc lịch sử công tác. |
| `2.3` | `POST /api/assignments` (`type = 'Điều chuyển'`) | `admin`, `hr`, `director` | - Ghi nhận quyết định điều chuyển từ `mapbcu` sang `mapbmoi` và cập nhật đồng thời hồ sơ nhân viên trong 1 transaction. |
| `2.4` | `POST /api/assignments` (`type = 'Bổ nhiệm'` / `'Điều chuyển và bổ nhiệm'`) | `admin`, `hr`, `director` | - Ghi nhận quyết định bổ nhiệm từ `macvcu` sang `macvmoi` và cập nhật đồng thời hồ sơ nhân viên. |

## 4. Hướng dẫn Sửa đổi / Bảo trì sau này
- **Thay đổi thang cấp bậc chức vụ**: Sửa ràng buộc `CHECK (level BETWEEN 1 AND 10)` trong `backend/src/db/schema.sql` và hàm `numeric(b, 'level', 1, 10)` trong `backend/src/routes/catalogs.routes.ts`.
- **Giao diện Phòng ban / Chức vụ**: Chỉnh sửa trực tiếp trong `frontend/src/components/DepartmentsView.tsx`.

## 5. Cập nhật ngày 16/11/2026

`POST /api/departments` tự cấp mã `PB07`… nối tiếp số lớn nhất đang có, không cần nhập mã. Cấp mã, lưu và ghi nhật ký trong cùng transaction với khóa chống trùng khi tạo đồng thời. API trả HTTP 201 kèm `id`. Mã phòng ban không hiển thị trên biểu mẫu hoặc thẻ phòng ban; giao diện dùng tên. Bỏ các số chỉ mục nghiệp vụ trên giao diện. Mã chức vụ giữ theo cơ chế hiện có.

### Nâng cấp Giao diện Responsive Đa thiết bị (Mobile, Tablet, Fold, Smart Devices)

- **Lưới thẻ phòng ban (`Card`)**: Cấu hình `Col xs={24} md={12} lg={8}` giúp danh sách phòng ban hiển thị 1 cột trên điện thoại và thiết bị gập, 2 cột trên tablet và 3 cột trên desktop.
- **Bảng danh mục chức vụ (`Table`)**: Thêm `scroll={{ x: 650 }}` đảm bảo các cột Mã chức vụ, Tên chức vụ, Cấp bậc, Mô tả, Số nhân viên và Thao tác có thể cuộn ngang nhẹ nhàng trên di động.
- **Thanh thao tác trên cùng**: Các nút "Phân bổ / Bổ nhiệm" và "Thêm phòng ban / Thêm chức vụ" hỗ trợ tự động wrap (`Space className="no-print w-full sm:w-auto flex-wrap"`).
- **Hộp thoại Thêm/Sửa phòng ban và chức vụ**: Tự động co giãn theo chiều rộng màn hình, padding được tinh chỉnh gọn gàng trên thiết bị di động.

## Cập nhật ngày 16/11/2026 — Phòng ban và chức vụ

- **Phòng ban**: thêm `head_id` (trưởng phòng, phải là nhân viên đang làm việc thuộc chính phòng đó) và `active` (ngừng sử dụng — không thể chọn cho nhân viên/quyết định mới). Form sửa phòng ban có chọn trưởng phòng và công tắc *Đang sử dụng*. `head_id` tự đồng bộ khi bổ nhiệm, điều chuyển, đổi vai trò hoặc lưu trữ hồ sơ.
- **Chức vụ**: mã **tự sinh** (`CV01`, `CV02`... theo transaction có khóa), API bỏ qua mã gửi lên. Thêm `is_executive` (chức vụ điều hành, không thuộc phòng ban), `default_role` (`employee`/`manager`/`director`; khi bổ nhiệm vào chức vụ này, vai trò tài khoản tự đồng bộ theo) và `active`.
- **Xóa danh mục đang dùng** trả thông báo cụ thể ("đang được sử dụng: 5 nhân viên, 2 quyết định công tác") và gợi ý chuyển sang *ngừng sử dụng*.
- Nhật ký tách `Thêm/Cập nhật/Xóa phòng ban` và `Thêm/Cập nhật/Xóa chức vụ`, có giá trị trước/sau.
