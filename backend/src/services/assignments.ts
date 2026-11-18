import { DbExecutor, auditLog } from '../db/pool.js';
import { today } from '../utils/validation.js';

interface PositionRow {
  macv: string;
  vaitromacdinh: string | null;
}

/**
 * Đồng bộ phân quyền và trưởng phòng sau khi nhân viên đổi phòng ban/chức vụ.
 * - Chức vụ có vaitromacdinh -> vai trò tài khoản theo đó (không đụng admin/hr).
 * - Không còn là trưởng phòng của phòng cũ; chức vụ "manager" tự thành trưởng phòng mới nếu phòng chưa có.
 */
export async function syncRoleAndHead(
  tx: DbExecutor,
  manv: string,
  mapbMoi: string | null,
  position: PositionRow,
  actorId: string | null
): Promise<void> {
  const user = await tx.one<{ matk: string; vaitro: string }>(
    'SELECT matk, vaitro FROM taikhoan WHERE manv = $1',
    [manv]
  );
  let role = user?.vaitro ?? null;
  if (
    user &&
    position.vaitromacdinh &&
    ['employee', 'manager', 'director'].includes(user.vaitro) &&
    user.vaitro !== position.vaitromacdinh
  ) {
    await tx.run('UPDATE taikhoan SET vaitro = $1 WHERE matk = $2', [position.vaitromacdinh, user.matk]);
    await auditLog(tx, actorId, 'Đồng bộ vai trò theo chức vụ', user.matk, {
      vaitro: { from: user.vaitro, to: position.vaitromacdinh },
    });
    role = position.vaitromacdinh;
  }

  // Bỏ vai trò trưởng phòng ở mọi phòng không còn phù hợp.
  await tx.run(
    `UPDATE phongban SET matruongphong = NULL
     WHERE matruongphong = $1 AND (mapb IS DISTINCT FROM $2 OR $3::text IS DISTINCT FROM 'manager')`,
    [manv, mapbMoi, role]
  );
  if (role === 'manager' && mapbMoi) {
    await tx.run('UPDATE phongban SET matruongphong = $1 WHERE mapb = $2 AND matruongphong IS NULL', [
      manv,
      mapbMoi,
    ]);
  }
}

/** Áp dụng một bản ghi công tác cho hồ sơ nhân viên (cho cả ghi nhận ngay lẫn quyết định đến hạn). */
export async function applyAssignment(
  tx: DbExecutor,
  maqt: string,
  actorId: string | null
): Promise<boolean> {
  const a = await tx.one<any>('SELECT * FROM quatrinhcongtac WHERE maqt = $1 FOR UPDATE', [maqt]);
  if (!a || a.trangthai !== 'Chờ hiệu lực') return false;
  const e = await tx.one<any>('SELECT * FROM nhanvien WHERE manv = $1 FOR UPDATE', [a.manv]);
  if (!e || ['Đã lưu trữ', 'Đã nghỉ việc'].includes(e.trangthai)) {
    await tx.run(
      `UPDATE quatrinhcongtac SET trangthai = 'Đã hủy', ngayhuy = $1, lydohuy = $2 WHERE maqt = $3`,
      [today(), 'Nhân viên không còn làm việc tại thời điểm quyết định có hiệu lực', a.maqt]
    );
    return false;
  }
  const position = await tx.one<PositionRow>('SELECT macv, vaitromacdinh FROM chucvu WHERE macv = $1', [
    a.macvmoi,
  ]);
  await tx.run(
    `UPDATE quatrinhcongtac SET trangthai = 'Hiệu lực', mapbcu = $1, macvcu = $2 WHERE maqt = $3`,
    [e.mapb, e.macv, a.maqt]
  );
  await tx.run(
    'UPDATE nhanvien SET mapb = $1, macv = $2, phienban = phienban + 1 WHERE manv = $3',
    [a.mapbmoi, a.macvmoi, e.manv]
  );
  await syncRoleAndHead(tx, e.manv, a.mapbmoi, position!, actorId);
  await auditLog(tx, actorId, 'Áp dụng quyết định công tác', a.maqt);
  return true;
}
