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
    const hoten = text(b, 'hoten', 120);
    const ngaysinh = date(b, 'ngaysinh');
    const ngayvaolam = date(b, 'ngayvaolam');
    const currentDay = today();
    assertPersonalDates(ngaysinh, ngayvaolam, currentDay);

    const gioitinh = choice(b, 'gioitinh', ['Nam', 'Nữ', 'Khác'] as const);
    const sodienthoai = text(b, 'sodienthoai', 20);
    const email = text(b, 'email', 150);
    assertContact(sodienthoai, email);

    const pos = await existsInTable(db, 'chucvu', text(b, 'macv'));
    if (pos.hoatdong === false) fail('Chức vụ này đã ngừng sử dụng.');
    const vaitro = choice(
      { vaitro: b.vaitro || (pos.ladieuhanh ? 'director' : pos.vaitromacdinh || 'employee') },
      'vaitro',
      ['admin', 'hr', 'manager', 'employee', 'director'] as const
    );
    if (vaitro === 'admin' && u.vaitro !== 'admin') {
      fail('Chỉ quản trị viên được tạo tài khoản quản trị.', 403);
    }
    const dept =
      vaitro === 'director' || pos.ladieuhanh
        ? null
        : await existsInTable(db, 'phongban', text(b, 'mapb'));
    if (dept && dept.hoatdong === false) fail('Phòng ban này đã ngừng sử dụng.');
    const trangthai = choice(b, 'trangthai', ['Đang làm việc', 'Thử việc'] as const);
    const diachi = optional(b, 'diachi');

    if (b.confirm_duplicate !== true) {
      const dup = await db.one<{ manv: string; hoten: string }>(
        `SELECT manv, hoten FROM nhanvien
         WHERE (LOWER(hoten) = LOWER($1) AND ngaysinh = $2) OR sodienthoai = $3
         LIMIT 1`,
        [hoten, ngaysinh, sodienthoai]
      );
      if (dup) {
        fail(
          `Có thể trùng hồ sơ ${dup.manv} (${dup.hoten}) về họ tên + ngày sinh hoặc số điện thoại. Xác nhận lại nếu vẫn muốn tạo mới.`,
          409
        );
      }
    }

    const matkhau = `Nv@${randomBytes(9).toString('base64url')}`;
    const matk = generateId('U');

    const manv = await withTransaction(async (tx) => {
      const manv = await nextBusinessId(tx, 'nhanvien');
      await tx.run(
        `INSERT INTO nhanvien(manv, hoten, ngaysinh, gioitinh, diachi, sodienthoai, email, ngayvaolam, trangthai, ngayluutru, mapb, macv)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11)`,
        [manv, hoten, ngaysinh, gioitinh, diachi, sodienthoai, email, ngayvaolam, trangthai, dept?.mapb ?? null, pos.macv]
      );
      await tx.run(
        'INSERT INTO taikhoan(matk, tendangnhap, matkhau, vaitro, manv, hoatdong) VALUES($1, $2, $3, $4, $5, 1)',
        [matk, email, passwordHash(matkhau), vaitro, manv]
      );
      const nam = Number(currentDay.slice(0, 4));
      await tx.run(
        'INSERT INTO songayphep(manv, nam, tongsongayphep) VALUES($1, $2, $3) ON CONFLICT DO NOTHING',
        [manv, nam, defaultEntitlement(ngayvaolam, nam)]
      );
      if (vaitro === 'manager' && dept) {
        await tx.run('UPDATE phongban SET matruongphong = $1 WHERE mapb = $2 AND matruongphong IS NULL', [
          manv,
          dept.mapb,
        ]);
      }
      await auditLog(tx, u.matk, 'Thêm hồ sơ', manv);
      await auditLog(tx, u.matk, 'Tạo tài khoản theo email', email);
      return manv;
    });

    res.status(201).json({ id: manv, taikhoan: { tendangnhap: email, matkhau, vaitro } });
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
    if (!['admin', 'hr'].includes(u.vaitro)) {
      if (rid !== u.manv || b.self_contact !== true) {
        fail('Bạn không có quyền thực hiện thao tác này.', 403);
      }
      const sodienthoai = text(b, 'sodienthoai', 20);
      const email = text(b, 'email', 150);
      const diachi = optional(b, 'diachi');
      assertContact(sodienthoai, email);

      await withTransaction(async (tx) => {
        const old = await tx.one<any>('SELECT * FROM nhanvien WHERE manv = $1 FOR UPDATE', [rid]);
        if (!old) fail('Không tìm thấy dữ liệu.', 404);
        await requireActiveEmployee(tx, rid);
        assertVersion(old, b);
        await tx.run(
          `UPDATE nhanvien SET sodienthoai = $1, email = $2, diachi = $3, phienban = phienban + 1 WHERE manv = $4`,
          [sodienthoai, email, diachi, rid]
        );
        await syncUsername(tx, rid, old.email, email);
        await auditLog(
          tx,
          u.matk,
          'Cập nhật thông tin liên hệ cá nhân',
          rid,
          diffFields(old, { sodienthoai, email, diachi })
        );
      });
      res.json({ ok: true });
      return;
    }

    const hoten = text(b, 'hoten', 120);
    const ngaysinh = date(b, 'ngaysinh');
    const ngayvaolam = date(b, 'ngayvaolam');
    const currentDay = today();
    assertPersonalDates(ngaysinh, ngayvaolam, currentDay);

    const gioitinh = choice(b, 'gioitinh', ['Nam', 'Nữ', 'Khác'] as const);
    const sodienthoai = text(b, 'sodienthoai', 20);
    const email = text(b, 'email', 150);
    assertContact(sodienthoai, email);
    const diachi = optional(b, 'diachi');

    await withTransaction(async (tx) => {
      const old = await tx.one<any>('SELECT * FROM nhanvien WHERE manv = $1 FOR UPDATE', [rid]);
      if (!old) fail('Không tìm thấy dữ liệu.', 404);
      await requireActiveEmployee(tx, rid);
      assertVersion(old, b);

      const dept = old.mapb === null ? null : await existsInTable(tx, 'phongban', text(b, 'mapb'));
      const pos = await existsInTable(tx, 'chucvu', text(b, 'macv'));
      if (old.mapb !== (dept?.mapb ?? null) || old.macv !== pos.macv) {
        fail('Hãy dùng chức năng Công tác để điều chuyển hoặc bổ nhiệm và lưu quyết định.');
      }

      const history = await tx.one(
        `SELECT 1 AS x WHERE
           EXISTS (SELECT 1 FROM hopdong WHERE manv = $1 AND ngaybatdau < $2)
        OR EXISTS (SELECT 1 FROM quatrinhcongtac WHERE manv = $1 AND ngayhieuluc < $2 AND trangthai <> 'Đã hủy')
        OR EXISTS (SELECT 1 FROM donnghiphep WHERE manv = $1 AND tungay < $2)`,
        [rid, ngayvaolam]
      );
      if (history) {
        fail('Ngày vào làm không được sau lịch sử hợp đồng, công tác hoặc nghỉ phép.');
      }

      // Trạng thái làm việc do hợp đồng quyết định; không cho sửa tay ở đây.
      await tx.run(
        `UPDATE nhanvien
         SET hoten = $1, ngaysinh = $2, gioitinh = $3, diachi = $4, sodienthoai = $5, email = $6,
             ngayvaolam = $7, phienban = phienban + 1
         WHERE manv = $8`,
        [hoten, ngaysinh, gioitinh, diachi, sodienthoai, email, ngayvaolam, rid]
      );
      await syncUsername(tx, rid, old.email, email);
      await auditLog(
        tx,
        u.matk,
        'Cập nhật hồ sơ',
        rid,
        diffFields(old, { hoten, ngaysinh, gioitinh, diachi, sodienthoai, email, ngayvaolam })
      );
    });
    res.json({ ok: true });
  })
);

function assertVersion(old: { phienban: number }, body: Record<string, unknown>): void {
  if (body.phienban !== undefined && body.phienban !== null && Number(body.phienban) !== Number(old.phienban)) {
    fail('Hồ sơ vừa được người khác cập nhật. Vui lòng tải lại trang và thực hiện lại.', 409);
  }
}

/** Khi email đổi, tài khoản tạo theo email cũng đổi tên đăng nhập theo. */
async function syncUsername(
  tx: import('../db/pool.js').DbExecutor,
  manv: string,
  oldEmail: string,
  newEmail: string
): Promise<void> {
  if (oldEmail.toLowerCase() === newEmail.toLowerCase()) return;
  await tx.run(
    `UPDATE taikhoan SET tendangnhap = $1 WHERE manv = $2 AND LOWER(tendangnhap) = LOWER($3)`,
    [newEmail, manv, oldEmail]
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
      const e = await tx.one<any>('SELECT * FROM nhanvien WHERE manv = $1 FOR UPDATE', [rid]);
      if (!e) fail('Không tìm thấy dữ liệu.', 404);
      if (e.trangthai === 'Đã lưu trữ') fail('Hồ sơ nhân viên đã lưu trữ.');
      if (e.manv === u.manv) fail('Không thể lưu trữ hồ sơ của chính bạn.');

      const currentDay = today();
      const activeContract = await tx.one(
        `SELECT mahd FROM hopdong
         WHERE manv = $1 AND ${LIVE_CONTRACT}
           AND (ngayketthuc IS NULL OR ngayketthuc >= $2)`,
        [rid, currentDay]
      );
      if (activeContract) fail('Cần chấm dứt các hợp đồng hiện hành trước khi lưu trữ.');

      const pendingLeave = await tx.one(
        `SELECT madon FROM donnghiphep WHERE manv = $1 AND trangthai = 'Chờ duyệt'`,
        [rid]
      );
      if (pendingLeave) fail('Cần xử lý các đơn nghỉ phép chờ duyệt trước khi lưu trữ.');

      const pendingAssignment = await tx.one(
        `SELECT maqt FROM quatrinhcongtac WHERE manv = $1 AND trangthai = 'Chờ hiệu lực'`,
        [rid]
      );
      if (pendingAssignment) fail('Cần hủy các quyết định công tác chờ hiệu lực trước khi lưu trữ.');

      await tx.run(
        `UPDATE nhanvien SET trangthai = 'Đã lưu trữ', ngayluutru = $1, phienban = phienban + 1 WHERE manv = $2`,
        [currentDay, rid]
      );
      await tx.run('UPDATE phongban SET matruongphong = NULL WHERE matruongphong = $1', [rid]);
      await tx.run('UPDATE taikhoan SET hoatdong = 0 WHERE manv = $1', [rid]);
      await tx.run(
        'DELETE FROM phiendangnhap WHERE matk IN (SELECT matk FROM taikhoan WHERE manv = $1)',
        [rid]
      );
      await auditLog(tx, u.matk, 'Lưu trữ hồ sơ', rid);
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
      const archived = await tx.one<any>('SELECT * FROM nhanvien WHERE manv = $1 FOR UPDATE', [rid]);
      if (!archived) fail('Không tìm thấy dữ liệu.', 404);
      if (archived.trangthai !== 'Đã lưu trữ') fail('Chỉ khôi phục hồ sơ đã lưu trữ.');

      await tx.run(
        `UPDATE nhanvien SET trangthai = 'Đang làm việc', ngayluutru = NULL, phienban = phienban + 1
         WHERE manv = $1`,
        [rid]
      );
      // Trạng thái thật (Thử việc / Đang làm việc) suy ra từ hợp đồng hiện hành, nếu có.
      await syncEmployeeStatuses(tx, rid);
      await auditLog(tx, u.matk, 'Khôi phục hồ sơ', rid);
    });
    // Tài khoản không tự mở lại: quản trị viên mở lại tường minh trong mục Tài khoản.
    res.json({ ok: true, account_locked: true });
  })
);
