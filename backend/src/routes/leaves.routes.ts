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

async function lockEmployee(tx: DbExecutor, manv: string): Promise<void> {
  await tx.query('SELECT manv FROM nhanvien WHERE manv = $1 FOR UPDATE', [manv]);
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
    const selfOnly = ['employee', 'manager', 'director'].includes(u.vaitro);
    const manv = selfOnly ? u.manv : text(b, 'manv');
    const tungay = date(b, 'tungay');
    const denngay = date(b, 'denngay');
    const lydo = text(b, 'lydo', 1000);
    const currentDay = today();

    // Chỉ nhân sự/quản trị viên được nhập đơn lùi ngày (ốm đột xuất, quên làm đơn).
    if (tungay < currentDay && !['admin', 'hr'].includes(u.vaitro)) {
      fail('Ngày nghỉ không được trước hôm nay.');
    }
    if (denngay < tungay) fail('Ngày kết thúc không được trước ngày bắt đầu.');

    const ids = await withTransaction(async (tx) => {
      await lockEmployee(tx, manv);
      const e = await requireActiveEmployee(tx, manv);
      const loai = await existsInTable<{ maloai: string; songaytoida: number }>(
        tx,
        'loainghiphep',
        text(b, 'maloai')
      );
      if (tungay < e.ngayvaolam) fail('Ngày nghỉ không được trước ngày vào làm.');

      const holidays = await loadHolidays(tx, tungay, denngay);
      const segments = splitByYear(tungay, denngay)
        .map(([from, to]) => ({ from, to, songay: countWorkingDays(from, to, holidays) }))
        .filter((s) => s.songay > 0);
      if (!segments.length) fail('Khoảng nghỉ không có ngày làm việc nào (cuối tuần hoặc ngày lễ).');

      const total = segments.reduce((sum, s) => sum + s.songay, 0);
      if (total > Number(loai.songaytoida)) {
        fail(`Loại nghỉ này tối đa ${loai.songaytoida} ngày làm việc mỗi đơn.`);
      }

      const overlap = await tx.one(
        `SELECT madon FROM donnghiphep
         WHERE manv = $1 AND trangthai IN ('Chờ duyệt', 'Đã duyệt')
           AND tungay <= $2 AND denngay >= $3`,
        [manv, denngay, tungay]
      );
      if (overlap) fail('Khoảng nghỉ trùng với đơn đang chờ duyệt hoặc đã duyệt.');

      const created: string[] = [];
      for (const s of segments) {
        const madon = generateId('NP');
        await tx.run(
          `INSERT INTO donnghiphep(madon, manv, maloai, ngaynop, tungay, denngay, songay, lydo, trangthai)
           VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'Chờ duyệt')`,
          [madon, manv, loai.maloai, currentDay, s.from, s.to, s.songay, lydo]
        );
        await auditLog(tx, u.matk, 'Nộp đơn nghỉ phép', madon, {
          tungay: s.from,
          denngay: s.to,
          songay: s.songay,
          nhaplui: s.from < currentDay,
        });
        created.push(madon);
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
      await lockEmployee(tx, probe.manv);
      const leave = (await tx.one<any>('SELECT * FROM donnghiphep WHERE madon = $1 FOR UPDATE', [rid]))!;
      const privileged = ['admin', 'hr'].includes(u.vaitro);
      const owner = leave.manv === u.manv;
      if (!owner && !privileged) fail('Bạn không có quyền hủy đơn này.', 403);

      const currentDay = today();
      if (leave.trangthai === 'Chờ duyệt') {
        // mọi người có quyền ở trên đều được hủy
      } else if (leave.trangthai === 'Đã duyệt') {
        const allowed = privileged ? leave.denngay >= currentDay : leave.tungay > currentDay;
        if (!allowed) fail('Đơn đã duyệt chỉ hủy được khi chưa đến ngày nghỉ.');
      } else {
        fail('Đơn đã được xử lý.');
      }

      await tx.run(`UPDATE donnghiphep SET trangthai = 'Đã hủy' WHERE madon = $1`, [rid]);
      await auditLog(tx, u.matk, 'Hủy đơn nghỉ phép', rid, { trangthaitruoc: leave.trangthai });
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
    const trangthai = choice(b, 'trangthai', ['Đã duyệt', 'Từ chối'] as const);
    const ghichuduyet = optional(b, 'ghichuduyet', 1000);
    if (trangthai === 'Từ chối' && !ghichuduyet) fail('Vui lòng nhập lý do từ chối.');

    await withTransaction(async (tx) => {
      const probe = await existsInTable<any>(tx, 'donnghiphep', rid);
      // Khóa nhân viên để các lần duyệt đồng thời cùng một người được thực hiện lần lượt.
      await lockEmployee(tx, probe.manv);
      const leave = (await tx.one<any>('SELECT * FROM donnghiphep WHERE madon = $1 FOR UPDATE', [rid]))!;
      if (leave.trangthai !== 'Chờ duyệt') fail('Đơn đã được xử lý.');

      const e = await existsInTable<any>(tx, 'nhanvien', leave.manv);
      if (e.manv === u.manv) fail('Không được tự duyệt đơn nghỉ phép.');

      const target = await tx.one<{ capbac: number }>(
        `SELECT c.capbac FROM nhanvien n JOIN chucvu c ON c.macv = n.macv WHERE n.manv = $1`,
        [e.manv]
      );
      const reviewer = await tx.one<SessionUser & { capbac: number }>(
        `SELECT t.matk, t.tendangnhap, t.vaitro, t.manv, n.hoten, n.mapb, c.capbac
         FROM taikhoan t
         JOIN nhanvien n ON n.manv = t.manv
         JOIN chucvu c ON c.macv = n.macv
         WHERE t.matk = $1`,
        [u.matk]
      );
      const deptHead = e.mapb
        ? await tx.one<{ matruongphong: string | null }>('SELECT matruongphong FROM phongban WHERE mapb = $1', [
            e.mapb,
          ])
        : null;
      const isHead = deptHead?.matruongphong === u.manv;
      const formerEmployee = ['Đã nghỉ việc', 'Đã lưu trữ'].includes(e.trangthai);
      const canReview =
        (formerEmployee && ['admin', 'hr'].includes(u.vaitro)) ||
        (!formerEmployee &&
          !!reviewer &&
          !!target &&
          canReviewLeave(reviewer, { ...e, capbac: Number(target.capbac) }, isHead));
      if (!canReview) {
        fail('Bạn không có quyền duyệt đơn nghỉ phép này.', 403);
      }

      const loai = await existsInTable<{ maloai: string; truphepnam: number }>(tx, 'loainghiphep', leave.maloai);

      if (trangthai === 'Đã duyệt' && Number(loai.truphepnam) === 1) {
        const nam = Number(leave.tungay.slice(0, 4));
        const tong = await annualTotal(tx, e, nam);
        const daNghi = await usedAnnualDays(tx, e.manv, nam);
        if (daNghi + Number(leave.songay) > tong) {
          fail(`Nhân viên chỉ còn ${Math.max(tong - daNghi, 0)} ngày phép năm.`);
        }
        await tx.run(
          `INSERT INTO songayphep(manv, nam, tongsongayphep) VALUES($1, $2, $3)
           ON CONFLICT (manv, nam) DO NOTHING`,
          [e.manv, nam, tong]
        );
      }

      await tx.run(
        `UPDATE donnghiphep
         SET trangthai = $1, manvduyet = $2, ngayduyet = $3, ghichuduyet = $4
         WHERE madon = $5`,
        [trangthai, u.manv, today(), ghichuduyet, rid]
      );
      await auditLog(tx, u.matk, `${trangthai} đơn nghỉ phép`, rid);
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
    const manv = text(b, 'manv');
    const nam = numeric(b, 'nam', 2000, 2100);
    const tongsongayphep = numeric(b, 'tongsongayphep', 0, 366);
    if (!Number.isInteger(nam) || !Number.isInteger(tongsongayphep)) {
      fail('Năm và số ngày phép phải là số nguyên.');
    }

    await withTransaction(async (tx) => {
      await lockEmployee(tx, manv);
      const e = await requireActiveEmployee(tx, manv);
      const daNghi = await usedAnnualDays(tx, e.manv, nam);
      if (tongsongayphep < daNghi) fail('Tổng ngày phép không được nhỏ hơn số ngày đã sử dụng.');

      const before = await annualTotal(tx, e, nam);
      await tx.run(
        `INSERT INTO songayphep(manv, nam, tongsongayphep) VALUES($1, $2, $3)
         ON CONFLICT (manv, nam) DO UPDATE SET tongsongayphep = EXCLUDED.tongsongayphep`,
        [e.manv, nam, tongsongayphep]
      );
      await auditLog(tx, u.matk, 'Cập nhật quỹ phép', `${e.manv}/${nam}`, {
        tongsongayphep: { from: before, to: tongsongayphep },
      });
    });
    res.json({ ok: true });
  })
);

// Ngày lễ (không tính vào số ngày nghỉ)
leavesRouter.get(
  '/holidays',
  asyncHandler(async (req, res) => {
    const nam = Number(req.query.year ?? req.query.nam);
    const rows = Number.isInteger(nam)
      ? await db.all('SELECT ngay, tenngayle FROM ngayle WHERE EXTRACT(YEAR FROM ngay) = $1 ORDER BY ngay', [nam])
      : await db.all('SELECT ngay, tenngayle FROM ngayle ORDER BY ngay');
    res.json(rows);
  })
);

leavesRouter.post(
  '/holidays',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const ngay = date(req.body, 'ngay');
    const tenngayle = text(req.body, 'tenngayle', 120);
    await db.run(
      `INSERT INTO ngayle(ngay, tenngayle) VALUES($1, $2)
       ON CONFLICT (ngay) DO UPDATE SET tenngayle = EXCLUDED.tenngayle`,
      [ngay, tenngayle]
    );
    await auditLog(db, u.matk, 'Cập nhật ngày lễ', ngay);
    res.status(201).json({ ok: true });
  })
);

leavesRouter.delete(
  '/holidays/:day',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const ngay = paramId(req, 'day');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) fail('Ngày không hợp lệ.');
    await db.run('DELETE FROM ngayle WHERE ngay = $1', [ngay]);
    await auditLog(db, u.matk, 'Xóa ngày lễ', ngay);
    res.json({ ok: true });
  })
);
