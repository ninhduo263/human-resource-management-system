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

    const tendangnhap = text(req.body, 'tendangnhap', 150);
    if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(tendangnhap) && !EMAIL_PATTERN.test(tendangnhap)) {
      fail('Tên đăng nhập cần là email hợp lệ hoặc 3–50 ký tự chữ, số, dấu gạch.');
    }

    const manv = text(req.body, 'manv');
    await requireActiveEmployee(db, manv);
    const vaitro = choice(req.body, 'vaitro', ROLES);

    const pw = text(req.body, 'matkhau');
    if (pw.length < 10) fail('Mật khẩu phải có ít nhất 10 ký tự.');

    const hasAccount = await db.one('SELECT matk FROM taikhoan WHERE manv = $1', [manv]);
    if (hasAccount) fail('Nhân viên này đã có tài khoản; hãy đổi vai trò hoặc khóa/mở tài khoản đó.', 409);

    const matk = generateId('U');
    await db.run(
      'INSERT INTO taikhoan(matk, tendangnhap, matkhau, vaitro, manv, hoatdong) VALUES($1, $2, $3, $4, $5, 1)',
      [matk, tendangnhap, passwordHash(pw), vaitro, manv]
    );
    await auditLog(db, u.matk, 'Tạo tài khoản', tendangnhap);
    res.status(201).json({ id: matk });
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
        matk: string;
        tendangnhap: string;
        hoatdong: number;
        manv: string;
      }>(tx, 'taikhoan', targetId);
      if (target.matk === u.matk) fail('Không thể khóa tài khoản của chính bạn.');

      const next = target.hoatdong ? 0 : 1;
      if (next === 1) await requireActiveEmployee(tx, target.manv);
      await tx.run('UPDATE taikhoan SET hoatdong = $1 WHERE matk = $2', [next, target.matk]);
      await tx.run('DELETE FROM phiendangnhap WHERE matk = $1', [target.matk]);
      await auditLog(tx, u.matk, 'Đổi trạng thái tài khoản', target.tendangnhap, {
        hoatdong: { from: target.hoatdong, to: next },
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
    const matkhau = `Nv@${randomBytes(9).toString('base64url')}`;

    await withTransaction(async (tx) => {
      const target = await existsInTable<{ matk: string; tendangnhap: string }>(tx, 'taikhoan', targetId);
      await tx.run('UPDATE taikhoan SET matkhau = $1 WHERE matk = $2', [passwordHash(matkhau), target.matk]);
      await tx.run('DELETE FROM phiendangnhap WHERE matk = $1', [target.matk]);
      await auditLog(tx, u.matk, 'Đặt lại mật khẩu', target.tendangnhap);
    });
    res.json({ ok: true, matkhau });
  })
);

// Đổi vai trò tài khoản (hủy phiên để quyền mới có hiệu lực ngay)
usersRouter.put(
  '/:id/role',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin']);
    const targetId = paramId(req);
    const vaitro = choice(req.body, 'vaitro', ROLES);

    await withTransaction(async (tx) => {
      const target = await existsInTable<{
        matk: string;
        tendangnhap: string;
        vaitro: string;
        manv: string;
      }>(tx, 'taikhoan', targetId);
      if (target.matk === u.matk) fail('Không thể tự đổi vai trò của chính bạn.');
      if (target.vaitro === vaitro) return;

      await tx.run('UPDATE taikhoan SET vaitro = $1 WHERE matk = $2', [vaitro, target.matk]);
      await tx.run('DELETE FROM phiendangnhap WHERE matk = $1', [target.matk]);
      // Rời vai trò trưởng phòng thì không còn là trưởng phòng; nhận vai trò đó thì làm trưởng phòng nếu phòng chưa có.
      if (vaitro !== 'manager') {
        await tx.run('UPDATE phongban SET matruongphong = NULL WHERE matruongphong = $1', [target.manv]);
      } else {
        await tx.run(
          `UPDATE phongban SET matruongphong = $1
           WHERE matruongphong IS NULL AND mapb = (SELECT mapb FROM nhanvien WHERE manv = $1)`,
          [target.manv]
        );
      }
      await auditLog(tx, u.matk, 'Đổi vai trò tài khoản', target.tendangnhap, {
        vaitro: { from: target.vaitro, to: vaitro },
      });
    });
    res.json({ ok: true });
  })
);
