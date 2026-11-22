# 07. Tính năng mở rộng: Thông báo thời gian thực, Lịch nghỉ phép, Xuất Excel/PDF, Trợ lý HR (AI)

> Cập nhật 22/11/2026. Các tính năng này **không thêm bảng mới vào ERD**: mọi dữ liệu đều được suy ra
> từ các kho D1–D5 hiện có và luôn đi qua cùng một hàm lọc phạm vi quyền `buildScopedState(user)`.

## 1. Thông báo thời gian thực + Dashboard cảnh báo

| Thành phần | File |
| :--- | :--- |
| Bộ tính cảnh báo (suy ra từ dữ liệu theo quyền) | `backend/src/services/alerts.ts` |
| Kênh đẩy Server-Sent Events | `backend/src/services/realtime.ts`, `GET /api/events` trong `auth.routes.ts` |
| Phát sự kiện sau mỗi thao tác ghi thành công | middleware trong `backend/src/app.ts`; `services/jobs.ts` (khi job định kỳ đổi dữ liệu) |
| Chuông thông báo, đánh dấu đã đọc | `frontend/src/components/NotificationBell.tsx` |
| Toast khi có cảnh báo mới, kết nối SSE | `frontend/src/App.tsx` |
| Thẻ "Việc cần xử lý & cảnh báo" | `frontend/src/components/DashboardView.tsx` |

- `GET /api/state` trả thêm mảng `alerts` (`id, kind, severity, title, description, date, route, refId`).
- Các loại cảnh báo: đơn chờ **chính người dùng** duyệt (khẩn khi chờ ≥ 2 ngày hoặc sắp tới ngày nghỉ), kết quả duyệt đơn của mình (7 ngày),
  hợp đồng sắp hết hạn ≤ 30 ngày chưa có hợp đồng nối tiếp, (HR/Admin) nhân viên đang làm việc mà hợp đồng đã hết hạn / chưa có hợp đồng,
  quyết định công tác sắp hiệu lực ≤ 14 ngày, quỹ phép của mình còn ≤ 2 ngày, sinh nhật trong 7 ngày.
- **Bảo mật**: sự kiện SSE chỉ chứa `{topic, at}` (ví dụ `leaves`), không chứa dữ liệu. Trình duyệt nhận sự kiện sẽ gọi lại `/api/state`,
  nên mỗi người chỉ thấy cảnh báo trong phạm vi của mình.
- Trạng thái "đã đọc" lưu ở `localStorage` theo `MaTK` (tiện ích cá nhân trên trình duyệt).
- nginx: `location = /api/events` tắt `proxy_buffering`, `proxy_read_timeout 1h`.

## 2. Lịch nghỉ phép trực quan (BFD 4.2 – 4.4)

- File: `frontend/src/components/LeaveCalendar.tsx`, tab **Lịch nghỉ** trong `LeavesView.tsx`.
- Lịch tháng (Ant Design `Calendar`, tiếng Việt qua `dayjs/locale/vi`): đơn đã duyệt (xanh), chờ duyệt (vàng viền nét đứt), ngày lễ lấy từ `GET /api/holidays?year=`.
  Bỏ qua thứ Bảy, Chủ nhật và ngày lễ, khớp với cách tính số ngày làm việc của backend. Dùng chung bộ lọc tìm kiếm/phòng ban của trang.
- Thống kê tháng: số người có lịch nghỉ và ngày đông người nghỉ nhất. Bấm vào một ngày để xem danh sách, bấm vào người để mở chi tiết đơn.
- **Cảnh báo trùng lịch khi duyệt**: hộp thoại "Phê duyệt" liệt kê những người **cùng phòng** đã duyệt/chờ duyệt nghỉ trùng khoảng ngày (`findOverlaps`).

## 3. Xuất Excel / PDF

- File: `frontend/src/utils/exportFiles.ts` (thư viện `exceljs`, tải động khi bấm xuất nên không làm nặng lần tải trang đầu).
- **Excel (.xlsx)**: tiêu đề đơn vị, tên báo cáo, các dòng điều kiện lọc, hàng tiêu đề màu thương hiệu, cố định dòng tiêu đề, bật AutoFilter,
  định dạng số, dòng tổng cộng, người lập. Chặn công thức độc hại (ô bắt đầu bằng `= + - @`).
- **PDF**: in qua iframe ẩn với mẫu văn bản hành chính (quốc hiệu, tiêu đề, bảng, chữ ký *Người lập biểu / Giám đốc*), giữ đúng font tiếng Việt;
  người dùng chọn "Lưu dưới dạng PDF".
- **In hợp đồng lao động**: nút *In hợp đồng (PDF)* trong chi tiết hợp đồng, điền sẵn thông tin hai bên, loại/thời hạn, chức danh, mức lương
  (ẩn nếu không có quyền xem), các phụ lục đã ký và thông tin chấm dứt.
- Có mặt ở: Báo cáo nhân sự (5.1–5.4), Nghỉ phép (đơn & quỹ phép), Dashboard (danh sách nhân sự). CSV vẫn được giữ.
- Dữ liệu xuất là dữ liệu đã được máy chủ lọc theo quyền nên file xuất cũng tôn trọng phân quyền.

## 4. Trợ lý HR (chatbot) có phân quyền

| Thành phần | File |
| :--- | :--- |
| API `GET /api/assistant/status`, `POST /api/assistant/chat` | `backend/src/routes/assistant.routes.ts` |
| 9 công cụ tra cứu chỉ đọc | `backend/src/services/assistantTools.ts` |
| Khung chat nổi | `frontend/src/components/AssistantChat.tsx` |

- **Chế độ AI**: khi có biến môi trường `ANTHROPIC_API_KEY`, dùng Claude (`ASSISTANT_MODEL`, mặc định `claude-opus-5-5`) qua SDK `@anthropic-ai/sdk`
  (Tool Runner, `effort: low`, bật fallback phía máy chủ khi bị từ chối). Mô hình chỉ gọi được các công cụ:
  `get_my_profile`, `find_employees`, `get_leave_balance`, `list_leave_requests`, `who_is_on_leave`, `list_contracts`, `headcount_summary`, `get_alerts`, `list_holidays`.
- **Phân quyền**: mọi công cụ chạy trên `buildScopedState(người hỏi)` nên AI **không bao giờ nhận được** dữ liệu ngoài quyền
  (nhân viên chỉ thấy mình, trưởng phòng thấy phòng mình, lương người khác hiện "Không có quyền xem"). Trợ lý không có công cụ ghi dữ liệu.
- **Chế độ ngoại tuyến**: không có khóa API (hoặc mất Internet) thì trả lời các câu hỏi mẫu bằng luật đơn giản trên cùng bộ công cụ.
- Giới hạn 20 câu hỏi/phút/tài khoản; tối đa 20 lượt hội thoại, mỗi lượt ≤ 2000 ký tự.
- Nhật ký: ghi hành động `Hỏi trợ lý HR` cùng danh sách công cụ đã dùng, **không lưu nội dung câu hỏi**.
- Bật AI: thêm `ANTHROPIC_API_KEY=...` vào `.env` (không commit file này) rồi `docker-compose up -d --build backend`.
  Lưu ý: ở chế độ AI, dữ liệu trong phạm vi quyền của người hỏi được gửi tới Anthropic API để trả lời.
