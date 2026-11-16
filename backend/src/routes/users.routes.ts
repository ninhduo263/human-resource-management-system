import { Router } from 'express';
import { db, withTransaction, auditLog } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { generateId, passwordHash } from '../utils/crypto.js';
import { choice, fail, text } from '../utils/validation.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.post('/', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin']);

    const username = text(req.body, 'username', 150);
    if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
      fail('Tên đăng nhập cần là email hợp lệ hoặc 3–50 ký tự chữ, số, dấu gạch.');
    }

    const empId = text(req.body, 'employee_id');
    await requireActiveEmployee(db, empId);

    const role = choice(req.body, 'role', [
      'admin',
      'hr',
      'manager',
      'employee',
      'director',
    ] as const);

    const pw = text(req.body, 'password');
    if (pw.length < 10) {
      fail('Mật khẩu phải có ít nhất 10 ký tự.');
    }

    const uid = generateId('U');
    await db.run(
      'INSERT INTO users(id, username, password_hash, role, employee_id, active) VALUES($1, $2, $3, $4, $5, 1)',
      [uid, username, passwordHash(pw), role, empId]
    );
    await auditLog(db, u.id, 'Tạo tài khoản', username);
    res.status(201).json({ id: uid });
  } catch (err) {
    next(err);
  }
});

usersRouter.post('/:id/toggle', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin']);

    const targetId = decodeURIComponent(req.params.id);
    const target = await existsInTable<{ id: string; username: string; active: number }>(
      db,
      'users',
      targetId
    );
    if (target.id === u.id) {
      fail('Không thể khóa tài khoản của chính bạn.');
    }

    await withTransaction(async (tx) => {
      const nextActive = target.active ? 0 : 1;
      await tx.run('UPDATE users SET active = $1 WHERE id = $2', [nextActive, target.id]);
      await tx.run('DELETE FROM sessions WHERE user_id = $1', [target.id]);
      await auditLog(tx, u.id, 'Đổi trạng thái tài khoản', target.username);
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
