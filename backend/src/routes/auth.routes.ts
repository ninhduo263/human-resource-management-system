import { Request, Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db, withTransaction, auditLog } from '../db/pool.js';
import { passwordHash, passwordMatches, sha256 } from '../utils/crypto.js';
import { fail, text, today } from '../utils/validation.js';
import { extractToken, requireAuth, requireRole, SessionUser } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { runScheduledJobs } from '../services/jobs.js';
import {
  canReviewLeave,
  defaultEntitlement,
  departmentsWithManager,
} from '../services/leave.js';

export const authRouter = Router();

// Giới hạn đăng nhập lưu trong DB (không mất khi khởi động lại, dùng chung nhiều instance).
const MAX_FAILS_PER_ACCOUNT = 8;
const MAX_FAILS_PER_IP = 40;
const LOCK_WINDOW_MS = 10 * 60_000;

async function failedCount(key: string, now: number): Promise<number> {
  const row = await db.one<{ count: number; until: string }>(
    'SELECT count, until FROM login_attempts WHERE key = $1',
    [key]
  );
  return row && Number(row.until) > now ? row.count : 0;
}

async function recordFailure(key: string, now: number): Promise<void> {
  await db.run(
    `INSERT INTO login_attempts(key, count, until) VALUES($1, 1, $2)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN login_attempts.until > $3 THEN login_attempts.count + 1 ELSE 1 END,
       until = CASE WHEN login_attempts.until > $3 THEN login_attempts.until ELSE $2 END`,
    [key, now + LOCK_WINDOW_MS, now]
  );
}

/** Cookie phiên: có cờ Secure khi chạy sau HTTPS hoặc khi COOKIE_SECURE=true. */
export function sessionCookie(req: Request, value: string, maxAge: number): string {
  const secure =
    process.env.COOKIE_SECURE === 'true' ||
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https';
  return `hr_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${
    secure ? '; Secure' : ''
  }`;
}

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const username = text(req.body, 'username');
    const password = text(req.body, 'password');
    const accountKey = `u:${username.toLowerCase()}`;
    const ipKey = `ip:${ip}`;

    if (
      (await failedCount(accountKey, now)) >= MAX_FAILS_PER_ACCOUNT ||
      (await failedCount(ipKey, now)) >= MAX_FAILS_PER_IP
    ) {
      fail('Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 10 phút.', 429);
    }

    const user = await db.one<{
      id: string;
      username: string;
      password_hash: string;
      role: string;
      employee_id: string;
      active: number;
    }>(
      `SELECT u.*
       FROM users u
       JOIN employees e ON e.id = u.employee_id
       WHERE u.username = $1 AND u.active = 1 AND e.status NOT IN ('Đã lưu trữ', 'Đã nghỉ việc')`,
      [username]
    );

    if (!user || !passwordMatches(password, user.password_hash)) {
      await recordFailure(accountKey, now);
      await recordFailure(ipKey, now);
      fail('Tên đăng nhập hoặc mật khẩu không đúng.', 401);
    }

    await db.run('DELETE FROM login_attempts WHERE key = $1 OR until < $2', [accountKey, now]);
    await db.run('DELETE FROM sessions WHERE expires < $1', [now]);

    const token = randomBytes(32).toString('hex');
    await db.run('INSERT INTO sessions(token_hash, user_id, expires) VALUES($1, $2, $3)', [
      sha256(token),
      user.id,
      now + 8 * 3600_000,
    ]);

    res.setHeader('Set-Cookie', sessionCookie(req, token, 28800));
    await auditLog(db, user.id, 'Đăng nhập', user.username);
    res.json({ ok: true });
  })
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const token = extractToken(req);
    if (token) {
      await db.run('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
    }
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    res.json({ ok: true });
  })
);

authRouter.post(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const current = await db.one<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [u.id]
    );
    if (!current || !passwordMatches(text(req.body, 'current_password'), current.password_hash)) {
      fail('Mật khẩu hiện tại không đúng.');
    }
    const newPw = text(req.body, 'new_password');
    if (newPw.length < 10) {
      fail('Mật khẩu mới phải có ít nhất 10 ký tự.');
    }

    await withTransaction(async (tx) => {
      await tx.run('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash(newPw), u.id]);
      await tx.run('DELETE FROM sessions WHERE user_id = $1', [u.id]);
      await auditLog(tx, u.id, 'Đổi mật khẩu', u.username);
    });

    res.json({ ok: true, relogin: true });
  })
);

export async function buildScopedState(u: SessionUser) {
  const currentDay = today();
  const fullAccess = ['admin', 'hr', 'director'].includes(u.role);

  // Phạm vi nhân viên được xem — lọc ngay trong SQL, không đọc toàn bảng rồi lọc bằng JS.
  const scope = fullAccess
    ? { where: 'TRUE', params: [] as any[] }
    : u.role === 'manager' && u.department_id !== null
    ? { where: '(e.department_id = $1 OR e.id = $2)', params: [u.department_id, u.employee_id] }
    : { where: 'e.id = $1', params: [u.employee_id] };

  const employees = await db.all(
    `SELECT e.* FROM employees e WHERE ${scope.where} ORDER BY e.id`,
    scope.params
  );
  const nameRows = await db.all<{ id: string; name: string }>('SELECT id, name FROM employees');
  const nameMap = new Map(nameRows.map((e) => [e.id, e.name]));
  const ids = employees.map((e) => e.id);

  const rawContracts = await db.all(
    'SELECT * FROM contracts WHERE employee_id = ANY($1::text[]) ORDER BY start_date DESC',
    [ids]
  );
  const contracts = rawContracts.map((c) => ({
    ...c,
    status:
      c.status === 'Đã chấm dứt' || c.status === 'Đã hủy bỏ'
        ? c.status
        : c.start_date > currentDay
        ? 'Chưa hiệu lực'
        : c.end_date && c.end_date < currentDay
        ? 'Hết hạn'
        : 'Hiệu lực',
    salary: fullAccess || c.employee_id === u.employee_id ? Number(c.salary) : null,
  }));
  const contractById = new Map(contracts.map((c) => [c.id, c]));

  const assignments = await db.all(
    'SELECT * FROM assignments WHERE employee_id = ANY($1::text[]) ORDER BY effective_date DESC',
    [ids]
  );
  const decisionIds = assignments.map((a) => a.decision_id);

  // Vai trò tài khoản + phòng đã có trưởng phòng, để tính "đơn nào tôi được duyệt".
  const roleRows = await db.all<{ employee_id: string; role: string }>(
    'SELECT employee_id, role FROM users WHERE employee_id = ANY($1::text[])',
    [ids]
  );
  const roleOf = new Map(roleRows.map((r) => [r.employee_id, r.role]));
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const managed = await departmentsWithManager(db);

  const rawLeaves = await db.all(
    'SELECT * FROM leave_requests WHERE employee_id = ANY($1::text[]) ORDER BY submitted_date DESC, id DESC',
    [ids]
  );
  const leaves = rawLeaves.map((l) => {
    const emp = employeeById.get(l.employee_id)!;
    return {
      ...l,
      approver_name: l.approver_id ? nameMap.get(l.approver_id) || l.approver_id : null,
      can_review:
        l.status === 'Chờ duyệt' &&
        canReviewLeave(
          u,
          emp,
          roleOf.get(emp.id) ?? null,
          emp.department_id !== null && managed.has(emp.department_id)
        ),
    };
  });

  // Quỹ phép: gộp số ngày đã dùng bằng một truy vấn thay vì lọc lồng nhau.
  const leaveTypes = await db.all('SELECT * FROM leave_types ORDER BY id');
  const usedRows = await db.all<{ employee_id: string; year: number; used: string }>(
    `SELECT l.employee_id, EXTRACT(YEAR FROM l.start_date)::int AS year, SUM(l.days) AS used
     FROM leave_requests l JOIN leave_types t ON t.id = l.type_id
     WHERE l.status = 'Đã duyệt' AND t.deduct_annual = 1 AND l.employee_id = ANY($1::text[])
     GROUP BY l.employee_id, EXTRACT(YEAR FROM l.start_date)`,
    [ids]
  );
  const usedLookup = new Map(usedRows.map((r) => [`${r.employee_id}:${r.year}`, Number(r.used)]));
  const balanceRows = await db.all<{ employee_id: string; year: number; total: number }>(
    'SELECT employee_id, year, total FROM leave_balances WHERE employee_id = ANY($1::text[])',
    [ids]
  );
  const balanceLookup = new Map(
    balanceRows.map((r) => [`${r.employee_id}:${r.year}`, Number(r.total)])
  );
  const years = new Set<number>([
    Number(currentDay.slice(0, 4)),
    ...usedRows.map((r) => Number(r.year)),
    ...balanceRows.map((r) => Number(r.year)),
    ...rawLeaves.map((l) => Number(String(l.start_date).slice(0, 4))),
  ]);
  const sortedYears = Array.from(years).sort((a, b) => b - a);

  const balances = employees.flatMap((e) =>
    sortedYears.map((yr) => {
      const total = balanceLookup.get(`${e.id}:${yr}`) ?? defaultEntitlement(e.join_date, yr);
      const used = usedLookup.get(`${e.id}:${yr}`) ?? 0;
      return { employee_id: e.id, year: yr, total, used, remaining: total - used };
    })
  );

  const departments = await db.all('SELECT * FROM departments ORDER BY id');
  const positions = await db.all('SELECT * FROM positions ORDER BY level DESC, id ASC');
  const rawExtensions = await db.all(
    'SELECT * FROM extensions WHERE contract_id = ANY($1::text[]) ORDER BY sequence DESC',
    [contracts.map((c) => c.id)]
  );
  const extensions = rawExtensions.map((x) => {
    const contract = contractById.get(x.contract_id)!;
    const canViewSalary = fullAccess || contract.employee_id === u.employee_id;
    return {
      ...x,
      old_salary: canViewSalary && x.old_salary != null ? Number(x.old_salary) : null,
      new_salary: canViewSalary && x.new_salary != null ? Number(x.new_salary) : null,
    };
  });

  const decisions = fullAccess
    ? await db.all('SELECT * FROM decisions ORDER BY effective_date DESC')
    : await db.all(
        'SELECT * FROM decisions WHERE id = ANY($1::text[]) ORDER BY effective_date DESC',
        [decisionIds]
      );

  const users =
    u.role === 'admin'
      ? await db.all(
          `SELECT u.id, u.username, u.role, u.employee_id, u.active, e.name
           FROM users u
           JOIN employees e ON e.id = u.employee_id
           ORDER BY u.id`
        )
      : [];

  const audit =
    u.role === 'admin'
      ? await db.all(
          `SELECT a.*, u.username
           FROM audit_log a
           LEFT JOIN users u ON u.id = a.user_id
           ORDER BY a.id DESC
           LIMIT 100`
        )
      : [];

  return {
    user: u,
    today: currentDay,
    employees,
    departments,
    positions,
    contracts,
    extensions,
    assignments,
    decisions,
    leaveTypes,
    leaves,
    balances,
    users,
    audit,
  };
}

authRouter.get(
  '/state',
  requireAuth,
  asyncHandler(async (req, res) => {
    await runScheduledJobs().catch((err) => console.error('[Job Error]:', err));
    res.json(await buildScopedState(req.user!));
  })
);

// Nhật ký hệ thống có phân trang và tìm kiếm (chỉ quản trị viên)
authRouter.get(
  '/audit',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireRole(req.user!, ['admin']);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? `%${req.query.q.trim()}%` : null;
    const filter = `($1::text IS NULL OR a.action ILIKE $1 OR a.target ILIKE $1 OR u.username ILIKE $1)`;
    const rows = await db.all(
      `SELECT a.*, u.username
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE ${filter}
       ORDER BY a.id DESC LIMIT $2 OFFSET $3`,
      [q, limit, offset]
    );
    const total = await db.one<{ n: string }>(
      `SELECT COUNT(*) AS n FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE ${filter}`,
      [q]
    );
    res.json({ rows, total: Number(total?.n ?? 0) });
  })
);
