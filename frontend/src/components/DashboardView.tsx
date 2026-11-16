import React from 'react';
import {
  Users,
  Building2,
  FileWarning,
  CalendarClock,
  Download,
  Plus,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { AppState, RouteKey } from '../types';
import {
  canEdit,
  daysUntil,
  downloadCsv,
  getAvatarColor,
  getContractStatus,
  getInitials,
  getStatusBadgeClass,
} from '../utils/format';

interface DashboardViewProps {
  state: AppState;
  onNavigate: (route: RouteKey) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onNavigate,
}) => {
  const activeEmployees = state.employees.filter((e) => e.status !== 'Đã lưu trữ');
  const pendingLeaves = state.leaves.filter((l) => l.status === 'Chờ duyệt');
  const expiringContracts = state.contracts.filter(
    (c) => getContractStatus(c, state.today) === 'Sắp hết hạn'
  );
  const newcomers = activeEmployees.filter(
    (e) => e.join_date.slice(0, 7) === state.today.slice(0, 7)
  );

  const deptName = (id: string) =>
    state.departments.find((d) => d.id === id)?.name || id;
  const posName = (id: string) =>
    state.positions.find((p) => p.id === id)?.name || id;
  const empName = (id: string) =>
    state.employees.find((e) => e.id === id)?.name || id;

  const maxDeptCount = Math.max(
    1,
    ...state.departments.map(
      (d) => activeEmployees.filter((e) => e.department_id === d.id).length
    )
  );

  const handleExportOverview = () => {
    downloadCsv(
      `peopleops-nhan-su-${state.today}.csv`,
      [
        'Mã nhân viên',
        'Họ tên',
        'Ngày sinh',
        'Giới tính',
        'Email',
        'Điện thoại',
        'Phòng ban',
        'Chức vụ',
        'Ngày vào làm',
        'Trạng thái',
      ],
      activeEmployees.map((e) => [
        e.id,
        e.name,
        e.birth_date,
        e.gender,
        e.email,
        e.phone,
        deptName(e.department_id),
        posName(e.position_id),
        e.join_date,
        e.status,
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
            TỔNG QUAN HỆ THỐNG
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            Xin chào, {state.user.name}
          </h1>
          <p className="text-sm text-slate-500">
            Theo dõi nhanh số liệu nhân sự, cơ cấu phòng ban, hợp đồng sắp hết hạn và đơn chờ duyệt.
          </p>
        </div>
        <div className="flex items-center gap-2.5 no-print">
          <button
            type="button"
            onClick={handleExportOverview}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <Download className="h-4 w-4" />
            <span>Xuất CSV</span>
          </button>
          {canEdit(state.user.role) ? (
            <button
              type="button"
              onClick={() => onNavigate('employees')}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Quản lý hồ sơ</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                onNavigate(state.user.role === 'director' ? 'reports' : 'leaves')
              }
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
            >
              <span>
                {state.user.role === 'director' ? 'Xem báo cáo' : 'Nghỉ phép'}
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Tổng nhân sự
            </span>
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <Users className="h-5 w-5" />
            </span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {activeEmployees.length}{' '}
            <span className="text-sm font-normal text-slate-500">nhân viên</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            <strong className="text-slate-700">{newcomers.length} nhân sự mới</strong>{' '}
            trong tháng này
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Phòng ban
            </span>
            <span className="p-2 rounded-xl bg-sky-50 text-sky-700">
              <Building2 className="h-5 w-5" />
            </span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {state.departments.length}{' '}
            <span className="text-sm font-normal text-slate-500">đơn vị</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Cùng {state.positions.length} chức danh trong danh mục
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              HĐ sắp hết hạn
            </span>
            <span className="p-2 rounded-xl bg-amber-50 text-amber-700">
              <FileWarning className="h-5 w-5" />
            </span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {expiringContracts.length}{' '}
            <span className="text-sm font-normal text-slate-500">hợp đồng</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Cần theo dõi trong <strong className="text-amber-700">30 ngày tới</strong>
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Đơn chờ duyệt
            </span>
            <span className="p-2 rounded-xl bg-purple-50 text-purple-700">
              <CalendarClock className="h-5 w-5" />
            </span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {pendingLeaves.length}{' '}
            <span className="text-sm font-normal text-slate-500">đơn nghỉ</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Đang chờ Trưởng phòng / Quản trị phê duyệt
          </p>
        </div>
      </div>

      {/* Distribution & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-2xl bg-white p-6 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Phân bổ nhân sự theo phòng ban
              </h2>
              <p className="text-xs text-slate-500">
                Nhân sự đang làm việc / thử việc tại các đơn vị
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('departments')}
              className="text-xs font-semibold text-brand-600 hover:underline inline-flex items-center gap-1"
            >
              <span>Xem cơ cấu</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-3.5">
            {state.departments.map((d) => {
              const count = activeEmployees.filter(
                (e) => e.department_id === d.id
              ).length;
              const pct = Math.round((count / maxDeptCount) * 100);
              return (
                <div key={d.id} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-slate-700">
                    <span>
                      {d.name} <span className="text-slate-400">({d.id})</span>
                    </span>
                    <span className="font-semibold">{count} nhân viên</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-600 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-5 rounded-2xl bg-white p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">
              Cảnh báo & Nhắc việc (3.4 / 4.3)
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Hợp đồng sắp hết hạn trong 30 ngày & đơn nghỉ phép chờ xử lý
            </p>

            <div className="space-y-3">
              {expiringContracts.slice(0, 3).map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-3 rounded-xl bg-amber-50/70 border border-amber-200/70 p-3.5"
                >
                  <div className="flex items-start gap-2.5">
                    <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <strong className="text-slate-900 block">
                        Hợp đồng {c.id} còn {daysUntil(c.end_date!, state.today)} ngày
                      </strong>
                      <span className="text-slate-600">
                        {empName(c.employee_id)} · Hết hạn: {c.end_date}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('contracts')}
                    className="text-xs font-semibold text-amber-800 hover:underline shrink-0"
                  >
                    Xử lý
                  </button>
                </div>
              ))}

              {pendingLeaves.length > 0 && (
                <div className="flex items-start justify-between gap-3 rounded-xl bg-emerald-50/70 border border-emerald-200/70 p-3.5">
                  <div className="flex items-start gap-2.5">
                    <CalendarClock className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <strong className="text-slate-900 block">
                        {pendingLeaves.length} đơn nghỉ phép đang chờ duyệt
                      </strong>
                      <span className="text-slate-600">
                        Kiểm tra lịch nghỉ và quỹ phép năm của nhân viên
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('leaves')}
                    className="text-xs font-semibold text-emerald-800 hover:underline shrink-0"
                  >
                    Xem đơn
                  </button>
                </div>
              )}

              {expiringContracts.length === 0 && pendingLeaves.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400">
                  Mọi hợp đồng và đơn nghỉ phép đều đã được xử lý.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Quick employee table */}
      <section className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Nhân sự trong phạm vi quản lý
            </h2>
            <p className="text-xs text-slate-500">
              Danh sách rút gọn · Nhấn &ldquo;Xem tất cả&rdquo; để tra cứu chi tiết
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('employees')}
            className="text-xs font-semibold text-brand-600 hover:underline inline-flex items-center gap-1"
          >
            <span>Xem tất cả ({activeEmployees.length})</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500 uppercase">
                <th className="py-3 px-6">Nhân viên</th>
                <th className="py-3 px-4">Mã NV</th>
                <th className="py-3 px-4">Phòng ban</th>
                <th className="py-3 px-4">Chức vụ</th>
                <th className="py-3 px-4">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeEmployees.slice(0, 5).map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/80">
                  <td className="py-3 px-6">
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-9 w-9 rounded-full border flex items-center justify-center text-xs font-bold ${getAvatarColor(
                          e.id
                        )}`}
                      >
                        {getInitials(e.name)}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-900">{e.name}</div>
                        <div className="text-xs text-slate-500">{e.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-700">
                    {e.id}
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {deptName(e.department_id)}
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {posName(e.position_id)}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(
                        e.status
                      )}`}
                    >
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
