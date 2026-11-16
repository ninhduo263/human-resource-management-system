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

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-sky-100 text-sky-800 border-sky-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-rose-100 text-rose-800 border-rose-200',
];

export function getAvatarColor(id?: string): string {
  const sum = [...String(id || '')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export function getStatusBadgeClass(status: string): string {
  if (['Chờ duyệt', 'Thử việc', 'Sắp hết hạn', 'Chưa hiệu lực'].includes(status)) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (['Từ chối', 'Hết hạn', 'Đã chấm dứt'].includes(status)) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  if (['Đã lưu trữ', 'Đã hủy'].includes(status)) {
    return 'bg-slate-100 text-slate-600 border-slate-200';
  }
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
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
