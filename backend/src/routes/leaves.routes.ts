import { Router } from 'express';
import { db, DbExecutor, withTransaction, auditLog } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { generateId } from '../utils/crypto.js';
import {
  choice,
  date,
  fail,
  numeric,
  optional,
  shift,
  text,
  today,
} from '../utils/validation.js';
import { asyncHandler, paramId } from '../utils/http.js';
import {
  annualTotal,
  canReviewLeave,
  departmentsWithManager,
  loadHolidays,
  usedAnnualDays,
} from '../services/leave.js';
import { countWorkingDays } from '../utils/validation.js';

export const leavesRouter = Router();

leavesRouter.use(requireAuth);

async function lockEmployee(tx: DbExecutor, id: string): Promise<void> {
  await tx.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [id]);
}

/** Tách khoảng nghỉ thành các đoạn theo từng năm dương lịch. */
function splitByYear(start: string, end: string): [string, string][] {
  const out: [string, string][] = [];
  let from = start;
  while (from <= end) {
    const yearEnd = `${from.slice(0, 4)}-12-31`;
    const to = yearEnd < end ? yearEnd : end;
    out.push([from, to]);
    from = shift(yearEnd, 1);
  }
  return out;
}

// 4.2 Đăng ký nghỉ phép (đơn nghỉ qua năm được tự tách theo năm)
leavesRouter.post(
  '/leaves',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr', 'manager', 'employee', 'director']);

    const b = req.body;
    const selfOnly = ['employee', 'manager', 'director'].includes(u.role);
    const eid = selfOnly ? u.employee_id : text(b, 'employee_id');
    const start = date(b, 'start_date');
    const end = date(b, 'end_date');
    const reason = text(b, 'reason', 1000);
    const currentDay = today();

    // Chỉ nhân sự/quản trị viên được nhập đơn lùi ngày (ốm đột xuất, quên làm đơn).
    if (start < currentDay && !['admin', 'hr'].includes(u.role)) {
      fail('Ngày nghỉ không được trước hôm nay.');
    }
    if (end < start) fail('Ngày kết thúc không được trước ngày bắt đầu.');

    const ids = await withTransaction(async (tx) => {
      await lockEmployee(tx, eid);
      const e = await requireActiveEmployee(tx, eid);
      const type = await existsInTable<{ id: string; max_days: number }>(
        tx,
        'leave_types',
        text(b, 'type_id')
      );
      if (start < e.join_date) fail('Ngày nghỉ không được trước ngày vào làm.');

      const holidays = await loadHolidays(tx, start, end);
      const segments = splitByYear(start, end)
        .map(([from, to]) => ({ from, to, days: countWorkingDays(from, to, holidays) }))
        .filter((s) => s.days > 0);
      if (!segments.length) fail('Khoảng nghỉ không có ngày làm việc nào (cuối tuần hoặc ngày lễ).');

      const total = segments.reduce((sum, s) => sum + s.days, 0);
      if (total > Number(type.max_days)) {
        fail(`Loại nghỉ này tối đa ${type.max_days} ngày làm việc mỗi đơn.`);
      }

      const overlap = await tx.one(
        `SELECT id FROM leave_requests
         WHERE employee_id = $1 AND status IN ('Chờ duyệt', 'Đã duyệt')
           AND start_date <= $2 AND end_date >= $3`,
        [eid, end, start]
      );
      if (overlap) fail('Khoảng nghỉ trùng với đơn đang chờ duyệt hoặc đã duyệt.');

      const created: string[] = [];
      for (const s of segments) {
        const lid = generateId('NP');
        await tx.run(
          `INSERT INTO leave_requests(id, employee_id, type_id, submitted_date, start_date, end_date, days, reason, status)
           VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'Chờ duyệt')`,
          [lid, eid, type.id, currentDay, s.from, s.to, s.days, reason]
        );
        await auditLog(tx, u.id, 'Nộp đơn nghỉ phép', lid, {
          start_date: s.from,
          end_date: s.to,
          days: s.days,
          backdated: s.from < currentDay,
        });
        created.push(lid);
      }
      return created;
    });
    res.status(201).json({ id: ids[0], ids });
  })
);

// Hủy đơn nghỉ phép: đơn chờ duyệt, hoặc đơn đã duyệt nhưng chưa nghỉ (quỹ phép tự hoàn lại)
leavesRouter.post(
  '/leaves/:id/cancel',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const rid = paramId(req);

    await withTransaction(async (tx) => {
      const probe = await existsInTable<any>(tx, 'leave_requests', rid);
      await lockEmployee(tx, probe.employee_id);
      const leave = (await tx.one<any>('SELECT * FROM leave_requests WHERE id = $1 FOR UPDATE', [rid]))!;
      const privileged = ['admin', 'hr'].includes(u.role);
      const owner = leave.employee_id === u.employee_id;
      if (!owner && !privileged) fail('Bạn không có quyền hủy đơn này.', 403);

      const currentDay = today();
      if (leave.status === 'Chờ duyệt') {
        // mọi người có quyền ở trên đều được hủy
      } else if (leave.status === 'Đã duyệt') {
        const allowed = privileged ? leave.end_date >= currentDay : leave.start_date > currentDay;
        if (!allowed) fail('Đơn đã duyệt chỉ hủy được khi chưa đến ngày nghỉ.');
      } else {
        fail('Đơn đã được xử lý.');
      }

      await tx.run(`UPDATE leave_requests SET status = 'Đã hủy' WHERE id = $1`, [rid]);
      await auditLog(tx, u.id, 'Hủy đơn nghỉ phép', rid, { previous_status: leave.status });
    });
    res.json({ ok: true });
  })
);

// 4.3 Duyệt hoặc từ chối nghỉ phép
leavesRouter.post(
  '/leaves/:id/review',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'manager', 'director', 'hr']);
    const rid = paramId(req);
    const b = req.body;
    const status = choice(b, 'status', ['Đã duyệt', 'Từ chối'] as const);
    const note = optional(b, 'review_note', 1000);
    if (status === 'Từ chối' && !note) fail('Vui lòng nhập lý do từ chối.');

    await withTransaction(async (tx) => {
      const probe = await existsInTable<any>(tx, 'leave_requests', rid);
      // Khóa nhân viên để các lần duyệt đồng thời cùng một người được thực hiện lần lượt.
      await lockEmployee(tx, probe.employee_id);
      const leave = (await tx.one<any>('SELECT * FROM leave_requests WHERE id = $1 FOR UPDATE', [rid]))!;
      if (leave.status !== 'Chờ duyệt') fail('Đơn đã được xử lý.');

      const e = await requireActiveEmployee(tx, leave.employee_id);
      if (e.id === u.employee_id) fail('Không được tự duyệt đơn nghỉ phép.');

      const target = await tx.one<{ role: string }>(
        'SELECT role FROM users WHERE employee_id = $1',
        [e.id]
      );
      const managed = await departmentsWithManager(tx);
      const hasManager = e.department_id !== null && managed.has(e.department_id);
      const deptHead = e.department_id
        ? await tx.one<{ head_id: string | null }>('SELECT head_id FROM departments WHERE id = $1', [e.department_id])
        : null;
      const isHead = deptHead?.head_id === u.employee_id;
      if (!canReviewLeave(u, e, target?.role ?? null, hasManager, isHead)) {
        fail('Bạn không có quyền duyệt đơn nghỉ phép này.', 403);
      }

      const ltype = await existsInTable<{ id: string; deduct_annual: number }>(
        tx,
        'leave_types',
        leave.type_id
      );

      if (status === 'Đã duyệt' && Number(ltype.deduct_annual) === 1) {
        const year = Number(leave.start_date.slice(0, 4));
        const total = await annualTotal(tx, e, year);
        const used = await usedAnnualDays(tx, e.id, year);
        if (used + Number(leave.days) > total) {
          fail(`Nhân viên chỉ còn ${Math.max(total - used, 0)} ngày phép năm.`);
        }
        await tx.run(
          `INSERT INTO leave_balances(employee_id, year, total) VALUES($1, $2, $3)
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
  })
);

// 4.4 Điều chỉnh quỹ phép theo năm
leavesRouter.post(
  '/balances',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const b = req.body;
    const empId = text(b, 'employee_id');
    const year = numeric(b, 'year', 2000, 2100);
    const total = numeric(b, 'total', 0, 366);
    if (!Number.isInteger(year) || !Number.isInteger(total)) {
      fail('Năm và số ngày phép phải là số nguyên.');
    }

    await withTransaction(async (tx) => {
      await lockEmployee(tx, empId);
      const e = await requireActiveEmployee(tx, empId);
      const used = await usedAnnualDays(tx, e.id, year);
      if (total < used) fail('Tổng ngày phép không được nhỏ hơn số ngày đã sử dụng.');

      const before = await annualTotal(tx, e, year);
      await tx.run(
        `INSERT INTO leave_balances(employee_id, year, total) VALUES($1, $2, $3)
         ON CONFLICT (employee_id, year) DO UPDATE SET total = EXCLUDED.total`,
        [e.id, year, total]
      );
      await auditLog(tx, u.id, 'Cập nhật quỹ phép', `${e.id}/${year}`, {
        total: { from: before, to: total },
      });
    });
    res.json({ ok: true });
  })
);

// Ngày lễ (không tính vào số ngày nghỉ)
leavesRouter.get(
  '/holidays',
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year);
    const rows = Number.isInteger(year)
      ? await db.all('SELECT day, name FROM holidays WHERE EXTRACT(YEAR FROM day) = $1 ORDER BY day', [year])
      : await db.all('SELECT day, name FROM holidays ORDER BY day');
    res.json(rows);
  })
);

leavesRouter.post(
  '/holidays',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const day = date(req.body, 'day');
    const name = text(req.body, 'name', 120);
    await db.run(
      `INSERT INTO holidays(day, name) VALUES($1, $2) ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name`,
      [day, name]
    );
    await auditLog(db, u.id, 'Cập nhật ngày lễ', day);
    res.status(201).json({ ok: true });
  })
);

leavesRouter.delete(
  '/holidays/:day',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const day = paramId(req, 'day');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail('Ngày không hợp lệ.');
    await db.run('DELETE FROM holidays WHERE day = $1', [day]);
    await auditLog(db, u.id, 'Xóa ngày lễ', day);
    res.json({ ok: true });
  })
);
