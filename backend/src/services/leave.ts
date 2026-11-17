import { DbExecutor } from '../db/pool.js';
import type { SessionUser } from '../middleware/auth.js';
import { countWorkingDays } from '../utils/validation.js';

export const BASE_ANNUAL_LEAVE = 12;

export async function loadHolidays(
  tx: DbExecutor,
  start: string,
  end: string
): Promise<Set<string>> {
  const rows = await tx.all<{ day: string }>(
    'SELECT day FROM holidays WHERE day BETWEEN $1 AND $2',
    [start, end]
  );
  return new Set(rows.map((r) => r.day));
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
 * Quỹ phép năm mặc định khi chưa có bản ghi leave_balances:
 * 12 ngày, +1 ngày cho mỗi 5 năm thâm niên; năm vào làm thì tính theo tỷ lệ
 * số tháng còn lại (làm tròn xuống).
 */
export function defaultEntitlement(joinDate: string, year: number): number {
  const joinYear = Number(joinDate.slice(0, 4));
  if (year < joinYear) return 0;
  if (year === joinYear) {
    const monthsLeft = 12 - Number(joinDate.slice(5, 7)) + 1;
    return Math.floor((BASE_ANNUAL_LEAVE * monthsLeft) / 12);
  }
  return BASE_ANNUAL_LEAVE + Math.floor((year - joinYear) / 5);
}

export async function annualTotal(
  tx: DbExecutor,
  employee: { id: string; join_date: string },
  year: number
): Promise<number> {
  const row = await tx.one<{ total: number }>(
    'SELECT total FROM leave_balances WHERE employee_id = $1 AND year = $2',
    [employee.id, year]
  );
  return row ? Number(row.total) : defaultEntitlement(employee.join_date, year);
}

export async function usedAnnualDays(
  tx: DbExecutor,
  employeeId: string,
  year: number
): Promise<number> {
  const row = await tx.one<{ n: string }>(
    `SELECT COALESCE(SUM(l.days), 0) AS n
     FROM leave_requests l
     JOIN leave_types t ON t.id = l.type_id
     WHERE l.employee_id = $1
       AND l.status = 'Đã duyệt'
       AND t.deduct_annual = 1
       AND EXTRACT(YEAR FROM l.start_date) = $2`,
    [employeeId, year]
  );
  return Number(row?.n ?? 0);
}

/**
 * Ai được duyệt đơn nghỉ phép của ai (không bao giờ tự duyệt):
 *  - admin: mọi đơn.
 *  - trưởng phòng: nhân viên thuộc phòng ban mình làm trưởng phòng (hoặc cùng phòng).
 *  - giám đốc: trưởng phòng, hoặc nhân viên thuộc phòng chưa có trưởng phòng.
 *  - nhân sự: giám đốc, hoặc nhân viên thuộc phòng chưa có trưởng phòng.
 */
export function canReviewLeave(
  u: SessionUser,
  target: { id: string; department_id: string | null },
  targetRole: string | null,
  departmentHasManager: boolean,
  isHeadOfDepartment: boolean = false
): boolean {
  if (target.id === u.employee_id) return false;
  switch (u.role) {
    case 'admin':
      return true;
    case 'manager':
      return (
        isHeadOfDepartment || (
          u.department_id !== null &&
          target.department_id === u.department_id &&
          targetRole !== 'manager' &&
          targetRole !== 'director'
        )
      );
    case 'director':
      return targetRole === 'manager' || (!departmentHasManager && targetRole !== 'director');
    case 'hr':
      return targetRole === 'director' || (!departmentHasManager && targetRole !== 'manager');
    default:
      return false;
  }
}

/** Phòng ban nào đang có trưởng phòng hoặc tài khoản trưởng phòng hoạt động. */
export async function departmentsWithManager(tx: DbExecutor): Promise<Set<string>> {
  const rows = await tx.all<{ department_id: string }>(
    `SELECT id AS department_id FROM departments WHERE head_id IS NOT NULL AND active = TRUE
     UNION
     SELECT DISTINCT e.department_id
     FROM users u JOIN employees e ON e.id = u.employee_id
     WHERE u.role = 'manager' AND u.active = 1
       AND e.status NOT IN ('Đã lưu trữ', 'Đã nghỉ việc')
       AND e.department_id IS NOT NULL`
  );
  return new Set(rows.map((r) => r.department_id));
}
