import { Router } from 'express';
import { db, withTransaction, auditLog } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { generateId } from '../utils/crypto.js';
import { choice, date, fail, numeric, text, today } from '../utils/validation.js';

export const contractsRouter = Router();

contractsRouter.use(requireAuth);

// 3.1 Lập hợp đồng
contractsRouter.post('/', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const b = req.body;
    const cid = text(b, 'id', 30);
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

    await db.run(
      `INSERT INTO contracts(id, employee_id, type, start_date, end_date, salary, status)
       VALUES($1, $2, $3, $4, $5, $6, 'Hiệu lực')`,
      [cid, e.id, type, start, end, salary]
    );
    await auditLog(db, u.id, 'Lập hợp đồng', cid);
    res.status(201).json({ id: cid });
  } catch (err) {
    next(err);
  }
});

// 3.2 Gia hạn hợp đồng
contractsRouter.post('/:id/extend', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const rid = decodeURIComponent(req.params.id);
    const c = await existsInTable(db, 'contracts', rid);
    await requireActiveEmployee(db, c.employee_id);

    if (c.status === 'Đã chấm dứt') {
      fail('Hợp đồng đã chấm dứt.');
    }
    if (!c.end_date) {
      fail('Hợp đồng không xác định thời hạn không cần gia hạn.');
    }

    const b = req.body;
    const newEnd = date(b, 'new_end_date');
    const reason = text(b, 'reason', 1000);
    const currentDay = today();

    if (newEnd <= c.end_date || newEnd < currentDay) {
      fail('Ngày gia hạn phải sau ngày kết thúc cũ và không trước hôm nay.');
    }

    const overlap = await db.one(
      `SELECT id FROM contracts
       WHERE employee_id = $1
         AND id != $2
         AND status != 'Đã chấm dứt'
         AND start_date <= $3
         AND (end_date IS NULL OR end_date >= $4)`,
      [c.employee_id, rid, newEnd, c.start_date]
    );
    if (overlap) {
      fail('Thời hạn mới trùng với hợp đồng khác.');
    }

    await withTransaction(async (tx) => {
      const seqRow = await tx.one<{ n: number }>(
        'SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM extensions WHERE contract_id = $1',
        [rid]
      );
      const seq = Number(seqRow?.n ?? 1);
      await tx.run(
        `INSERT INTO extensions(id, contract_id, sequence, created_date, old_end_date, new_end_date, reason)
         VALUES($1, $2, $3, $4, $5, $6, $7)`,
        [generateId('GH'), rid, seq, currentDay, c.end_date, newEnd, reason]
      );
      await tx.run('UPDATE contracts SET end_date = $1 WHERE id = $2', [newEnd, rid]);
      await auditLog(tx, u.id, 'Gia hạn hợp đồng', rid);
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

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

    await db.run(
      `UPDATE contracts
       SET status = 'Đã chấm dứt', terminated_date = $1, termination_reason = $2
       WHERE id = $3`,
      [ended, reason, rid]
    );
    await auditLog(db, u.id, 'Chấm dứt hợp đồng', rid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
