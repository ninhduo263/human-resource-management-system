import { Request, Response, NextFunction } from 'express';
import { db, DbExecutor } from '../db/pool.js';
import { sha256 } from '../utils/crypto.js';
import { fail } from '../utils/validation.js';

export type UserRole = 'admin' | 'hr' | 'manager' | 'employee' | 'director';

export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
  employee_id: string;
  name: string;
  department_id: string | null;
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
      `SELECT u.id, u.username, u.role, u.employee_id, e.name, e.department_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN employees e ON e.id = u.employee_id
       WHERE s.token_hash = $1
         AND s.expires > $2
         AND u.active = 1
         AND e.status NOT IN ('Đã lưu trữ', 'Đã nghỉ việc')`,
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
  if (!roles.includes(u.role)) {
    fail('Bạn không có quyền thực hiện thao tác này.', 403);
  }
}

export function canViewEmployee(
  u: SessionUser,
  emp: { id: string; department_id: string | null }
): boolean {
  return (
    ['admin', 'hr', 'director'].includes(u.role) ||
    (u.role === 'manager' && u.department_id !== null && emp.department_id === u.department_id) ||
    emp.id === u.employee_id
  );
}

const ALLOWED_TABLES = new Set([
  'departments',
  'positions',
  'employees',
  'contracts',
  'extensions',
  'decisions',
  'assignments',
  'leave_types',
  'leave_requests',
  'users',
]);

export async function existsInTable<T = any>(
  executor: DbExecutor,
  table: string,
  id: string
): Promise<T> {
  if (!ALLOWED_TABLES.has(table)) {
    fail('Bảng truy vấn không hợp lệ.', 400);
  }
  const row = await executor.one<T>(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  if (!row) {
    fail('Không tìm thấy dữ liệu.', 404);
  }
  return row as T;
}

export async function requireActiveEmployee(executor: DbExecutor, id: string): Promise<any> {
  const emp = await existsInTable<any>(executor, 'employees', id);
  if (emp.status === 'Đã lưu trữ') {
    fail('Hồ sơ nhân viên đã lưu trữ.');
  }
  if (emp.status === 'Đã nghỉ việc') {
    fail('Nhân viên đã nghỉ việc.');
  }
  return emp;
}
