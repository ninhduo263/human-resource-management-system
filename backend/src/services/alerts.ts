import type { SessionUser } from '../middleware/auth.js';
import { shift } from '../utils/validation.js';

/**
 * Cảnh báo / thông báo được SUY RA từ dữ liệu đã lọc theo phạm vi quyền của người dùng
 * (không thêm bảng mới vào ERD). Mỗi cảnh báo có `id` ổn định để giao diện đánh dấu "đã đọc".
 */
export type AlertSeverity = 'danger' | 'warning' | 'info' | 'success';
export type AlertKind =
  | 'duyet-phep'
  | 'ket-qua-phep'
  | 'hop-dong-sap-het-han'
  | 'hop-dong-qua-han'
  | 'chua-co-hop-dong'
  | 'cong-tac-sap-hieu-luc'
  | 'quy-phep-sap-het'
  | 'sinh-nhat';

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  description: string;
  date: string;
  route: 'leaves' | 'contracts' | 'assignments' | 'employees';
  refId?: string;
}

/** Hình dạng tối thiểu của state theo phạm vi mà bộ tính cảnh báo cần đọc. */
export interface AlertSource {
  user: SessionUser;
  today: string;
  employees: any[];
  contracts: any[];
  assignments: any[];
  leaves: any[];
  balances: any[];
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2, success: 3 };
const ACTIVE = ['Đang làm việc', 'Thử việc'];

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function buildAlerts(s: AlertSource): Alert[] {
  const { user: u, today } = s;
  const canManageContracts = ['admin', 'hr'].includes(u.VaiTro);
  const name = new Map<string, string>(s.employees.map((e) => [e.MaNV, e.HoTen]));
  const out: Alert[] = [];

  // 1. Đơn nghỉ phép đang chờ chính người dùng duyệt (quyền do máy chủ tính: coquyenduyet).
  for (const l of s.leaves) {
    if (!l.coquyenduyet) continue;
    const waited = daysBetween(l.NgayNop, today);
    const urgent = waited >= 2 || l.TuNgay <= shift(today, 1);
    out.push({
      id: `duyet-phep:${l.MaDon}`,
      kind: 'duyet-phep',
      severity: urgent ? 'danger' : 'warning',
      title: urgent ? 'Đơn nghỉ phép cần duyệt gấp' : 'Đơn nghỉ phép chờ bạn duyệt',
      description: `${name.get(l.MaNV) || l.MaNV} · ${l.SoNgay} ngày (${fmt(l.TuNgay)} – ${fmt(l.DenNgay)})${
        waited >= 2 ? ` · đã chờ ${waited} ngày` : ''
      }`,
      date: l.NgayNop,
      route: 'leaves',
      refId: l.MaDon,
    });
  }

  // 2. Kết quả duyệt đơn của chính mình trong 7 ngày gần nhất.
  for (const l of s.leaves) {
    if (l.MaNV !== u.MaNV || !l.NgayDuyet || daysBetween(l.NgayDuyet, today) > 7) continue;
    if (l.TrangThai !== 'Đã duyệt' && l.TrangThai !== 'Từ chối') continue;
    const ok = l.TrangThai === 'Đã duyệt';
    out.push({
      id: `ket-qua-phep:${l.MaDon}:${l.TrangThai}`,
      kind: 'ket-qua-phep',
      severity: ok ? 'success' : 'danger',
      title: ok ? 'Đơn nghỉ phép của bạn đã được duyệt' : 'Đơn nghỉ phép của bạn bị từ chối',
      description: `${fmt(l.TuNgay)} – ${fmt(l.DenNgay)}${l.tennguoiduyet ? ` · ${l.tennguoiduyet}` : ''}${
        !ok && l.GhiChuDuyet ? ` · Lý do: ${l.GhiChuDuyet}` : ''
      }`,
      date: l.NgayDuyet,
      route: 'leaves',
      refId: l.MaDon,
    });
  }

  // 3. Hợp đồng sắp hết hạn (30 ngày) mà chưa có hợp đồng nối tiếp.
  const contractsByEmp = new Map<string, any[]>();
  for (const c of s.contracts) {
    contractsByEmp.set(c.MaNV, [...(contractsByEmp.get(c.MaNV) || []), c]);
  }
  for (const c of s.contracts) {
    if (c.TrangThai !== 'Hiệu lực' || !c.NgayKetThuc) continue;
    const left = daysBetween(today, c.NgayKetThuc);
    if (left < 0 || left > 30) continue;
    const renewed = (contractsByEmp.get(c.MaNV) || []).some(
      (o) => o.MaHD !== c.MaHD && o.NgayBatDau > c.NgayBatDau && !['Đã hủy bỏ', 'Đã chấm dứt'].includes(o.TrangThai)
    );
    if (renewed) continue;
    const mine = c.MaNV === u.MaNV;
    out.push({
      id: `hop-dong-sap-het-han:${c.MaHD}:${c.NgayKetThuc}`,
      kind: 'hop-dong-sap-het-han',
      severity: left <= 7 ? 'danger' : 'warning',
      title: mine
        ? `Hợp đồng của bạn hết hạn sau ${left} ngày`
        : `Hợp đồng ${c.LoaiHD === 'Thử việc' ? 'thử việc ' : ''}sắp hết hạn (${left} ngày)`,
      description: `${mine ? c.LoaiHD : name.get(c.MaNV) || c.MaNV} · hết hạn ${fmt(c.NgayKetThuc)}`,
      date: c.NgayKetThuc,
      route: 'contracts',
      refId: c.MaHD,
    });
  }

  // 4. (Nhân sự/Quản trị) Nhân viên đang làm việc nhưng không còn hợp đồng hiệu lực.
  if (canManageContracts) {
    for (const e of s.employees) {
      if (!ACTIVE.includes(e.TrangThai)) continue;
      const list = contractsByEmp.get(e.MaNV) || [];
      const hasValid = list.some((c) => c.TrangThai === 'Hiệu lực' || c.TrangThai === 'Chưa hiệu lực');
      if (hasValid) continue;
      const expired = list.find((c) => c.TrangThai === 'Hết hạn');
      out.push({
        id: `${expired ? 'hop-dong-qua-han' : 'chua-co-hop-dong'}:${e.MaNV}:${expired?.MaHD ?? ''}`,
        kind: expired ? 'hop-dong-qua-han' : 'chua-co-hop-dong',
        severity: 'danger',
        title: expired ? 'Hợp đồng đã hết hạn chưa xử lý' : 'Nhân viên chưa có hợp đồng',
        description: `${e.HoTen}${expired?.NgayKetThuc ? ` · hết hạn ${fmt(expired.NgayKetThuc)}` : ''}`,
        date: expired?.NgayKetThuc || e.NgayVaoLam,
        route: 'contracts',
        refId: expired?.MaHD,
      });
    }
  }

  // 5. Quyết định công tác sắp có hiệu lực trong 14 ngày.
  for (const a of s.assignments) {
    if (a.TrangThai !== 'Chờ hiệu lực') continue;
    const left = daysBetween(today, a.NgayHieuLuc);
    if (left < 0 || left > 14) continue;
    const mine = a.MaNV === u.MaNV;
    out.push({
      id: `cong-tac:${a.MaQT}`,
      kind: 'cong-tac-sap-hieu-luc',
      severity: 'info',
      title: mine ? `Quyết định ${a.LoaiBienDong.toLowerCase()} của bạn sắp có hiệu lực` : `${a.LoaiBienDong} sắp có hiệu lực`,
      description: `${mine ? 'Bạn' : name.get(a.MaNV) || a.MaNV} · hiệu lực ${fmt(a.NgayHieuLuc)}${
        left === 0 ? ' (hôm nay)' : ` (còn ${left} ngày)`
      }`,
      date: a.NgayHieuLuc,
      route: 'assignments',
      refId: a.MaQT,
    });
  }

  // 6. Quỹ phép năm của chính mình sắp hết.
  const year = Number(today.slice(0, 4));
  const mine = s.balances.find((b) => b.MaNV === u.MaNV && b.Nam === year);
  if (mine && mine.TongSoNgayPhep > 0 && mine.SoNgayConLai <= 2) {
    out.push({
      id: `quy-phep:${u.MaNV}:${year}:${mine.SoNgayConLai}`,
      kind: 'quy-phep-sap-het',
      severity: 'warning',
      title: mine.SoNgayConLai <= 0 ? 'Bạn đã dùng hết phép năm' : `Bạn chỉ còn ${mine.SoNgayConLai} ngày phép năm`,
      description: `Đã nghỉ ${mine.SoNgayDaNghi}/${mine.TongSoNgayPhep} ngày phép năm ${year}`,
      date: today,
      route: 'leaves',
    });
  }

  // 7. Sinh nhật trong 7 ngày tới (đồng nghiệp trong phạm vi + chính mình).
  {
    for (const e of s.employees) {
      if (!ACTIVE.includes(e.TrangThai) || !e.NgaySinh) continue;
      let next = `${year}-${e.NgaySinh.slice(5, 10)}`;
      if (next < today) next = `${year + 1}-${e.NgaySinh.slice(5, 10)}`;
      const left = daysBetween(today, next);
      if (left > 7) continue;
      const self = e.MaNV === u.MaNV;
      if (self && left !== 0) continue;
      out.push({
        id: `sinh-nhat:${e.MaNV}:${next}`,
        kind: 'sinh-nhat',
        severity: self ? 'success' : 'info',
        title: self ? 'Chúc mừng sinh nhật bạn! 🎉' : left === 0 ? `Hôm nay là sinh nhật ${e.HoTen}` : `Sinh nhật ${e.HoTen}`,
        description: self ? 'PeopleOps chúc bạn một ngày thật vui.' : `${fmt(next)}${left === 0 ? ' · hôm nay' : ` · còn ${left} ngày`}`,
        date: next,
        route: 'employees',
        refId: e.MaNV,
      });
    }
  }

  return out.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.date.localeCompare(b.date)
  );
}
