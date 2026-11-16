import { Router } from 'express';
import { db, withTransaction, auditLog } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { generateId } from '../utils/crypto.js';
import {
  calendarDays,
  choice,
  date,
  fail,
  numeric,
  optional,
  text,
  today,
} from '../utils/validation.js';

export const leavesRouter = Router();

leavesRouter.use(requireAuth);

// 4.2 Đăng ký nghỉ phép
leavesRouter.post('/leaves', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr', 'manager', 'employee']);

    const b = req.body;
    const eid =
      u.role === 'employee' || u.role === 'manager'
        ? u.employee_id
        : text(b, 'employee_id');
    const e = await requireActiveEmployee(db, eid);
    const type = await existsInTable<{ id: string; max_days: number; deduct_annual: number }>(
      db,
      'leave_types',
      text(b, 'type_id')
    );

    const start = date(b, 'start_date');
    const end = date(b, 'end_date');
    const currentDay = today();

    if (start < currentDay) {
      fail('Ngày nghỉ không được trước hôm nay.');
    }
    if (start < e.join_date) {
      fail('Ngày nghỉ không được trước ngày vào làm.');
    }
    if (end < start) {
      fail('Ngày kết thúc không được trước ngày bắt đầu.');
    }
    if (start.slice(0, 4) !== end.slice(0, 4)) {
      fail('Vui lòng chia đơn nghỉ qua năm thành 2 đơn.');
    }

    const days = calendarDays(start, end);
    if (days > Number(type.max_days)) {
      fail(`Loại nghỉ này tối đa ${type.max_days} ngày mỗi đơn.`);
    }

    const overlap = await db.one(
      `SELECT id FROM leave_requests
       WHERE employee_id = $1
         AND status IN ('Chờ duyệt', 'Đã duyệt')
         AND start_date <= $2
         AND end_date >= $3`,
      [eid, end, start]
    );
    if (overlap) {
      fail('Khoảng nghỉ trùng với đơn đang chờ duyệt hoặc đã duyệt.');
    }

    const lid = generateId('NP');
    await db.run(
      `INSERT INTO leave_requests(id, employee_id, type_id, submitted_date, start_date, end_date, days, reason, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'Chờ duyệt')`,
      [lid, eid, type.id, currentDay, start, end, days, text(b, 'reason', 1000)]
    );
    await auditLog(db, u.id, 'Nộp đơn nghỉ phép', lid);
    res.status(201).json({ id: lid });
  } catch (err) {
    next(err);
  }
});

// Hủy đơn nghỉ phép đang chờ duyệt
leavesRouter.post('/leaves/:id/cancel', async (req, res, next) => {
  try {
    const u = req.user!;
    const rid = decodeURIComponent(req.params.id);
    const leave = await existsInTable(db, 'leave_requests', rid);

    if (leave.status !== 'Chờ duyệt') {
      fail('Đơn đã được xử lý.');
    }
    if (leave.employee_id !== u.employee_id && !['admin', 'hr'].includes(u.role)) {
      fail('Bạn không có quyền hủy đơn này.', 403);
    }

    await db.run(`UPDATE leave_requests SET status = 'Đã hủy' WHERE id = $1`, [rid]);
    await auditLog(db, u.id, 'Hủy đơn nghỉ phép', rid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 4.3 Duyệt hoặc từ chối nghỉ phép
leavesRouter.post('/leaves/:id/review', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'manager']);

    const rid = decodeURIComponent(req.params.id);
    const leave = await existsInTable(db, 'leave_requests', rid);

    if (leave.status !== 'Chờ duyệt') {
      fail('Đơn đã được xử lý.');
    }

    const e = await requireActiveEmployee(db, leave.employee_id);
    if (e.id === u.employee_id) {
      fail('Không được tự duyệt đơn nghỉ phép.');
    }
    if (u.role === 'manager' && (!u.department_id || e.department_id !== u.department_id)) {
      fail('Chỉ được duyệt đơn trong phòng ban của bạn.', 403);
    }

    const b = req.body;
    const status = choice(b, 'status', ['Đã duyệt', 'Từ chối'] as const);
    const note = optional(b, 'review_note', 1000);

    if (status === 'Từ chối' && !note) {
      fail('Vui lòng nhập lý do từ chối.');
    }

    const ltype = await existsInTable<{ id: string; deduct_annual: number }>(
      db,
      'leave_types',
      leave.type_id
    );

    await withTransaction(async (tx) => {
      if (status === 'Đã duyệt' && Number(ltype.deduct_annual) === 1) {
        const year = Number(leave.start_date.slice(0, 4));
        const balRow = await tx.one<{ total: number }>(
          'SELECT total FROM leave_balances WHERE employee_id = $1 AND year = $2',
          [e.id, year]
        );
        const total = balRow ? Number(balRow.total) : 12;

        const usedRow = await tx.one<{ n: number }>(
          `SELECT COALESCE(SUM(l.days), 0) AS n
           FROM leave_requests l
           JOIN leave_types t ON t.id = l.type_id
           WHERE l.employee_id = $1
             AND l.status = 'Đã duyệt'
             AND t.deduct_annual = 1
             AND SUBSTRING(l.start_date FROM 1 FOR 4) = $2`,
          [e.id, String(year)]
        );
        const used = Number(usedRow?.n ?? 0);

        if (used + Number(leave.days) > total) {
          fail(`Nhân viên chỉ còn ${total - used} ngày phép năm.`);
        }

        await tx.run(
          `INSERT INTO leave_balances(employee_id, year, total)
           VALUES($1, $2, $3)
           ON CONFLICT (employee_id, year) DO NOTHING`,
          [e.id, year, total]
        );
      }

      await tx.run(
        `UPDATE leave_requests
         SET status = $1, approver_id = $2, approved_date = $3, review_note = $4
         WHERE id = $5`,
        [status, u.employee_id, today(), note, rid]
      );
      await auditLog(tx, u.id, `${status} đơn nghỉ phép`, rid);
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 4.4 Điều chỉnh quỹ phép theo năm
leavesRouter.post('/balances', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const b = req.body;
    const e = await requireActiveEmployee(db, text(b, 'employee_id'));
    const year = numeric(b, 'year', 2000, 2100);
    const total = numeric(b, 'total', 0, 366);

    if (!Number.isInteger(year) || !Number.isInteger(total)) {
      fail('Năm và số ngày phép phải là số nguyên.');
    }

    const usedRow = await db.one<{ n: number }>(
      `SELECT COALESCE(SUM(l.days), 0) AS n
       FROM leave_requests l
       JOIN leave_types t ON t.id = l.type_id
       WHERE l.employee_id = $1
         AND l.status = 'Đã duyệt'
         AND t.deduct_annual = 1
         AND SUBSTRING(l.start_date FROM 1 FOR 4) = $2`,
      [e.id, String(year)]
    );
    const used = Number(usedRow?.n ?? 0);

    if (total < used) {
      fail('Tổng ngày phép không được nhỏ hơn số ngày đã sử dụng.');
    }

    await db.run(
      `INSERT INTO leave_balances(employee_id, year, total)
       VALUES($1, $2, $3)
       ON CONFLICT (employee_id, year) DO UPDATE SET total = EXCLUDED.total`,
      [e.id, year, total]
    );
    await auditLog(db, u.id, 'Cập nhật quỹ phép', `${e.id}/${year}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
