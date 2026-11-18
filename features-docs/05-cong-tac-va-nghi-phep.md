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
  - `QUYETDINH` (`quyetdinh`) — quan hệ `1-N` với `QUATRINHCONGTAC` (`quatrinhcongtac`).
  - `LOAINGHIPHEP` (`loainghiphep`), `DONNGHIPHEP` (`donnghiphep`), `SONGAYPHEP` (`songayphep` & View `v_songayphep`).

## 2. Các File Mã nguồn Liên quan
- **Backend**:
  - `backend/src/routes/assignments.routes.ts` (`4.1 Ghi nhận công tác` & dùng chung Quyết định 1-N)
  - `backend/src/routes/leaves.routes.ts` (`4.2 Đăng ký`, `4.3 Duyệt`, `4.4 Quỹ phép`, ngày lễ)
  - `backend/src/services/leave.ts`, `backend/src/services/assignments.ts` (xem mục cập nhật 16/11/2026 bên dưới)
- **Frontend (Ant Design)**:
  - `frontend/src/components/AssignmentsView.tsx` (Sử dụng `Table`, `Modal`, `Select`, `Descriptions`, `Alert`, `Tag` của `antd`)
  - `frontend/src/components/LeavesView.tsx` (Sử dụng `Table`, `Tabs`, `Modal`, `Form`, `InputNumber`, `Popconfirm`, `Descriptions`, `Tag` của `antd`)

## 3. Danh sách API Endpoints & Quy tắc Nghiệp vụ

| Mã BFD | Phương thức & Đường dẫn | Quyền hạn | Quy tắc Kiểm tra & Xử lý |
| :--- | :--- | :--- | :--- |
| `4.1` | `POST /api/assignments` | `admin`, `hr`, `director` | - Hỗ trợ tạo quyết định mới hoặc **tái sử dụng quyết định đã có** (nhiều nhân viên chung 1 `SoQD` khi khớp thông tin quyết định).<br>- Hỗ trợ 4 loại biến động: `Điều chuyển`, `Bổ nhiệm`, `Miễn nhiệm`, `Điều chuyển và bổ nhiệm` khớp chính xác với quyết định của Ban Giám đốc.<br>- Transaction nguyên tử: lưu `quyetdinh` + lưu `quatrinhcongtac` (giữ `mapbcu`/`macvcu`) + cập nhật `nhanvien`. |
| `4.2` | `POST /api/leaves`<br>`POST /api/leaves/:id/cancel` | `admin`, `hr`, `manager`, `employee` | - `start_date >= today`, `start_date >= join_date`, `end_date >= start_date`, cùng năm dương lịch.<br>- `days <= loainghiphep.max_days`.<br>- Tự động xác định Trưởng phòng phụ trách (`phongban.matruongphong`) làm người duyệt thẩm quyền.<br>- Chặn trùng lịch với đơn đang `Chờ duyệt` hoặc `Đã duyệt`.<br>- Cho phép hủy đơn đang `Chờ duyệt`. |
| `4.3` | `POST /api/leaves/:id/review` | `admin`, `manager`, `director` | - Chặn tự duyệt đơn của chính mình.<br>- `manager` là Trưởng phòng (`phongban.matruongphong`) duyệt đơn của nhân viên thuộc phòng ban mình phụ trách.<br>- Khi `Từ chối` bắt buộc nhập `ghichuduyet`.<br>- Khi `Đã duyệt` đơn loại `Phép năm` (`deduct_annual = 1`): kiểm tra quỹ phép còn đủ trong transaction trước khi duyệt. |
| `4.4` | `POST /api/balances`<br>`GET /api/state` | `admin`, `hr` (điều chỉnh)<br>Tất cả (xem theo phạm vi) | - Hỗ trợ theo dõi và điều chỉnh quỹ phép đa năm (`2000`–`2100`).<br>- `tongsongayphep` không được nhỏ hơn số ngày đã sử dụng (`used`) trong năm đó. |

## 4. Hướng dẫn Sửa đổi / Bảo trì sau này
- **Thêm loại nghỉ phép mới (ví dụ: Nghỉ thai sản)**: Thêm vào `backend/src/db/seed.ts` hoặc bảng `loainghiphep` (`deduct_annual = 0` nếu không trừ phép năm, `deduct_annual = 1` nếu trừ phép năm).
- **Đổi ngày làm việc trong tuần (ví dụ: làm cả Thứ 7)**: đặt biến môi trường `WORKING_DAYS` (mặc định `1,2,3,4,5`; 0 = Chủ nhật) hoặc sửa `WORKING_WEEKDAYS` trong `backend/src/utils/validation.ts`. Ngày lễ quản lý ở bảng `ngayle`.

## 5. Cập nhật ngày 16/11/2026 — Nâng cấp Giao diện Responsive Đa thiết bị (Mobile, Tablet, Fold, Smart Devices)

- **Quá trình công tác (`AssignmentsView.tsx`)**:
  - Bảng lịch sử biến động nhân sự thêm `scroll={{ x: 850 }}` cho phép lướt xem các cột biến động (Phòng ban cũ/mới, Chức vụ cũ/mới, Ngày hiệu lực, Số quyết định) trơn tru trên mọi thiết bị cầm tay.
  - Form ghi nhận công tác và quyết định mới chuyển sang lưới `grid grid-cols-1 sm:grid-cols-2 gap-4`, giúp người dùng dễ dàng thao tác trên màn hình nhỏ.
  - Hộp thoại Chi tiết Quyết định (`Modal`) thiết lập `width={640}` và dùng `Descriptions column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}` co giãn thông minh, ngăn chặn lỗi nhảy 3 cột làm méo bảng.
- **Quản lý Nghỉ phép (`LeavesView.tsx`)**:
  - Bảng đơn nghỉ phép (`scroll={{ x: 800 }}`) và Bảng theo dõi quỹ phép năm (`scroll={{ x: 750 }}`) được trang bị thanh cuộn cảm ứng đa điểm.
  - Bộ lọc năm, tìm kiếm, phòng ban và trạng thái thiết kế fluid thích ứng linh hoạt (`className="w-full xs:w-48 sm:w-56"`).
  - **Khắc phục lỗi trình bày form popup**: Hộp thoại Chi tiết đơn nghỉ phép (`Modal`) bổ sung `width={640}` và cố định `Descriptions column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}`, đảm bảo luôn chia đều 2 cặp cột thông tin cân đối trên màn hình tablet/desktop và 1 cột trên điện thoại. Chống lỗi rớt chữ và ngắt dòng tên nhân viên, ngày tháng bằng `white-space: nowrap` và `word-break: normal` trong `index.css`.
  - Hộp thoại Đăng ký nghỉ phép (`width={560}`), Phê duyệt (`width={520}`) và Quỹ phép (`width={520}`) được căn chỉnh kích thước thoáng đãng.
  - **Tích hợp Badge thời gian thực**: Số đơn nghỉ phép đang chờ duyệt (`Chờ duyệt`) được hiển thị trực tiếp trên nút Nghỉ phép của **Thanh điều hướng dưới đáy (Bottom Navigation Bar)** trên điện thoại di động và thanh menu Drawer, giúp Trưởng phòng/Quản trị viên nhận biết đơn mới ngay lập tức.

## Cập nhật ngày 16/11/2026 — Nghiệp vụ công tác và nghỉ phép

> Các quy tắc ở bảng mục 3 được thay thế/bổ sung như sau (nội dung bảng cũ về `start_date >= today`, tính ngày dương lịch, chỉ `admin`/`manager` duyệt không còn đúng).

### Công tác (`assignments.routes.ts`, `services/assignments.ts`)
- **Quyết định hiệu lực trong tương lai** (tối đa 12 tháng): lưu ở trạng thái `Chờ hiệu lực` và tự áp dụng khi đến ngày (job theo ngày); hiệu lực từ hôm nay trở về trước được áp dụng ngay. Mỗi nhân viên chỉ có một quyết định chờ hiệu lực.
- **Hủy / hoàn tác** — `POST /api/assignments/:id/cancel` (kèm lý do): hủy quyết định chờ hiệu lực, hoặc hoàn tác biến động hiệu lực **gần nhất** (hồ sơ trở về phòng ban/chức vụ cũ nếu chưa bị thay đổi sau đó). Bản ghi chuyển `Đã hủy`, quyết định gốc được giữ lại. Giao diện: nút **Hủy QĐ** và cột Trạng thái.
- Số quyết định được tạo bằng `INSERT ... ON CONFLICT (number)` trong transaction (hết race khi hai request cùng số quyết định).
- **Đồng bộ phân quyền**: bổ nhiệm vào chức vụ có `default_role` thì vai trò tài khoản tự đổi theo; trưởng phòng mới tự thành `head_id` của phòng chưa có trưởng phòng, rời phòng thì mất vai trò trưởng phòng ở phòng cũ.
- Báo cáo biến động nhân sự chỉ tính quyết định `Hiệu lực`.

### Nghỉ phép (`leaves.routes.ts`, `services/leave.ts`)
- **Số ngày nghỉ = ngày làm việc thực tế** (bỏ Thứ 7, Chủ nhật và ngày lễ trong bảng `holidays`); đơn không có ngày làm việc nào bị từ chối. Đơn nghỉ **qua năm được tự tách** thành các đơn theo từng năm (`days <= max_days` tính trên tổng).
- **Nhập đơn lùi ngày**: chỉ `admin`/`hr` được nhập ngày bắt đầu trước hôm nay (ốm đột xuất, quên làm đơn), có ghi nhật ký; nhân viên/trưởng phòng/giám đốc vẫn phải từ hôm nay. Giám đốc nay cũng được nộp đơn.
- **Hủy đơn đã duyệt**: chủ đơn hủy được khi chưa đến ngày nghỉ; `admin`/`hr` hủy được khi kỳ nghỉ chưa kết thúc. Quỹ phép tự hoàn lại vì được tính từ các đơn `Đã duyệt`.
- **Tuyến duyệt** (hàm `canReviewLeave`, không bao giờ tự duyệt): `admin` duyệt mọi đơn; trưởng phòng duyệt nhân viên cùng phòng; giám đốc duyệt trưởng phòng và nhân viên thuộc phòng **chưa có trưởng phòng**; `hr` duyệt giám đốc và nhân viên thuộc phòng chưa có trưởng phòng. Vi phạm trả `403`.
- **Duyệt an toàn đồng thời**: khóa dòng nhân viên trước khi kiểm tra quỹ phép, nên hai lần duyệt song song không thể vượt quỹ. Nộp đơn và hủy đơn cũng chạy trong transaction có khóa.
- **Quỹ phép mặc định** khi chưa có bản ghi `leave_balances`: 12 ngày, **+1 ngày mỗi 5 năm thâm niên**; năm vào làm tính theo số tháng còn lại (làm tròn xuống). Chuyển phép sang năm sau chưa tự động — HR điều chỉnh bằng `POST /api/balances`.
- **Ngày lễ**: `GET/POST /api/holidays`, `DELETE /api/holidays/:day` (`admin`/`hr`). Hiện **chưa có màn hình quản lý ngày lễ**; thêm/sửa/xóa ngày lễ **không** tính lại các đơn đã nộp.
