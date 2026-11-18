export type UserRole = 'admin' | 'hr' | 'manager' | 'employee' | 'director';

export interface SessionUser {
  matk: string;
  tendangnhap: string;
  vaitro: UserRole;
  manv: string;
  hoten: string;
  mapb: string | null;
}

export interface Department {
  mapb: string;
  tenpb: string;
  mota: string;
  ngaythanhlap: string;
  matruongphong?: string | null;
  hoatdong?: boolean;
}

export interface Position {
  macv: string;
  tencv: string;
  mota: string;
  capbac: number;
  ladieuhanh?: boolean;
  vaitromacdinh?: string | null;
  hoatdong?: boolean;
}

export interface Employee {
  manv: string;
  hoten: string;
  ngaysinh: string;
  gioitinh: 'Nam' | 'Nữ' | 'Khác';
  diachi: string;
  sodienthoai: string;
  email: string;
  ngayvaolam: string;
  trangthai: 'Đang làm việc' | 'Thử việc' | 'Đã nghỉ việc' | 'Đã lưu trữ';
  ngayluutru: string | null;
  mapb: string | null;
  macv: string;
  phienban?: number;
}

export interface Contract {
  mahd: string;
  manv: string;
  loaihd: 'Thử việc' | 'Xác định thời hạn' | 'Không xác định thời hạn';
  ngaybatdau: string;
  ngayketthuc: string | null;
  ngayketthucgoc?: string | null;
  mucluong: number | null;
  trangthai: string;
  ngaychamdut: string | null;
  lydochamdut: string | null;
  loaichamdut?: string | null;
  maqdchamdut?: string | null;
  sohd?: string | null;
}

export interface ContractExtension {
  magh: string;
  mahd: string;
  langiahan: number;
  ngaylap: string;
  ngayketthuccu: string | null;
  ngayketthucmoi: string | null;
  loaiphuluc: string;
  luongcu: number | null;
  luongmoi: number | null;
  lydo: string;
  ngayhieuluc?: string | null;
  daapdung?: boolean;
  maqd?: string | null;
}

export interface Decision {
  maqd: string;
  soqd: string;
  loaiqd: string;
  ngayky: string;
  ngayhieuluc: string;
  nguoiky: string;
  noidung: string;
}

export interface Assignment {
  maqt: string;
  manv: string;
  maqd: string;
  loaibiendong: 'Điều chuyển' | 'Bổ nhiệm' | 'Miễn nhiệm' | 'Điều chuyển và bổ nhiệm';
  mapbcu: string | null;
  mapbmoi: string;
  macvcu: string;
  macvmoi: string;
  ngayhieuluc: string;
  lydo: string;
  trangthai?: 'Chờ hiệu lực' | 'Hiệu lực' | 'Đã hủy';
  lydohuy?: string | null;
}

export interface LeaveType {
  maloai: string;
  tenloai: string;
  songaytoida: number;
  truphepnam: number;
}

export interface LeaveRequest {
  madon: string;
  manv: string;
  maloai: string;
  ngaynop: string;
  tungay: string;
  denngay: string;
  songay: number;
  lydo: string;
  trangthai: 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối' | 'Đã hủy';
  manvduyet: string | null;
  tennguoiduyet?: string | null;
  ngayduyet: string | null;
  ghichuduyet: string | null;
  coquyenduyet?: boolean;
}

export interface LeaveBalance {
  manv: string;
  nam: number;
  tongsongayphep: number;
  songaydanghi: number;
  songayconlai: number;
}

export interface UserAccount {
  matk: string;
  tendangnhap: string;
  vaitro: UserRole;
  manv: string;
  hoatdong: number;
  hoten: string;
}

export interface AuditEntry {
  mank: number;
  matk: string | null;
  tendangnhap: string | null;
  hanhdong: string;
  doituong: string;
  thoigian: string;
  chitiet?: Record<string, unknown> | null;
  diachiip?: string | null;
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
