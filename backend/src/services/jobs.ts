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
      MaHD: string;
      MaNV: string;
      LoaiChamDut: string | null;
    }>(
      `SELECT "MaHD", "MaNV", "LoaiChamDut" FROM "HOPDONG"
       WHERE "TrangThai" NOT IN ('Đã chấm dứt', 'Đã hủy bỏ')
         AND "NgayChamDut" IS NOT NULL AND "NgayChamDut" <= $1
       ORDER BY "NgayChamDut"`,
      [day]
    );
    for (const c of terminations) {
      await finalizeTermination(tx, c, null, 'Chấm dứt hợp đồng đến hạn', c.LoaiChamDut);
    }

    const salaries = await tx.all<{ MaGH: string; MaHD: string; LuongMoi: number }>(
      `SELECT g."MaGH", g."MaHD", g."LuongMoi"
       FROM "GIAHANHOPDONG" g JOIN "HOPDONG" h ON h."MaHD" = g."MaHD"
       WHERE g."DaApDung" = FALSE AND g."NgayHieuLuc" <= $1
         AND h."TrangThai" NOT IN ('Đã chấm dứt', 'Đã hủy bỏ')
       ORDER BY g."NgayHieuLuc", g."LanGiaHan"`,
      [day]
    );
    for (const g of salaries) {
      await tx.run('UPDATE "HOPDONG" SET "MucLuong" = $1 WHERE "MaHD" = $2', [g.LuongMoi, g.MaHD]);
      await tx.run('UPDATE "GIAHANHOPDONG" SET "DaApDung" = TRUE WHERE "MaGH" = $1', [g.MaGH]);
    }

    const due = await tx.all<{ MaQT: string }>(
      `SELECT "MaQT" FROM "QUATRINHCONGTAC"
       WHERE "TrangThai" = 'Chờ hiệu lực' AND "NgayHieuLuc" <= $1
       ORDER BY "NgayHieuLuc", "MaQT"`,
      [day]
    );
    for (const a of due) {
      await applyAssignment(tx, a.MaQT, null);
    }

    await syncEmployeeStatuses(tx);
  });
}

export function startJobScheduler(): void {
  const tick = () => runScheduledJobs(true).catch((err) => console.error('[Job Error]:', err));
  void tick();
  setInterval(tick, 15 * 60_000).unref();
}
