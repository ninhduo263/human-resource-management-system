import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db, withTransaction, auditLog } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { generateId, passwordHash } from '../utils/crypto.js';
import { EMAIL_PATTERN, choice, fail, text } from '../utils/validation.js';
import { asyncHandler, paramId } from '../utils/http.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

const ROLES = ['admin', 'hr', 'manager', 'employee', 'director'] as const;

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin']);

    const username = text(req.body, 'username', 150);
    if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username) && !EMAIL_PATTERN.test(username)) {
      fail('Tên đăng nhập cần là email hợp lệ hoặc 3–50 ký tự chữ, số, dấu gạch.');
    }

    const empId = text(req.body, 'employee_id');
    await requireActiveEmployee(db, empId);
    const role = choice(req.body, 'role', ROLES);

    const pw = text(req.body, 'password');
    if (pw.length < 10) fail('Mật khẩu phải có ít nhất 10 ký tự.');

    const hasAccount = await db.one('SELECT id FROM users WHERE employee_id = $1', [empId]);
    if (hasAccount) fail('Nhân viên này đã có tài khoản; hãy đổi vai trò hoặc khóa/mở tài khoản đó.', 409);

    const uid = generateId('U');
    await db.run(
      'INSERT INTO users(id, username, password_hash, role, employee_id, active) VALUES($1, $2, $3, $4, $5, 1)',
      [uid, username, passwordHash(pw), role, empId]
    );
    await auditLog(db, u.id, 'Tạo tài khoản', username);
    res.status(201).json({ id: uid });
  })
);

usersRouter.post(
  '/:id/toggle',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin']);
    const targetId = paramId(req);

    await withTransaction(async (tx) => {
      const target = await existsInTable<{
        id: string;
        username: string;
        active: number;
        employee_id: string;
      }>(tx, 'users', targetId);
      if (target.id === u.id) fail('Không thể khóa tài khoản của chính bạn.');

      const nextActive = target.active ? 0 : 1;
      if (nextActive === 1) await requireActiveEmployee(tx, target.employee_id);
      await tx.run('UPDATE users SET active = $1 WHERE id = $2', [nextActive, target.id]);
      await tx.run('DELETE FROM sessions WHERE user_id = $1', [target.id]);
      await auditLog(tx, u.id, 'Đổi trạng thái tài khoản', target.username, {
        active: { from: target.active, to: nextActive },
      });
    });
    res.json({ ok: true });
  })
);

// Quản trị viên đặt lại mật khẩu: sinh mật khẩu ngẫu nhiên, hiển thị một lần, hủy mọi phiên của tài khoản.
usersRouter.post(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin']);
    const targetId = paramId(req);
    const password = `Nv@${randomBytes(9).toString('base64url')}`;

    await withTransaction(async (tx) => {
      const target = await existsInTable<{ id: string; username: string }>(tx, 'users', targetId);
      await tx.run('UPDATE users SET password_hash = $1 WHERE id = $2', [
        passwordHash(password),
        target.id,
      ]);
      await tx.run('DELETE FROM sessions WHERE user_id = $1', [target.id]);
      await auditLog(tx, u.id, 'Đặt lại mật khẩu', target.username);
    });
    res.json({ ok: true, password });
  })
);

// Đổi vai trò tài khoản (hủy phiên để quyền mới có hiệu lực ngay)
usersRouter.put(
  '/:id/role',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin']);
    const targetId = paramId(req);
    const role = choice(req.body, 'role', ROLES);

    await withTransaction(async (tx) => {
      const target = await existsInTable<{
        id: string;
        username: string;
        role: string;
        employee_id: string;
      }>(tx, 'users', targetId);
      if (target.id === u.id) fail('Không thể tự đổi vai trò của chính bạn.');
      if (target.role === role) return;

      await tx.run('UPDATE users SET role = $1 WHERE id = $2', [role, target.id]);
      await tx.run('DELETE FROM sessions WHERE user_id = $1', [target.id]);
      // Rời vai trò trưởng phòng thì không còn là trưởng phòng; nhận vai trò đó thì làm trưởng phòng nếu phòng chưa có.
      if (role !== 'manager') {
        await tx.run('UPDATE departments SET head_id = NULL WHERE head_id = $1', [target.employee_id]);
      } else {
        await tx.run(
          `UPDATE departments SET head_id = $1
           WHERE head_id IS NULL AND id = (SELECT department_id FROM employees WHERE id = $1)`,
          [target.employee_id]
        );
      }
      await auditLog(tx, u.id, 'Đổi vai trò tài khoản', target.username, {
        role: { from: target.role, to: role },
      });
    });
    res.json({ ok: true });
  })
);
