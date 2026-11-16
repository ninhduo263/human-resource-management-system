import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db, withTransaction, auditLog } from '../db/pool.js';
import { passwordHash, passwordMatches, sha256 } from '../utils/crypto.js';
import { fail, text, today } from '../utils/validation.js';
import { canViewEmployee, extractToken, requireAuth, SessionUser } from '../middleware/auth.js';

export const authRouter = Router();

const loginAttempts = new Map<string, { count: number; until: number }>();

authRouter.post('/login', async (req, res, next) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let attempt = loginAttempts.get(ip);
    if (!attempt || attempt.until < now) {
      attempt = { count: 0, until: now + 600_000 };
      loginAttempts.set(ip, attempt);
    }
    if (attempt.count >= 15) {
      fail('Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 10 phút.', 429);
    }

    const username = text(req.body, 'username');
    const password = text(req.body, 'password');

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
       WHERE u.username = $1 AND u.active = 1 AND e.status != 'Đã lưu trữ'`,
      [username]
    );

    if (!user || !passwordMatches(password, user.password_hash)) {
      attempt.count++;
      fail('Tên đăng nhập hoặc mật khẩu không đúng.', 401);
    }

    loginAttempts.delete(ip);
    await db.run('DELETE FROM sessions WHERE expires < $1', [now]);

    const token = randomBytes(32).toString('hex');
    await db.run('INSERT INTO sessions(token_hash, user_id, expires) VALUES($1, $2, $3)', [
      sha256(token),
      user.id,
      now + 8 * 3600_000,
    ]);

    res.setHeader(
      'Set-Cookie',
      `hr_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
    );
    await auditLog(db, user.id, 'Đăng nhập', user.username);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (token) {
      await db.run('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
    }
    res.setHeader('Set-Cookie', 'hr_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/password', requireAuth, async (req, res, next) => {
  try {
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
      await tx.run('UPDATE users SET password_hash = $1 WHERE id = $2', [
        passwordHash(newPw),
        u.id,
      ]);
      await tx.run('DELETE FROM sessions WHERE user_id = $1', [u.id]);
      await auditLog(tx, u.id, 'Đổi mật khẩu', u.username);
    });

    res.json({ ok: true, relogin: true });
  } catch (err) {
    next(err);
  }
});

export async function buildScopedState(u: SessionUser) {
  const currentDay = today();
  const allEmployees = await db.all('SELECT * FROM employees ORDER BY id');
  const nameMap = new Map<string, string>(allEmployees.map((e) => [e.id, e.name]));

  const employees = allEmployees.filter((e) => canViewEmployee(u, e));
  const ids = new Set(employees.map((e) => e.id));
  const fullAccess = ['admin', 'hr', 'director'].includes(u.role);

  const rawContracts = await db.all('SELECT * FROM contracts ORDER BY start_date DESC');
  const contracts = rawContracts
    .filter((c) => ids.has(c.employee_id))
    .map((c) => ({
      ...c,
      status:
        c.status === 'Đã chấm dứt'
          ? c.status
          : c.start_date > currentDay
          ? 'Chưa hiệu lực'
          : c.end_date && c.end_date < currentDay
          ? 'Hết hạn'
          : 'Hiệu lực',
      salary: fullAccess || c.employee_id === u.employee_id ? Number(c.salary) : null,
    }));

  const rawAssignments = await db.all('SELECT * FROM assignments ORDER BY effective_date DESC');
  const assignments = rawAssignments.filter((a) => ids.has(a.employee_id));
  const decisionIds = new Set(assignments.map((a) => a.decision_id));
  const contractIds = new Set(contracts.map((c) => c.id));

  const rawLeaves = await db.all(
    'SELECT * FROM leave_requests ORDER BY submitted_date DESC, id DESC'
  );
  const leaves = rawLeaves
    .filter((l) => ids.has(l.employee_id))
    .map((l) => ({
      ...l,
      approver_name: l.approver_id ? nameMap.get(l.approver_id) || l.approver_id : null,
    }));

  const balanceYears = await db.all<{ year: number }>('SELECT DISTINCT year FROM leave_balances');
  const years = new Set<number>([
    Number(currentDay.slice(0, 4)),
    ...leaves.map((l) => Number(l.start_date.slice(0, 4))),
    ...balanceYears.map((b) => Number(b.year)),
  ]);

  const leaveTypes = await db.all('SELECT * FROM leave_types ORDER BY id');
  const annualTypeIds = new Set(
    leaveTypes.filter((t) => Number(t.deduct_annual) === 1).map((t) => t.id)
  );

  const allBalanceRows = await db.all<{ employee_id: string; year: number; total: number }>(
    'SELECT employee_id, year, total FROM leave_balances'
  );
  const balanceLookup = new Map<string, number>();
  for (const row of allBalanceRows) {
    balanceLookup.set(`${row.employee_id}:${row.year}`, Number(row.total));
  }

  const balances: {
    employee_id: string;
    year: number;
    total: number;
    used: number;
    remaining: number;
  }[] = [];

  for (const e of employees) {
    for (const yr of Array.from(years).sort((a, b) => b - a)) {
      const total = balanceLookup.get(`${e.id}:${yr}`) ?? 12;
      const used = leaves
        .filter(
          (l) =>
            l.employee_id === e.id &&
            l.status === 'Đã duyệt' &&
            annualTypeIds.has(l.type_id) &&
            Number(l.start_date.slice(0, 4)) === yr
        )
        .reduce((sum, l) => sum + Number(l.days), 0);
      balances.push({
        employee_id: e.id,
        year: yr,
        total,
        used,
        remaining: total - used,
      });
    }
  }

  const departments = await db.all('SELECT * FROM departments ORDER BY id');
  const positions = await db.all('SELECT * FROM positions ORDER BY level DESC, id ASC');
  const rawExtensions = await db.all('SELECT * FROM extensions ORDER BY sequence DESC');
  const extensions = rawExtensions.filter((x) => contractIds.has(x.contract_id));

  const rawDecisions = await db.all('SELECT * FROM decisions ORDER BY effective_date DESC');
  const decisions = fullAccess
    ? rawDecisions
    : rawDecisions.filter((d) => decisionIds.has(d.id));

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

authRouter.get('/state', requireAuth, async (req, res, next) => {
  try {
    const state = await buildScopedState(req.user!);
    res.json(state);
  } catch (err) {
    next(err);
  }
});
