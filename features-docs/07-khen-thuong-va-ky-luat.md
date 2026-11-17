# 07. Phân hệ Khen thưởng & Kỷ luật (BFD 3.4)

## 1. Mục tiêu & Căn cứ Nghiệp vụ
- **Căn cứ thiết kế**: BFD nhánh `3.4 - Quản lý khen thưởng, kỷ luật` (trong `BFD_DFD_QLNS_v2.drawio` và `ERD_QLNS_v2.drawio`), gắn liền với các Quyết định pháp lý từ Ban Giám Đốc (`QUYETDINH`), áp dụng cho từng nhân viên (`NHANVIEN`).
- **Các file mã nguồn & thiết kế liên quan**:
  - Sơ đồ thiết kế: `ERD_QLNS_v2.drawio` (thực thể `KHENTHUONG_KYLUAT`) và `BFD_DFD_QLNS_v2.drawio` (BFD `3.4`, DFD Mức 0 & DFD Mức 1 tiến trình `3.4` - Kho `D6`).
  - Database: Bảng `rewards_disciplines` trong `backend/src/db/schema.sql` và migration `004` trong `backend/src/db/migrations.ts`.
  - Backend API: `backend/src/routes/rewards.routes.ts` (`GET /api/rewards`, `POST /api/rewards`, `DELETE /api/rewards/:id`) và `backend/src/routes/auth.routes.ts` (`buildScopedState` trả `rewards`).
  - Frontend (Ant Design): `frontend/src/components/RewardsView.tsx`.
- **Nghiệp vụ**:
  - Ghi nhận các hình thức khen thưởng (bằng khen, giấy khen, tiền mặt, tăng bậc lương trước hạn...) và kỷ luật (khiển trách, cảnh cáo, hạ bậc lương, sa thải...) theo quy định của Luật Lao động và Quy chế thi đua khen thưởng của doanh nghiệp.
  - Mỗi bản ghi khen thưởng hoặc kỷ luật bắt buộc phải có căn cứ là một **Quyết định** đã ban hành (có số quyết định, ngày ký, ngày hiệu lực, người ký thuộc Ban Giám đốc).
  - Cho phép tra cứu lịch sử thi đua - kỷ luật theo từng nhân viên, theo phòng ban, hoặc lập danh sách tổng hợp.

## 2. Cấu trúc Bảng Cơ sở Dữ liệu (`rewards_disciplines`)

| Thuộc tính | Kiểu dữ liệu | Ràng buộc | Diễn giải |
| :--- | :--- | :--- | :--- |
| `id` | `VARCHAR(30)` | `PRIMARY KEY` | Mã bản ghi (`KT001`, `KL001`...) |
| `employee_id` | `VARCHAR(25)` | `NOT NULL REFERENCES employees(id)` | Mã nhân viên được khen thưởng / bị kỷ luật |
| `decision_id` | `VARCHAR(30)` | `NOT NULL REFERENCES decisions(id)` | Quyết định pháp lý căn cứ |
| `type` | `VARCHAR(40)` | `CHECK IN ('Khen thưởng', 'Kỷ luật')` | Loại hình thức: Khen thưởng hoặc Kỷ luật |
| `category` | `VARCHAR(100)` | `NOT NULL` | Hình thức chi tiết (Thưởng tiền mặt, Bằng khen, Khiển trách...) |
| `amount` | `NUMERIC(15,2)`| `DEFAULT 0 CHECK (amount >= 0)` | Số tiền thưởng hoặc tiền phạt (nếu có) |
| `effective_date` | `DATE` | `NOT NULL` | Ngày bắt đầu có hiệu lực |
| `reason` | `TEXT` | `NOT NULL` | Lý do / Trích yếu nội dung khen thưởng / kỷ luật |

## 3. Luồng Dữ liệu (DFD Mức 1 - Chức năng 3.4)
- **Đầu vào**:
  - Ban Giám Đốc ban hành *"Quyết định khen thưởng"* hoặc *"Quyết định kỷ luật"*.
  - Cán bộ nhân sự tiếp nhận, nhập thông tin chi tiết vào hệ thống.
- **Xử lý**:
  - Kiểm tra tính hợp lệ của nhân viên (`employee_id`) và quyết định (`decision_id`).
  - Ghi bản ghi vào bảng `rewards_disciplines`.
  - Tự động ghi nhật ký hệ thống `audit_log`.
- **Đầu ra**:
  - Cung cấp danh sách khen thưởng/kỷ luật cho Ban Giám đốc và Cán bộ nhân sự.
  - Nhân viên có thể xem lịch sử khen thưởng/kỷ luật trong trang thông tin cá nhân của mình.

## 4. Phân quyền Truy cập (RBAC)
- **Admin / HR / Director**: Toàn quyền xem danh sách, tạo mới, chỉnh sửa và hủy quyết định khen thưởng / kỷ luật.
- **Trưởng phòng (Manager)**: Xem danh sách khen thưởng / kỷ luật của nhân viên trong phòng ban mình phụ trách.
- **Nhân viên (Employee)**: Chỉ xem các quyết định khen thưởng / kỷ luật của chính mình.

## 5. Kiểm thử Tự động (Cập nhật 17/11/2026)
- Đã kiểm thử tự động trong `backend/tests/workflows.test.mjs`:
  - Tự sinh mã `KTxxx` (Khen thưởng) và `KLxxx` (Kỷ luật), liên kết `1-N` với bảng `decisions` (`QUYETDINH`).
  - Kiểm tra phân quyền RBAC/ABAC trên `GET /api/rewards` và `DELETE /api/rewards/:id` cho các vai trò `admin`, `hr`, `manager`, `employee`.
