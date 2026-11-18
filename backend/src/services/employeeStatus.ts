import { DbExecutor, auditLog } from '../db/pool.js';
import { today } from '../utils/validation.js';

/** Hợp đồng còn giá trị (chưa chấm dứt, chưa hủy bỏ). */
export const LIVE_CONTRACT = `"TrangThai" NOT IN ('Đã chấm dứt', 'Đã hủy bỏ')`;

/**
 * Trạng thái nhân viên được SUY RA từ hợp đồng hiện hành:
 * hợp đồng thử việc -> "Thử việc", hợp đồng khác -> "Đang làm việc".
 * Chỉ tác động nhân viên đang ở một trong hai trạng thái này; hồ sơ đã nghỉ/lưu trữ không bị đổi.
 */
export async function syncEmployeeStatuses(tx: DbExecutor, MaNV?: string): Promise<void> {
  await tx.run(
    `UPDATE nhanvien n SET "TrangThai" = t.target, "PhienBan" = n."PhienBan" + 1
     FROM (
       SELECT DISTINCT ON (h."MaNV") h."MaNV",
              CASE WHEN h."LoaiHD" = 'Thử việc' THEN 'Thử việc' ELSE 'Đang làm việc' END AS target
       FROM hopdong h
       WHERE h.${LIVE_CONTRACT}
         AND h."NgayBatDau" <= $1
         AND (h."NgayKetThuc" IS NULL OR h."NgayKetThuc" >= $1)
       ORDER BY h."MaNV", h."NgayBatDau" DESC
     ) t
     WHERE t."MaNV" = n."MaNV"
       AND n."TrangThai" IN ('Đang làm việc', 'Thử việc')
       AND n."TrangThai" <> t.target
       AND ($2::text IS NULL OR n."MaNV" = $2)`,
    [today(), MaNV ?? null]
  );
}

/**
 * Chốt chấm dứt hợp đồng (đã có ngaychamdut <= hôm nay):
 * đổi trạng thái hợp đồng, và nếu nhân viên không còn/chưa có hợp đồng nào khác
 * thì chuyển "Đã nghỉ việc" và thu hồi phiên đăng nhập.
 */
export async function finalizeTermination(
  tx: DbExecutor,
  contract: { MaHD: string; MaNV: string },
  actorId: string | null,
  actionLabel: string,
  LoaiChamDut?: string | null
): Promise<void> {
  const day = today();
  await tx.run(`UPDATE hopdong SET "TrangThai" = 'Đã chấm dứt' WHERE "MaHD" = $1`, [contract.MaHD]);
  const remaining = await tx.one<{ MaHD: string }>(
    `SELECT "MaHD" FROM hopdong
     WHERE "MaNV" = $1 AND "MaHD" != $2 AND ${LIVE_CONTRACT}
       AND "NgayBatDau" <= $3
       AND ("NgayKetThuc" IS NULL OR "NgayKetThuc" >= $3)`,
    [contract.MaNV, contract.MaHD, day]
  );
  if (LoaiChamDut === 'Người lao động xin nghỉ' || !remaining) {
    await tx.run(
      `UPDATE nhanvien SET "TrangThai" = 'Đã nghỉ việc', "PhienBan" = "PhienBan" + 1
       WHERE "MaNV" = $1 AND "TrangThai" IN ('Đang làm việc', 'Thử việc')`,
      [contract.MaNV]
    );
    await tx.run(
      'DELETE FROM phiendangnhap WHERE "MaTK" IN (SELECT "MaTK" FROM taikhoan WHERE "MaNV" = $1)',
      [contract.MaNV]
    );
  } else {
    await syncEmployeeStatuses(tx, contract.MaNV);
  }
  await auditLog(tx, actorId, actionLabel, contract.MaHD);
}
