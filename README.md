# Hệ thống Quản lý Nhân sự (PeopleOps HRMS) - Nhóm 16

Hệ thống được thiết kế và xây dựng hoàn chỉnh từ **4 tài liệu thiết kế gốc** (`BFD.jpeg`, `DFD-MUC0.png`, `ERD_QLNS_v2.drawio.pdf`, `Nhom_16_QL_Nhan_su.pdf`) sử dụng kiến trúc **Docker Compose**:

- **Database**: **PostgreSQL 16** (10 bảng thực thể ERD + View `v_songayphep` + 3 bảng hệ thống)
- **Backend**: **Node.js + Express + TypeScript** (`backend/`)
- **Frontend**: **React 18 + Vite + TypeScript + Tailwind CSS** (`frontend/`)
- **Container**: **Docker & Docker Compose** (`docker-compose.yml`)

---

## 1. Khởi chạy Hệ thống bằng Docker

1. Mở ứng dụng **Docker Desktop** trên máy.
2. Nhấp đúp vào `CHAY_HE_THONG.bat` hoặc mở Terminal tại thư mục gốc và chạy:

```powershell
docker-compose up --build -d
```

3. Truy cập ứng dụng tại: **http://localhost:3000**
   - Để xem trạng thái các container: `docker-compose ps`
   - Để tắt hệ thống: `docker-compose down`
   - Để xóa sạch dữ liệu và tạo lại dữ liệu mẫu từ đầu: `docker-compose down -v && docker-compose up -d`

---

## 2. Tài khoản Mẫu (5 Vai trò theo DFD)

Mật khẩu chung ban đầu: **`Demo@12345`** (có thể chọn nhanh ngay trên màn hình đăng nhập; mật khẩu `admin` đổi được bằng biến `ADMIN_PASSWORD`):

| Tên đăng nhập | Vai trò | Nhân viên liên kết | Phạm vi & Quyền hạn chính |
| :--- | :--- | :--- | :--- |
| `admin` | Quản trị viên | `NV001` - Nguyễn Minh Anh | Toàn quyền hệ thống, duyệt nghỉ phép, quản lý tài khoản & nhật ký |
| `nhansu` | Cán bộ nhân sự | `NV009` - Nguyễn Khánh Vy | Quản lý hồ sơ, phòng ban/chức vụ, hợp đồng, công tác, quỹ phép, ngày lễ, báo cáo; duyệt phép phòng chưa có trưởng phòng và giám đốc |
| `truongphong` | Trưởng phòng | `NV002` - Trần Quốc Bảo | Xem nhân sự trong phòng Công nghệ (ẩn lương người khác), duyệt phép nhân viên cùng phòng |
| `nhanvien` | Nhân viên | `NV003` - Lê Hoàng Nam | Xem thông tin cá nhân, cập nhật liên hệ, nộp/hủy đơn nghỉ phép của mình |
| `giamdoc` | Ban giám đốc | `NV010` - Trần Hải Đăng | Xem dữ liệu toàn tổ chức, 4 loại báo cáo, ghi nhận quyết định công tác; duyệt phép trưởng phòng và phòng chưa có trưởng phòng |

---

## 3. Thư mục Tài liệu Tính năng (`features-docs/`)

Mỗi tính năng sau khi hoàn thành được lưu trữ độc lập thành một file `.md` trong thư mục [`features-docs/`](./features-docs/README.md). Khi cần sửa đổi hoặc mở rộng bất kỳ tính năng nào, chỉ cần đọc đúng file `.md` của tính năng đó và cập nhật lại sau khi sửa:

- [Mục lục & Quy trình bảo trì tính năng](./features-docs/README.md)
- [00. Hạ tầng Docker & Cơ sở dữ liệu PostgreSQL (10 thực thể ERD)](./features-docs/00-ha-tang-docker-va-database.md)
- [01. Xác thực, Phân quyền 5 vai trò, Quản trị & Tổng quan](./features-docs/01-xac-thuc-phan-quyen-va-quan-tri.md)
- [02. Phân hệ 1.0 - Quản lý Hồ sơ nhân viên (1.1 – 1.4)](./features-docs/02-ho-so-nhan-vien.md)
- [03. Phân hệ 2.0 - Quản lý Phòng ban & Chức vụ (2.1 – 2.4)](./features-docs/03-phong-ban-va-chuc-vu.md)
- [04. Phân hệ 3.0 - Quản lý Hợp đồng lao động (3.1 – 3.4)](./features-docs/04-hop-dong-lao-dong.md)
- [05. Phân hệ 4.0 - Quản lý Công tác & Nghỉ phép (4.1 – 4.4)](./features-docs/05-cong-tac-va-nghi-phep.md)
- [06. Phân hệ 5.0 - Báo cáo & Thống kê nhân sự (5.1 – 5.4)](./features-docs/06-bao-cao-nhan-su.md)

---

## 4. Nhật ký thực hiện

Ghi lại công việc đã làm, cách chạy và kết quả kiểm tra tại mục này sau mỗi lần thực hiện.

### 16/11/2026 — Chạy dự án trực tiếp trên Windows

- Máy có Node.js `24.20.0`, npm `11.19.0` và PostgreSQL `18`; chưa có Docker nên đã chạy backend và frontend trực tiếp.
- Đã cài thư viện cho `backend/`, `frontend/` và tạo các file `package-lock.json`.
- Đã khởi tạo PostgreSQL riêng tại `../.peopleops-runtime/postgres-data`, chỉ lắng nghe ở `127.0.0.1:5433`, với database `peopleops_hrms`. PostgreSQL đang có trên cổng `5432` được giữ nguyên.
- Đã biên dịch backend, sao chép `src/db/schema.sql` vào `dist/db/schema.sql` và chạy backend tại cổng `5000`. Backend đã khởi tạo cấu trúc và dữ liệu mẫu.
- Đã chạy frontend bằng Vite tại **http://localhost:3000**. Các file log và PID nằm trong `../.peopleops-runtime/`.
- Đã kiểm tra: giao diện và module `src/main.tsx` trả HTTP `200`; `/api/health` trả `{"status":"ok"}`; đăng nhập `admin / Demo@12345`, tải `/api/state` và đăng xuất đều thành công.

**Chạy lại với cơ sở dữ liệu đã khởi tạo trên máy này:** mở PowerShell tại thư mục chứa file README này. Nếu PostgreSQL riêng chưa chạy, khởi động bằng:

```powershell
& 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe' -D '../.peopleops-runtime/postgres-data' -l '../.peopleops-runtime/postgres.log' -o '-p 5433 -h 127.0.0.1' -w start
```

Terminal thứ nhất — backend:

```powershell
cd backend
$env:DATABASE_URL = 'postgresql://peopleops:peopleops_secret@127.0.0.1:5433/peopleops_hrms'
$env:PORT = '5000'
npm.cmd run build
npm.cmd start
```

Terminal thứ hai — frontend:

```powershell
cd frontend
npm.cmd run dev -- --host 127.0.0.1 --port 3000 --strictPort
```

Chỉ chạy lại các lệnh khởi động khi tiến trình tương ứng đã dừng. Dữ liệu và log trong `../.peopleops-runtime/` là dữ liệu cục bộ, không nằm trong Git của dự án.

### 16/11/2026 — Sửa 4 yêu cầu nhân viên và hợp đồng

1. **Chấm dứt hợp đồng:** cập nhật trạng thái nhân viên trong cùng giao dịch. Khi không còn hợp đồng khác đang hiệu lực, nhân viên chuyển **Đã nghỉ việc**, được hiển thị trong tab riêng và bị thu hồi phiên đăng nhập. Nếu vẫn còn hợp đồng đang hiệu lực thì giữ trạng thái làm việc theo hợp đồng đó.
2. **Giám đốc không thuộc phòng ban:** form thêm nhân viên có vai trò tài khoản; chọn vai trò hoặc chức vụ Giám đốc sẽ ẩn phòng ban. Backend lưu phòng ban bằng `NULL`; các màn hình liên quan hiển thị **Không thuộc phòng ban**.
3. **Tự tạo tài khoản:** thêm hồ sơ sẽ tạo đồng thời tài khoản có tên đăng nhập bằng email và mật khẩu ngẫu nhiên. Sau khi lưu, hộp thoại hiển thị email/mật khẩu có nút sao chép. Database chỉ lưu mật khẩu đã băm; tài khoản mẫu cũ vẫn đăng nhập như trước.
4. **Phụ lục hợp đồng:** trong **Hợp đồng lao động → Chi tiết**, thêm nút **Điều chỉnh lương**. Thay đổi lương hoặc gia hạn đều tạo phụ lục lưu ngày lập, lý do, thời hạn cũ/mới và lương cũ/mới. Gia hạn có thể nhập thêm lương mới; để trống sẽ giữ nguyên. Lương mới có hiệu lực ngay khi lưu. Hợp đồng không xác định thời hạn vẫn lập được phụ lục lương.

Đã bổ sung cập nhật schema cho database đang có, giữ lịch sử gia hạn cũ; che lương trong phụ lục theo quyền xem; cập nhật danh sách đang làm ở Tổng quan, Phòng ban, Công tác, Nghỉ phép và Quản trị. Trưởng phòng không có phòng ban không được xem hoặc duyệt phép của người khác có phòng ban rỗng. Đã đặt tên riêng cho từng form để tránh trùng mã trường giữa các hộp thoại.

**Kiểm tra:** backend và frontend biên dịch thành công; 10 kiểm thử tự động qua trên database tạm riêng. Kiểm tra Chrome headless xác nhận ẩn/hiện phòng ban, hiển thị thông tin tài khoản sau khi tạo và các trường chỉnh lương/gia hạn, không có lỗi JavaScript trên trình duyệt. Bước hiển thị tài khoản dùng phản hồi API giả lập; các thao tác tạo tài khoản, đăng nhập, thay đổi hợp đồng và cập nhật trạng thái thực được kiểm tra trên database tạm, không thêm nhân viên kiểm thử vào dữ liệu đang dùng.

Chạy lại bộ kiểm thử nghiệp vụ trong PowerShell:

```powershell
cd backend
$env:TEST_DATABASE_URL = 'postgresql://peopleops:peopleops_secret@127.0.0.1:5433/peopleops_hrms'
npm.cmd test
Remove-Item Env:TEST_DATABASE_URL
```

PostgreSQL của URL kiểm thử cần quyền tạo database. Bộ kiểm thử tự tạo database có tên ngẫu nhiên và xóa khi hoàn tất. Các tài liệu `features-docs/00`, `01`, `02`, `04` đã được cập nhật theo thay đổi.

### 16/11/2026 — Tự sinh mã nhân viên và mã hợp đồng

- Thêm nhân viên hoặc lập hợp đồng không cần nhập mã. Backend tự cấp `NV001`, `NV002`… và `HD001`, `HD002`… nối tiếp số lớn nhất đã có của từng loại; giữ nguyên mọi mã cũ.
- Mã chỉ được cấp khi lưu trong transaction, có khóa riêng cho từng loại để tránh trùng khi nhiều người tạo đồng thời. API bỏ qua mã do người dùng gửi lên và trả mã thực tế trong `id`.
- Giao diện hiển thị ô mã tự sinh không chỉnh sửa được; thông báo lưu thành công có mã vừa cấp. Khi sửa nhân viên vẫn hiển thị mã hiện có.
- Đã bổ sung kiểm thử tạo đồng thời nhân viên/hợp đồng không gửi mã; bộ kiểm thử có 11 kiểm tra.

### 16/11/2026 — Gọn giao diện và ẩn mã nội bộ

- Bỏ các chỉ mục nghiệp vụ `1.0`, `2.0`, `3.0`… khỏi menu, tiêu đề, nút, hộp thoại, nhãn báo cáo và mô tả; bỏ nhãn BFD/kho dữ liệu trên giao diện.
- Mã phòng ban tự sinh theo dạng `PB07`, `PB08`… nối tiếp dữ liệu hiện có trong transaction có khóa chống trùng. API thêm phòng ban không cần mã, bỏ qua mã nhập tay và trả mã thực tế.
- Mã phòng ban, nhân viên và hợp đồng chỉ dùng nội bộ, không còn xuất hiện ở biểu mẫu thêm/sửa, bảng danh sách, chi tiết, thông báo, lựa chọn nhân viên, thẻ phòng ban, Tổng quan và báo cáo/CSV. Giao diện dùng tên và email để nhận diện; dữ liệu và liên kết cũ được giữ nguyên.
- Đối tượng trong nhật ký được hiển thị bằng tên nhân viên/phòng ban hoặc tên người có hợp đồng thay cho mã.
- Backend/frontend biên dịch thành công; 12 kiểm thử qua, gồm tạo phòng ban đồng thời không trùng mã. Chrome headless đã kiểm tra 8 màn hình chính cùng biểu mẫu và chi tiết hợp đồng: không hiện các mã `NV…`, `HD…`, `PB…` hoặc chỉ mục nghiệp vụ, không có lỗi JavaScript.

### 16/11/2026 — Thiết kế lại màn hình đăng nhập

- Thiết kế lại phần giới thiệu PeopleOps với nền xanh rừng, họa tiết vòng cung, logo xanh nhạt, tiêu đề lớn và điểm nhấn màu xanh lá sáng.
- Thêm thẻ minh họa đội ngũ, hồ sơ, hợp đồng và nghỉ phép bằng HTML/CSS; đây là nội dung trang trí, không phải số liệu nhân sự thực. Thay mô tả công nghệ bằng lời giới thiệu ngắn, dễ hiểu.
- Phần đăng nhập dùng nền sáng, bố cục thoáng, ô nhập và nút đăng nhập thống nhất; lựa chọn tài khoản mẫu dạng lưới có đánh dấu vai trò đang chọn.
- Trên điện thoại/máy tính bảng, bố cục xếp dọc và ẩn minh họa để ưu tiên biểu mẫu. Bổ sung autocomplete cho tài khoản và mật khẩu.
- Frontend biên dịch thành công. Chrome headless đã kiểm tra các chiều rộng 1440, 768 và 390 px: không tràn ngang, chọn tài khoản mẫu và đăng nhập thành công, không có lỗi JavaScript.

### 16/11/2026 — Đổi nội dung nhận diện trên trang đăng nhập

- Thay logo chữ PeopleOps bằng **Nhân sự.**, biểu tượng **16** và dòng **NHÓM 16 · KẾT NỐI ĐỂ PHÁT TRIỂN**.
- Thay câu ở chân trang bằng **Cùng đội ngũ, tạo giá trị.**; dòng bản quyền ghi **Nhóm 16 · Quản lý nhân sự**.
- Đồng bộ biểu tượng trong thẻ minh họa thành `16.` và điều chỉnh kiểu chữ logo. Frontend biên dịch thành công.

### 16/11/2026 — Dọn thư mục runtime theo yêu cầu

- Đã dừng frontend, backend và PostgreSQL riêng; xóa toàn bộ dữ liệu database, log, công cụ kiểm tra và ảnh trong `../.peopleops-runtime/`. Mã nguồn dự án được giữ nguyên.
- Đã xóa hoàn toàn thư mục runtime sau khi terminal PowerShell không còn giữ thư mục; đã xác nhận thư mục không còn tồn tại và mã nguồn dự án vẫn còn nguyên.
- Database cục bộ cổng 5433 đã bị xóa; hướng dẫn chạy lại với database đã khởi tạo ở phần nhật ký trước không còn áp dụng. Có thể khởi tạo hệ thống mới bằng cấu hình Docker ở đầu README.

### 16/11/2026 — Nâng cấp giao diện Responsive đa thiết bị (Mobile, Tablet, Fold, Smart Devices)

- **Cấu trúc điều hướng thích ứng (Adaptive Navigation)**:
  - Desktop / Laptop ($\ge 1024\text{px}$): Giữ nguyên Sider cố định bên trái hỗ trợ thu gọn tiện lợi.
  - Mobile, Tablet & Foldable Phone ($< 1024\text{px}$): Ẩn Sider cố định, thay bằng **Menu trượt (Drawer)** của Ant Design mở qua nút hamburger tại Header. Drawer tích hợp sẵn danh mục tính năng, thông tin người dùng và nút Đăng xuất nhanh.
  - Bổ sung **Thanh điều hướng dưới đáy (Bottom Navigation Bar)** cố định ở chân màn hình cho thiết bị di động: truy cập nhanh *Tổng quan, Hồ sơ, Phòng ban, Nghỉ phép (kèm Badge đỏ đếm đơn chờ duyệt) và nút Thêm (mở Drawer)*.
- **Tối ưu thiết bị gập (Foldables - Galaxy Z Fold, Pixel Fold, Surface Duo)**:
  - Màn hình ngoài siêu hẹp ($\le 360\text{px}$): Lưới nút chọn tài khoản mẫu trang đăng nhập tự co giãn 1–2 cột; font chữ tiêu đề tự co giãn (`clamp`).
  - Màn hình trong khi mở rộng ($700\text{px} - 880\text{px}$) hiển thị thoáng đãng, chuyển tiếp mượt mà.
- **Vùng an toàn cảm ứng (Safe Area Insets & Smart Devices)**:
  - Tích hợp biến CSS `--sat`, `--sab`, `--sal`, `--sar` dựa trên `env(safe-area-inset-*)` để bottom bar và nội dung không bị che khuất bởi tai thỏ, Dynamic Island hay thanh cử chỉ vuốt của iOS/Android.
  - Khai báo meta tag PWA/Web App trong `index.html`: `viewport-fit=cover`, `mobile-web-app-capable`.
- **Bảng dữ liệu & Hộp thoại chi tiết**:
  - 100% các bảng dữ liệu trên 8 phân hệ đều được trang bị cuộn ngang cảm ứng (`scroll={{ x: ... }}`) và touch-scroll mượt mà.
  - Tất cả hộp thoại xem chi tiết chuyển sang `Descriptions column={{ xs: 1, sm: 2 }}` (tự thu về 1 cột trên điện thoại và mở 2 cột trên tablet/desktop).
- **Cập nhật tài liệu kỹ thuật**: Đã đồng bộ chi tiết toàn bộ các tính năng và cải tiến responsive vào từng file tài liệu `00` đến `06` và `README.md` trong `features-docs/`.

### 16/11/2026 — Nâng cấp nghiệp vụ, nền dữ liệu và bảo mật

**Nền dữ liệu và vận hành**
- Ngày chuyển sang `DATE`, tiền sang `NUMERIC(15,2)` bằng migration có đánh số (`backend/src/db/migrations.ts`). Migration đổi kiểu **không hoàn tác được — hãy sao lưu database trước khi nâng cấp dữ liệu thật**.
- `GET /api/state` lọc phạm vi dữ liệu trong SQL; nhật ký ghi giá trị trước/sau và IP; thêm `GET /api/audit` phân trang.
- Job theo ngày chốt hợp đồng chấm dứt đã hẹn, phụ lục lương và quyết định công tác đến hạn.
- Docker Compose: cổng DB/backend chỉ mở trên `127.0.0.1`; biến mới `TRUST_PROXY`, `COOKIE_SECURE`, `ADMIN_PASSWORD` (xem `.env.example`).

**Nghiệp vụ**
- Hồ sơ: trạng thái nhân viên suy từ hợp đồng; khóa lạc quan `version`; cảnh báo trùng hồ sơ; đồng bộ tên đăng nhập theo email; lưu trữ khóa tài khoản, khôi phục không tự mở lại tài khoản.
- Hợp đồng: giới hạn thử việc 60 ngày/một lần, xác định thời hạn tối đa 36 tháng và 2 lần ký/gia hạn; ký chính thức từ thử việc; hủy bỏ hợp đồng nhập sai; hẹn ngày chấm dứt và loại chấm dứt; phụ lục lương có ngày hiệu lực.
- Công tác: quyết định hiệu lực trong tương lai (`Chờ hiệu lực`), hủy/hoàn tác; vai trò và trưởng phòng tự đồng bộ theo chức vụ.
- Nghỉ phép: tính theo ngày làm việc (bảng ngày lễ `holidays`), đơn qua năm tự tách, HR nhập đơn lùi ngày, hủy đơn đã duyệt khi chưa đến ngày nghỉ, tuyến duyệt trưởng phòng → giám đốc/HR, khóa dòng khi duyệt, quỹ phép mặc định theo thâm niên.
- Danh mục: chức vụ mã tự sinh, cờ điều hành, vai trò mặc định, ngừng sử dụng; phòng ban có trưởng phòng.
- Tài khoản: đặt lại mật khẩu, đổi vai trò, một nhân viên một tài khoản; giới hạn đăng nhập lưu trong DB.

**Trạng thái kiểm tra**
- Backend và frontend **biên dịch TypeScript thành công**.
- Bộ kiểm thử `backend/tests/workflows.test.mjs` đã được cập nhật và bổ sung kịch bản cho các tính năng trên (ngày làm việc, tuyến duyệt, luật hợp đồng, chấm dứt hẹn ngày, công tác chờ hiệu lực, đặt lại mật khẩu, khóa lạc quan, giới hạn đăng nhập). **Các kiểm thử này chưa được chạy** vì môi trường chưa có PostgreSQL/Docker; cần chạy `npm test` với `TEST_DATABASE_URL` trước khi dùng thật.

**Chưa làm**
- Bắt đổi mật khẩu ở lần đăng nhập đầu (theo yêu cầu, để sau).
- Tách `GET /api/state` thành API phân trang theo từng màn hình; màn hình quản lý ngày lễ; tự động chuyển phép sang năm sau.
- Các chức năng mở rộng (chấm công, lương, bảo hiểm, tuyển dụng, đánh giá...) — để sau.

Các tài liệu `features-docs/00`–`06` đã được cập nhật theo thay đổi này.
