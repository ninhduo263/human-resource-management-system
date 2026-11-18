import { Request, Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db, withTransaction, auditLog } from '../db/pool.js';
import { passwordHash, passwordMatches, sha256 } from '../utils/crypto.js';
import { fail, text, today } from '../utils/validation.js';
import { extractToken, requireAuth, requireRole, SessionUser } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { runScheduledJobs } from '../services/jobs.js';
import { canReviewLeave, defaultEntitlement } from '../services/leave.js';

export const authRouter = Router();

// Giới hạn đăng nhập lưu trong DB (không mất khi khởi động lại, dùng chung nhiều instance).
const MAX_FAILS_PER_ACCOUNT = 8;
const MAX_FAILS_PER_IP = 40;
const LOCK_WINDOW_MS = 10 * 60_000;

async function failedCount(khoa: string, now: number): Promise<number> {
  const row = await db.one<{ solansai: number; khoaden: string }>(
    'SELECT solansai, khoaden FROM dangnhapthatbai WHERE khoa = $1',
    [khoa]
  );
  return row && Number(row.khoaden) > now ? row.solansai : 0;
}

async function recordFailure(khoa: string, now: number): Promise<void> {
  await db.run(
    `INSERT INTO dangnhapthatbai(khoa, solansai, khoaden) VALUES($1, 1, $2)
     ON CONFLICT (khoa) DO UPDATE SET
       solansai = CASE WHEN dangnhapthatbai.khoaden > $3 THEN dangnhapthatbai.solansai + 1 ELSE 1 END,
       khoaden = CASE WHEN dangnhapthatbai.khoaden > $3 THEN dangnhapthatbai.khoaden ELSE $2 END`,
    [khoa, now + LOCK_WINDOW_MS, now]
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
    const tendangnhap = text(req.body, 'tendangnhap');
    const matkhau = text(req.body, 'matkhau');
    const accountKey = `u:${tendangnhap.toLowerCase()}`;
    const ipKey = `ip:${ip}`;

    if (
      (await failedCount(accountKey, now)) >= MAX_FAILS_PER_ACCOUNT ||
      (await failedCount(ipKey, now)) >= MAX_FAILS_PER_IP
    ) {
      fail('Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 10 phút.', 429);
    }

    const user = await db.one<{
      matk: string;
      tendangnhap: string;
      matkhau: string;
      vaitro: string;
      manv: string;
      hoatdong: number;
    }>(
      `SELECT t.*
       FROM taikhoan t
       JOIN nhanvien n ON n.manv = t.manv
       WHERE t.tendangnhap = $1 AND t.hoatdong = 1 AND n.trangthai NOT IN ('Đã lưu trữ', 'Đã nghỉ việc')`,
      [tendangnhap]
    );

    if (!user || !passwordMatches(matkhau, user.matkhau)) {
      await recordFailure(accountKey, now);
      await recordFailure(ipKey, now);
      fail('Tên đăng nhập hoặc mật khẩu không đúng.', 401);
    }

    await db.run('DELETE FROM dangnhapthatbai WHERE khoa = $1 OR khoaden < $2', [accountKey, now]);
    await db.run('DELETE FROM phiendangnhap WHERE thoihan < $1', [now]);

    const token = randomBytes(32).toString('hex');
    await db.run('INSERT INTO phiendangnhap(maphien, matk, thoihan) VALUES($1, $2, $3)', [
      sha256(token),
      user.matk,
      now + 8 * 3600_000,
    ]);

    res.setHeader('Set-Cookie', sessionCookie(req, token, 28800));
    await auditLog(db, user.matk, 'Đăng nhập', user.tendangnhap);
    res.json({ ok: true });
  })
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const token = extractToken(req);
    if (token) {
      await db.run('DELETE FROM phiendangnhap WHERE maphien = $1', [sha256(token)]);
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
    const current = await db.one<{ matkhau: string }>('SELECT matkhau FROM taikhoan WHERE matk = $1', [
      u.matk,
    ]);
    if (!current || !passwordMatches(text(req.body, 'matkhauhientai'), current.matkhau)) {
      fail('Mật khẩu hiện tại không đúng.');
    }
    const newPw = text(req.body, 'matkhaumoi');
    if (newPw.length < 10) {
      fail('Mật khẩu mới phải có ít nhất 10 ký tự.');
    }

    await withTransaction(async (tx) => {
      await tx.run('UPDATE taikhoan SET matkhau = $1 WHERE matk = $2', [passwordHash(newPw), u.matk]);
      await tx.run('DELETE FROM phiendangnhap WHERE matk = $1', [u.matk]);
      await auditLog(tx, u.matk, 'Đổi mật khẩu', u.tendangnhap);
    });

    res.json({ ok: true, relogin: true });
  })
);

export async function buildScopedState(u: SessionUser) {
  const currentDay = today();
  const fullAccess = ['admin', 'hr', 'director'].includes(u.vaitro);

  // Phạm vi nhân viên được xem — lọc ngay trong SQL, không đọc toàn bảng rồi lọc bằng JS.
  const scope = fullAccess
    ? { where: 'TRUE', params: [] as any[] }
    : u.vaitro === 'manager' && u.mapb !== null
    ? { where: '(n.mapb = $1 OR n.manv = $2)', params: [u.mapb, u.manv] }
    : { where: 'n.manv = $1', params: [u.manv] };

  const employees = await db.all(
    `SELECT n.* FROM nhanvien n WHERE ${scope.where} ORDER BY n.manv`,
    scope.params
  );
  const nameRows = await db.all<{ manv: string; hoten: string }>('SELECT manv, hoten FROM nhanvien');
  const nameMap = new Map(nameRows.map((e) => [e.manv, e.hoten]));
  const ids = employees.map((e) => e.manv);

  const rawContracts = await db.all(
    'SELECT * FROM hopdong WHERE manv = ANY($1::text[]) ORDER BY ngaybatdau DESC',
    [ids]
  );
  const contracts = rawContracts.map((c) => ({
    ...c,
    trangthai:
      c.trangthai === 'Đã chấm dứt' || c.trangthai === 'Đã hủy bỏ'
        ? c.trangthai
        : c.ngaybatdau > currentDay
        ? 'Chưa hiệu lực'
        : c.ngayketthuc && c.ngayketthuc < currentDay
        ? 'Hết hạn'
        : 'Hiệu lực',
    mucluong: fullAccess || c.manv === u.manv ? Number(c.mucluong) : null,
  }));
  const contractById = new Map(contracts.map((c) => [c.mahd, c]));

  const assignments = await db.all(
    'SELECT * FROM quatrinhcongtac WHERE manv = ANY($1::text[]) ORDER BY ngayhieuluc DESC',
    [ids]
  );
  const decisionIds = assignments.map((a) => a.maqd);

  const employeeById = new Map(employees.map((e) => [e.manv, e]));
  const deptHeadRows = await db.all<{ mapb: string; matruongphong: string | null }>(
    'SELECT mapb, matruongphong FROM phongban'
  );
  const deptHeadMap = new Map(deptHeadRows.map((d) => [d.mapb, d.matruongphong]));
  const positionLevels = new Map(
    (await db.all<{ macv: string; capbac: number }>('SELECT macv, capbac FROM chucvu')).map((p) => [
      p.macv,
      Number(p.capbac),
    ])
  );
  const reviewerEmployee = employees.find((e) => e.manv === u.manv);
  const reviewerLevel = reviewerEmployee ? positionLevels.get(reviewerEmployee.macv) : undefined;

  const rawLeaves = await db.all(
    'SELECT * FROM donnghiphep WHERE manv = ANY($1::text[]) ORDER BY ngaynop DESC, madon DESC',
    [ids]
  );
  const leaves = rawLeaves.map((l) => {
    const emp = employeeById.get(l.manv)!;
    return {
      ...l,
      tennguoiduyet: l.manvduyet ? nameMap.get(l.manvduyet) || l.manvduyet : null,
      coquyenduyet:
        l.trangthai === 'Chờ duyệt' &&
        ((['Đã nghỉ việc', 'Đã lưu trữ'].includes(emp.trangthai) &&
          ['admin', 'hr'].includes(u.vaitro)) ||
          (!!reviewerEmployee &&
            reviewerLevel !== undefined &&
            canReviewLeave(
              { ...u, capbac: reviewerLevel },
              { ...emp, capbac: positionLevels.get(emp.macv) ?? 0 },
              emp.mapb !== null && deptHeadMap.get(emp.mapb) === u.manv
            ))),
    };
  });

  // Quỹ phép: gộp số ngày đã dùng bằng một truy vấn thay vì lọc lồng nhau.
  const leaveTypes = await db.all('SELECT * FROM loainghiphep ORDER BY maloai');
  const usedRows = await db.all<{ manv: string; nam: number; songay: string }>(
    `SELECT d.manv, EXTRACT(YEAR FROM d.tungay)::int AS nam, SUM(d.songay) AS songay
     FROM donnghiphep d JOIN loainghiphep l ON l.maloai = d.maloai
     WHERE d.trangthai = 'Đã duyệt' AND l.truphepnam = 1 AND d.manv = ANY($1::text[])
     GROUP BY d.manv, EXTRACT(YEAR FROM d.tungay)`,
    [ids]
  );
  const usedLookup = new Map(usedRows.map((r) => [`${r.manv}:${r.nam}`, Number(r.songay)]));
  const balanceRows = await db.all<{ manv: string; nam: number; tongsongayphep: number }>(
    'SELECT manv, nam, tongsongayphep FROM songayphep WHERE manv = ANY($1::text[])',
    [ids]
  );
  const balanceLookup = new Map(balanceRows.map((r) => [`${r.manv}:${r.nam}`, Number(r.tongsongayphep)]));
  const years = new Set<number>([
    Number(currentDay.slice(0, 4)),
    ...usedRows.map((r) => Number(r.nam)),
    ...balanceRows.map((r) => Number(r.nam)),
    ...rawLeaves.map((l) => Number(String(l.tungay).slice(0, 4))),
  ]);
  const sortedYears = Array.from(years).sort((a, b) => b - a);

  // Cùng thuộc tính với SONGAYPHEP / view v_songayphep.
  const balances = employees.flatMap((e) =>
    sortedYears.map((nam) => {
      const tongsongayphep = balanceLookup.get(`${e.manv}:${nam}`) ?? defaultEntitlement(e.ngayvaolam, nam);
      const songaydanghi = usedLookup.get(`${e.manv}:${nam}`) ?? 0;
      return { manv: e.manv, nam, tongsongayphep, songaydanghi, songayconlai: tongsongayphep - songaydanghi };
    })
  );

  const departments = await db.all('SELECT * FROM phongban ORDER BY mapb');
  const positions = await db.all('SELECT * FROM chucvu ORDER BY capbac DESC, macv ASC');
  const rawExtensions = await db.all(
    'SELECT * FROM giahanhopdong WHERE mahd = ANY($1::text[]) ORDER BY langiahan DESC',
    [contracts.map((c) => c.mahd)]
  );
  const extensions = rawExtensions.map((g) => {
    const contract = contractById.get(g.mahd)!;
    const canViewSalary = fullAccess || contract.manv === u.manv;
    return {
      ...g,
      luongcu: canViewSalary && g.luongcu != null ? Number(g.luongcu) : null,
      luongmoi: canViewSalary && g.luongmoi != null ? Number(g.luongmoi) : null,
    };
  });

  const decisions = fullAccess
    ? await db.all('SELECT * FROM quyetdinh ORDER BY ngayhieuluc DESC')
    : await db.all('SELECT * FROM quyetdinh WHERE maqd = ANY($1::text[]) ORDER BY ngayhieuluc DESC', [
        decisionIds.filter(Boolean),
      ]);

  const users =
    u.vaitro === 'admin'
      ? await db.all(
          `SELECT t.matk, t.tendangnhap, t.vaitro, t.manv, t.hoatdong, n.hoten
           FROM taikhoan t
           JOIN nhanvien n ON n.manv = t.manv
           ORDER BY t.matk`
        )
      : [];

  const audit =
    u.vaitro === 'admin'
      ? await db.all(
          `SELECT k.*, t.tendangnhap
           FROM nhatkyhethong k
           LEFT JOIN taikhoan t ON t.matk = k.matk
           ORDER BY k.mank DESC
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
    const filter = `($1::text IS NULL OR k.hanhdong ILIKE $1 OR k.doituong ILIKE $1 OR t.tendangnhap ILIKE $1)`;
    const rows = await db.all(
      `SELECT k.*, t.tendangnhap
       FROM nhatkyhethong k LEFT JOIN taikhoan t ON t.matk = k.matk
       WHERE ${filter}
       ORDER BY k.mank DESC LIMIT $2 OFFSET $3`,
      [q, limit, offset]
    );
    const total = await db.one<{ n: string }>(
      `SELECT COUNT(*) AS n FROM nhatkyhethong k LEFT JOIN taikhoan t ON t.matk = k.matk WHERE ${filter}`,
      [q]
    );
    res.json({ rows, total: Number(total?.n ?? 0) });
  })
);
