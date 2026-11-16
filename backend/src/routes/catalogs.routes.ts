import { Router } from 'express';
import { db, auditLog } from '../db/pool.js';
import { existsInTable, requireAuth, requireRole } from '../middleware/auth.js';
import { date, fail, numeric, optional, text } from '../utils/validation.js';

export const catalogsRouter = Router();

catalogsRouter.use(requireAuth);

// 2.1 Quản lý phòng ban
catalogsRouter.post('/departments', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const b = req.body;
    const rid = text(b, 'id', 25);
    if (!/^[A-Za-z0-9_-]+$/.test(rid)) {
      fail('Mã danh mục không hợp lệ.');
    }
    const name = text(b, 'name', 120);
    const description = optional(b, 'description');
    const founded = date(b, 'founded_date');

    await db.run(
      'INSERT INTO departments(id, name, description, founded_date) VALUES($1, $2, $3, $4)',
      [rid, name, description, founded]
    );
    await auditLog(db, u.id, 'Cập nhật danh mục', rid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

catalogsRouter.put('/departments/:id', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const rid = decodeURIComponent(req.params.id);
    await existsInTable(db, 'departments', rid);

    const b = req.body;
    const name = text(b, 'name', 120);
    const description = optional(b, 'description');
    const founded = date(b, 'founded_date');

    await db.run(
      'UPDATE departments SET name = $1, description = $2, founded_date = $3 WHERE id = $4',
      [name, description, founded, rid]
    );
    await auditLog(db, u.id, 'Cập nhật danh mục', rid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

catalogsRouter.delete('/departments/:id', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const rid = decodeURIComponent(req.params.id);
    await existsInTable(db, 'departments', rid);

    await db.run('DELETE FROM departments WHERE id = $1', [rid]);
    await auditLog(db, u.id, 'Xóa danh mục', rid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 2.2 Quản lý chức vụ
catalogsRouter.post('/positions', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const b = req.body;
    const rid = text(b, 'id', 25);
    if (!/^[A-Za-z0-9_-]+$/.test(rid)) {
      fail('Mã danh mục không hợp lệ.');
    }
    const name = text(b, 'name', 120);
    const description = optional(b, 'description');
    const level = numeric(b, 'level', 1, 10);
    if (!Number.isInteger(level)) {
      fail('Cấp bậc phải là số nguyên.');
    }

    await db.run(
      'INSERT INTO positions(id, name, description, level) VALUES($1, $2, $3, $4)',
      [rid, name, description, level]
    );
    await auditLog(db, u.id, 'Cập nhật danh mục', rid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

catalogsRouter.put('/positions/:id', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const rid = decodeURIComponent(req.params.id);
    await existsInTable(db, 'positions', rid);

    const b = req.body;
    const name = text(b, 'name', 120);
    const description = optional(b, 'description');
    const level = numeric(b, 'level', 1, 10);
    if (!Number.isInteger(level)) {
      fail('Cấp bậc phải là số nguyên.');
    }

    await db.run(
      'UPDATE positions SET name = $1, description = $2, level = $3 WHERE id = $4',
      [name, description, level, rid]
    );
    await auditLog(db, u.id, 'Cập nhật danh mục', rid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

catalogsRouter.delete('/positions/:id', async (req, res, next) => {
  try {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const rid = decodeURIComponent(req.params.id);
    await existsInTable(db, 'positions', rid);

    await db.run('DELETE FROM positions WHERE id = $1', [rid]);
    await auditLog(db, u.id, 'Xóa danh mục', rid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
