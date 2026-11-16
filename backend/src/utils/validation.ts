export const labels: Record<string, string> = {
  name: 'họ tên / tên',
  birth_date: 'sinh',
  join_date: 'vào làm',
  start_date: 'bắt đầu',
  end_date: 'kết thúc',
  founded_date: 'thành lập',
  signed_date: 'ký',
  effective_date: 'hiệu lực',
  new_end_date: 'kết thúc mới',
  terminated_date: 'chấm dứt',
  salary: 'Mức lương',
  reason: 'lý do',
  number: 'số quyết định',
  signer: 'người ký',
  username: 'tên đăng nhập',
  password: 'mật khẩu',
  current_password: 'mật khẩu hiện tại',
  new_password: 'mật khẩu mới',
  employee_id: 'nhân viên',
  id: 'mã',
  email: 'email',
  phone: 'số điện thoại',
  year: 'Năm',
  total: 'Tổng ngày phép',
  level: 'Cấp bậc',
};

export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function fail(message: string, status = 400): never {
  throw new HttpError(message, status);
}

export const today = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

export function shift(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function calendarDays(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
}

export const text = (b: Record<string, unknown>, k: string, max = 250): string => {
  const val = b[k];
  if (typeof val !== 'string' || !val.trim()) {
    fail(`Vui lòng nhập ${labels[k] || k}.`);
  }
  const trimmed = val.trim();
  if (trimmed.length > max) {
    fail(`${labels[k] || k} quá dài.`);
  }
  return trimmed;
};

export const optional = (b: Record<string, unknown>, k: string, max = 500): string => {
  const v = b[k] ?? '';
  if (typeof v !== 'string' || v.length > max) {
    fail(`Giá trị ${labels[k] || k} không hợp lệ.`);
  }
  return v.trim();
};

export const date = (b: Record<string, unknown>, k: string): string => {
  const v = text(b, k);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(`${v}T00:00:00Z`)) ||
    new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v
  ) {
    fail(`Ngày ${labels[k] || k} không hợp lệ.`);
  }
  return v;
};

export const numeric = (
  b: Record<string, unknown>,
  k: string,
  min: number,
  max: number
): number => {
  const n = Number(b[k]);
  if (!Number.isFinite(n) || n < min || n > max) {
    fail(`${labels[k] || k} phải từ ${min} đến ${max}.`);
  }
  return n;
};

export const choice = <T extends string>(
  b: Record<string, unknown>,
  k: string,
  choices: readonly T[]
): T => {
  const v = text(b, k);
  if (!choices.includes(v as T)) {
    fail(`${labels[k] || k} không hợp lệ.`);
  }
  return v as T;
};
