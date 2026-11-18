import { withTransaction } from '../db/pool.js';
import { today } from '../utils/validation.js';
import { applyAssignment } from './assignments.js';
import { finalizeTermination, syncEmployeeStatuses } from './employeeStatus.js';

let lastRun = 0;

/**
 * Các việc đến hạn theo ngày: chấm dứt hợp đồng đã lên lịch, phụ lục lương có hiệu lực,
 * quyết định công tác có hiệu lực và đồng bộ trạng thái nhân viên theo hợp đồng.
 * Idempotent; an toàn khi nhiều tiến trình chạy đồng thời nhờ advisory lock.
 */
export async function runScheduledJobs(force = false): Promise<void> {
  if (!force && Date.now() - lastRun < 60_000) return;
  lastRun = Date.now();
  await withTransaction(async (tx) => {
    const lock = await tx.one<{ ok: boolean }>(
      `SELECT pg_try_advisory_xact_lock(hashtext('peopleops:jobs')) AS ok`
    );
    if (!lock?.ok) return;
    const day = today();

    const terminations = await tx.all<{
      id: string;
      employee_id: string;
      termination_type: string | null;
    }>(
      `SELECT id, employee_id, termination_type FROM contracts
       WHERE status NOT IN ('Đã chấm dứt', 'Đã hủy bỏ')
         AND terminated_date IS NOT NULL AND terminated_date <= $1
       ORDER BY terminated_date`,
      [day]
    );
    for (const c of terminations) {
      await finalizeTermination(
        tx,
        c,
        null,
        'Chấm dứt hợp đồng đến hạn',
        c.termination_type
      );
    }

    const due = await tx.all<{ id: string }>(
      `SELECT id FROM assignments
       WHERE status = 'Chờ hiệu lực' AND effective_date <= $1
       ORDER BY effective_date, id`,
      [day]
    );
    for (const a of due) {
      await applyAssignment(tx, a.id, null);
    }

    await syncEmployeeStatuses(tx);
  });
}

export function startJobScheduler(): void {
  const tick = () => runScheduledJobs(true).catch((err) => console.error('[Job Error]:', err));
  void tick();
  setInterval(tick, 15 * 60_000).unref();
}
