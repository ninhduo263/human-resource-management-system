# Thư mục Tài liệu Đặc tả & Lưu vết Tính năng (`features-docs/`)

Thư mục này lưu trữ toàn bộ tài liệu kỹ thuật của từng tính năng/phân hệ trong hệ thống **PeopleOps HRMS (Nhóm 16)**.

## Nguyên tắc vận hành & Bảo trì
1. **Không cần ghi nhớ thủ công**: Mỗi tính năng sau khi tạo xong được ghi chép đầy đủ vào một file `.md` riêng biệt tại đây (gồm nguồn gốc BFD/DFD/ERD, bảng CSDL, API endpoints, file code Backend/Frontend, và quy tắc nghiệp vụ).
2. **Quy trình khi sửa đổi hoặc nâng cấp tính năng**:
   - **Bước 1**: Mở file `.md` tương ứng của tính năng đó trong thư mục `features-docs/` để nắm rõ cấu trúc file, API và ràng buộc hiện tại.
   - **Bước 2**: Thực hiện chỉnh sửa mã nguồn ở `backend/` hoặc `frontend/`.
   - **Bước 3**: Cập nhật lại những thay đổi vào đúng file `.md` của tính năng đó.

## Danh mục Tài liệu Tính năng

| STT | File tài liệu | Phân hệ / Nội dung | Đối chiếu BFD / DFD / ERD |
| :--- | :--- | :--- | :--- |
| 00 | [00-ha-tang-docker-va-database.md](./00-ha-tang-docker-va-database.md) | Hạ tầng Docker Compose, PostgreSQL 16 & Khởi tạo dữ liệu | 10 thực thể ERD + 3 bảng hệ thống |
| 01 | [01-xac-thuc-phan-quyen-va-quan-tri.md](./01-xac-thuc-phan-quyen-va-quan-tri.md) | Đăng nhập, Phiên, Phân quyền 5 vai trò, Quản trị & Dashboard | Tác nhân DFD Mức 0, RBAC/ABAC |
| 02 | [02-ho-so-nhan-vien.md](./02-ho-so-nhan-vien.md) | Quản lý Hồ sơ nhân viên | BFD `1.1`, `1.2`, `1.3`, `1.4` — Kho `D1` |
| 03 | [03-phong-ban-va-chuc-vu.md](./03-phong-ban-va-chuc-vu.md) | Quản lý Phòng ban & Chức vụ | BFD `2.1`, `2.2`, `2.3`, `2.4` — Kho `D2` |
| 04 | [04-hop-dong-lao-dong.md](./04-hop-dong-lao-dong.md) | Quản lý Hợp đồng lao động | BFD `3.1`, `3.2`, `3.3`, `3.4` — Kho `D3` |
| 05 | [05-cong-tac-va-nghi-phep.md](./05-cong-tac-va-nghi-phep.md) | Quản lý Công tác & Nghỉ phép | BFD `4.1`, `4.2`, `4.3`, `4.4` — Kho `D4`, `D5` |
| 06 | [06-bao-cao-nhan-su.md](./06-bao-cao-nhan-su.md) | Báo cáo & Thống kê nhân sự | BFD `5.1`, `5.2`, `5.3`, `5.4` — Kho `D1`–`D5` |
