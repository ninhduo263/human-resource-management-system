import { Router } from 'express';
import { db, DbExecutor, withTransaction, auditLog } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import type { SessionUser } from '../middleware/auth.js';
import { generateId } from '../utils/crypto.js';
import { choice, date, fail, numeric, optional, shift, text, today } from '../utils/validation.js';
import { asyncHandler, paramId } from '../utils/http.js';
import { annualTotal, canReviewLeave, loadHolidays, usedAnnualDays } from '../services/leave.js';
import { countWorkingDays } from '../utils/validation.js';

export const leavesRouter = Router();

leavesRouter.use(requireAuth);

async function lockEmployee(tx: DbExecutor, MaNV: string): Promise<void> {
  await tx.query('SELECT "MaNV" FROM nhanvien WHERE "MaNV" = $1 FOR UPDATE', [MaNV]);
}

/** Tách khoảng nghỉ thành các đoạn theo từng năm dương lịch. */
function splitByYear(start: string, end: string): [string, string][] {
  const out: [string, string][] = [];
  let from = start;
  while (from <= end) {
    const yearEnd = `${from.slice(0, 4)}-12-31`;
    const to = yearEnd < end ? yearEnd : end;
    out.push([from, to]);
    from = shift(yearEnd, 1);
  }
  return out;
}

// 4.2 Đăng ký nghỉ phép (đơn nghỉ qua năm được tự tách theo năm)
leavesRouter.post(
  '/leaves',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr', 'manager', 'employee', 'director']);

    const b = req.body;
    const selfOnly = ['employee', 'manager', 'director'].includes(u.VaiTro);
    const MaNV = selfOnly ? u.MaNV : text(b, 'MaNV');
    const TuNgay = date(b, 'TuNgay');
    const DenNgay = date(b, 'DenNgay');
    const LyDo = text(b, 'LyDo', 1000);
    const currentDay = today();

    // Chỉ nhân sự/quản trị viên được nhập đơn lùi ngày (ốm đột xuất, quên làm đơn).
    if (TuNgay < currentDay && !['admin', 'hr'].includes(u.VaiTro)) {
      fail('Ngày nghỉ không được trước hôm nay.');
    }
    if (DenNgay < TuNgay) fail('Ngày kết thúc không được trước ngày bắt đầu.');

    const ids = await withTransaction(async (tx) => {
      await lockEmployee(tx, MaNV);
      const e = await requireActiveEmployee(tx, MaNV);
      const loai = await existsInTable<{ MaLoai: string; SoNgayToiDa: number }>(
        tx,
        'loainghiphep',
        text(b, 'MaLoai')
      );
      if (TuNgay < e.NgayVaoLam) fail('Ngày nghỉ không được trước ngày vào làm.');

      const holidays = await loadHolidays(tx, TuNgay, DenNgay);
      const segments = splitByYear(TuNgay, DenNgay)
        .map(([from, to]) => ({ from, to, SoNgay: countWorkingDays(from, to, holidays) }))
        .filter((s) => s.SoNgay > 0);
      if (!segments.length) fail('Khoảng nghỉ không có ngày làm việc nào (cuối tuần hoặc ngày lễ).');

      const total = segments.reduce((sum, s) => sum + s.SoNgay, 0);
      if (total > Number(loai.SoNgayToiDa)) {
        fail(`Loại nghỉ này tối đa ${loai.SoNgayToiDa} ngày làm việc mỗi đơn.`);
      }

      const overlap = await tx.one(
        `SELECT "MaDon" FROM donnghiphep
         WHERE "MaNV" = $1 AND "TrangThai" IN ('Chờ duyệt', 'Đã duyệt')
           AND "TuNgay" <= $2 AND "DenNgay" >= $3`,
        [MaNV, DenNgay, TuNgay]
      );
      if (overlap) fail('Khoảng nghỉ trùng với đơn đang chờ duyệt hoặc đã duyệt.');

      const created: string[] = [];
      for (const s of segments) {
        const MaDon = generateId('NP');
        await tx.run(
          `INSERT INTO donnghiphep("MaDon", "MaNV", "MaLoai", "NgayNop", "TuNgay", "DenNgay", "SoNgay", "LyDo", "TrangThai")
           VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'Chờ duyệt')`,
          [MaDon, MaNV, loai.MaLoai, currentDay, s.from, s.to, s.SoNgay, LyDo]
        );
        await auditLog(tx, u.MaTK, 'Nộp đơn nghỉ phép', MaDon, {
          TuNgay: s.from,
          DenNgay: s.to,
          SoNgay: s.SoNgay,
          nhaplui: s.from < currentDay,
        });
        created.push(MaDon);
      }
      return created;
    });
    res.status(201).json({ id: ids[0], ids });
  })
);

// Hủy đơn nghỉ phép: đơn chờ duyệt, hoặc đơn đã duyệt nhưng chưa nghỉ (quỹ phép tự hoàn lại)
leavesRouter.post(
  '/leaves/:id/cancel',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const rid = paramId(req);

    await withTransaction(async (tx) => {
      const probe = await existsInTable<any>(tx, 'donnghiphep', rid);
      await lockEmployee(tx, probe.MaNV);
      const leave = (await tx.one<any>('SELECT * FROM donnghiphep WHERE "MaDon" = $1 FOR UPDATE', [rid]))!;
      const privileged = ['admin', 'hr'].includes(u.VaiTro);
      const owner = leave.MaNV === u.MaNV;
      if (!owner && !privileged) fail('Bạn không có quyền hủy đơn này.', 403);

      const currentDay = today();
      if (leave.TrangThai === 'Chờ duyệt') {
        // mọi người có quyền ở trên đều được hủy
      } else if (leave.TrangThai === 'Đã duyệt') {
        const allowed = privileged ? leave.DenNgay >= currentDay : leave.TuNgay > currentDay;
        if (!allowed) fail('Đơn đã duyệt chỉ hủy được khi chưa đến ngày nghỉ.');
      } else {
        fail('Đơn đã được xử lý.');
      }

      await tx.run(`UPDATE donnghiphep SET "TrangThai" = 'Đã hủy' WHERE "MaDon" = $1`, [rid]);
      await auditLog(tx, u.MaTK, 'Hủy đơn nghỉ phép', rid, { trangthaitruoc: leave.TrangThai });
    });
    res.json({ ok: true });
  })
);

// 4.3 Duyệt hoặc từ chối nghỉ phép
leavesRouter.post(
  '/leaves/:id/review',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'manager', 'director', 'hr']);
    const rid = paramId(req);
    const b = req.body;
    const TrangThai = choice(b, 'TrangThai', ['Đã duyệt', 'Từ chối'] as const);
    const GhiChuDuyet = optional(b, 'GhiChuDuyet', 1000);
    if (TrangThai === 'Từ chối' && !GhiChuDuyet) fail('Vui lòng nhập lý do từ chối.');

    await withTransaction(async (tx) => {
      const probe = await existsInTable<any>(tx, 'donnghiphep', rid);
      // Khóa nhân viên để các lần duyệt đồng thời cùng một người được thực hiện lần lượt.
      await lockEmployee(tx, probe.MaNV);
      const leave = (await tx.one<any>('SELECT * FROM donnghiphep WHERE "MaDon" = $1 FOR UPDATE', [rid]))!;
      if (leave.TrangThai !== 'Chờ duyệt') fail('Đơn đã được xử lý.');

      const e = await existsInTable<any>(tx, 'nhanvien', leave.MaNV);
      if (e.MaNV === u.MaNV) fail('Không được tự duyệt đơn nghỉ phép.');

      const target = await tx.one<{ CapBac: number }>(
        `SELECT c."CapBac" FROM nhanvien n JOIN chucvu c ON c."MaCV" = n."MaCV" WHERE n."MaNV" = $1`,
        [e.MaNV]
      );
      const reviewer = await tx.one<SessionUser & { CapBac: number }>(
        `SELECT t."MaTK", t."TenDangNhap", t."VaiTro", t."MaNV", n."HoTen", n."MaPB", c."CapBac"
         FROM taikhoan t
         JOIN nhanvien n ON n."MaNV" = t."MaNV"
         JOIN chucvu c ON c."MaCV" = n."MaCV"
         WHERE t."MaTK" = $1`,
        [u.MaTK]
      );
      const deptHead = e.MaPB
        ? await tx.one<{ MaTruongPhong: string | null }>('SELECT "MaTruongPhong" FROM phongban WHERE "MaPB" = $1', [
            e.MaPB,
          ])
        : null;
      const isHead = deptHead?.MaTruongPhong === u.MaNV;
      const formerEmployee = ['Đã nghỉ việc', 'Đã lưu trữ'].includes(e.TrangThai);
      const canReview =
        (formerEmployee && ['admin', 'hr'].includes(u.VaiTro)) ||
        (!formerEmployee &&
          !!reviewer &&
          !!target &&
          canReviewLeave(reviewer, { ...e, CapBac: Number(target.CapBac) }, isHead));
      if (!canReview) {
        fail('Bạn không có quyền duyệt đơn nghỉ phép này.', 403);
      }

      const loai = await existsInTable<{ MaLoai: string; TruPhepNam: number }>(tx, 'loainghiphep', leave.MaLoai);

      if (TrangThai === 'Đã duyệt' && Number(loai.TruPhepNam) === 1) {
        const Nam = Number(leave.TuNgay.slice(0, 4));
        const tong = await annualTotal(tx, e, Nam);
        const daNghi = await usedAnnualDays(tx, e.MaNV, Nam);
        if (daNghi + Number(leave.SoNgay) > tong) {
          fail(`Nhân viên chỉ còn ${Math.max(tong - daNghi, 0)} ngày phép năm.`);
        }
        await tx.run(
          `INSERT INTO songayphep("MaNV", "Nam", "TongSoNgayPhep") VALUES($1, $2, $3)
           ON CONFLICT ("MaNV", "Nam") DO NOTHING`,
          [e.MaNV, Nam, tong]
        );
      }

      await tx.run(
        `UPDATE donnghiphep
         SET "TrangThai" = $1, "MaNVDuyet" = $2, "NgayDuyet" = $3, "GhiChuDuyet" = $4
         WHERE "MaDon" = $5`,
        [TrangThai, u.MaNV, today(), GhiChuDuyet, rid]
      );
      await auditLog(tx, u.MaTK, `${TrangThai} đơn nghỉ phép`, rid);
    });

    res.json({ ok: true });
  })
);

// 4.4 Điều chỉnh quỹ phép theo năm
leavesRouter.post(
  '/balances',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const b = req.body;
    const MaNV = text(b, 'MaNV');
    const Nam = numeric(b, 'Nam', 2000, 2100);
    const TongSoNgayPhep = numeric(b, 'TongSoNgayPhep', 0, 366);
    if (!Number.isInteger(Nam) || !Number.isInteger(TongSoNgayPhep)) {
      fail('Năm và số ngày phép phải là số nguyên.');
    }

    await withTransaction(async (tx) => {
      await lockEmployee(tx, MaNV);
      const e = await requireActiveEmployee(tx, MaNV);
      const daNghi = await usedAnnualDays(tx, e.MaNV, Nam);
      if (TongSoNgayPhep < daNghi) fail('Tổng ngày phép không được nhỏ hơn số ngày đã sử dụng.');

      const before = await annualTotal(tx, e, Nam);
      await tx.run(
        `INSERT INTO songayphep("MaNV", "Nam", "TongSoNgayPhep") VALUES($1, $2, $3)
         ON CONFLICT ("MaNV", "Nam") DO UPDATE SET "TongSoNgayPhep" = EXCLUDED."TongSoNgayPhep"`,
        [e.MaNV, Nam, TongSoNgayPhep]
      );
      await auditLog(tx, u.MaTK, 'Cập nhật quỹ phép', `${e.MaNV}/${Nam}`, {
        TongSoNgayPhep: { from: before, to: TongSoNgayPhep },
      });
    });
    res.json({ ok: true });
  })
);

// Ngày lễ (không tính vào số ngày nghỉ)
leavesRouter.get(
  '/holidays',
  asyncHandler(async (req, res) => {
    const Nam = Number(req.query.year ?? req.query.Nam);
    const rows = Number.isInteger(Nam)
      ? await db.all('SELECT "Ngay", "TenNgayLe" FROM ngayle WHERE EXTRACT(YEAR FROM "Ngay") = $1 ORDER BY "Ngay"', [Nam])
      : await db.all('SELECT "Ngay", "TenNgayLe" FROM ngayle ORDER BY "Ngay"');
    res.json(rows);
  })
);

leavesRouter.post(
  '/holidays',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const Ngay = date(req.body, 'Ngay');
    const TenNgayLe = text(req.body, 'TenNgayLe', 120);
    await db.run(
      `INSERT INTO ngayle("Ngay", "TenNgayLe") VALUES($1, $2)
       ON CONFLICT ("Ngay") DO UPDATE SET "TenNgayLe" = EXCLUDED."TenNgayLe"`,
      [Ngay, TenNgayLe]
    );
    await auditLog(db, u.MaTK, 'Cập nhật ngày lễ', Ngay);
    res.status(201).json({ ok: true });
  })
);

leavesRouter.delete(
  '/holidays/:day',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const Ngay = paramId(req, 'day');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(Ngay)) fail('Ngày không hợp lệ.');
    await db.run('DELETE FROM ngayle WHERE "Ngay" = $1', [Ngay]);
    await auditLog(db, u.MaTK, 'Xóa ngày lễ', Ngay);
    res.json({ ok: true });
  })
);
