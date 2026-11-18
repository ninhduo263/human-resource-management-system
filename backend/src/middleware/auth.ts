import { Request, Response, NextFunction } from 'express';
import { db, DbExecutor } from '../db/pool.js';
import { sha256 } from '../utils/crypto.js';
import { fail } from '../utils/validation.js';

export type UserRole = 'admin' | 'hr' | 'manager' | 'employee' | 'director';

/** Người dùng của phiên hiện tại (cột của TAIKHOAN + họ tên, phòng ban của NHANVIEN). */
export interface SessionUser {
  matk: string;
  tendangnhap: string;
  vaitro: UserRole;
  manv: string;
  hoten: string;
  mapb: string | null;
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
      `SELECT t.matk, t.tendangnhap, t.vaitro, t.manv, n.hoten, n.mapb
       FROM phiendangnhap p
       JOIN taikhoan t ON t.matk = p.matk
       JOIN nhanvien n ON n.manv = t.manv
       WHERE p.maphien = $1
         AND p.thoihan > $2
         AND t.hoatdong = 1
         AND n.trangthai NOT IN ('Đã lưu trữ', 'Đã nghỉ việc')`,
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
  if (!roles.includes(u.vaitro)) {
    fail('Bạn không có quyền thực hiện thao tác này.', 403);
  }
}

export function canViewEmployee(
  u: SessionUser,
  emp: { manv: string; mapb: string | null }
): boolean {
  return (
    ['admin', 'hr', 'director'].includes(u.vaitro) ||
    (u.vaitro === 'manager' && u.mapb !== null && emp.mapb === u.mapb) ||
    emp.manv === u.manv
  );
}

/** Bảng được phép tra theo khóa chính và tên cột khóa chính tương ứng. */
const TABLE_KEYS: Record<string, string> = {
  phongban: 'mapb',
  chucvu: 'macv',
  nhanvien: 'manv',
  hopdong: 'mahd',
  giahanhopdong: 'magh',
  quyetdinh: 'maqd',
  quatrinhcongtac: 'maqt',
  loainghiphep: 'maloai',
  donnghiphep: 'madon',
  taikhoan: 'matk',
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
  const row = await executor.one<T>(`SELECT * FROM ${table} WHERE ${pk} = $1`, [id]);
  if (!row) {
    fail('Không tìm thấy dữ liệu.', 404);
  }
  return row as T;
}

export async function requireActiveEmployee(executor: DbExecutor, manv: string): Promise<any> {
  const emp = await existsInTable<any>(executor, 'nhanvien', manv);
  if (emp.trangthai === 'Đã lưu trữ') {
    fail('Hồ sơ nhân viên đã lưu trữ.');
  }
  if (emp.trangthai === 'Đã nghỉ việc') {
    fail('Nhân viên đã nghỉ việc.');
  }
  return emp;
}
