import { Router } from 'express';
import { withTransaction, auditLog } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { generateId } from '../utils/crypto.js';
import { addMonths, choice, date, fail, text, today } from '../utils/validation.js';
import { asyncHandler, paramId } from '../utils/http.js';
import { applyAssignment, syncRoleAndHead } from '../services/assignments.js';

export const assignmentsRouter = Router();

assignmentsRouter.use(requireAuth);

// 4.1 Ghi nhận công tác (kết hợp 2.3 Phân bổ nhân sự & 2.4 Bổ nhiệm chức vụ).
// Quyết định có hiệu lực từ hôm nay trở về trước được áp dụng ngay; ngày hiệu lực tương lai
// được lưu ở trạng thái "Chờ hiệu lực" và tự áp dụng khi đến ngày.
assignmentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr', 'director']);

    const b = req.body;
    const ngayhieuluc = date(b, 'ngayhieuluc');
    const ngayky = date(b, 'ngayky');
    const loaibiendong = choice(
      b,
      'loaibiendong',
      ['Điều chuyển', 'Bổ nhiệm', 'Miễn nhiệm', 'Điều chuyển và bổ nhiệm'] as const
    );
    const lydo = text(b, 'lydo', 1000);
    const soqd = text(b, 'soqd', 60);
    const nguoiky = text(b, 'nguoiky', 120);
    const currentDay = today();

    if (ngayhieuluc > addMonths(currentDay, 12)) {
      fail('Ngày hiệu lực không được quá 12 tháng sau hôm nay.');
    }
    if (ngayky > ngayhieuluc) fail('Ngày ký phải không sau ngày hiệu lực.');

    const maqt = await withTransaction(async (tx) => {
      const manv = text(b, 'manv');
      await tx.query('SELECT manv FROM nhanvien WHERE manv = $1 FOR UPDATE', [manv]);
      const e = await requireActiveEmployee(tx, manv);
      const dept = await existsInTable(tx, 'phongban', text(b, 'mapbmoi'));
      const pos = await existsInTable(tx, 'chucvu', text(b, 'macvmoi'));
      if (dept.hoatdong === false) fail('Phòng ban này đã ngừng sử dụng.');
      if (pos.hoatdong === false) fail('Chức vụ này đã ngừng sử dụng.');
      if (ngayhieuluc < e.ngayvaolam) fail('Ngày hiệu lực không được trước ngày vào làm.');

      const pending = await tx.one(
        `SELECT maqt FROM quatrinhcongtac WHERE manv = $1 AND trangthai = 'Chờ hiệu lực'`,
        [e.manv]
      );
      if (pending) fail('Nhân viên đang có quyết định công tác chờ hiệu lực; hãy hủy hoặc chờ áp dụng.');

      const last = await tx.one<{ d: string | null }>(
        `SELECT MAX(ngayhieuluc) AS d FROM quatrinhcongtac WHERE manv = $1 AND trangthai = 'Hiệu lực'`,
        [e.manv]
      );
      if (last?.d && ngayhieuluc < last.d) {
        fail('Ngày hiệu lực không được trước biến động gần nhất.');
      }

      if (e.mapb === dept.mapb && e.macv === pos.macv) {
        fail('Phòng ban hoặc chức vụ mới phải thay đổi.');
      }

      if (loaibiendong === 'Miễn nhiệm') {
        if (e.macv === pos.macv) {
          fail('Miễn nhiệm yêu cầu thay đổi chức vụ sang chức vụ mới.');
        }
      } else {
        const expected =
          e.mapb !== dept.mapb
            ? e.macv !== pos.macv
              ? 'Điều chuyển và bổ nhiệm'
              : 'Điều chuyển'
            : 'Bổ nhiệm';
        if (loaibiendong !== expected) fail('Loại biến động không khớp phòng ban/chức vụ thay đổi.');
      }

      await tx.run(
        `INSERT INTO quyetdinh(maqd, soqd, loaiqd, ngayky, ngayhieuluc, nguoiky, noidung)
         VALUES($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (soqd) DO NOTHING`,
        [generateId('QD'), soqd, loaibiendong, ngayky, ngayhieuluc, nguoiky, lydo]
      );
      const decision = (await tx.one<any>('SELECT * FROM quyetdinh WHERE soqd = $1', [soqd]))!;
      if (
        decision.loaiqd !== loaibiendong ||
        decision.ngayky !== ngayky ||
        decision.ngayhieuluc !== ngayhieuluc ||
        decision.nguoiky !== nguoiky ||
        decision.noidung !== lydo
      ) {
        fail('Thông tin không khớp quyết định đã có.', 409);
      }

      const maqt = generateId('QT');
      await tx.run(
        `INSERT INTO quatrinhcongtac(maqt, manv, maqd, loaibiendong, mapbcu, mapbmoi,
           macvcu, macvmoi, ngayhieuluc, lydo, trangthai)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Chờ hiệu lực')`,
        [maqt, e.manv, decision.maqd, loaibiendong, e.mapb, dept.mapb, e.macv, pos.macv, ngayhieuluc, lydo]
      );
      if (ngayhieuluc <= currentDay) {
        await applyAssignment(tx, maqt, u.matk);
      }
      await auditLog(
        tx,
        u.matk,
        ngayhieuluc <= currentDay ? 'Ghi nhận công tác' : 'Ghi nhận công tác chờ hiệu lực',
        e.manv
      );
      return maqt;
    });

    res.status(201).json({ id: maqt });
  })
);

// Hủy quyết định công tác: chờ hiệu lực, hoặc bản ghi hiệu lực gần nhất của nhân viên (hoàn tác).
assignmentsRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr', 'director']);
    const rid = paramId(req);
    const lydohuy = text(req.body, 'lydohuy', 1000);

    await withTransaction(async (tx) => {
      const a = await tx.one<any>('SELECT * FROM quatrinhcongtac WHERE maqt = $1 FOR UPDATE', [rid]);
      if (!a) fail('Không tìm thấy dữ liệu.', 404);
      if (a.trangthai === 'Đã hủy') fail('Quyết định công tác đã bị hủy.');
      const e = await tx.one<any>('SELECT * FROM nhanvien WHERE manv = $1 FOR UPDATE', [a.manv]);
      if (!e) fail('Không tìm thấy dữ liệu.', 404);

      if (a.trangthai === 'Hiệu lực') {
        if (['Đã lưu trữ', 'Đã nghỉ việc'].includes(e.trangthai)) {
          fail('Nhân viên đã nghỉ việc hoặc lưu trữ; không thể hoàn tác công tác.');
        }
        const latest = await tx.one<{ maqt: string }>(
          `SELECT maqt FROM quatrinhcongtac
           WHERE manv = $1 AND trangthai = 'Hiệu lực'
           ORDER BY ngayhieuluc DESC, maqt DESC LIMIT 1`,
          [e.manv]
        );
        if (latest?.maqt !== a.maqt) fail('Chỉ hoàn tác được biến động công tác gần nhất.');
        if (e.mapb !== a.mapbmoi || e.macv !== a.macvmoi) {
          fail('Hồ sơ đã thay đổi sau quyết định này; không thể hoàn tác.');
        }
        const oldPos = await existsInTable<any>(tx, 'chucvu', a.macvcu);
        await tx.run('UPDATE nhanvien SET mapb = $1, macv = $2, phienban = phienban + 1 WHERE manv = $3', [
          a.mapbcu,
          a.macvcu,
          e.manv,
        ]);
        await syncRoleAndHead(tx, e.manv, a.mapbcu, oldPos, u.matk);
      }

      await tx.run(
        `UPDATE quatrinhcongtac SET trangthai = 'Đã hủy', ngayhuy = $1, lydohuy = $2 WHERE maqt = $3`,
        [today(), lydohuy, rid]
      );
      await auditLog(tx, u.matk, 'Hủy quyết định công tác', rid, { lydohuy, trangthaitruoc: a.trangthai });
    });
    res.json({ ok: true });
  })
);
