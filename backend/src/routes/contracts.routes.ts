import { Router, RequestHandler } from 'express';
import { db, withTransaction, auditLog } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { generateId } from '../utils/crypto.js';
import { nextBusinessId } from '../utils/business-id.js';
import { choice, date, fail, numeric, text, today } from '../utils/validation.js';

export const contractsRouter = Router();

contractsRouter.use(requireAuth);

// 3.1 Lập hợp đồng
contractsRouter.post('/', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const b = req.body;
    const e = await requireActiveEmployee(db, text(b, 'employee_id'));
    const type = choice(b, 'type', [
      'Thử việc',
      'Xác định thời hạn',
      'Không xác định thời hạn',
    ] as const);
    const start = date(b, 'start_date');
    const end = type === 'Không xác định thời hạn' ? null : date(b, 'end_date');
    const salary = numeric(b, 'salary', 1, 100_000_000_000);

    if (start < e.join_date) {
      fail('Hợp đồng không được bắt đầu trước ngày vào làm.');
    }
    if (end && end < start) {
      fail('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
    }

    const overlap = await db.one(
      `SELECT id FROM contracts
       WHERE employee_id = $1
         AND status != 'Đã chấm dứt'
         AND start_date <= $2
         AND (end_date IS NULL OR end_date >= $3)`,
      [e.id, end || '9999-12-31', start]
    );
    if (overlap) {
      fail('Khoảng thời gian bị trùng với hợp đồng hiện có.');
    }

    const cid = await withTransaction(async (tx) => {
      const cid = await nextBusinessId(tx, 'contracts');
      await tx.run(
      `INSERT INTO contracts(id, employee_id, type, start_date, end_date, salary, status)
       VALUES($1, $2, $3, $4, $5, $6, 'Hiệu lực')`,
      [cid, e.id, type, start, end, salary]
    );
      await auditLog(tx, u.id, 'Lập hợp đồng', cid);
      return cid;
    });
    res.status(201).json({ id: cid });
  } catch (err) {
    next(err);
  }
});

// Gia hạn và điều chỉnh lương đều phải lập phụ lục trong cùng transaction.
function amendContract(extend: boolean): RequestHandler {
 return async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const rid = decodeURIComponent(String(req.params.id));
    const existing = await existsInTable(db, 'contracts', rid);
    const b = req.body;
    const reason = text(b, 'reason', 1000);
    const currentDay = today();
    await withTransaction(async (tx) => {
      await tx.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [existing.employee_id]);
      await requireActiveEmployee(tx, existing.employee_id);
      const c = (await tx.one('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [rid]))!;
      if (c.status === 'Đã chấm dứt') fail('Hợp đồng đã chấm dứt.');
      if (extend && !c.end_date) fail('Hợp đồng không xác định thời hạn không cần gia hạn.');
      const newEnd = extend ? date(b, 'new_end_date') : c.end_date;
      const salary = !extend || (b.salary != null && b.salary !== '')
        ? numeric(b, 'salary', 1, 100_000_000_000) : Number(c.salary);
      const salaryChanged = salary !== Number(c.salary);
      if (!extend && !salaryChanged) fail('Mức lương mới phải khác mức lương hiện tại.');
      if (extend && (newEnd <= c.end_date || newEnd < currentDay)) {
        fail('Ngày gia hạn phải sau ngày kết thúc cũ và không trước hôm nay.');
      }
      if (extend) {
       const overlap = await tx.one(
      `SELECT id FROM contracts
       WHERE employee_id = $1
         AND id != $2
         AND status != 'Đã chấm dứt'
         AND start_date <= $3
         AND (end_date IS NULL OR end_date >= $4)`,
      [c.employee_id, rid, newEnd, c.start_date]
    );
       if (overlap) fail('Thời hạn mới trùng với hợp đồng khác.');
      }
      const seqRow = await tx.one<{ n: number }>(
        'SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM extensions WHERE contract_id = $1',
        [rid]
      );
      const seq = Number(seqRow?.n ?? 1);
      await tx.run(
        `INSERT INTO extensions(id, contract_id, sequence, created_date, old_end_date, new_end_date, reason,
          amendment_type, old_salary, new_salary)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [generateId('PL'), rid, seq, currentDay, c.end_date, newEnd, reason,
          extend ? (salaryChanged ? 'Gia hạn và điều chỉnh lương' : 'Gia hạn') : 'Điều chỉnh lương',
          Number(c.salary), salary]
      );
      await tx.run('UPDATE contracts SET end_date = $1, salary = $2 WHERE id = $3', [newEnd, salary, rid]);
      await auditLog(tx, u.id, extend ? 'Gia hạn hợp đồng và lập phụ lục' : 'Điều chỉnh lương và lập phụ lục', rid);
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
 };
}

contractsRouter.post('/:id/extend', amendContract(true));
contractsRouter.post('/:id/salary', amendContract(false));

// 3.3 Chấm dứt hợp đồng
contractsRouter.post('/:id/terminate', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const rid = decodeURIComponent(req.params.id);
    const c = await existsInTable(db, 'contracts', rid);
    await requireActiveEmployee(db, c.employee_id);

    if (c.status === 'Đã chấm dứt') {
      fail('Hợp đồng đã chấm dứt.');
    }

    const b = req.body;
    const ended = date(b, 'terminated_date');
    const reason = text(b, 'reason', 1000);
    const currentDay = today();

    if (ended < c.start_date || ended > currentDay || (c.end_date && ended > c.end_date)) {
      fail('Ngày chấm dứt phải từ ngày bắt đầu đến hôm nay (và không sau ngày kết thúc).');
    }

    await withTransaction(async (tx) => {
      await tx.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [c.employee_id]);
      const locked = (await tx.one('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [rid]))!;
      if (locked.status === 'Đã chấm dứt') fail('Hợp đồng đã chấm dứt.');
      if (ended < locked.start_date || (locked.end_date && ended > locked.end_date)) {
        fail('Ngày chấm dứt không nằm trong thời hạn hợp đồng.');
      }
      await tx.run(
      `UPDATE contracts
       SET status = 'Đã chấm dứt', terminated_date = $1, termination_reason = $2
       WHERE id = $3`,
      [ended, reason, rid]
    );
      const remaining = await tx.one(
        `SELECT id, type FROM contracts WHERE employee_id = $1 AND id != $2
         AND status != 'Đã chấm dứt' AND start_date <= $3
         AND (end_date IS NULL OR end_date >= $3)`,
        [c.employee_id, rid, currentDay]
      );
      const status = remaining ? (remaining.type === 'Thử việc' ? 'Thử việc' : 'Đang làm việc') : 'Đã nghỉ việc';
      await tx.run('UPDATE employees SET status = $1 WHERE id = $2', [status, c.employee_id]);
      if (!remaining) {
        await tx.run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE employee_id = $1)', [c.employee_id]);
      }
      await auditLog(tx, u.id, 'Chấm dứt hợp đồng và cập nhật trạng thái nhân viên', rid);
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
