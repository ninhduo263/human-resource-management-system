import { DbExecutor, auditLog } from '../db/pool.js';
import { today } from '../utils/validation.js';

interface PositionRow {
  MaCV: string;
  VaiTroMacDinh: string | null;
}

/**
 * Đồng bộ phân quyền và trưởng phòng sau khi nhân viên đổi phòng ban/chức vụ.
 * - Chức vụ có vaitromacdinh -> vai trò tài khoản theo đó (không đụng admin/hr).
 * - Không còn là trưởng phòng của phòng cũ; chức vụ "manager" tự thành trưởng phòng mới nếu phòng chưa có.
 */
export async function syncRoleAndHead(
  tx: DbExecutor,
  MaNV: string,
  mapbMoi: string | null,
  position: PositionRow,
  actorId: string | null
): Promise<void> {
  const user = await tx.one<{ MaTK: string; VaiTro: string }>(
    'SELECT "MaTK", "VaiTro" FROM "TAIKHOAN" WHERE "MaNV" = $1',
    [MaNV]
  );
  let role = user?.VaiTro ?? null;
  if (
    user &&
    position.VaiTroMacDinh &&
    ['employee', 'manager', 'director'].includes(user.VaiTro) &&
    user.VaiTro !== position.VaiTroMacDinh
  ) {
    await tx.run('UPDATE "TAIKHOAN" SET "VaiTro" = $1 WHERE "MaTK" = $2', [position.VaiTroMacDinh, user.MaTK]);
    await auditLog(tx, actorId, 'Đồng bộ vai trò theo chức vụ', user.MaTK, {
      VaiTro: { from: user.VaiTro, to: position.VaiTroMacDinh },
    });
    role = position.VaiTroMacDinh;
  }

  // Bỏ vai trò trưởng phòng ở mọi phòng không còn phù hợp.
  await tx.run(
    `UPDATE "PHONGBAN" SET "MaTruongPhong" = NULL
     WHERE "MaTruongPhong" = $1 AND ("MaPB" IS DISTINCT FROM $2 OR $3::text IS DISTINCT FROM 'manager')`,
    [MaNV, mapbMoi, role]
  );
  if (role === 'manager' && mapbMoi) {
    await tx.run('UPDATE "PHONGBAN" SET "MaTruongPhong" = $1 WHERE "MaPB" = $2 AND "MaTruongPhong" IS NULL', [
      MaNV,
      mapbMoi,
    ]);
  }
}

/** Áp dụng một bản ghi công tác cho hồ sơ nhân viên (cho cả ghi nhận ngay lẫn quyết định đến hạn). */
export async function applyAssignment(
  tx: DbExecutor,
  MaQT: string,
  actorId: string | null
): Promise<boolean> {
  const a = await tx.one<any>('SELECT * FROM "QUATRINHCONGTAC" WHERE "MaQT" = $1 FOR UPDATE', [MaQT]);
  if (!a || a.TrangThai !== 'Chờ hiệu lực') return false;
  const e = await tx.one<any>('SELECT * FROM "NHANVIEN" WHERE "MaNV" = $1 FOR UPDATE', [a.MaNV]);
  if (!e || ['Đã lưu trữ', 'Đã nghỉ việc'].includes(e.TrangThai)) {
    await tx.run(
      `UPDATE "QUATRINHCONGTAC" SET "TrangThai" = 'Đã hủy', "NgayHuy" = $1, "LyDoHuy" = $2 WHERE "MaQT" = $3`,
      [today(), 'Nhân viên không còn làm việc tại thời điểm quyết định có hiệu lực', a.MaQT]
    );
    return false;
  }
  const position = await tx.one<PositionRow>('SELECT "MaCV", "VaiTroMacDinh" FROM "CHUCVU" WHERE "MaCV" = $1', [
    a.MaCVMoi,
  ]);
  await tx.run(
    `UPDATE "QUATRINHCONGTAC" SET "TrangThai" = 'Hiệu lực', "MaPBCu" = $1, "MaCVCu" = $2 WHERE "MaQT" = $3`,
    [e.MaPB, e.MaCV, a.MaQT]
  );
  await tx.run(
    'UPDATE "NHANVIEN" SET "MaPB" = $1, "MaCV" = $2, "PhienBan" = "PhienBan" + 1 WHERE "MaNV" = $3',
    [a.MaPBMoi, a.MaCVMoi, e.MaNV]
  );
  await syncRoleAndHead(tx, e.MaNV, a.MaPBMoi, position!, actorId);
  await auditLog(tx, actorId, 'Áp dụng quyết định công tác', a.MaQT);
  return true;
}
