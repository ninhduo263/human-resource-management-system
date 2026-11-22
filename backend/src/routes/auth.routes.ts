import { Request, Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db, withTransaction, auditLog } from '../db/pool.js';
import { passwordHash, passwordMatches, sha256 } from '../utils/crypto.js';
import { fail, text, today } from '../utils/validation.js';
import { extractToken, requireAuth, requireRole, SessionUser } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { runScheduledJobs } from '../services/jobs.js';
import { canReviewLeave, defaultEntitlement } from '../services/leave.js';
import { buildAlerts } from '../services/alerts.js';
import { openEventStream } from '../services/realtime.js';

export const authRouter = Router();

// Giới hạn đăng nhập lưu trong DB (không mất khi khởi động lại, dùng chung nhiều instance).
const MAX_FAILS_PER_ACCOUNT = 8;
const MAX_FAILS_PER_IP = 40;
const LOCK_WINDOW_MS = 10 * 60_000;

async function failedCount(Khoa: string, now: number): Promise<number> {
  const row = await db.one<{ SoLanSai: number; KhoaDen: string }>(
    'SELECT "SoLanSai", "KhoaDen" FROM "DANGNHAPTHATBAI" WHERE "Khoa" = $1',
    [Khoa]
  );
  return row && Number(row.KhoaDen) > now ? row.SoLanSai : 0;
}

async function recordFailure(Khoa: string, now: number): Promise<void> {
  await db.run(
    `INSERT INTO "DANGNHAPTHATBAI"("Khoa", "SoLanSai", "KhoaDen") VALUES($1, 1, $2)
     ON CONFLICT ("Khoa") DO UPDATE SET
       "SoLanSai" = CASE WHEN "DANGNHAPTHATBAI"."KhoaDen" > $3 THEN "DANGNHAPTHATBAI"."SoLanSai" + 1 ELSE 1 END,
       "KhoaDen" = CASE WHEN "DANGNHAPTHATBAI"."KhoaDen" > $3 THEN "DANGNHAPTHATBAI"."KhoaDen" ELSE $2 END`,
    [Khoa, now + LOCK_WINDOW_MS, now]
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
    const TenDangNhap = text(req.body, 'TenDangNhap');
    const MatKhau = text(req.body, 'MatKhau');
    const accountKey = `u:${TenDangNhap.toLowerCase()}`;
    const ipKey = `ip:${ip}`;

    if (
      (await failedCount(accountKey, now)) >= MAX_FAILS_PER_ACCOUNT ||
      (await failedCount(ipKey, now)) >= MAX_FAILS_PER_IP
    ) {
      fail('Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 10 phút.', 429);
    }

    const user = await db.one<{
      MaTK: string;
      TenDangNhap: string;
      MatKhau: string;
      VaiTro: string;
      MaNV: string;
      HoatDong: number;
    }>(
      `SELECT t.*
       FROM "TAIKHOAN" t
       JOIN "NHANVIEN" n ON n."MaNV" = t."MaNV"
       WHERE t."TenDangNhap" = $1 AND t."HoatDong" = 1 AND n."TrangThai" NOT IN ('Đã lưu trữ', 'Đã nghỉ việc')`,
      [TenDangNhap]
    );

    if (!user || !passwordMatches(MatKhau, user.MatKhau)) {
      await recordFailure(accountKey, now);
      await recordFailure(ipKey, now);
      fail('Tên đăng nhập hoặc mật khẩu không đúng.', 401);
    }

    await db.run('DELETE FROM "DANGNHAPTHATBAI" WHERE "Khoa" = $1 OR "KhoaDen" < $2', [accountKey, now]);
    await db.run('DELETE FROM "PHIENDANGNHAP" WHERE "ThoiHan" < $1', [now]);

    const token = randomBytes(32).toString('hex');
    await db.run('INSERT INTO "PHIENDANGNHAP"("MaPhien", "MaTK", "ThoiHan") VALUES($1, $2, $3)', [
      sha256(token),
      user.MaTK,
      now + 8 * 3600_000,
    ]);

    res.setHeader('Set-Cookie', sessionCookie(req, token, 28800));
    await auditLog(db, user.MaTK, 'Đăng nhập', user.TenDangNhap);
    res.json({ ok: true });
  })
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const token = extractToken(req);
    if (token) {
      await db.run('DELETE FROM "PHIENDANGNHAP" WHERE "MaPhien" = $1', [sha256(token)]);
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
    const current = await db.one<{ MatKhau: string }>('SELECT "MatKhau" FROM "TAIKHOAN" WHERE "MaTK" = $1', [
      u.MaTK,
    ]);
    if (!current || !passwordMatches(text(req.body, 'matkhauhientai'), current.MatKhau)) {
      fail('Mật khẩu hiện tại không đúng.');
    }
    const newPw = text(req.body, 'matkhaumoi');
    if (newPw.length < 10) {
      fail('Mật khẩu mới phải có ít nhất 10 ký tự.');
    }

    await withTransaction(async (tx) => {
      await tx.run('UPDATE "TAIKHOAN" SET "MatKhau" = $1 WHERE "MaTK" = $2', [passwordHash(newPw), u.MaTK]);
      await tx.run('DELETE FROM "PHIENDANGNHAP" WHERE "MaTK" = $1', [u.MaTK]);
      await auditLog(tx, u.MaTK, 'Đổi mật khẩu', u.TenDangNhap);
    });

    res.json({ ok: true, relogin: true });
  })
);

export async function buildScopedState(u: SessionUser) {
  const currentDay = today();
  const fullAccess = ['admin', 'hr', 'director'].includes(u.VaiTro);

  // Phạm vi nhân viên được xem — lọc ngay trong SQL, không đọc toàn bảng rồi lọc bằng JS.
  const scope = fullAccess
    ? { where: 'TRUE', params: [] as any[] }
    : u.VaiTro === 'manager' && u.MaPB !== null
    ? { where: '(n."MaPB" = $1 OR n."MaNV" = $2)', params: [u.MaPB, u.MaNV] }
    : { where: 'n."MaNV" = $1', params: [u.MaNV] };

  const employees = await db.all(
    `SELECT n.* FROM "NHANVIEN" n WHERE ${scope.where} ORDER BY n."MaNV"`,
    scope.params
  );
  const nameRows = await db.all<{ MaNV: string; HoTen: string }>('SELECT "MaNV", "HoTen" FROM "NHANVIEN"');
  const nameMap = new Map(nameRows.map((e) => [e.MaNV, e.HoTen]));
  const ids = employees.map((e) => e.MaNV);

  const rawContracts = await db.all(
    'SELECT * FROM "HOPDONG" WHERE "MaNV" = ANY($1::text[]) ORDER BY "NgayBatDau" DESC',
    [ids]
  );
  const contracts = rawContracts.map((c) => ({
    ...c,
    TrangThai:
      c.TrangThai === 'Đã chấm dứt' || c.TrangThai === 'Đã hủy bỏ'
        ? c.TrangThai
        : c.NgayBatDau > currentDay
        ? 'Chưa hiệu lực'
        : c.NgayKetThuc && c.NgayKetThuc < currentDay
        ? 'Hết hạn'
        : 'Hiệu lực',
    MucLuong: fullAccess || c.MaNV === u.MaNV ? Number(c.MucLuong) : null,
  }));
  const contractById = new Map(contracts.map((c) => [c.MaHD, c]));

  const assignments = await db.all(
    'SELECT * FROM "QUATRINHCONGTAC" WHERE "MaNV" = ANY($1::text[]) ORDER BY "NgayHieuLuc" DESC',
    [ids]
  );
  const decisionIds = assignments.map((a) => a.MaQD);

  const employeeById = new Map(employees.map((e) => [e.MaNV, e]));
  const deptHeadRows = await db.all<{ MaPB: string; MaTruongPhong: string | null }>(
    'SELECT "MaPB", "MaTruongPhong" FROM "PHONGBAN"'
  );
  const deptHeadMap = new Map(deptHeadRows.map((d) => [d.MaPB, d.MaTruongPhong]));
  const positionLevels = new Map(
    (await db.all<{ MaCV: string; CapBac: number }>('SELECT "MaCV", "CapBac" FROM "CHUCVU"')).map((p) => [
      p.MaCV,
      Number(p.CapBac),
    ])
  );
  const reviewerEmployee = employees.find((e) => e.MaNV === u.MaNV);
  const reviewerLevel = reviewerEmployee ? positionLevels.get(reviewerEmployee.MaCV) : undefined;

  const rawLeaves = await db.all(
    'SELECT * FROM "DONNGHIPHEP" WHERE "MaNV" = ANY($1::text[]) ORDER BY "NgayNop" DESC, "MaDon" DESC',
    [ids]
  );
  const leaves = rawLeaves.map((l) => {
    const emp = employeeById.get(l.MaNV)!;
    return {
      ...l,
      tennguoiduyet: l.MaNVDuyet ? nameMap.get(l.MaNVDuyet) || l.MaNVDuyet : null,
      coquyenduyet:
        l.TrangThai === 'Chờ duyệt' &&
        ((['Đã nghỉ việc', 'Đã lưu trữ'].includes(emp.TrangThai) &&
          ['admin', 'hr'].includes(u.VaiTro)) ||
          (!!reviewerEmployee &&
            reviewerLevel !== undefined &&
            canReviewLeave(
              { ...u, CapBac: reviewerLevel },
              { ...emp, CapBac: positionLevels.get(emp.MaCV) ?? 0 },
              emp.MaPB !== null && deptHeadMap.get(emp.MaPB) === u.MaNV
            ))),
    };
  });

  // Quỹ phép: gộp số ngày đã dùng bằng một truy vấn thay vì lọc lồng nhau.
  const leaveTypes = await db.all('SELECT * FROM "LOAINGHIPHEP" ORDER BY "MaLoai"');
  const usedRows = await db.all<{ MaNV: string; Nam: number; SoNgay: string }>(
    `SELECT d."MaNV", EXTRACT(YEAR FROM d."TuNgay")::int AS "Nam", SUM(d."SoNgay") AS "SoNgay"
     FROM "DONNGHIPHEP" d JOIN "LOAINGHIPHEP" l ON l."MaLoai" = d."MaLoai"
     WHERE d."TrangThai" = 'Đã duyệt' AND l."TruPhepNam" = 1 AND d."MaNV" = ANY($1::text[])
     GROUP BY d."MaNV", EXTRACT(YEAR FROM d."TuNgay")`,
    [ids]
  );
  const usedLookup = new Map(usedRows.map((r) => [`${r.MaNV}:${r.Nam}`, Number(r.SoNgay)]));
  const balanceRows = await db.all<{ MaNV: string; Nam: number; TongSoNgayPhep: number }>(
    'SELECT "MaNV", "Nam", "TongSoNgayPhep" FROM "SONGAYPHEP" WHERE "MaNV" = ANY($1::text[])',
    [ids]
  );
  const balanceLookup = new Map(balanceRows.map((r) => [`${r.MaNV}:${r.Nam}`, Number(r.TongSoNgayPhep)]));
  const years = new Set<number>([
    Number(currentDay.slice(0, 4)),
    ...usedRows.map((r) => Number(r.Nam)),
    ...balanceRows.map((r) => Number(r.Nam)),
    ...rawLeaves.map((l) => Number(String(l.TuNgay).slice(0, 4))),
  ]);
  const sortedYears = Array.from(years).sort((a, b) => b - a);

  // Cùng thuộc tính với SONGAYPHEP / view v_songayphep.
  const balances = employees.flatMap((e) =>
    sortedYears.map((Nam) => {
      const TongSoNgayPhep = balanceLookup.get(`${e.MaNV}:${Nam}`) ?? defaultEntitlement(e.NgayVaoLam, Nam);
      const SoNgayDaNghi = usedLookup.get(`${e.MaNV}:${Nam}`) ?? 0;
      return { MaNV: e.MaNV, Nam, TongSoNgayPhep, SoNgayDaNghi, SoNgayConLai: TongSoNgayPhep - SoNgayDaNghi };
    })
  );

  const departments = await db.all('SELECT * FROM "PHONGBAN" ORDER BY "MaPB"');
  const positions = await db.all('SELECT * FROM "CHUCVU" ORDER BY "CapBac" DESC, "MaCV" ASC');
  const rawExtensions = await db.all(
    'SELECT * FROM "GIAHANHOPDONG" WHERE "MaHD" = ANY($1::text[]) ORDER BY "LanGiaHan" DESC',
    [contracts.map((c) => c.MaHD)]
  );
  const extensions = rawExtensions.map((g) => {
    const contract = contractById.get(g.MaHD)!;
    const canViewSalary = fullAccess || contract.MaNV === u.MaNV;
    return {
      ...g,
      LuongCu: canViewSalary && g.LuongCu != null ? Number(g.LuongCu) : null,
      LuongMoi: canViewSalary && g.LuongMoi != null ? Number(g.LuongMoi) : null,
    };
  });

  const decisions = fullAccess
    ? await db.all('SELECT * FROM "QUYETDINH" ORDER BY "NgayHieuLuc" DESC')
    : await db.all('SELECT * FROM "QUYETDINH" WHERE "MaQD" = ANY($1::text[]) ORDER BY "NgayHieuLuc" DESC', [
        decisionIds.filter(Boolean),
      ]);

  const users =
    u.VaiTro === 'admin'
      ? await db.all(
          `SELECT t."MaTK", t."TenDangNhap", t."VaiTro", t."MaNV", t."HoatDong", n."HoTen"
           FROM "TAIKHOAN" t
           JOIN "NHANVIEN" n ON n."MaNV" = t."MaNV"
           ORDER BY t."MaTK"`
        )
      : [];

  const audit =
    u.VaiTro === 'admin'
      ? await db.all(
          `SELECT k.*, t."TenDangNhap"
           FROM "NHATKYHETHONG" k
           LEFT JOIN "TAIKHOAN" t ON t."MaTK" = k."MaTK"
           ORDER BY k."MaNK" DESC
           LIMIT 100`
        )
      : [];

  const alerts = buildAlerts({ user: u, today: currentDay, employees, contracts, assignments, leaves, balances });

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
    alerts,
  };
}

// Kênh thông báo thời gian thực (SSE): chỉ báo "có thay đổi", trình duyệt tự tải lại state theo quyền.
authRouter.get('/events', requireAuth, (req, res) => openEventStream(req, res));

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
    const filter = `($1::text IS NULL OR k."HanhDong" ILIKE $1 OR k."DoiTuong" ILIKE $1 OR t."TenDangNhap" ILIKE $1)`;
    const rows = await db.all(
      `SELECT k.*, t."TenDangNhap"
       FROM "NHATKYHETHONG" k LEFT JOIN "TAIKHOAN" t ON t."MaTK" = k."MaTK"
       WHERE ${filter}
       ORDER BY k."MaNK" DESC LIMIT $2 OFFSET $3`,
      [q, limit, offset]
    );
    const total = await db.one<{ n: string }>(
      `SELECT COUNT(*) AS n FROM "NHATKYHETHONG" k LEFT JOIN "TAIKHOAN" t ON t."MaTK" = k."MaTK" WHERE ${filter}`,
      [q]
    );
    res.json({ rows, total: Number(total?.n ?? 0) });
  })
);
