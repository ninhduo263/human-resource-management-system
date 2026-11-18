export const labels: Record<string, string> = {
  HoTen: 'họ tên',
  TenPB: 'tên phòng ban',
  TenCV: 'tên chức vụ',
  TenNgayLe: 'tên ngày lễ',
  NgaySinh: 'sinh',
  NgayVaoLam: 'vào làm',
  NgayBatDau: 'bắt đầu',
  NgayKetThuc: 'kết thúc',
  TuNgay: 'bắt đầu nghỉ',
  DenNgay: 'kết thúc nghỉ',
  NgayThanhLap: 'thành lập',
  NgayKy: 'ký',
  NgayHieuLuc: 'hiệu lực',
  NgayKetThucMoi: 'kết thúc mới',
  NgayChamDut: 'chấm dứt',
  Ngay: 'ngày lễ',
  MucLuong: 'Mức lương',
  LyDo: 'lý do',
  LyDoChamDut: 'lý do chấm dứt',
  LyDoHuy: 'lý do hủy',
  SoQD: 'số quyết định',
  NguoiKy: 'người ký',
  TenDangNhap: 'tên đăng nhập',
  MatKhau: 'mật khẩu',
  matkhauhientai: 'mật khẩu hiện tại',
  matkhaumoi: 'mật khẩu mới',
  MaNV: 'nhân viên',
  MaPB: 'phòng ban',
  MaCV: 'chức vụ',
  MaPBMoi: 'phòng ban mới',
  MaCVMoi: 'chức vụ mới',
  MaLoai: 'loại nghỉ phép',
  MaTruongPhong: 'trưởng phòng',
  Email: 'Email',
  SoDienThoai: 'số điện thoại',
  GioiTinh: 'giới tính',
  TrangThai: 'trạng thái',
  VaiTro: 'vai trò',
  VaiTroMacDinh: 'vai trò mặc định',
  LoaiHD: 'loại hợp đồng',
  LoaiChamDut: 'hình thức chấm dứt',
  LoaiBienDong: 'loại biến động',
  Nam: 'Năm',
  TongSoNgayPhep: 'Tổng ngày phép',
  CapBac: 'Cấp bậc',
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

// ---- Ngày làm việc, kiểm tra định dạng dùng chung ----

/** Các thứ làm việc trong tuần (0 = Chủ nhật ... 6 = Thứ bảy). Cấu hình qua WORKING_DAYS, mặc định Thứ 2-Thứ 6. */
export const WORKING_WEEKDAYS: Set<number> = new Set(
  (process.env.WORKING_DAYS || '1,2,3,4,5')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isInteger(x) && x >= 0 && x <= 6)
);

export function isWorkingDay(day: string, holidays: ReadonlySet<string> = new Set()): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return WORKING_WEEKDAYS.has(weekday) && !holidays.has(day);
}

export function countWorkingDays(
  start: string,
  end: string,
  holidays: ReadonlySet<string> = new Set()
): number {
  let count = 0;
  for (let d = start; d <= end; d = shift(d, 1)) {
    if (isWorkingDay(d, holidays)) count++;
  }
  return count;
}

export function nextWorkingDay(from: string, holidays: ReadonlySet<string> = new Set()): string {
  let d = from;
  while (!isWorkingDay(d, holidays)) d = shift(d, 1);
  return d;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_PATTERN = /^(\+84|0)[\d .-]{8,13}$/;

export function assertContact(phone: string, Email: string): void {
  if (!PHONE_PATTERN.test(phone) || phone.replace(/\D/g, '').length < 9) {
    fail('Số điện thoại không hợp lệ (dạng 0xxxxxxxxx hoặc +84xxxxxxxxx).');
  }
  if (!EMAIL_PATTERN.test(Email)) {
    fail('Email không hợp lệ.');
  }
}

export const MIN_WORKING_AGE = 15;

/** Tuổi tính theo năm tại một ngày. */
export function ageAt(birth: string, at: string): number {
  const b = new Date(`${birth}T00:00:00Z`);
  const a = new Date(`${at}T00:00:00Z`);
  let age = a.getUTCFullYear() - b.getUTCFullYear();
  if (
    a.getUTCMonth() < b.getUTCMonth() ||
    (a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() < b.getUTCDate())
  ) {
    age--;
  }
  return age;
}

/** Cộng số tháng vào một ngày (giữ nguyên ngày trong tháng, cắt về cuối tháng nếu cần). */
export function addMonths(day: string, months: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dayOfMonth = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dayOfMonth, last));
  return d.toISOString().slice(0, 10);
}

export const optionalDate = (b: Record<string, unknown>, k: string): string | null => {
  const v = b[k];
  if (v === undefined || v === null || v === '') return null;
  return date(b, k);
};
