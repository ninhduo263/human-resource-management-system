import { DbExecutor } from '../db/pool.js';
import type { SessionUser } from '../middleware/auth.js';
import { countWorkingDays } from '../utils/validation.js';

export const BASE_ANNUAL_LEAVE = 12;

export async function loadHolidays(
  tx: DbExecutor,
  start: string,
  end: string
): Promise<Set<string>> {
  const rows = await tx.all<{ Ngay: string }>(
    'SELECT "Ngay" FROM ngayle WHERE "Ngay" BETWEEN $1 AND $2',
    [start, end]
  );
  return new Set(rows.map((r) => r.Ngay));
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
export function defaultEntitlement(NgayVaoLam: string, year: number): number {
  const joinYear = Number(NgayVaoLam.slice(0, 4));
  if (year < joinYear) return 0;
  if (year === joinYear) {
    const monthsLeft = 12 - Number(NgayVaoLam.slice(5, 7)) + 1;
    return Math.floor((BASE_ANNUAL_LEAVE * monthsLeft) / 12);
  }
  return BASE_ANNUAL_LEAVE + Math.floor((year - joinYear) / 5);
}

export async function annualTotal(
  tx: DbExecutor,
  employee: { MaNV: string; NgayVaoLam: string },
  Nam: number
): Promise<number> {
  const row = await tx.one<{ TongSoNgayPhep: number }>(
    'SELECT "TongSoNgayPhep" FROM songayphep WHERE "MaNV" = $1 AND "Nam" = $2',
    [employee.MaNV, Nam]
  );
  return row ? Number(row.TongSoNgayPhep) : defaultEntitlement(employee.NgayVaoLam, Nam);
}

export async function usedAnnualDays(
  tx: DbExecutor,
  MaNV: string,
  Nam: number
): Promise<number> {
  const row = await tx.one<{ n: string }>(
    `SELECT COALESCE(SUM(d."SoNgay"), 0) AS n
     FROM donnghiphep d
     JOIN loainghiphep l ON l."MaLoai" = d."MaLoai"
     WHERE d."MaNV" = $1
       AND d."TrangThai" = 'Đã duyệt'
       AND l."TruPhepNam" = 1
       AND EXTRACT(YEAR FROM d."TuNgay") = $2`,
    [MaNV, Nam]
  );
  return Number(row?.n ?? 0);
}

/** Duyệt theo tuyến cấp trên: trưởng phòng cùng phòng ban hoặc lãnh đạo cấp cao hơn. */
export function canReviewLeave(
  reviewer: SessionUser & { CapBac: number },
  target: { MaNV: string; MaPB: string | null; CapBac: number },
  isHeadOfDepartment: boolean
): boolean {
  if (target.MaNV === reviewer.MaNV) return false;
  if (reviewer.VaiTro === 'admin') return true;
  if (reviewer.CapBac <= target.CapBac) return false;

  if (reviewer.VaiTro === 'manager') {
    return isHeadOfDepartment && reviewer.MaPB !== null && target.MaPB === reviewer.MaPB;
  }
  return reviewer.VaiTro === 'director';
}

/** Phòng ban nào đang có trưởng phòng hoặc tài khoản trưởng phòng hoạt động. */
export async function departmentsWithManager(tx: DbExecutor): Promise<Set<string>> {
  const rows = await tx.all<{ MaPB: string }>(
    `SELECT "MaPB" FROM phongban WHERE "MaTruongPhong" IS NOT NULL AND "HoatDong" = TRUE
     UNION
     SELECT DISTINCT n."MaPB"
     FROM taikhoan t JOIN nhanvien n ON n."MaNV" = t."MaNV"
     WHERE t."VaiTro" = 'manager' AND t."HoatDong" = 1
       AND n."TrangThai" NOT IN ('Đã lưu trữ', 'Đã nghỉ việc')
       AND n."MaPB" IS NOT NULL`
  );
  return new Set(rows.map((r) => r.MaPB));
}
