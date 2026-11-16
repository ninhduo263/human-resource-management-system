import { Contract, Employee, UserRole } from '../types';

export const ROLE_NAMES: Record<UserRole, string> = {
  admin: 'Quản trị viên',
  hr: 'Cán bộ nhân sự',
  manager: 'Trưởng phòng',
  employee: 'Nhân viên',
  director: 'Ban giám đốc',
};

export function formatDate(v?: string | null): string {
  if (!v) return 'Không xác định';
  try {
    return new Intl.DateTimeFormat('vi-VN').format(new Date(`${v}T00:00:00`));
  } catch {
    return v;
  }
}

export function formatMoney(v?: number | null): string {
  if (v == null) return 'Hạn chế truy cập';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(v);
}

export function daysUntil(targetDate: string, todayStr: string): number {
  return Math.round((Date.parse(targetDate) - Date.parse(todayStr)) / 86400000);
}

export function getContractStatus(c: Contract, todayStr: string): string {
  if (c.status === 'Hiệu lực' && c.end_date && daysUntil(c.end_date, todayStr) <= 30) {
    return 'Sắp hết hạn';
  }
  return c.status;
}

export function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();
}

const AVATAR_BG_HEX = ['#12584b', '#0284c7', '#d97706', '#7c3aed', '#e11d48'];

export function getAvatarHex(id?: string): string {
  const sum = [...String(id || '')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_BG_HEX[sum % AVATAR_BG_HEX.length];
}

export function getAntTagColor(status: string): string {
  if (['Chờ duyệt', 'Thử việc', 'Sắp hết hạn', 'Chưa hiệu lực'].includes(status)) {
    return 'warning';
  }
  if (['Từ chối', 'Hết hạn', 'Đã chấm dứt', 'Đã nghỉ việc'].includes(status)) {
    return 'error';
  }
  if (['Đã lưu trữ', 'Đã hủy', 'Đã hủy bỏ'].includes(status)) {
    return 'default';
  }
  if (['Điều chuyển', 'Bổ nhiệm', 'Điều chuyển và bổ nhiệm'].includes(status)) {
    return 'processing';
  }
  return 'success';
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
) {
  const csvContent =
    '\uFEFF' +
    [headers, ...rows]
      .map((row) =>
        row
          .map((v) => {
            let s = String(v ?? '');
            if (/^[=+\-@\t\r\n]/.test(s)) s = "'" + s;
            return '"' + s.replace(/"/g, '""') + '"';
          })
          .join(',')
      )
      .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function canEdit(role: UserRole): boolean {
  return ['admin', 'hr'].includes(role);
}

export function canAssign(role: UserRole): boolean {
  return ['admin', 'hr', 'director'].includes(role);
}

export function matchEmployeeQuery(
  e: Employee | undefined,
  search: string,
  deptFilter: string
): boolean {
  if (!e) return false;
  if (deptFilter && e.department_id !== deptFilter) return false;
  if (!search.trim()) return true;
  const q = search.trim().toLocaleLowerCase('vi');
  return [e.name, e.id, e.email].some((x) => x.toLocaleLowerCase('vi').includes(q));
}
