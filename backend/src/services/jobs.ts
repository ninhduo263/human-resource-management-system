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
      mahd: string;
      manv: string;
      loaichamdut: string | null;
    }>(
      `SELECT mahd, manv, loaichamdut FROM hopdong
       WHERE trangthai NOT IN ('Đã chấm dứt', 'Đã hủy bỏ')
         AND ngaychamdut IS NOT NULL AND ngaychamdut <= $1
       ORDER BY ngaychamdut`,
      [day]
    );
    for (const c of terminations) {
      await finalizeTermination(tx, c, null, 'Chấm dứt hợp đồng đến hạn', c.loaichamdut);
    }

    const salaries = await tx.all<{ magh: string; mahd: string; luongmoi: number }>(
      `SELECT g.magh, g.mahd, g.luongmoi
       FROM giahanhopdong g JOIN hopdong h ON h.mahd = g.mahd
       WHERE g.daapdung = FALSE AND g.ngayhieuluc <= $1
         AND h.trangthai NOT IN ('Đã chấm dứt', 'Đã hủy bỏ')
       ORDER BY g.ngayhieuluc, g.langiahan`,
      [day]
    );
    for (const g of salaries) {
      await tx.run('UPDATE hopdong SET mucluong = $1 WHERE mahd = $2', [g.luongmoi, g.mahd]);
      await tx.run('UPDATE giahanhopdong SET daapdung = TRUE WHERE magh = $1', [g.magh]);
    }

    const due = await tx.all<{ maqt: string }>(
      `SELECT maqt FROM quatrinhcongtac
       WHERE trangthai = 'Chờ hiệu lực' AND ngayhieuluc <= $1
       ORDER BY ngayhieuluc, maqt`,
      [day]
    );
    for (const a of due) {
      await applyAssignment(tx, a.maqt, null);
    }

    await syncEmployeeStatuses(tx);
  });
}

export function startJobScheduler(): void {
  const tick = () => runScheduledJobs(true).catch((err) => console.error('[Job Error]:', err));
  void tick();
  setInterval(tick, 15 * 60_000).unref();
}
