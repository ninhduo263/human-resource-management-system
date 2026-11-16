export type UserRole = 'admin' | 'hr' | 'manager' | 'employee' | 'director';

export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
  employee_id: string;
  name: string;
  department_id: string | null;
}

export interface Department {
  id: string;
  name: string;
  description: string;
  founded_date: string;
  head_id?: string | null;
  active?: boolean;
}

export interface Position {
  id: string;
  name: string;
  description: string;
  level: number;
  is_executive?: boolean;
  default_role?: string | null;
  active?: boolean;
}

export interface Employee {
  id: string;
  name: string;
  birth_date: string;
  gender: 'Nam' | 'Nữ' | 'Khác';
  address: string;
  phone: string;
  email: string;
  join_date: string;
  status: 'Đang làm việc' | 'Thử việc' | 'Đã nghỉ việc' | 'Đã lưu trữ';
  archived_date: string | null;
  department_id: string | null;
  position_id: string;
  version?: number;
}

export interface Contract {
  id: string;
  employee_id: string;
  type: 'Thử việc' | 'Xác định thời hạn' | 'Không xác định thời hạn';
  start_date: string;
  end_date: string | null;
  salary: number | null;
  status: string;
  terminated_date: string | null;
  termination_reason: string | null;
  termination_type?: string | null;
  contract_number?: string | null;
}

export interface ContractExtension {
  id: string;
  contract_id: string;
  sequence: number;
  created_date: string;
  old_end_date: string | null;
  new_end_date: string | null;
  amendment_type: string;
  old_salary: number | null;
  new_salary: number | null;
  reason: string;
  effective_date?: string | null;
  applied?: boolean;
}

export interface Decision {
  id: string;
  number: string;
  type: string;
  signed_date: string;
  effective_date: string;
  signer: string;
  content: string;
}

export interface Assignment {
  id: string;
  employee_id: string;
  decision_id: string;
  type: 'Điều chuyển' | 'Bổ nhiệm' | 'Điều chuyển và bổ nhiệm';
  old_department_id: string | null;
  new_department_id: string;
  old_position_id: string;
  new_position_id: string;
  effective_date: string;
  reason: string;
  status?: 'Chờ hiệu lực' | 'Hiệu lực' | 'Đã hủy';
  cancel_reason?: string | null;
}

export interface LeaveType {
  id: string;
  name: string;
  max_days: number;
  deduct_annual: number;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  type_id: string;
  submitted_date: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối' | 'Đã hủy';
  approver_id: string | null;
  approver_name?: string | null;
  approved_date: string | null;
  review_note: string | null;
  can_review?: boolean;
}

export interface LeaveBalance {
  employee_id: string;
  year: number;
  total: number;
  used: number;
  remaining: number;
}

export interface UserAccount {
  id: string;
  username: string;
  role: UserRole;
  employee_id: string;
  active: number;
  name: string;
}

export interface AuditEntry {
  id: number;
  user_id: string | null;
  username: string | null;
  action: string;
  target: string;
  created_at: string;
  details?: Record<string, unknown> | null;
  ip?: string | null;
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
