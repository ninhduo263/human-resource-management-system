export type UserRole = 'admin' | 'hr' | 'manager' | 'employee' | 'director';

export interface SessionUser {
  MaTK: string;
  TenDangNhap: string;
  VaiTro: UserRole;
  MaNV: string;
  HoTen: string;
  MaPB: string | null;
}

export interface Department {
  MaPB: string;
  TenPB: string;
  MoTa: string;
  NgayThanhLap: string;
  MaTruongPhong?: string | null;
  HoatDong?: boolean;
}

export interface Position {
  MaCV: string;
  TenCV: string;
  MoTa: string;
  CapBac: number;
  LaDieuHanh?: boolean;
  VaiTroMacDinh?: string | null;
  HoatDong?: boolean;
}

export interface Employee {
  MaNV: string;
  HoTen: string;
  NgaySinh: string;
  GioiTinh: 'Nam' | 'Nữ' | 'Khác';
  DiaChi: string;
  SoDienThoai: string;
  Email: string;
  NgayVaoLam: string;
  TrangThai: 'Đang làm việc' | 'Thử việc' | 'Đã nghỉ việc' | 'Đã lưu trữ';
  NgayLuuTru: string | null;
  MaPB: string | null;
  MaCV: string;
  PhienBan?: number;
}

export interface Contract {
  MaHD: string;
  MaNV: string;
  LoaiHD: 'Thử việc' | 'Xác định thời hạn' | 'Không xác định thời hạn';
  NgayBatDau: string;
  NgayKetThuc: string | null;
  NgayKetThucGoc?: string | null;
  MucLuong: number | null;
  TrangThai: string;
  NgayChamDut: string | null;
  LyDoChamDut: string | null;
  LoaiChamDut?: string | null;
  MaQDChamDut?: string | null;
  SoHD?: string | null;
}

export interface ContractExtension {
  MaGH: string;
  MaHD: string;
  LanGiaHan: number;
  NgayLap: string;
  NgayKetThucCu: string | null;
  NgayKetThucMoi: string | null;
  LoaiPhuLuc: string;
  LuongCu: number | null;
  LuongMoi: number | null;
  LyDo: string;
  NgayHieuLuc?: string | null;
  DaApDung?: boolean;
  MaQD?: string | null;
}

export interface Decision {
  MaQD: string;
  SoQD: string;
  LoaiQD: string;
  NgayKy: string;
  NgayHieuLuc: string;
  NguoiKy: string;
  NoiDung: string;
}

export interface Assignment {
  MaQT: string;
  MaNV: string;
  MaQD: string;
  LoaiBienDong: 'Điều chuyển' | 'Bổ nhiệm' | 'Miễn nhiệm' | 'Điều chuyển và bổ nhiệm';
  MaPBCu: string | null;
  MaPBMoi: string;
  MaCVCu: string;
  MaCVMoi: string;
  NgayHieuLuc: string;
  LyDo: string;
  TrangThai?: 'Chờ hiệu lực' | 'Hiệu lực' | 'Đã hủy';
  LyDoHuy?: string | null;
}

export interface LeaveType {
  MaLoai: string;
  TenLoai: string;
  SoNgayToiDa: number;
  TruPhepNam: number;
}

export interface LeaveRequest {
  MaDon: string;
  MaNV: string;
  MaLoai: string;
  NgayNop: string;
  TuNgay: string;
  DenNgay: string;
  SoNgay: number;
  LyDo: string;
  TrangThai: 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối' | 'Đã hủy';
  MaNVDuyet: string | null;
  tennguoiduyet?: string | null;
  NgayDuyet: string | null;
  GhiChuDuyet: string | null;
  coquyenduyet?: boolean;
}

export interface LeaveBalance {
  MaNV: string;
  Nam: number;
  TongSoNgayPhep: number;
  SoNgayDaNghi: number;
  SoNgayConLai: number;
}

export interface UserAccount {
  MaTK: string;
  TenDangNhap: string;
  VaiTro: UserRole;
  MaNV: string;
  HoatDong: number;
  HoTen: string;
}

export interface AuditEntry {
  MaNK: number;
  MaTK: string | null;
  TenDangNhap: string | null;
  HanhDong: string;
  DoiTuong: string;
  ThoiGian: string;
  ChiTiet?: Record<string, unknown> | null;
  DiaChiIP?: string | null;
}

export type AlertSeverity = 'danger' | 'warning' | 'info' | 'success';

/** Cảnh báo do máy chủ suy ra từ dữ liệu trong phạm vi quyền của người dùng. */
export interface AppAlert {
  id: string;
  kind: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  date: string;
  route: 'leaves' | 'contracts' | 'assignments' | 'employees';
  refId?: string;
}

export interface AppState {
  user: SessionUser;
  today: string;
  employees: Employee[];
  departments: Department[];
  positions: Position[];
  contracts: Contract[];
  extensions: ContractExtension[];
  assignments: Assignment[];
  decisions: Decision[];
  leaveTypes: LeaveType[];
  leaves: LeaveRequest[];
  balances: LeaveBalance[];
  users: UserAccount[];
  audit: AuditEntry[];
  alerts: AppAlert[];
}

export type RouteKey =
  | 'dashboard'
  | 'employees'
  | 'departments'
  | 'contracts'
  | 'assignments'
  | 'leaves'
  | 'reports'
  | 'settings';
