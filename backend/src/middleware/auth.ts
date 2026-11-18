import { Request, Response, NextFunction } from 'express';
import { db, DbExecutor } from '../db/pool.js';
import { sha256 } from '../utils/crypto.js';
import { fail } from '../utils/validation.js';

export type UserRole = 'admin' | 'hr' | 'manager' | 'employee' | 'director';

/** Người dùng của phiên hiện tại (cột của TAIKHOAN + họ tên, phòng ban của NHANVIEN). */
export interface SessionUser {
  MaTK: string;
  TenDangNhap: string;
  VaiTro: UserRole;
  MaNV: string;
  HoTen: string;
  MaPB: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function extractToken(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie || '';
  return cookieHeader
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('hr_session='))
    ?.slice(11);
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) {
      fail('Vui lòng đăng nhập.', 401);
    }
    const user = await db.one<SessionUser>(
      `SELECT t."MaTK", t."TenDangNhap", t."VaiTro", t."MaNV", n."HoTen", n."MaPB"
       FROM "PHIENDANGNHAP" p
       JOIN "TAIKHOAN" t ON t."MaTK" = p."MaTK"
       JOIN "NHANVIEN" n ON n."MaNV" = t."MaNV"
       WHERE p."MaPhien" = $1
         AND p."ThoiHan" > $2
         AND t."HoatDong" = 1
         AND n."TrangThai" NOT IN ('Đã lưu trữ', 'Đã nghỉ việc')`,
      [sha256(token), Date.now()]
    );
    if (!user) {
      fail('Phiên đăng nhập đã hết hạn.', 401);
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(u: SessionUser, roles: UserRole[]): void {
  if (!roles.includes(u.VaiTro)) {
    fail('Bạn không có quyền thực hiện thao tác này.', 403);
  }
}

export function canViewEmployee(
  u: SessionUser,
  emp: { MaNV: string; MaPB: string | null }
): boolean {
  return (
    ['admin', 'hr', 'director'].includes(u.VaiTro) ||
    (u.VaiTro === 'manager' && u.MaPB !== null && emp.MaPB === u.MaPB) ||
    emp.MaNV === u.MaNV
  );
}

/** Bảng được phép tra theo khóa chính và tên cột khóa chính tương ứng. */
const TABLE_KEYS: Record<string, string> = {
  PHONGBAN: 'MaPB',
  CHUCVU: 'MaCV',
  NHANVIEN: 'MaNV',
  HOPDONG: 'MaHD',
  GIAHANHOPDONG: 'MaGH',
  QUYETDINH: 'MaQD',
  QUATRINHCONGTAC: 'MaQT',
  LOAINGHIPHEP: 'MaLoai',
  DONNGHIPHEP: 'MaDon',
  TAIKHOAN: 'MaTK',
};

export async function existsInTable<T = any>(
  executor: DbExecutor,
  table: string,
  id: string
): Promise<T> {
  const pk = TABLE_KEYS[table];
  if (!pk) {
    fail('Bảng truy vấn không hợp lệ.', 400);
  }
  const row = await executor.one<T>(`SELECT * FROM "${table}" WHERE "${pk}" = $1`, [id]);
  if (!row) {
    fail('Không tìm thấy dữ liệu.', 404);
  }
  return row as T;
}

export async function requireActiveEmployee(executor: DbExecutor, MaNV: string): Promise<any> {
  const emp = await existsInTable<any>(executor, 'NHANVIEN', MaNV);
  if (emp.TrangThai === 'Đã lưu trữ') {
    fail('Hồ sơ nhân viên đã lưu trữ.');
  }
  if (emp.TrangThai === 'Đã nghỉ việc') {
    fail('Nhân viên đã nghỉ việc.');
  }
  return emp;
}
