import { Router } from 'express';
import { db, withTransaction, auditLog } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { choice, date, fail, optional, text, today } from '../utils/validation.js';

export const employeesRouter = Router();

employeesRouter.use(requireAuth);

// 1.1 Thêm hồ sơ mới
employeesRouter.post('/', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const b = req.body;
    const eid = text(b, 'id', 25);
    if (!/^[A-Za-z0-9_-]+$/.test(eid)) {
      fail('Mã nhân viên chỉ gồm chữ, số, gạch ngang hoặc gạch dưới.');
    }

    const name = text(b, 'name', 120);
    const birth = date(b, 'birth_date');
    const join = date(b, 'join_date');
    const currentDay = today();

    if (birth >= currentDay || birth >= join) {
      fail('Ngày sinh phải trước ngày vào làm và ngày hiện tại.');
    }

    const gender = choice(b, 'gender', ['Nam', 'Nữ', 'Khác'] as const);
    const phone = text(b, 'phone', 20);
    const email = text(b, 'email', 150);

    if (!/^[+\d][\d .()-]{7,19}$/.test(phone)) {
      fail('Số điện thoại không hợp lệ.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail('Email không hợp lệ.');
    }

    const dept = await existsInTable(db, 'departments', text(b, 'department_id'));
    const pos = await existsInTable(db, 'positions', text(b, 'position_id'));
    const status = choice(b, 'status', ['Đang làm việc', 'Thử việc'] as const);
    const address = optional(b, 'address');

    await withTransaction(async (tx) => {
      await tx.run(
        `INSERT INTO employees(id, name, birth_date, gender, address, phone, email, join_date, status, archived_date, department_id, position_id)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11)`,
        [eid, name, birth, gender, address, phone, email, join, status, dept.id, pos.id]
      );
      await tx.run(
        'INSERT INTO leave_balances(employee_id, year, total) VALUES($1, $2, 12) ON CONFLICT DO NOTHING',
        [eid, Number(currentDay.slice(0, 4))]
      );
      await auditLog(tx, u.id, 'Thêm hồ sơ', eid);
    });

    res.status(201).json({ id: eid });
  } catch (err) {
    next(err);
  }
});

// 1.2 Cập nhật hồ sơ (Admin/HR cập nhật đầy đủ hoặc Nhân viên tự cập nhật thông tin liên hệ)
employeesRouter.put('/:id', async (req, res, next) => {
  try {
    const u = req.user!;
    const rid = decodeURIComponent(req.params.id);
    const b = req.body;

    // Nếu là nhân viên/trưởng phòng/giám đốc tự cập nhật thông tin liên hệ cá nhân (theo DFD 1.2)
    if (!['admin', 'hr'].includes(u.role)) {
      if (rid !== u.employee_id || b.self_contact !== true) {
        fail('Bạn không có quyền thực hiện thao tác này.', 403);
      }
      await requireActiveEmployee(db, rid);
      const phone = text(b, 'phone', 20);
      const email = text(b, 'email', 150);
      const address = optional(b, 'address');
      if (!/^[+\d][\d .()-]{7,19}$/.test(phone)) {
        fail('Số điện thoại không hợp lệ.');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fail('Email không hợp lệ.');
      }
      await db.run(
        'UPDATE employees SET phone = $1, email = $2, address = $3 WHERE id = $4',
        [phone, email, address, rid]
      );
      await auditLog(db, u.id, 'Cập nhật thông tin liên hệ cá nhân', rid);
      res.json({ ok: true });
      return;
    }

    requireRole(u, ['admin', 'hr']);
    const old = await requireActiveEmployee(db, rid);

    const name = text(b, 'name', 120);
    const birth = date(b, 'birth_date');
    const join = date(b, 'join_date');
    const currentDay = today();

    if (birth >= currentDay || birth >= join) {
      fail('Ngày sinh phải trước ngày vào làm và ngày hiện tại.');
    }

    const gender = choice(b, 'gender', ['Nam', 'Nữ', 'Khác'] as const);
    const phone = text(b, 'phone', 20);
    const email = text(b, 'email', 150);

    if (!/^[+\d][\d .()-]{7,19}$/.test(phone)) {
      fail('Số điện thoại không hợp lệ.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail('Email không hợp lệ.');
    }

    const dept = await existsInTable(db, 'departments', text(b, 'department_id'));
    const pos = await existsInTable(db, 'positions', text(b, 'position_id'));
    const status = choice(b, 'status', ['Đang làm việc', 'Thử việc'] as const);

    const invalidContract = await db.one(
      'SELECT id FROM contracts WHERE employee_id = $1 AND start_date < $2',
      [rid, join]
    );
    const invalidAssignment = await db.one(
      'SELECT id FROM assignments WHERE employee_id = $1 AND effective_date < $2',
      [rid, join]
    );
    const invalidLeave = await db.one(
      'SELECT id FROM leave_requests WHERE employee_id = $1 AND start_date < $2',
      [rid, join]
    );

    if (invalidContract || invalidAssignment || invalidLeave) {
      fail('Ngày vào làm không được sau lịch sử hợp đồng, công tác hoặc nghỉ phép.');
    }

    if (old.department_id !== dept.id || old.position_id !== pos.id) {
      fail('Hãy dùng chức năng Công tác để điều chuyển hoặc bổ nhiệm và lưu quyết định.');
    }

    await db.run(
      `UPDATE employees
       SET name = $1, birth_date = $2, gender = $3, address = $4, phone = $5, email = $6, join_date = $7, status = $8
       WHERE id = $9`,
      [name, birth, gender, optional(b, 'address'), phone, email, join, status, rid]
    );
    await auditLog(db, u.id, 'Cập nhật hồ sơ', rid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 1.4 Lưu trữ hồ sơ
employeesRouter.post('/:id/archive', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const rid = decodeURIComponent(req.params.id);
    const e = await requireActiveEmployee(db, rid);

    if (e.id === u.employee_id) {
      fail('Không thể lưu trữ hồ sơ của chính bạn.');
    }

    const currentDay = today();
    const activeContract = await db.one(
      `SELECT id FROM contracts
       WHERE employee_id = $1
         AND status != 'Đã chấm dứt'
         AND (end_date IS NULL OR end_date >= $2)`,
      [rid, currentDay]
    );
    if (activeContract) {
      fail('Cần chấm dứt các hợp đồng hiện hành trước khi lưu trữ.');
    }

    const pendingLeave = await db.one(
      `SELECT id FROM leave_requests WHERE employee_id = $1 AND status = 'Chờ duyệt'`,
      [rid]
    );
    if (pendingLeave) {
      fail('Cần xử lý các đơn nghỉ phép chờ duyệt trước khi lưu trữ.');
    }

    await withTransaction(async (tx) => {
      await tx.run(
        `UPDATE employees SET status = 'Đã lưu trữ', archived_date = $1 WHERE id = $2`,
        [currentDay, rid]
      );
      await tx.run(
        `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE employee_id = $1)`,
        [rid]
      );
      await auditLog(tx, u.id, 'Lưu trữ hồ sơ', rid);
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 1.4 Khôi phục hồ sơ đã lưu trữ
employeesRouter.post('/:id/restore', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const rid = decodeURIComponent(req.params.id);
    const archived = await existsInTable(db, 'employees', rid);
    if (archived.status !== 'Đã lưu trữ') {
      fail('Chỉ khôi phục hồ sơ đã lưu trữ.');
    }

    await db.run(
      `UPDATE employees SET status = 'Đang làm việc', archived_date = NULL WHERE id = $1`,
      [rid]
    );
    await auditLog(db, u.id, 'Khôi phục hồ sơ', rid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
