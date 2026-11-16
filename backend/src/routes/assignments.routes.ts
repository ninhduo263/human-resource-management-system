import { Router } from 'express';
import { withTransaction, auditLog } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { generateId } from '../utils/crypto.js';
import { addMonths, choice, date, fail, text, today } from '../utils/validation.js';
import { asyncHandler, paramId } from '../utils/http.js';
import { applyAssignment, syncRoleAndHead } from '../services/assignments.js';

export const assignmentsRouter = Router();

assignmentsRouter.use(requireAuth);

// 4.1 Ghi nhận công tác (kết hợp 2.3 Phân bổ nhân sự & 2.4 Bổ nhiệm chức vụ).
// Quyết định có hiệu lực từ hôm nay trở về trước được áp dụng ngay; ngày hiệu lực tương lai
// được lưu ở trạng thái "Chờ hiệu lực" và tự áp dụng khi đến ngày.
assignmentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr', 'director']);

    const b = req.body;
    const effective = date(b, 'effective_date');
    const signed = date(b, 'signed_date');
    const type = choice(b, 'type', ['Điều chuyển', 'Bổ nhiệm', 'Điều chuyển và bổ nhiệm'] as const);
    const reason = text(b, 'reason', 1000);
    const number = text(b, 'number', 60);
    const signer = text(b, 'signer', 120);
    const currentDay = today();

    if (effective > addMonths(currentDay, 12)) {
      fail('Ngày hiệu lực không được quá 12 tháng sau hôm nay.');
    }
    if (signed > effective) fail('Ngày ký phải không sau ngày hiệu lực.');

    const aid = await withTransaction(async (tx) => {
      const empId = text(b, 'employee_id');
      await tx.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [empId]);
      const e = await requireActiveEmployee(tx, empId);
      const dept = await existsInTable(tx, 'departments', text(b, 'new_department_id'));
      const pos = await existsInTable(tx, 'positions', text(b, 'new_position_id'));
      if (dept.active === false) fail('Phòng ban này đã ngừng sử dụng.');
      if (pos.active === false) fail('Chức vụ này đã ngừng sử dụng.');
      if (effective < e.join_date) fail('Ngày hiệu lực không được trước ngày vào làm.');

      const pending = await tx.one(
        `SELECT id FROM assignments WHERE employee_id = $1 AND status = 'Chờ hiệu lực'`,
        [e.id]
      );
      if (pending) fail('Nhân viên đang có quyết định công tác chờ hiệu lực; hãy hủy hoặc chờ áp dụng.');

      const last = await tx.one<{ d: string | null }>(
        `SELECT MAX(effective_date) AS d FROM assignments WHERE employee_id = $1 AND status = 'Hiệu lực'`,
        [e.id]
      );
      if (last?.d && effective < last.d) {
        fail('Ngày hiệu lực không được trước biến động gần nhất.');
      }

      if (e.department_id === dept.id && e.position_id === pos.id) {
        fail('Phòng ban hoặc chức vụ mới phải thay đổi.');
      }

      const expected =
        e.department_id !== dept.id
          ? e.position_id !== pos.id
            ? 'Điều chuyển và bổ nhiệm'
            : 'Điều chuyển'
          : 'Bổ nhiệm';
      if (type !== expected) fail('Loại biến động không khớp phòng ban/chức vụ thay đổi.');

      const did = generateId('QD');
      await tx.run(
        `INSERT INTO decisions(id, number, type, signed_date, effective_date, signer, content)
         VALUES($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (number) DO NOTHING`,
        [did, number, type, signed, effective, signer, reason]
      );
      const decision = (await tx.one<any>('SELECT * FROM decisions WHERE number = $1', [number]))!;
      if (
        decision.type !== type ||
        decision.signed_date !== signed ||
        decision.effective_date !== effective ||
        decision.signer !== signer ||
        decision.content !== reason
      ) {
        fail('Thông tin không khớp quyết định đã có.', 409);
      }

      const aid = generateId('QT');
      await tx.run(
        `INSERT INTO assignments(id, employee_id, decision_id, type, old_department_id, new_department_id,
           old_position_id, new_position_id, effective_date, reason, status)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Chờ hiệu lực')`,
        [aid, e.id, decision.id, type, e.department_id, dept.id, e.position_id, pos.id, effective, reason]
      );
      if (effective <= currentDay) {
        await applyAssignment(tx, aid, u.id);
      }
      await auditLog(
        tx,
        u.id,
        effective <= currentDay ? 'Ghi nhận công tác' : 'Ghi nhận công tác chờ hiệu lực',
        e.id
      );
      return aid;
    });

    res.status(201).json({ id: aid });
  })
);

// Hủy quyết định công tác: chờ hiệu lực, hoặc bản ghi hiệu lực gần nhất của nhân viên (hoàn tác).
assignmentsRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr', 'director']);
    const rid = paramId(req);
    const reason = text(req.body, 'reason', 1000);

    await withTransaction(async (tx) => {
      const a = await tx.one<any>('SELECT * FROM assignments WHERE id = $1 FOR UPDATE', [rid]);
      if (!a) fail('Không tìm thấy dữ liệu.', 404);
      if (a.status === 'Đã hủy') fail('Quyết định công tác đã bị hủy.');
      const e = await tx.one<any>('SELECT * FROM employees WHERE id = $1 FOR UPDATE', [a.employee_id]);
      if (!e) fail('Không tìm thấy dữ liệu.', 404);

      if (a.status === 'Hiệu lực') {
        if (['Đã lưu trữ', 'Đã nghỉ việc'].includes(e.status)) {
          fail('Nhân viên đã nghỉ việc hoặc lưu trữ; không thể hoàn tác công tác.');
        }
        const latest = await tx.one<{ id: string }>(
          `SELECT id FROM assignments
           WHERE employee_id = $1 AND status = 'Hiệu lực'
           ORDER BY effective_date DESC, id DESC LIMIT 1`,
          [e.id]
        );
        if (latest?.id !== a.id) fail('Chỉ hoàn tác được biến động công tác gần nhất.');
        if (e.department_id !== a.new_department_id || e.position_id !== a.new_position_id) {
          fail('Hồ sơ đã thay đổi sau quyết định này; không thể hoàn tác.');
        }
        const oldPos = await existsInTable<any>(tx, 'positions', a.old_position_id);
        await tx.run(
          'UPDATE employees SET department_id = $1, position_id = $2, version = version + 1 WHERE id = $3',
          [a.old_department_id, a.old_position_id, e.id]
        );
        await syncRoleAndHead(tx, e.id, a.old_department_id, oldPos, u.id);
      }

      await tx.run(
        `UPDATE assignments SET status = 'Đã hủy', cancelled_date = $1, cancel_reason = $2 WHERE id = $3`,
        [today(), reason, rid]
      );
      await auditLog(tx, u.id, 'Hủy quyết định công tác', rid, { reason, previous_status: a.status });
    });
    res.json({ ok: true });
  })
);

