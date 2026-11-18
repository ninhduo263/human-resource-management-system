import { DbExecutor, auditLog } from '../db/pool.js';
import { today } from '../utils/validation.js';

/** Hợp đồng còn giá trị (chưa chấm dứt, chưa hủy bỏ). */
export const LIVE_CONTRACT = `trangthai NOT IN ('Đã chấm dứt', 'Đã hủy bỏ')`;

/**
 * Trạng thái nhân viên được SUY RA từ hợp đồng hiện hành:
 * hợp đồng thử việc -> "Thử việc", hợp đồng khác -> "Đang làm việc".
 * Chỉ tác động nhân viên đang ở một trong hai trạng thái này; hồ sơ đã nghỉ/lưu trữ không bị đổi.
 */
export async function syncEmployeeStatuses(tx: DbExecutor, manv?: string): Promise<void> {
  await tx.run(
    `UPDATE nhanvien n SET trangthai = t.target, phienban = n.phienban + 1
     FROM (
       SELECT DISTINCT ON (h.manv) h.manv,
              CASE WHEN h.loaihd = 'Thử việc' THEN 'Thử việc' ELSE 'Đang làm việc' END AS target
       FROM hopdong h
       WHERE h.${LIVE_CONTRACT}
         AND h.ngaybatdau <= $1
         AND (h.ngayketthuc IS NULL OR h.ngayketthuc >= $1)
       ORDER BY h.manv, h.ngaybatdau DESC
     ) t
     WHERE t.manv = n.manv
       AND n.trangthai IN ('Đang làm việc', 'Thử việc')
       AND n.trangthai <> t.target
       AND ($2::text IS NULL OR n.manv = $2)`,
    [today(), manv ?? null]
  );
}

/**
 * Chốt chấm dứt hợp đồng (đã có ngaychamdut <= hôm nay):
 * đổi trạng thái hợp đồng, và nếu nhân viên không còn/chưa có hợp đồng nào khác
 * thì chuyển "Đã nghỉ việc" và thu hồi phiên đăng nhập.
 */
export async function finalizeTermination(
  tx: DbExecutor,
  contract: { mahd: string; manv: string },
  actorId: string | null,
  actionLabel: string,
  loaichamdut?: string | null
): Promise<void> {
  const day = today();
  await tx.run(`UPDATE hopdong SET trangthai = 'Đã chấm dứt' WHERE mahd = $1`, [contract.mahd]);
  const remaining = await tx.one<{ mahd: string }>(
    `SELECT mahd FROM hopdong
     WHERE manv = $1 AND mahd != $2 AND ${LIVE_CONTRACT}
       AND ngaybatdau <= $3
       AND (ngayketthuc IS NULL OR ngayketthuc >= $3)`,
    [contract.manv, contract.mahd, day]
  );
  if (loaichamdut === 'Người lao động xin nghỉ' || !remaining) {
    await tx.run(
      `UPDATE nhanvien SET trangthai = 'Đã nghỉ việc', phienban = phienban + 1
       WHERE manv = $1 AND trangthai IN ('Đang làm việc', 'Thử việc')`,
      [contract.manv]
    );
    await tx.run(
      'DELETE FROM phiendangnhap WHERE matk IN (SELECT matk FROM taikhoan WHERE manv = $1)',
      [contract.manv]
    );
  } else {
    await syncEmployeeStatuses(tx, contract.manv);
  }
  await auditLog(tx, actorId, actionLabel, contract.mahd);
}
