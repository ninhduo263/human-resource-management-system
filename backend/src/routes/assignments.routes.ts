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
    const NgayHieuLuc = date(b, 'NgayHieuLuc');
    const NgayKy = date(b, 'NgayKy');
    const LoaiBienDong = choice(
      b,
      'LoaiBienDong',
      ['Điều chuyển', 'Bổ nhiệm', 'Miễn nhiệm', 'Điều chuyển và bổ nhiệm'] as const
    );
    const LyDo = text(b, 'LyDo', 1000);
    const SoQD = text(b, 'SoQD', 60);
    const NguoiKy = text(b, 'NguoiKy', 120);
    const currentDay = today();

    if (NgayHieuLuc > addMonths(currentDay, 12)) {
      fail('Ngày hiệu lực không được quá 12 tháng sau hôm nay.');
    }
    if (NgayKy > NgayHieuLuc) fail('Ngày ký phải không sau ngày hiệu lực.');

    const MaQT = await withTransaction(async (tx) => {
      const MaNV = text(b, 'MaNV');
      await tx.query('SELECT "MaNV" FROM "NHANVIEN" WHERE "MaNV" = $1 FOR UPDATE', [MaNV]);
      const e = await requireActiveEmployee(tx, MaNV);
      const dept = await existsInTable(tx, 'PHONGBAN', text(b, 'MaPBMoi'));
      const pos = await existsInTable(tx, 'CHUCVU', text(b, 'MaCVMoi'));
      if (dept.HoatDong === false) fail('Phòng ban này đã ngừng sử dụng.');
      if (pos.HoatDong === false) fail('Chức vụ này đã ngừng sử dụng.');
      if (NgayHieuLuc < e.NgayVaoLam) fail('Ngày hiệu lực không được trước ngày vào làm.');

      const pending = await tx.one(
        `SELECT "MaQT" FROM "QUATRINHCONGTAC" WHERE "MaNV" = $1 AND "TrangThai" = 'Chờ hiệu lực'`,
        [e.MaNV]
      );
      if (pending) fail('Nhân viên đang có quyết định công tác chờ hiệu lực; hãy hủy hoặc chờ áp dụng.');

      const last = await tx.one<{ d: string | null }>(
        `SELECT MAX("NgayHieuLuc") AS d FROM "QUATRINHCONGTAC" WHERE "MaNV" = $1 AND "TrangThai" = 'Hiệu lực'`,
        [e.MaNV]
      );
      if (last?.d && NgayHieuLuc < last.d) {
        fail('Ngày hiệu lực không được trước biến động gần nhất.');
      }

      if (e.MaPB === dept.MaPB && e.MaCV === pos.MaCV) {
        fail('Phòng ban hoặc chức vụ mới phải thay đổi.');
      }

      if (LoaiBienDong === 'Miễn nhiệm') {
        if (e.MaCV === pos.MaCV) {
          fail('Miễn nhiệm yêu cầu thay đổi chức vụ sang chức vụ mới.');
        }
      } else {
        const expected =
          e.MaPB !== dept.MaPB
            ? e.MaCV !== pos.MaCV
              ? 'Điều chuyển và bổ nhiệm'
              : 'Điều chuyển'
            : 'Bổ nhiệm';
        if (LoaiBienDong !== expected) fail('Loại biến động không khớp phòng ban/chức vụ thay đổi.');
      }

      await tx.run(
        `INSERT INTO "QUYETDINH"("MaQD", "SoQD", "LoaiQD", "NgayKy", "NgayHieuLuc", "NguoiKy", "NoiDung")
         VALUES($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT ("SoQD") DO NOTHING`,
        [generateId('QD'), SoQD, LoaiBienDong, NgayKy, NgayHieuLuc, NguoiKy, LyDo]
      );
      const decision = (await tx.one<any>('SELECT * FROM "QUYETDINH" WHERE "SoQD" = $1', [SoQD]))!;
      if (
        decision.LoaiQD !== LoaiBienDong ||
        decision.NgayKy !== NgayKy ||
        decision.NgayHieuLuc !== NgayHieuLuc ||
        decision.NguoiKy !== NguoiKy ||
        decision.NoiDung !== LyDo
      ) {
        fail('Thông tin không khớp quyết định đã có.', 409);
      }

      const MaQT = generateId('QT');
      await tx.run(
        `INSERT INTO "QUATRINHCONGTAC"("MaQT", "MaNV", "MaQD", "LoaiBienDong", "MaPBCu", "MaPBMoi",
           "MaCVCu", "MaCVMoi", "NgayHieuLuc", "LyDo", "TrangThai")
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Chờ hiệu lực')`,
        [MaQT, e.MaNV, decision.MaQD, LoaiBienDong, e.MaPB, dept.MaPB, e.MaCV, pos.MaCV, NgayHieuLuc, LyDo]
      );
      if (NgayHieuLuc <= currentDay) {
        await applyAssignment(tx, MaQT, u.MaTK);
      }
      await auditLog(
        tx,
        u.MaTK,
        NgayHieuLuc <= currentDay ? 'Ghi nhận công tác' : 'Ghi nhận công tác chờ hiệu lực',
        e.MaNV
      );
      return MaQT;
    });

    res.status(201).json({ id: MaQT });
  })
);

// Hủy quyết định công tác: chờ hiệu lực, hoặc bản ghi hiệu lực gần nhất của nhân viên (hoàn tác).
assignmentsRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr', 'director']);
    const rid = paramId(req);
    const LyDoHuy = text(req.body, 'LyDoHuy', 1000);

    await withTransaction(async (tx) => {
      const a = await tx.one<any>('SELECT * FROM "QUATRINHCONGTAC" WHERE "MaQT" = $1 FOR UPDATE', [rid]);
      if (!a) fail('Không tìm thấy dữ liệu.', 404);
      if (a.TrangThai === 'Đã hủy') fail('Quyết định công tác đã bị hủy.');
      const e = await tx.one<any>('SELECT * FROM "NHANVIEN" WHERE "MaNV" = $1 FOR UPDATE', [a.MaNV]);
      if (!e) fail('Không tìm thấy dữ liệu.', 404);

      if (a.TrangThai === 'Hiệu lực') {
        if (['Đã lưu trữ', 'Đã nghỉ việc'].includes(e.TrangThai)) {
          fail('Nhân viên đã nghỉ việc hoặc lưu trữ; không thể hoàn tác công tác.');
        }
        const latest = await tx.one<{ MaQT: string }>(
          `SELECT "MaQT" FROM "QUATRINHCONGTAC"
           WHERE "MaNV" = $1 AND "TrangThai" = 'Hiệu lực'
           ORDER BY "NgayHieuLuc" DESC, "MaQT" DESC LIMIT 1`,
          [e.MaNV]
        );
        if (latest?.MaQT !== a.MaQT) fail('Chỉ hoàn tác được biến động công tác gần nhất.');
        if (e.MaPB !== a.MaPBMoi || e.MaCV !== a.MaCVMoi) {
          fail('Hồ sơ đã thay đổi sau quyết định này; không thể hoàn tác.');
        }
        const oldPos = await existsInTable<any>(tx, 'CHUCVU', a.MaCVCu);
        await tx.run('UPDATE "NHANVIEN" SET "MaPB" = $1, "MaCV" = $2, "PhienBan" = "PhienBan" + 1 WHERE "MaNV" = $3', [
          a.MaPBCu,
          a.MaCVCu,
          e.MaNV,
        ]);
        await syncRoleAndHead(tx, e.MaNV, a.MaPBCu, oldPos, u.MaTK);
      }

      await tx.run(
        `UPDATE "QUATRINHCONGTAC" SET "TrangThai" = 'Đã hủy', "NgayHuy" = $1, "LyDoHuy" = $2 WHERE "MaQT" = $3`,
        [today(), LyDoHuy, rid]
      );
      await auditLog(tx, u.MaTK, 'Hủy quyết định công tác', rid, { LyDoHuy, trangthaitruoc: a.TrangThai });
    });
    res.json({ ok: true });
  })
);
