import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db, withTransaction, auditLog, diffFields } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import {
  MIN_WORKING_AGE,
  ageAt,
  assertContact,
  choice,
  date,
  fail,
  optional,
  text,
  today,
} from '../utils/validation.js';
import { generateId, passwordHash } from '../utils/crypto.js';
import { nextBusinessId } from '../utils/business-id.js';
import { asyncHandler, paramId } from '../utils/http.js';
import { LIVE_CONTRACT, syncEmployeeStatuses } from '../services/employeeStatus.js';
import { defaultEntitlement } from '../services/leave.js';

export const employeesRouter = Router();

employeesRouter.use(requireAuth);

function assertPersonalDates(birth: string, join: string, currentDay: string): void {
  if (birth >= currentDay || birth >= join) {
    fail('Ngày sinh phải trước ngày vào làm và ngày hiện tại.');
  }
  if (ageAt(birth, join) < MIN_WORKING_AGE) {
    fail(`Nhân viên phải đủ ${MIN_WORKING_AGE} tuổi tại ngày vào làm.`);
  }
}

// 1.1 Thêm hồ sơ mới
employeesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const b = req.body;
    const name = text(b, 'name', 120);
    const birth = date(b, 'birth_date');
    const join = date(b, 'join_date');
    const currentDay = today();
    assertPersonalDates(birth, join, currentDay);

    const gender = choice(b, 'gender', ['Nam', 'Nữ', 'Khác'] as const);
    const phone = text(b, 'phone', 20);
    const email = text(b, 'email', 150);
    assertContact(phone, email);

    const pos = await existsInTable(db, 'positions', text(b, 'position_id'));
    if (pos.active === false) fail('Chức vụ này đã ngừng sử dụng.');
    const role = choice(
      { role: b.role || (pos.is_executive ? 'director' : pos.default_role || 'employee') },
      'role',
      ['admin', 'hr', 'manager', 'employee', 'director'] as const
    );
    if (role === 'admin' && u.role !== 'admin') {
      fail('Chỉ quản trị viên được tạo tài khoản quản trị.', 403);
    }
    const dept =
      role === 'director' || pos.is_executive
        ? null
        : await existsInTable(db, 'departments', text(b, 'department_id'));
    if (dept && dept.active === false) fail('Phòng ban này đã ngừng sử dụng.');
    const status = choice(b, 'status', ['Đang làm việc', 'Thử việc'] as const);
    const address = optional(b, 'address');

    if (b.confirm_duplicate !== true) {
      const dup = await db.one<{ id: string; name: string }>(
        `SELECT id, name FROM employees
         WHERE (LOWER(name) = LOWER($1) AND birth_date = $2) OR phone = $3
         LIMIT 1`,
        [name, birth, phone]
      );
      if (dup) {
        fail(
          `Có thể trùng hồ sơ ${dup.id} (${dup.name}) về họ tên + ngày sinh hoặc số điện thoại. Xác nhận lại nếu vẫn muốn tạo mới.`,
          409
        );
      }
    }

    const password = `Nv@${randomBytes(9).toString('base64url')}`;
    const userId = generateId('U');

    const eid = await withTransaction(async (tx) => {
      const eid = await nextBusinessId(tx, 'employees');
      await tx.run(
        `INSERT INTO employees(id, name, birth_date, gender, address, phone, email, join_date, status, archived_date, department_id, position_id)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11)`,
        [eid, name, birth, gender, address, phone, email, join, status, dept?.id ?? null, pos.id]
      );
      await tx.run(
        'INSERT INTO users(id, username, password_hash, role, employee_id, active) VALUES($1, $2, $3, $4, $5, 1)',
        [userId, email, passwordHash(password), role, eid]
      );
      await tx.run(
        'INSERT INTO leave_balances(employee_id, year, total) VALUES($1, $2, $3) ON CONFLICT DO NOTHING',
        [eid, Number(currentDay.slice(0, 4)), defaultEntitlement(join, Number(currentDay.slice(0, 4)))]
      );
      if (role === 'manager' && dept) {
        await tx.run('UPDATE departments SET head_id = $1 WHERE id = $2 AND head_id IS NULL', [
          eid,
          dept.id,
        ]);
      }
      await auditLog(tx, u.id, 'Thêm hồ sơ', eid);
      await auditLog(tx, u.id, 'Tạo tài khoản theo email', email);
      return eid;
    });

    res.status(201).json({ id: eid, account: { username: email, password, role } });
  })
);

// 1.2 Cập nhật hồ sơ (Admin/HR cập nhật đầy đủ hoặc nhân viên tự cập nhật thông tin liên hệ)
employeesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const rid = paramId(req);
    const b = req.body;

    // Nhân viên/trưởng phòng/giám đốc tự cập nhật thông tin liên hệ cá nhân (theo DFD 1.2)
    if (!['admin', 'hr'].includes(u.role)) {
      if (rid !== u.employee_id || b.self_contact !== true) {
        fail('Bạn không có quyền thực hiện thao tác này.', 403);
      }
      const phone = text(b, 'phone', 20);
      const email = text(b, 'email', 150);
      const address = optional(b, 'address');
      assertContact(phone, email);

      await withTransaction(async (tx) => {
        const old = await tx.one<any>('SELECT * FROM employees WHERE id = $1 FOR UPDATE', [rid]);
        if (!old) fail('Không tìm thấy dữ liệu.', 404);
        await requireActiveEmployee(tx, rid);
        assertVersion(old, b);
        await tx.run(
          `UPDATE employees SET phone = $1, email = $2, address = $3, version = version + 1 WHERE id = $4`,
          [phone, email, address, rid]
        );
        await syncUsername(tx, rid, old.email, email);
        await auditLog(
          tx,
          u.id,
          'Cập nhật thông tin liên hệ cá nhân',
          rid,
          diffFields(old, { phone, email, address })
        );
      });
      res.json({ ok: true });
      return;
    }

    const name = text(b, 'name', 120);
    const birth = date(b, 'birth_date');
    const join = date(b, 'join_date');
    const currentDay = today();
    assertPersonalDates(birth, join, currentDay);

    const gender = choice(b, 'gender', ['Nam', 'Nữ', 'Khác'] as const);
    const phone = text(b, 'phone', 20);
    const email = text(b, 'email', 150);
    assertContact(phone, email);
    const address = optional(b, 'address');

    await withTransaction(async (tx) => {
      const old = await tx.one<any>('SELECT * FROM employees WHERE id = $1 FOR UPDATE', [rid]);
      if (!old) fail('Không tìm thấy dữ liệu.', 404);
      await requireActiveEmployee(tx, rid);
      assertVersion(old, b);

      const dept =
        old.department_id === null
          ? null
          : await existsInTable(tx, 'departments', text(b, 'department_id'));
      const pos = await existsInTable(tx, 'positions', text(b, 'position_id'));
      if (old.department_id !== (dept?.id ?? null) || old.position_id !== pos.id) {
        fail('Hãy dùng chức năng Công tác để điều chuyển hoặc bổ nhiệm và lưu quyết định.');
      }

      const history = await tx.one(
        `SELECT 1 AS x WHERE
           EXISTS (SELECT 1 FROM contracts WHERE employee_id = $1 AND start_date < $2)
        OR EXISTS (SELECT 1 FROM assignments WHERE employee_id = $1 AND effective_date < $2 AND status <> 'Đã hủy')
        OR EXISTS (SELECT 1 FROM leave_requests WHERE employee_id = $1 AND start_date < $2)`,
        [rid, join]
      );
      if (history) {
        fail('Ngày vào làm không được sau lịch sử hợp đồng, công tác hoặc nghỉ phép.');
      }

      // Trạng thái làm việc do hợp đồng quyết định; không cho sửa tay ở đây.
      await tx.run(
        `UPDATE employees
         SET name = $1, birth_date = $2, gender = $3, address = $4, phone = $5, email = $6,
             join_date = $7, version = version + 1
         WHERE id = $8`,
        [name, birth, gender, address, phone, email, join, rid]
      );
      await syncUsername(tx, rid, old.email, email);
      await auditLog(
        tx,
        u.id,
        'Cập nhật hồ sơ',
        rid,
        diffFields(old, { name, birth_date: birth, gender, address, phone, email, join_date: join })
      );
    });
    res.json({ ok: true });
  })
);

function assertVersion(old: { version: number }, body: Record<string, unknown>): void {
  if (body.version !== undefined && body.version !== null && Number(body.version) !== Number(old.version)) {
    fail('Hồ sơ vừa được người khác cập nhật. Vui lòng tải lại trang và thực hiện lại.', 409);
  }
}

/** Khi email đổi, tài khoản tạo theo email cũng đổi tên đăng nhập theo. */
async function syncUsername(
  tx: import('../db/pool.js').DbExecutor,
  employeeId: string,
  oldEmail: string,
  newEmail: string
): Promise<void> {
  if (oldEmail.toLowerCase() === newEmail.toLowerCase()) return;
  await tx.run(
    `UPDATE users SET username = $1 WHERE employee_id = $2 AND LOWER(username) = LOWER($3)`,
    [newEmail, employeeId, oldEmail]
  );
}

// 1.4 Lưu trữ hồ sơ
employeesRouter.post(
  '/:id/archive',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);

    await withTransaction(async (tx) => {
      const e = await tx.one<any>('SELECT * FROM employees WHERE id = $1 FOR UPDATE', [rid]);
      if (!e) fail('Không tìm thấy dữ liệu.', 404);
      if (e.status === 'Đã lưu trữ') fail('Hồ sơ nhân viên đã lưu trữ.');
      if (e.id === u.employee_id) fail('Không thể lưu trữ hồ sơ của chính bạn.');

      const currentDay = today();
      const activeContract = await tx.one(
        `SELECT id FROM contracts
         WHERE employee_id = $1 AND ${LIVE_CONTRACT}
           AND (end_date IS NULL OR end_date >= $2)`,
        [rid, currentDay]
      );
      if (activeContract) fail('Cần chấm dứt các hợp đồng hiện hành trước khi lưu trữ.');

      const pendingLeave = await tx.one(
        `SELECT id FROM leave_requests WHERE employee_id = $1 AND status = 'Chờ duyệt'`,
        [rid]
      );
      if (pendingLeave) fail('Cần xử lý các đơn nghỉ phép chờ duyệt trước khi lưu trữ.');

      const pendingAssignment = await tx.one(
        `SELECT id FROM assignments WHERE employee_id = $1 AND status = 'Chờ hiệu lực'`,
        [rid]
      );
      if (pendingAssignment) fail('Cần hủy các quyết định công tác chờ hiệu lực trước khi lưu trữ.');

      await tx.run(
        `UPDATE employees SET status = 'Đã lưu trữ', archived_date = $1, version = version + 1 WHERE id = $2`,
        [currentDay, rid]
      );
      await tx.run('UPDATE departments SET head_id = NULL WHERE head_id = $1', [rid]);
      await tx.run('UPDATE users SET active = 0 WHERE employee_id = $1', [rid]);
      await tx.run(
        'DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE employee_id = $1)',
        [rid]
      );
      await auditLog(tx, u.id, 'Lưu trữ hồ sơ', rid);
    });

    res.json({ ok: true });
  })
);

// 1.4 Khôi phục hồ sơ đã lưu trữ
employeesRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);

    await withTransaction(async (tx) => {
      const archived = await tx.one<any>('SELECT * FROM employees WHERE id = $1 FOR UPDATE', [rid]);
      if (!archived) fail('Không tìm thấy dữ liệu.', 404);
      if (archived.status !== 'Đã lưu trữ') fail('Chỉ khôi phục hồ sơ đã lưu trữ.');

      await tx.run(
        `UPDATE employees SET status = 'Đang làm việc', archived_date = NULL, version = version + 1
         WHERE id = $1`,
        [rid]
      );
      // Trạng thái thật (Thử việc / Đang làm việc) suy ra từ hợp đồng hiện hành, nếu có.
      await syncEmployeeStatuses(tx, rid);
      await auditLog(tx, u.id, 'Khôi phục hồ sơ', rid);
    });
    // Tài khoản không tự mở lại: quản trị viên mở lại tường minh trong mục Tài khoản.
    res.json({ ok: true, account_locked: true });
  })
);
