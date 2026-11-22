import { db } from '../db/pool.js';
import { shift } from '../utils/validation.js';
import type { buildScopedState } from '../routes/auth.routes.js';

/**
 * Các công cụ tra cứu CHỈ ĐỌC cho Trợ lý HR.
 * Mọi công cụ đọc từ `buildScopedState(user)` — tức dữ liệu ĐÃ được lọc theo vai trò
 * (nhân viên chỉ thấy mình, trưởng phòng thấy phòng mình, lương người khác bị ẩn...).
 * Vì vậy mô hình AI không bao giờ "nhìn thấy" dữ liệu mà người hỏi không có quyền xem.
 */
export type ScopedState = Awaited<ReturnType<typeof buildScopedState>>;

const MAX_ROWS = 40;
const ACTIVE = ['Đang làm việc', 'Thử việc'];

/** Bỏ dấu tiếng Việt + chữ thường để so khớp tên ("nguyen van a" khớp "Nguyễn Văn A"). */
export const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

function helpers(s: ScopedState) {
  const dept = (id: string | null) => s.departments.find((d: any) => d.MaPB === id)?.TenPB || 'Không thuộc phòng ban';
  const pos = (id: string) => s.positions.find((p: any) => p.MaCV === id)?.TenCV || id;
  const empName = (id: string | null) => (id ? s.employees.find((e: any) => e.MaNV === id)?.HoTen || id : null);
  const leaveType = (id: string) => s.leaveTypes.find((t: any) => t.MaLoai === id)?.TenLoai || id;
  return { dept, pos, empName, leaveType };
}

function matchDept(s: ScopedState, ref?: string): string[] | null {
  if (!ref) return null;
  const q = norm(ref);
  return s.departments
    .filter((d: any) => norm(d.MaPB) === q || norm(d.TenPB).includes(q))
    .map((d: any) => d.MaPB);
}

/** Tìm nhân viên theo mã/tên/email TRONG PHẠM VI được xem. */
function resolveEmployee(s: ScopedState, ref?: string): { emp?: any; error?: string } {
  if (!ref || ['toi', 'minh', 'ban than', 'me', 'self'].includes(norm(ref))) {
    return { emp: s.employees.find((e: any) => e.MaNV === s.user.MaNV) };
  }
  const q = norm(ref);
  const exact = s.employees.find((e: any) => norm(e.MaNV) === q || norm(e.Email) === q || norm(e.HoTen) === q);
  if (exact) return { emp: exact };
  const partial = s.employees.filter((e: any) => norm(e.HoTen).includes(q));
  if (partial.length === 1) return { emp: partial[0] };
  if (partial.length > 1) {
    return {
      error: `Có ${partial.length} nhân viên khớp "${ref}": ${partial
        .slice(0, 8)
        .map((e: any) => `${e.HoTen} (${e.MaNV})`)
        .join(', ')}. Hãy hỏi lại cụ thể hơn.`,
    };
  }
  return {
    error: `Không tìm thấy nhân viên "${ref}" trong phạm vi dữ liệu mà ${s.user.HoTen} được phép xem.`,
  };
}

const overlaps = (aFrom: string, aTo: string, bFrom: string, bTo: string) => aFrom <= bTo && aTo >= bFrom;

// ---------------------------------------------------------------------------
// Các công cụ
// ---------------------------------------------------------------------------

export function getMyProfile(s: ScopedState) {
  const h = helpers(s);
  const e: any = s.employees.find((x: any) => x.MaNV === s.user.MaNV);
  if (!e) return { error: 'Không tìm thấy hồ sơ của người dùng hiện tại.' };
  const year = Number(s.today.slice(0, 4));
  const contract = s.contracts.find((c: any) => c.MaNV === e.MaNV && c.TrangThai === 'Hiệu lực');
  const balance = s.balances.find((b: any) => b.MaNV === e.MaNV && b.Nam === year);
  return {
    MaNV: e.MaNV,
    HoTen: e.HoTen,
    VaiTroHeThong: s.user.VaiTro,
    PhongBan: h.dept(e.MaPB),
    ChucVu: h.pos(e.MaCV),
    NgayVaoLam: e.NgayVaoLam,
    TrangThai: e.TrangThai,
    Email: e.Email,
    SoDienThoai: e.SoDienThoai,
    HopDongHienTai: contract
      ? {
          MaHD: contract.MaHD,
          LoaiHD: contract.LoaiHD,
          NgayBatDau: contract.NgayBatDau,
          NgayKetThuc: contract.NgayKetThuc,
          MucLuong: contract.MucLuong,
        }
      : null,
    QuyPhepNamNay: balance || null,
  };
}

export function findEmployees(s: ScopedState, input: { query?: string; department?: string; status?: string }) {
  const h = helpers(s);
  const depts = matchDept(s, input.department);
  const q = norm(input.query);
  const rows = s.employees
    .filter((e: any) => !q || [e.HoTen, e.MaNV, e.Email].some((x) => norm(x).includes(q)))
    .filter((e: any) => !depts || depts.includes(e.MaPB))
    .filter((e: any) => (input.status ? norm(e.TrangThai) === norm(input.status) : e.TrangThai !== 'Đã lưu trữ'))
    .map((e: any) => ({
      MaNV: e.MaNV,
      HoTen: e.HoTen,
      PhongBan: h.dept(e.MaPB),
      ChucVu: h.pos(e.MaCV),
      TrangThai: e.TrangThai,
      Email: e.Email,
      NgayVaoLam: e.NgayVaoLam,
    }));
  return { tongSo: rows.length, danhSach: rows.slice(0, MAX_ROWS), phamViXem: scopeLabel(s) };
}

export function getLeaveBalance(s: ScopedState, input: { employee?: string; year?: number }) {
  const r = resolveEmployee(s, input.employee);
  if (!r.emp) return { error: r.error };
  const year = input.year || Number(s.today.slice(0, 4));
  const b = s.balances.find((x: any) => x.MaNV === r.emp.MaNV && x.Nam === year);
  const pending = s.leaves
    .filter((l: any) => l.MaNV === r.emp.MaNV && l.TrangThai === 'Chờ duyệt' && l.TuNgay.startsWith(String(year)))
    .reduce((sum: number, l: any) => sum + Number(l.SoNgay), 0);
  return {
    NhanVien: r.emp.HoTen,
    Nam: year,
    TongSoNgayPhep: b?.TongSoNgayPhep ?? null,
    SoNgayDaNghi: b?.SoNgayDaNghi ?? 0,
    SoNgayConLai: b?.SoNgayConLai ?? null,
    SoNgayDangChoDuyet: pending,
    GhiChu: 'Chỉ loại nghỉ có "trừ phép năm" và đơn đã duyệt mới trừ vào quỹ phép.',
  };
}

export function listLeaveRequests(
  s: ScopedState,
  input: { employee?: string; status?: string; from?: string; to?: string; only_waiting_for_me?: boolean }
) {
  const h = helpers(s);
  let target: any = null;
  if (input.employee) {
    const r = resolveEmployee(s, input.employee);
    if (!r.emp) return { error: r.error };
    target = r.emp;
  }
  const rows = s.leaves
    .filter((l: any) => !target || l.MaNV === target.MaNV)
    .filter((l: any) => !input.status || norm(l.TrangThai) === norm(input.status))
    .filter((l: any) => !input.only_waiting_for_me || l.coquyenduyet)
    .filter((l: any) => overlaps(l.TuNgay, l.DenNgay, input.from || '0000-01-01', input.to || '9999-12-31'))
    .map((l: any) => ({
      MaDon: l.MaDon,
      NhanVien: h.empName(l.MaNV),
      LoaiNghi: h.leaveType(l.MaLoai),
      TuNgay: l.TuNgay,
      DenNgay: l.DenNgay,
      SoNgay: Number(l.SoNgay),
      TrangThai: l.TrangThai,
      NgayNop: l.NgayNop,
      NguoiDuyet: l.tennguoiduyet,
      BanCoQuyenDuyet: !!l.coquyenduyet,
    }));
  return { tongSo: rows.length, danhSach: rows.slice(0, MAX_ROWS) };
}

export function whoIsOnLeave(
  s: ScopedState,
  input: { from?: string; to?: string; department?: string; include_pending?: boolean }
) {
  const h = helpers(s);
  const from = input.from || s.today;
  const to = input.to || from;
  const depts = matchDept(s, input.department);
  const statuses = input.include_pending ? ['Đã duyệt', 'Chờ duyệt'] : ['Đã duyệt'];
  const rows = s.leaves
    .filter((l: any) => statuses.includes(l.TrangThai) && overlaps(l.TuNgay, l.DenNgay, from, to))
    .filter((l: any) => {
      const e: any = s.employees.find((x: any) => x.MaNV === l.MaNV);
      return !depts || (e && depts.includes(e.MaPB));
    })
    .map((l: any) => {
      const e: any = s.employees.find((x: any) => x.MaNV === l.MaNV);
      return {
        NhanVien: e?.HoTen || l.MaNV,
        PhongBan: h.dept(e?.MaPB ?? null),
        LoaiNghi: h.leaveType(l.MaLoai),
        TuNgay: l.TuNgay,
        DenNgay: l.DenNgay,
        TrangThai: l.TrangThai,
      };
    });
  return { khoangThoiGian: { from, to }, soNguoi: new Set(rows.map((r) => r.NhanVien)).size, danhSach: rows.slice(0, MAX_ROWS) };
}

export function listContracts(
  s: ScopedState,
  input: { employee?: string; expiring_within_days?: number; status?: string }
) {
  const h = helpers(s);
  let target: any = null;
  if (input.employee) {
    const r = resolveEmployee(s, input.employee);
    if (!r.emp) return { error: r.error };
    target = r.emp;
  }
  const limit = input.expiring_within_days != null ? shift(s.today, input.expiring_within_days) : null;
  const rows = s.contracts
    .filter((c: any) => !target || c.MaNV === target.MaNV)
    .filter((c: any) => !input.status || norm(c.TrangThai) === norm(input.status))
    .filter(
      (c: any) => !limit || (c.TrangThai === 'Hiệu lực' && c.NgayKetThuc && c.NgayKetThuc >= s.today && c.NgayKetThuc <= limit)
    )
    .map((c: any) => ({
      MaHD: c.MaHD,
      NhanVien: h.empName(c.MaNV),
      LoaiHD: c.LoaiHD,
      NgayBatDau: c.NgayBatDau,
      NgayKetThuc: c.NgayKetThuc || 'Không xác định thời hạn',
      TrangThai: c.TrangThai,
      MucLuong: c.MucLuong ?? 'Không có quyền xem',
    }));
  return { tongSo: rows.length, danhSach: rows.slice(0, MAX_ROWS) };
}

export function headcountSummary(s: ScopedState) {
  const h = helpers(s);
  const active = s.employees.filter((e: any) => ACTIVE.includes(e.TrangThai));
  const count = (key: (e: any) => string) =>
    active.reduce<Record<string, number>>((acc, e) => {
      const k = key(e);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
  const month = s.today.slice(0, 7);
  return {
    phamViXem: scopeLabel(s),
    tongDangLamViec: active.length,
    theoTrangThai: count((e) => e.TrangThai),
    theoPhongBan: count((e) => h.dept(e.MaPB)),
    theoGioiTinh: count((e) => e.GioiTinh),
    vaoLamThangNay: active.filter((e: any) => String(e.NgayVaoLam).startsWith(month)).length,
    daNghiViec: s.employees.filter((e: any) => e.TrangThai === 'Đã nghỉ việc').length,
  };
}

export function getAlerts(s: ScopedState) {
  return {
    tongSo: s.alerts.length,
    danhSach: s.alerts.slice(0, MAX_ROWS).map((a) => ({ mucDo: a.severity, tieuDe: a.title, chiTiet: a.description })),
  };
}

export async function listHolidays(s: ScopedState, input: { year?: number }) {
  const year = input.year || Number(s.today.slice(0, 4));
  const rows = await db.all(
    'SELECT "Ngay", "TenNgayLe" FROM "NGAYLE" WHERE EXTRACT(YEAR FROM "Ngay") = $1 ORDER BY "Ngay"',
    [year]
  );
  return { nam: year, danhSach: rows };
}

export function scopeLabel(s: ScopedState): string {
  if (['admin', 'hr', 'director'].includes(s.user.VaiTro)) return 'Toàn bộ tổ chức';
  if (s.user.VaiTro === 'manager') return 'Nhân viên trong phòng của bạn';
  return 'Chỉ hồ sơ của chính bạn';
}
