import { DbExecutor, auditLog } from '../db/pool.js';
import { today } from '../utils/validation.js';

/** Hợp đồng còn giá trị (chưa chấm dứt, chưa hủy bỏ). */
export const LIVE_CONTRACT = `status NOT IN ('Đã chấm dứt', 'Đã hủy bỏ')`;

/**
 * Trạng thái nhân viên được SUY RA từ hợp đồng hiện hành:
 * hợp đồng thử việc -> "Thử việc", hợp đồng khác -> "Đang làm việc".
 * Chỉ tác động nhân viên đang ở một trong hai trạng thái này; hồ sơ đã nghỉ/lưu trữ không bị đổi.
 */
export async function syncEmployeeStatuses(tx: DbExecutor, employeeId?: string): Promise<void> {
  await tx.run(
    `UPDATE employees e SET status = t.target, version = e.version + 1
     FROM (
       SELECT DISTINCT ON (c.employee_id) c.employee_id,
              CASE WHEN c.type = 'Thử việc' THEN 'Thử việc' ELSE 'Đang làm việc' END AS target
       FROM contracts c
       WHERE c.${LIVE_CONTRACT}
         AND c.start_date <= $1
         AND (c.end_date IS NULL OR c.end_date >= $1)
       ORDER BY c.employee_id, c.start_date DESC
     ) t
     WHERE t.employee_id = e.id
       AND e.status IN ('Đang làm việc', 'Thử việc')
       AND e.status <> t.target
       AND ($2::text IS NULL OR e.id = $2)`,
    [today(), employeeId ?? null]
  );
}

/**
 * Chốt chấm dứt hợp đồng (đã có terminated_date <= hôm nay):
 * đổi trạng thái hợp đồng, và nếu nhân viên không còn/chưa có hợp đồng nào khác
 * thì chuyển "Đã nghỉ việc" và thu hồi phiên đăng nhập.
 */
export async function finalizeTermination(
  tx: DbExecutor,
  contract: { id: string; employee_id: string },
  actorId: string | null,
  actionLabel: string,
  terminationType?: string | null
): Promise<void> {
  const day = today();
  await tx.run(`UPDATE contracts SET status = 'Đã chấm dứt' WHERE id = $1`, [contract.id]);
  const remaining = await tx.one<{ id: string }>(
    `SELECT id FROM contracts
     WHERE employee_id = $1 AND id != $2 AND ${LIVE_CONTRACT}
       AND start_date <= $3
       AND (end_date IS NULL OR end_date >= $3)`,
    [contract.employee_id, contract.id, day]
  );
  if (terminationType === 'Người lao động xin nghỉ' || !remaining) {
    await tx.run(
      `UPDATE employees SET status = 'Đã nghỉ việc', version = version + 1
       WHERE id = $1 AND status IN ('Đang làm việc', 'Thử việc')`,
      [contract.employee_id]
    );
    await tx.run(
      'DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE employee_id = $1)',
      [contract.employee_id]
    );
  } else {
    await syncEmployeeStatuses(tx, contract.employee_id);
  }
  await auditLog(tx, actorId, actionLabel, contract.id);
}
