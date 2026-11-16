import { Router } from 'express';
import { db, withTransaction, auditLog } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { generateId } from '../utils/crypto.js';
import { choice, date, fail, text, today } from '../utils/validation.js';

export const assignmentsRouter = Router();

assignmentsRouter.use(requireAuth);

// 4.1 Ghi nhận công tác (kết hợp 2.3 Phân bổ nhân sự & 2.4 Bổ nhiệm chức vụ)
assignmentsRouter.post('/', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr', 'director']);

    const b = req.body;
    const e = await requireActiveEmployee(db, text(b, 'employee_id'));
    const dept = await existsInTable(db, 'departments', text(b, 'new_department_id'));
    const pos = await existsInTable(db, 'positions', text(b, 'new_position_id'));
    const effective = date(b, 'effective_date');
    const signed = date(b, 'signed_date');
    const currentDay = today();

    if (effective > currentDay) {
      fail('Hệ thống chỉ ghi nhận quyết định có hiệu lực đến hôm nay.');
    }
    if (effective < e.join_date || signed > effective) {
      fail('Ngày ký phải không sau ngày hiệu lực; ngày hiệu lực không trước ngày vào làm.');
    }

    const last = await db.one<{ d: string | null }>(
      'SELECT MAX(effective_date) AS d FROM assignments WHERE employee_id = $1',
      [e.id]
    );
    if (last?.d && effective < last.d) {
      fail('Ngày hiệu lực không được trước biến động gần nhất.');
    }

    if (e.department_id === dept.id && e.position_id === pos.id) {
      fail('Phòng ban hoặc chức vụ mới phải thay đổi.');
    }

    const type = choice(b, 'type', [
      'Điều chuyển',
      'Bổ nhiệm',
      'Điều chuyển và bổ nhiệm',
    ] as const);
    const reason = text(b, 'reason', 1000);
    const number = text(b, 'number', 60);
    const signer = text(b, 'signer', 120);

    const expected =
      e.department_id !== dept.id
        ? e.position_id !== pos.id
          ? 'Điều chuyển và bổ nhiệm'
          : 'Điều chuyển'
        : 'Bổ nhiệm';

    if (type !== expected) {
      fail('Loại biến động không khớp phòng ban/chức vụ thay đổi.');
    }

    const existing = await db.one<{
      id: string;
      number: string;
      type: string;
      signed_date: string;
      effective_date: string;
      signer: string;
      content: string;
    }>('SELECT * FROM decisions WHERE number = $1', [number]);

    if (
      existing &&
      (existing.type !== type ||
        existing.signed_date !== signed ||
        existing.effective_date !== effective ||
        existing.signer !== signer ||
        existing.content !== reason)
    ) {
      fail('Thông tin không khớp quyết định đã có.', 409);
    }

    const did = existing?.id || generateId('QD');
    const aid = generateId('QT');

    await withTransaction(async (tx) => {
      if (!existing) {
        await tx.run(
          `INSERT INTO decisions(id, number, type, signed_date, effective_date, signer, content)
           VALUES($1, $2, $3, $4, $5, $6, $7)`,
          [did, number, type, signed, effective, signer, reason]
        );
      }
      await tx.run(
        `INSERT INTO assignments(id, employee_id, decision_id, type, old_department_id, new_department_id, old_position_id, new_position_id, effective_date, reason)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          aid,
          e.id,
          did,
          type,
          e.department_id,
          dept.id,
          e.position_id,
          pos.id,
          effective,
          reason,
        ]
      );
      await tx.run('UPDATE employees SET department_id = $1, position_id = $2 WHERE id = $3', [
        dept.id,
        pos.id,
        e.id,
      ]);
      await auditLog(tx, u.id, 'Ghi nhận công tác', e.id);
    });

    res.status(201).json({ id: aid });
  } catch (err) {
    next(err);
  }
});
