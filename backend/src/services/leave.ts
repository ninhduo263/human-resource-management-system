import { DbExecutor } from '../db/pool.js';
import type { SessionUser } from '../middleware/auth.js';
import { countWorkingDays } from '../utils/validation.js';

export const BASE_ANNUAL_LEAVE = 12;

export async function loadHolidays(
  tx: DbExecutor,
  start: string,
  end: string
): Promise<Set<string>> {
  const rows = await tx.all<{ ngay: string }>(
    'SELECT ngay FROM ngayle WHERE ngay BETWEEN $1 AND $2',
    [start, end]
  );
  return new Set(rows.map((r) => r.ngay));
}

/** Số ngày làm việc thực tế (bỏ cuối tuần và ngày lễ) trong khoảng nghỉ. */
export async function workingDaysBetween(
  tx: DbExecutor,
  start: string,
  end: string
): Promise<number> {
  return countWorkingDays(start, end, await loadHolidays(tx, start, end));
}

/**
 * Quỹ phép năm mặc định khi chưa có bản ghi songayphep:
 * 12 ngày, +1 ngày cho mỗi 5 năm thâm niên; năm vào làm thì tính theo tỷ lệ
 * số tháng còn lại (làm tròn xuống).
 */
export function defaultEntitlement(ngayvaolam: string, year: number): number {
  const joinYear = Number(ngayvaolam.slice(0, 4));
  if (year < joinYear) return 0;
  if (year === joinYear) {
    const monthsLeft = 12 - Number(ngayvaolam.slice(5, 7)) + 1;
    return Math.floor((BASE_ANNUAL_LEAVE * monthsLeft) / 12);
  }
  return BASE_ANNUAL_LEAVE + Math.floor((year - joinYear) / 5);
}

export async function annualTotal(
  tx: DbExecutor,
  employee: { manv: string; ngayvaolam: string },
  nam: number
): Promise<number> {
  const row = await tx.one<{ tongsongayphep: number }>(
    'SELECT tongsongayphep FROM songayphep WHERE manv = $1 AND nam = $2',
    [employee.manv, nam]
  );
  return row ? Number(row.tongsongayphep) : defaultEntitlement(employee.ngayvaolam, nam);
}

export async function usedAnnualDays(
  tx: DbExecutor,
  manv: string,
  nam: number
): Promise<number> {
  const row = await tx.one<{ n: string }>(
    `SELECT COALESCE(SUM(d.songay), 0) AS n
     FROM donnghiphep d
     JOIN loainghiphep l ON l.maloai = d.maloai
     WHERE d.manv = $1
       AND d.trangthai = 'Đã duyệt'
       AND l.truphepnam = 1
       AND EXTRACT(YEAR FROM d.tungay) = $2`,
    [manv, nam]
  );
  return Number(row?.n ?? 0);
}

/** Duyệt theo tuyến cấp trên: trưởng phòng cùng phòng ban hoặc lãnh đạo cấp cao hơn. */
export function canReviewLeave(
  reviewer: SessionUser & { capbac: number },
  target: { manv: string; mapb: string | null; capbac: number },
  isHeadOfDepartment: boolean
): boolean {
  if (target.manv === reviewer.manv) return false;
  if (reviewer.vaitro === 'admin') return true;
  if (reviewer.capbac <= target.capbac) return false;

  if (reviewer.vaitro === 'manager') {
    return isHeadOfDepartment && reviewer.mapb !== null && target.mapb === reviewer.mapb;
  }
  return reviewer.vaitro === 'director';
}

/** Phòng ban nào đang có trưởng phòng hoặc tài khoản trưởng phòng hoạt động. */
export async function departmentsWithManager(tx: DbExecutor): Promise<Set<string>> {
  const rows = await tx.all<{ mapb: string }>(
    `SELECT mapb FROM phongban WHERE matruongphong IS NOT NULL AND hoatdong = TRUE
     UNION
     SELECT DISTINCT n.mapb
     FROM taikhoan t JOIN nhanvien n ON n.manv = t.manv
     WHERE t.vaitro = 'manager' AND t.hoatdong = 1
       AND n.trangthai NOT IN ('Đã lưu trữ', 'Đã nghỉ việc')
       AND n.mapb IS NOT NULL`
  );
  return new Set(rows.map((r) => r.mapb));
}
