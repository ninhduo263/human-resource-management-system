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

    const TenDangNhap = text(req.body, 'TenDangNhap', 150);
    if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(TenDangNhap) && !EMAIL_PATTERN.test(TenDangNhap)) {
      fail('Tên đăng nhập cần là email hợp lệ hoặc 3–50 ký tự chữ, số, dấu gạch.');
    }

    const MaNV = text(req.body, 'MaNV');
    await requireActiveEmployee(db, MaNV);
    const VaiTro = choice(req.body, 'VaiTro', ROLES);

    const pw = text(req.body, 'MatKhau');
    if (pw.length < 10) fail('Mật khẩu phải có ít nhất 10 ký tự.');

    const hasAccount = await db.one('SELECT "MaTK" FROM taikhoan WHERE "MaNV" = $1', [MaNV]);
    if (hasAccount) fail('Nhân viên này đã có tài khoản; hãy đổi vai trò hoặc khóa/mở tài khoản đó.', 409);

    const MaTK = generateId('U');
    await db.run(
      'INSERT INTO taikhoan("MaTK", "TenDangNhap", "MatKhau", "VaiTro", "MaNV", "HoatDong") VALUES($1, $2, $3, $4, $5, 1)',
      [MaTK, TenDangNhap, passwordHash(pw), VaiTro, MaNV]
    );
    await auditLog(db, u.MaTK, 'Tạo tài khoản', TenDangNhap);
    res.status(201).json({ id: MaTK });
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
        MaTK: string;
        TenDangNhap: string;
        HoatDong: number;
        MaNV: string;
      }>(tx, 'taikhoan', targetId);
      if (target.MaTK === u.MaTK) fail('Không thể khóa tài khoản của chính bạn.');

      const next = target.HoatDong ? 0 : 1;
      if (next === 1) await requireActiveEmployee(tx, target.MaNV);
      await tx.run('UPDATE taikhoan SET "HoatDong" = $1 WHERE "MaTK" = $2', [next, target.MaTK]);
      await tx.run('DELETE FROM phiendangnhap WHERE "MaTK" = $1', [target.MaTK]);
      await auditLog(tx, u.MaTK, 'Đổi trạng thái tài khoản', target.TenDangNhap, {
        HoatDong: { from: target.HoatDong, to: next },
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
    const MatKhau = `Nv@${randomBytes(9).toString('base64url')}`;

    await withTransaction(async (tx) => {
      const target = await existsInTable<{ MaTK: string; TenDangNhap: string }>(tx, 'taikhoan', targetId);
      await tx.run('UPDATE taikhoan SET "MatKhau" = $1 WHERE "MaTK" = $2', [passwordHash(MatKhau), target.MaTK]);
      await tx.run('DELETE FROM phiendangnhap WHERE "MaTK" = $1', [target.MaTK]);
      await auditLog(tx, u.MaTK, 'Đặt lại mật khẩu', target.TenDangNhap);
    });
    res.json({ ok: true, MatKhau });
  })
);

// Đổi vai trò tài khoản (hủy phiên để quyền mới có hiệu lực ngay)
usersRouter.put(
  '/:id/role',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin']);
    const targetId = paramId(req);
    const VaiTro = choice(req.body, 'VaiTro', ROLES);

    await withTransaction(async (tx) => {
      const target = await existsInTable<{
        MaTK: string;
        TenDangNhap: string;
        VaiTro: string;
        MaNV: string;
      }>(tx, 'taikhoan', targetId);
      if (target.MaTK === u.MaTK) fail('Không thể tự đổi vai trò của chính bạn.');
      if (target.VaiTro === VaiTro) return;

      await tx.run('UPDATE taikhoan SET "VaiTro" = $1 WHERE "MaTK" = $2', [VaiTro, target.MaTK]);
      await tx.run('DELETE FROM phiendangnhap WHERE "MaTK" = $1', [target.MaTK]);
      // Rời vai trò trưởng phòng thì không còn là trưởng phòng; nhận vai trò đó thì làm trưởng phòng nếu phòng chưa có.
      if (VaiTro !== 'manager') {
        await tx.run('UPDATE phongban SET "MaTruongPhong" = NULL WHERE "MaTruongPhong" = $1', [target.MaNV]);
      } else {
        await tx.run(
          `UPDATE phongban SET "MaTruongPhong" = $1
           WHERE "MaTruongPhong" IS NULL AND "MaPB" = (SELECT "MaPB" FROM nhanvien WHERE "MaNV" = $1)`,
          [target.MaNV]
        );
      }
      await auditLog(tx, u.MaTK, 'Đổi vai trò tài khoản', target.TenDangNhap, {
        VaiTro: { from: target.VaiTro, to: VaiTro },
      });
    });
    res.json({ ok: true });
  })
);
