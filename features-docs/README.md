# Thư mục Tài liệu Đặc tả & Lưu vết Tính năng (`features-docs/`)

Thư mục này lưu trữ toàn bộ tài liệu kỹ thuật của từng tính năng/phân hệ trong hệ thống **PeopleOps HRMS (Nhóm 16)** sử dụng bộ công nghệ **Docker Compose + PostgreSQL 16 + Node.js (Express/TypeScript) + React (Ant Design & Vite)**.

## Nguyên tắc vận hành & Bảo trì
1. **Không cần ghi nhớ thủ công**: Mỗi tính năng sau khi tạo xong được ghi chép đầy đủ vào một file `.md` riêng biệt tại đây (gồm nguồn gốc BFD/DFD/ERD, bảng CSDL, API endpoints, file code Backend/Frontend Ant Design, và quy tắc nghiệp vụ).
2. **Quy trình khi sửa đổi hoặc nâng cấp tính năng**:
   - **Bước 1**: Mở file `.md` tương ứng của tính năng đó trong thư mục `features-docs/` để nắm rõ cấu trúc file, API và ràng buộc hiện tại.
   - **Bước 2**: Thực hiện chỉnh sửa mã nguồn ở `backend/` hoặc `frontend/`.
   - **Bước 3**: Cập nhật lại những thay đổi vào đúng file `.md` của tính năng đó.

## Danh mục Tài liệu Tính năng

| STT | File tài liệu | Phân hệ / Nội dung | Đối chiếu BFD / DFD / ERD |
| :--- | :--- | :--- | :--- |
| 00 | [00-ha-tang-docker-va-database.md](./00-ha-tang-docker-va-database.md) | Hạ tầng Docker Compose, PostgreSQL 16 & Khởi tạo dữ liệu | 11 thực thể ERD (`ERD_QLNS_v2.drawio`) + 3 bảng hệ thống |
| 01 | [01-xac-thuc-phan-quyen-va-quan-tri.md](./01-xac-thuc-phan-quyen-va-quan-tri.md) | Đăng nhập, Phiên, Phân quyền 5 vai trò, Quản trị & Dashboard | Tác nhân DFD Mức 0 (`BFD_DFD_QLNS_v2.drawio`), RBAC/ABAC |
| 02 | [02-ho-so-nhan-vien.md](./02-ho-so-nhan-vien.md) | Quản lý Hồ sơ nhân viên | BFD `1.1`, `1.2`, `1.3`, `1.4` — Kho `D1` |
| 03 | [03-phong-ban-va-chuc-vu.md](./03-phong-ban-va-chuc-vu.md) | Quản lý Phòng ban & Chức vụ | BFD `2.1`, `2.2`, `2.3`, `2.4` — Kho `D2`, `D4` |
| 04 | [04-hop-dong-lao-dong.md](./04-hop-dong-lao-dong.md) | Quản lý Hợp đồng lao động | BFD `3.1`, `3.2`, `3.3`, `3.4` — Kho `D3`, `D6` |
| 05 | [05-cong-tac-va-nghi-phep.md](./05-cong-tac-va-nghi-phep.md) | Quản lý Công tác & Nghỉ phép | BFD `4.1`, `4.2`, `4.3`, `4.4` — Kho `D4`, `D5` |
| 06 | [06-bao-cao-nhan-su.md](./06-bao-cao-nhan-su.md) | Báo cáo & Thống kê nhân sự | BFD `5.1`, `5.2`, `5.3`, `5.4` — Kho `D1`–`D5` |
| 07 | [07-khen-thuong-va-ky-luat.md](./07-khen-thuong-va-ky-luat.md) | Quản lý Khen thưởng & Kỷ luật | BFD `3.4` — Kho `D6` (liên kết `D1`, `D4`) |

## Kiến trúc Giao diện Thích ứng Đa thiết bị (Responsive Architecture)

Hệ thống được thiết kế theo tiêu chuẩn giao diện thích ứng đa nền tảng (**Responsive Design**), đáp ứng tốt trên tất cả các loại thiết bị:
- **Thiết bị di động thông minh (Smartphones)**: Bổ sung thanh điều hướng dưới đáy (Bottom Navigation Bar), menu trượt Drawer thay cho Sider, hỗ trợ Safe Area Insets (tai thỏ, Dynamic Island, thanh cử chỉ vuốt).
- **Thiết bị màn hình gập (Foldable Devices - Galaxy Z Fold, Pixel Fold, Surface Duo)**: Tự động thích ứng cả màn hình ngoài siêu hẹp ($\le 360\text{px}$) lẫn màn hình trong khi mở rộng ($700\text{px} - 880\text{px}$).
- **Máy tính bảng (Tablets - iPad, Galaxy Tab)**: Lưới card và bảng số liệu tự động co giãn theo 2–3 cột.
- **Bảng dữ liệu & Hộp thoại**: 100% bảng dữ liệu trang bị cuộn ngang cảm ứng (`scroll={{ x: ... }}`); các hộp thoại chi tiết (`Modal width={640}`) cố định `Descriptions column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}` và CSS `word-break: normal` để triệt tiêu hiện tượng ngắt chữ, co thắt cột trên popup.

## Lịch sử cập nhật lớn

- **16/11/2026 — Nâng cấp nghiệp vụ và nền dữ liệu**: migration có đánh số, kiểu `DATE`/`NUMERIC`, trạng thái nhân viên suy từ hợp đồng, quy định lao động cho hợp đồng, công tác chờ hiệu lực và hoàn tác, nghỉ phép theo ngày làm việc + tuyến duyệt, đặt lại mật khẩu/đổi vai trò, nhật ký có giá trị trước/sau. Chi tiết trong mục *Cập nhật ngày 16/11/2026* ở từng file `00`–`06`.
- **17/11/2026 — Hoàn thiện 4 điểm chuẩn hóa BFD / DFD / ERD & Sơ đồ Draw.io**:
  1. Bổ sung thực thể và phân hệ `KHENTHUONG_KYLUAT` (`rewards_disciplines`) cho **BFD 3.4 "Quản lý khen thưởng, kỷ luật"** (tài liệu `07-khen-thuong-va-ky-luat.md`).
  2. Bảo toàn lịch sử hợp đồng gốc khi gia hạn/chấm dứt (`HOPDONG.original_end_date`, `termination_decision_id` và `GIAHANHOPDONG.decision_id`).
  3. Xác định rõ tác nhân **Trưởng phòng** (`PHONGBAN.head_id` / `MaTruongPhong`) duyệt đơn nghỉ phép (`4.2`/`4.3`).
  4. Liên kết chặt `QUATRINHCONGTAC` với `QUYETDINH` (`MaQD`) hỗ trợ đầy đủ *Điều chuyển, Bổ nhiệm, Miễn nhiệm* (`DFD 2.3, 2.4`).
  5. Xuất bộ file thiết kế chuẩn Draw.io tại thư mục `diagrams/`: `diagrams/ERD_QLNS_v2.drawio` và `diagrams/BFD_DFD_QLNS_v2.drawio` (cùng 4 file gốc `BFD.jpeg`, `DFD-MUC0.png`, `ERD_QLNS_v2.drawio.pdf`, `Nhom_16_QL_Nhan_su.pdf`).
- **17/11/2026 — Nâng cấp giao diện Ant Design (`Botanical Forest & Warm Ivory`) & Kiểm thử toàn bộ**:
  - Đồng bộ bảng màu `#0d392f` / `#155e4b` / `#f6f7f3`, font `Plus Jakarta Sans`, Bento Dashboard bất đối xứng và tối ưu responsive.
  - Mở rộng bộ kiểm thử tích hợp `backend/tests/workflows.test.mjs` (23/23 pass) bao phủ đầy đủ các phân hệ `00`–`07`.
