import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db, withTransaction, auditLog, diffFields } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import {
  MIN_WORKING_AGE,
  ageAt,
  assertContact,
  choice,
  date,
  fail,
  optional,
  text,
  today,
} from '../utils/validation.js';
import { generateId, passwordHash } from '../utils/crypto.js';
import { nextBusinessId } from '../utils/business-id.js';
import { asyncHandler, paramId } from '../utils/http.js';
import { LIVE_CONTRACT, syncEmployeeStatuses } from '../services/employeeStatus.js';
import { defaultEntitlement } from '../services/leave.js';

export const employeesRouter = Router();

employeesRouter.use(requireAuth);

function assertPersonalDates(birth: string, join: string, currentDay: string): void {
  if (birth >= currentDay || birth >= join) {
    fail('Ngày sinh phải trước ngày vào làm và ngày hiện tại.');
  }
  if (ageAt(birth, join) < MIN_WORKING_AGE) {
    fail(`Nhân viên phải đủ ${MIN_WORKING_AGE} tuổi tại ngày vào làm.`);
  }
}

// 1.1 Thêm hồ sơ mới
employeesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const b = req.body;
    const HoTen = text(b, 'HoTen', 120);
    const NgaySinh = date(b, 'NgaySinh');
    const NgayVaoLam = date(b, 'NgayVaoLam');
    const currentDay = today();
    assertPersonalDates(NgaySinh, NgayVaoLam, currentDay);

    const GioiTinh = choice(b, 'GioiTinh', ['Nam', 'Nữ', 'Khác'] as const);
    const SoDienThoai = text(b, 'SoDienThoai', 20);
    const Email = text(b, 'Email', 150);
    assertContact(SoDienThoai, Email);

    const pos = await existsInTable(db, 'CHUCVU', text(b, 'MaCV'));
    if (pos.HoatDong === false) fail('Chức vụ này đã ngừng sử dụng.');
    const VaiTro = choice(
      { VaiTro: b.VaiTro || (pos.LaDieuHanh ? 'director' : pos.VaiTroMacDinh || 'employee') },
      'VaiTro',
      ['admin', 'hr', 'manager', 'employee', 'director'] as const
    );
    if (VaiTro === 'admin' && u.VaiTro !== 'admin') {
      fail('Chỉ quản trị viên được tạo tài khoản quản trị.', 403);
    }
    const dept =
      VaiTro === 'director' || pos.LaDieuHanh
        ? null
        : await existsInTable(db, 'PHONGBAN', text(b, 'MaPB'));
    if (dept && dept.HoatDong === false) fail('Phòng ban này đã ngừng sử dụng.');
    const TrangThai = choice(b, 'TrangThai', ['Đang làm việc', 'Thử việc'] as const);
    const DiaChi = optional(b, 'DiaChi');

    if (b.confirm_duplicate !== true) {
      const dup = await db.one<{ MaNV: string; HoTen: string }>(
        `SELECT "MaNV", "HoTen" FROM "NHANVIEN"
         WHERE (LOWER("HoTen") = LOWER($1) AND "NgaySinh" = $2) OR "SoDienThoai" = $3
         LIMIT 1`,
        [HoTen, NgaySinh, SoDienThoai]
      );
      if (dup) {
        fail(
          `Có thể trùng hồ sơ ${dup.MaNV} (${dup.HoTen}) về họ tên + ngày sinh hoặc số điện thoại. Xác nhận lại nếu vẫn muốn tạo mới.`,
          409
        );
      }
    }

    const MatKhau = `Nv@${randomBytes(9).toString('base64url')}`;
    const MaTK = generateId('U');

    const MaNV = await withTransaction(async (tx) => {
      const MaNV = await nextBusinessId(tx, 'NHANVIEN');
      await tx.run(
        `INSERT INTO "NHANVIEN"("MaNV", "HoTen", "NgaySinh", "GioiTinh", "DiaChi", "SoDienThoai", "Email", "NgayVaoLam", "TrangThai", "NgayLuuTru", "MaPB", "MaCV")
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11)`,
        [MaNV, HoTen, NgaySinh, GioiTinh, DiaChi, SoDienThoai, Email, NgayVaoLam, TrangThai, dept?.MaPB ?? null, pos.MaCV]
      );
      await tx.run(
        'INSERT INTO "TAIKHOAN"("MaTK", "TenDangNhap", "MatKhau", "VaiTro", "MaNV", "HoatDong") VALUES($1, $2, $3, $4, $5, 1)',
        [MaTK, Email, passwordHash(MatKhau), VaiTro, MaNV]
      );
      const Nam = Number(currentDay.slice(0, 4));
      await tx.run(
        'INSERT INTO "SONGAYPHEP"("MaNV", "Nam", "TongSoNgayPhep") VALUES($1, $2, $3) ON CONFLICT DO NOTHING',
        [MaNV, Nam, defaultEntitlement(NgayVaoLam, Nam)]
      );
      if (VaiTro === 'manager' && dept) {
        await tx.run('UPDATE "PHONGBAN" SET "MaTruongPhong" = $1 WHERE "MaPB" = $2 AND "MaTruongPhong" IS NULL', [
          MaNV,
          dept.MaPB,
        ]);
      }
      await auditLog(tx, u.MaTK, 'Thêm hồ sơ', MaNV);
      await auditLog(tx, u.MaTK, 'Tạo tài khoản theo email', Email);
      return MaNV;
    });

    res.status(201).json({ id: MaNV, taikhoan: { TenDangNhap: Email, MatKhau, VaiTro } });
  })
);

// 1.2 Cập nhật hồ sơ (Admin/HR cập nhật đầy đủ hoặc nhân viên tự cập nhật thông tin liên hệ)
employeesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const rid = paramId(req);
    const b = req.body;

    // Nhân viên/trưởng phòng/giám đốc tự cập nhật thông tin liên hệ cá nhân (theo DFD 1.2)
    if (!['admin', 'hr'].includes(u.VaiTro)) {
      if (rid !== u.MaNV || b.self_contact !== true) {
        fail('Bạn không có quyền thực hiện thao tác này.', 403);
      }
      const SoDienThoai = text(b, 'SoDienThoai', 20);
      const Email = text(b, 'Email', 150);
      const DiaChi = optional(b, 'DiaChi');
      assertContact(SoDienThoai, Email);

      await withTransaction(async (tx) => {
        const old = await tx.one<any>('SELECT * FROM "NHANVIEN" WHERE "MaNV" = $1 FOR UPDATE', [rid]);
        if (!old) fail('Không tìm thấy dữ liệu.', 404);
        await requireActiveEmployee(tx, rid);
        assertVersion(old, b);
        await tx.run(
          `UPDATE "NHANVIEN" SET "SoDienThoai" = $1, "Email" = $2, "DiaChi" = $3, "PhienBan" = "PhienBan" + 1 WHERE "MaNV" = $4`,
          [SoDienThoai, Email, DiaChi, rid]
        );
        await syncUsername(tx, rid, old.Email, Email);
        await auditLog(
          tx,
          u.MaTK,
          'Cập nhật thông tin liên hệ cá nhân',
          rid,
          diffFields(old, { SoDienThoai, Email, DiaChi })
        );
      });
      res.json({ ok: true });
      return;
    }

    const HoTen = text(b, 'HoTen', 120);
    const NgaySinh = date(b, 'NgaySinh');
    const NgayVaoLam = date(b, 'NgayVaoLam');
    const currentDay = today();
    assertPersonalDates(NgaySinh, NgayVaoLam, currentDay);

    const GioiTinh = choice(b, 'GioiTinh', ['Nam', 'Nữ', 'Khác'] as const);
    const SoDienThoai = text(b, 'SoDienThoai', 20);
    const Email = text(b, 'Email', 150);
    assertContact(SoDienThoai, Email);
    const DiaChi = optional(b, 'DiaChi');

    await withTransaction(async (tx) => {
      const old = await tx.one<any>('SELECT * FROM "NHANVIEN" WHERE "MaNV" = $1 FOR UPDATE', [rid]);
      if (!old) fail('Không tìm thấy dữ liệu.', 404);
      await requireActiveEmployee(tx, rid);
      assertVersion(old, b);

      const dept = old.MaPB === null ? null : await existsInTable(tx, 'PHONGBAN', text(b, 'MaPB'));
      const pos = await existsInTable(tx, 'CHUCVU', text(b, 'MaCV'));
      if (old.MaPB !== (dept?.MaPB ?? null) || old.MaCV !== pos.MaCV) {
        fail('Hãy dùng chức năng Công tác để điều chuyển hoặc bổ nhiệm và lưu quyết định.');
      }

      const history = await tx.one(
        `SELECT 1 AS x WHERE
           EXISTS (SELECT 1 FROM "HOPDONG" WHERE "MaNV" = $1 AND "NgayBatDau" < $2)
        OR EXISTS (SELECT 1 FROM "QUATRINHCONGTAC" WHERE "MaNV" = $1 AND "NgayHieuLuc" < $2 AND "TrangThai" <> 'Đã hủy')
        OR EXISTS (SELECT 1 FROM "DONNGHIPHEP" WHERE "MaNV" = $1 AND "TuNgay" < $2)`,
        [rid, NgayVaoLam]
      );
      if (history) {
        fail('Ngày vào làm không được sau lịch sử hợp đồng, công tác hoặc nghỉ phép.');
      }

      // Trạng thái làm việc do hợp đồng quyết định; không cho sửa tay ở đây.
      await tx.run(
        `UPDATE "NHANVIEN"
         SET "HoTen" = $1, "NgaySinh" = $2, "GioiTinh" = $3, "DiaChi" = $4, "SoDienThoai" = $5, "Email" = $6,
             "NgayVaoLam" = $7, "PhienBan" = "PhienBan" + 1
         WHERE "MaNV" = $8`,
        [HoTen, NgaySinh, GioiTinh, DiaChi, SoDienThoai, Email, NgayVaoLam, rid]
      );
      await syncUsername(tx, rid, old.Email, Email);
      await auditLog(
        tx,
        u.MaTK,
        'Cập nhật hồ sơ',
        rid,
        diffFields(old, { HoTen, NgaySinh, GioiTinh, DiaChi, SoDienThoai, Email, NgayVaoLam })
      );
    });
    res.json({ ok: true });
  })
);

function assertVersion(old: { PhienBan: number }, body: Record<string, unknown>): void {
  if (body.PhienBan !== undefined && body.PhienBan !== null && Number(body.PhienBan) !== Number(old.PhienBan)) {
    fail('Hồ sơ vừa được người khác cập nhật. Vui lòng tải lại trang và thực hiện lại.', 409);
  }
}

/** Khi email đổi, tài khoản tạo theo email cũng đổi tên đăng nhập theo. */
async function syncUsername(
  tx: import('../db/pool.js').DbExecutor,
  MaNV: string,
  oldEmail: string,
  newEmail: string
): Promise<void> {
  if (oldEmail.toLowerCase() === newEmail.toLowerCase()) return;
  await tx.run(
    `UPDATE "TAIKHOAN" SET "TenDangNhap" = $1 WHERE "MaNV" = $2 AND LOWER("TenDangNhap") = LOWER($3)`,
    [newEmail, MaNV, oldEmail]
  );
}

// 1.4 Lưu trữ hồ sơ
employeesRouter.post(
  '/:id/archive',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);

    await withTransaction(async (tx) => {
      const e = await tx.one<any>('SELECT * FROM "NHANVIEN" WHERE "MaNV" = $1 FOR UPDATE', [rid]);
      if (!e) fail('Không tìm thấy dữ liệu.', 404);
      if (e.TrangThai === 'Đã lưu trữ') fail('Hồ sơ nhân viên đã lưu trữ.');
      if (e.MaNV === u.MaNV) fail('Không thể lưu trữ hồ sơ của chính bạn.');

      const currentDay = today();
      const activeContract = await tx.one(
        `SELECT "MaHD" FROM "HOPDONG"
         WHERE "MaNV" = $1 AND ${LIVE_CONTRACT}
           AND ("NgayKetThuc" IS NULL OR "NgayKetThuc" >= $2)`,
        [rid, currentDay]
      );
      if (activeContract) fail('Cần chấm dứt các hợp đồng hiện hành trước khi lưu trữ.');

      const pendingLeave = await tx.one(
        `SELECT "MaDon" FROM "DONNGHIPHEP" WHERE "MaNV" = $1 AND "TrangThai" = 'Chờ duyệt'`,
        [rid]
      );
      if (pendingLeave) fail('Cần xử lý các đơn nghỉ phép chờ duyệt trước khi lưu trữ.');

      const pendingAssignment = await tx.one(
        `SELECT "MaQT" FROM "QUATRINHCONGTAC" WHERE "MaNV" = $1 AND "TrangThai" = 'Chờ hiệu lực'`,
        [rid]
      );
      if (pendingAssignment) fail('Cần hủy các quyết định công tác chờ hiệu lực trước khi lưu trữ.');

      await tx.run(
        `UPDATE "NHANVIEN" SET "TrangThai" = 'Đã lưu trữ', "NgayLuuTru" = $1, "PhienBan" = "PhienBan" + 1 WHERE "MaNV" = $2`,
        [currentDay, rid]
      );
      await tx.run('UPDATE "PHONGBAN" SET "MaTruongPhong" = NULL WHERE "MaTruongPhong" = $1', [rid]);
      await tx.run('UPDATE "TAIKHOAN" SET "HoatDong" = 0 WHERE "MaNV" = $1', [rid]);
      await tx.run(
        'DELETE FROM "PHIENDANGNHAP" WHERE "MaTK" IN (SELECT "MaTK" FROM "TAIKHOAN" WHERE "MaNV" = $1)',
        [rid]
      );
      await auditLog(tx, u.MaTK, 'Lưu trữ hồ sơ', rid);
    });

    res.json({ ok: true });
  })
);

// 1.4 Khôi phục hồ sơ đã lưu trữ
employeesRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);

    await withTransaction(async (tx) => {
      const archived = await tx.one<any>('SELECT * FROM "NHANVIEN" WHERE "MaNV" = $1 FOR UPDATE', [rid]);
      if (!archived) fail('Không tìm thấy dữ liệu.', 404);
      if (archived.TrangThai !== 'Đã lưu trữ') fail('Chỉ khôi phục hồ sơ đã lưu trữ.');

      await tx.run(
        `UPDATE "NHANVIEN" SET "TrangThai" = 'Đang làm việc', "NgayLuuTru" = NULL, "PhienBan" = "PhienBan" + 1
         WHERE "MaNV" = $1`,
        [rid]
      );
      // Trạng thái thật (Thử việc / Đang làm việc) suy ra từ hợp đồng hiện hành, nếu có.
      await syncEmployeeStatuses(tx, rid);
      await auditLog(tx, u.MaTK, 'Khôi phục hồ sơ', rid);
    });
    // Tài khoản không tự mở lại: quản trị viên mở lại tường minh trong mục Tài khoản.
    res.json({ ok: true, account_locked: true });
  })
);
