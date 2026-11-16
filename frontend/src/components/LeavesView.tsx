import React, { useState } from 'react';
import {
  Plus,
  Download,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  Edit3,
} from 'lucide-react';
import { AppState, LeaveBalance, LeaveRequest } from '../types';
import { apiRequest } from '../api';
import {
  canEdit,
  downloadCsv,
  formatDate,
  getAvatarColor,
  getInitials,
  getStatusBadgeClass,
  matchEmployeeQuery,
} from '../utils/format';
import { Modal } from './Modal';

interface LeavesViewProps {
  state: AppState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, isError?: boolean) => void;
}

export const LeavesView: React.FC<LeavesViewProps> = ({
  state,
  onRefresh,
  notify,
}) => {
  const currentYear = Number(state.today.slice(0, 4));
  const [tab, setTab] = useState<'requests' | 'balances'>('requests');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailLeave, setDetailLeave] = useState<LeaveRequest | null>(null);
  const [reviewModal, setReviewModal] = useState<{
    leave: LeaveRequest;
    approve: boolean;
  } | null>(null);
  const [balanceModal, setBalanceModal] = useState<LeaveBalance | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const emp = (id: string) => state.employees.find((e) => e.id === id);
  const deptName = (id: string) =>
    state.departments.find((d) => d.id === id)?.name || id;
  const leaveTypeName = (id: string) =>
    state.leaveTypes.find((t) => t.id === id)?.name || id;

  const canReviewLeave = (l: LeaveRequest) =>
    ['admin', 'manager'].includes(state.user.role) &&
    l.employee_id !== state.user.employee_id &&
    l.status === 'Chờ duyệt';

  const filteredRequests = state.leaves.filter(
    (l) =>
      (!statusFilter || l.status === statusFilter) &&
      matchEmployeeQuery(emp(l.employee_id), search, deptFilter)
  );

  const availableYears = Array.from(
    new Set([currentYear, ...state.balances.map((b) => b.year)])
  ).sort((a, b) => b - a);

  const filteredBalances = state.balances.filter((b) => {
    const e = emp(b.employee_id);
    return (
      b.year === selectedYear &&
      e &&
      e.status !== 'Đã lưu trữ' &&
      matchEmployeeQuery(e, search, deptFilter)
    );
  });

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const requestRows = filteredRequests.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSubmitLeave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      await apiRequest('/api/leaves', body, 'POST');
      setCreateOpen(false);
      notify('Đã gửi đơn đăng ký nghỉ phép.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelLeave = async (l: LeaveRequest) => {
    if (!window.confirm(`Hủy đơn nghỉ phép ${l.id}?`)) return;
    try {
      await apiRequest(`/api/leaves/${encodeURIComponent(l.id)}/cancel`, {}, 'POST');
      setDetailLeave(null);
      notify('Đã hủy đơn nghỉ phép.');
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reviewModal) return;
    setFormError('');
    setSubmitting(true);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      await apiRequest(
        `/api/leaves/${encodeURIComponent(reviewModal.leave.id)}/review`,
        {
          status: reviewModal.approve ? 'Đã duyệt' : 'Từ chối',
          review_note: raw.review_note || '',
        },
        'POST'
      );
      setReviewModal(null);
      setDetailLeave(null);
      notify(
        reviewModal.approve
          ? 'Đã phê duyệt đơn nghỉ phép.'
          : 'Đã từ chối đơn nghỉ phép.'
      );
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveBalance = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!balanceModal) return;
    setFormError('');
    setSubmitting(true);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      await apiRequest(
        '/api/balances',
        {
          employee_id: balanceModal.employee_id,
          year: Number(raw.year),
          total: Number(raw.total),
        },
        'POST'
      );
      setSelectedYear(Number(raw.year));
      setBalanceModal(null);
      notify('Đã cập nhật tổng quỹ phép năm.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    if (tab === 'balances') {
      downloadCsv(
        `peopleops-leave-balances-${selectedYear}.csv`,
        ['Mã NV', 'Nhân viên', 'Phòng ban', 'Năm', 'Tổng phép', 'Đã nghỉ', 'Còn lại'],
        filteredBalances.map((b) => {
          const e = emp(b.employee_id);
          return [
            b.employee_id,
            e?.name || b.employee_id,
            e ? deptName(e.department_id) : '',
            b.year,
            b.total,
            b.used,
            b.remaining,
          ];
        })
      );
    } else {
      downloadCsv(
        `peopleops-leave-requests-${state.today}.csv`,
        [
          'Mã đơn',
          'Nhân viên',
          'Loại nghỉ',
          'Từ ngày',
          'Đến ngày',
          'Số ngày',
          'Trạng thái',
          'Người duyệt',
        ],
        filteredRequests.map((l) => [
          l.id,
          emp(l.employee_id)?.name || l.employee_id,
          leaveTypeName(l.type_id),
          l.start_date,
          l.end_date,
          l.days,
          l.status,
          l.approver_name || l.approver_id || '—',
        ])
      );
    }
  };

  const isSelfOnly = ['employee', 'manager'].includes(state.user.role);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
            PHÂN HỆ 4.0 · BFD 4.2 – 4.4
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            Đăng ký, Duyệt & Theo dõi Nghỉ phép
          </h1>
          <p className="text-sm text-slate-500">
            Đăng ký nghỉ phép (4.2), phê duyệt đơn (4.3) và theo dõi quỹ phép năm (4.4) (Kho D5).
          </p>
        </div>

        <div className="flex items-center gap-2.5 no-print">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <Download className="h-4 w-4" />
            <span>Xuất CSV</span>
          </button>
          {state.user.role !== 'director' && (
            <button
              type="button"
              onClick={() => {
                setFormError('');
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Đăng ký nghỉ phép (4.2)</span>
            </button>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="rounded-2xl bg-brand-50 border border-brand-200 px-5 py-3.5 text-xs text-brand-800">
        Số ngày nghỉ tính theo ngày lịch (gồm ngày bắt đầu và kết thúc). Chỉ các đơn loại <strong>Phép năm</strong> đã được phê duyệt mới khấu trừ vào quỹ phép năm (mặc định 12 ngày/năm).
      </div>

      {/* Main Card */}
      <section className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setTab('requests');
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                tab === 'requests'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Đơn nghỉ phép ({state.leaves.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('balances')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                tab === 'balances'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Quỹ phép năm {selectedYear} (4.4)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {tab === 'balances' && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium">Năm:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm nhân viên..."
                className="pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs w-52"
              />
            </div>

            <select
              value={deptFilter}
              onChange={(e) => {
                setDeptFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs"
            >
              <option value="">Tất cả phòng ban</option>
              {state.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            {tab === 'requests' && (
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs"
              >
                <option value="">Tất cả trạng thái</option>
                {['Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Đã hủy'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Table Content */}
        {tab === 'requests' ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500 uppercase">
                    <th className="py-3 px-6">Nhân viên</th>
                    <th className="py-3 px-4">Loại nghỉ</th>
                    <th className="py-3 px-4">Thời gian nghỉ</th>
                    <th className="py-3 px-4">Số ngày</th>
                    <th className="py-3 px-4">Trạng thái</th>
                    <th className="py-3 px-4">Người duyệt</th>
                    <th className="py-3 px-6 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requestRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-10 text-center text-sm text-slate-400"
                      >
                        Chưa có đơn nghỉ phép phù hợp.
                      </td>
                    </tr>
                  ) : (
                    requestRows.map((l) => {
                      const e = emp(l.employee_id);
                      return (
                        <tr key={l.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-6">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`h-8 w-8 rounded-full border flex items-center justify-center text-xs font-bold ${getAvatarColor(
                                  e?.id
                                )}`}
                              >
                                {getInitials(e?.name)}
                              </span>
                              <div>
                                <div className="font-semibold text-slate-900 text-xs">
                                  {e?.name || l.employee_id}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {l.id}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-700">
                            {leaveTypeName(l.type_id)}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            {formatDate(l.start_date)} –{' '}
                            {formatDate(l.end_date)}
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold text-slate-800">
                            {l.days} ngày
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(
                                l.status
                              )}`}
                            >
                              {l.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            {l.approver_name ||
                              (l.approver_id
                                ? emp(l.approver_id)?.name || l.approver_id
                                : '—')}
                          </td>
                          <td className="py-3 px-6 text-right">
                            <button
                              type="button"
                              onClick={() => setDetailLeave(l)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>
                                {canReviewLeave(l) ? 'Xử lý duyệt (4.3)' : 'Chi tiết'}
                              </span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Hiển thị{' '}
                {filteredRequests.length
                  ? `${(currentPage - 1) * pageSize + 1}–${Math.min(
                      currentPage * pageSize,
                      filteredRequests.length
                    )}`
                  : '0'}{' '}
                trong {filteredRequests.length} đơn
              </span>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      className={`h-7 w-7 rounded-lg font-medium ${
                        currentPage === p
                          ? 'bg-brand-600 text-white'
                          : 'hover:bg-slate-100 text-slate-600'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500 uppercase">
                  <th className="py-3 px-6">Nhân viên</th>
                  <th className="py-3 px-4">Phòng ban</th>
                  <th className="py-3 px-4">Năm</th>
                  <th className="py-3 px-4">Tổng ngày phép</th>
                  <th className="py-3 px-4">Số ngày đã nghỉ</th>
                  <th className="py-3 px-4">Số ngày còn lại</th>
                  <th className="py-3 px-6 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBalances.map((b) => {
                  const e = emp(b.employee_id)!;
                  return (
                    <tr
                      key={`${b.employee_id}-${b.year}`}
                      className="hover:bg-slate-50/80"
                    >
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`h-8 w-8 rounded-full border flex items-center justify-center text-xs font-bold ${getAvatarColor(
                              e.id
                            )}`}
                          >
                            {getInitials(e.name)}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-900 text-xs">
                              {e.name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {e.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        {deptName(e.department_id)}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-slate-700">
                        {b.year}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-800">
                        {b.total} ngày
                      </td>
                      <td className="py-3 px-4 text-xs text-amber-700 font-medium">
                        {b.used} ngày
                      </td>
                      <td className="py-3 px-4 text-xs font-bold text-emerald-700">
                        {b.remaining} ngày
                      </td>
                      <td className="py-3 px-6 text-right">
                        {canEdit(state.user.role) && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormError('');
                              setBalanceModal(b);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Điều chỉnh</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal Đăng ký nghỉ phép (4.2) */}
      <Modal
        open={createOpen}
        title="Đăng ký nghỉ phép (4.2)"
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={handleSubmitLeave} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
              {formError}
            </div>
          )}

          {isSelfOnly ? (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700">
              Người đăng ký: <strong>{state.user.name}</strong> (
              {state.user.employee_id})
              <input
                type="hidden"
                name="employee_id"
                value={state.user.employee_id}
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nhân viên *
              </label>
              <select
                name="employee_id"
                defaultValue={state.user.employee_id}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {state.employees
                  .filter((e) => e.status !== 'Đã lưu trữ')
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id} - {e.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Loại nghỉ phép *
            </label>
            <select
              name="type_id"
              required
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              {state.leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (Tối đa {t.max_days} ngày/đơn ·{' '}
                  {t.deduct_annual ? 'Trừ phép năm' : 'Không trừ phép năm'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Từ ngày *
              </label>
              <input
                name="start_date"
                type="date"
                required
                min={state.today}
                defaultValue={state.today}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Đến ngày *
              </label>
              <input
                name="end_date"
                type="date"
                required
                min={state.today}
                defaultValue={state.today}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Lý do xin nghỉ *
            </label>
            <textarea
              name="reason"
              rows={3}
              required
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Gửi đơn nghỉ phép
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Chi tiết Đơn nghỉ phép & Nút Duyệt / Từ chối / Hủy */}
      <Modal
        open={!!detailLeave}
        title="Chi tiết đơn nghỉ phép"
        onClose={() => setDetailLeave(null)}
      >
        {detailLeave && (
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {emp(detailLeave.employee_id)?.name ||
                    detailLeave.employee_id}
                </h3>
                <p className="text-xs text-slate-500">
                  Mã đơn: <strong>{detailLeave.id}</strong>
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeClass(
                  detailLeave.status
                )}`}
              >
                {detailLeave.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Loại nghỉ</span>
                <strong className="text-slate-800">
                  {leaveTypeName(detailLeave.type_id)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Số ngày nghỉ</span>
                <strong className="text-slate-800">
                  {detailLeave.days} ngày
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Từ ngày</span>
                <strong className="text-slate-800">
                  {formatDate(detailLeave.start_date)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Đến ngày</span>
                <strong className="text-slate-800">
                  {formatDate(detailLeave.end_date)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Ngày nộp</span>
                <strong className="text-slate-800">
                  {formatDate(detailLeave.submitted_date)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Người duyệt</span>
                <strong className="text-slate-800">
                  {detailLeave.approver_name ||
                    (detailLeave.approver_id
                      ? emp(detailLeave.approver_id)?.name ||
                        detailLeave.approver_id
                      : 'Chưa xử lý')}
                </strong>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block">Lý do xin nghỉ</span>
                <p className="text-slate-800 mt-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {detailLeave.reason}
                </p>
              </div>
              {detailLeave.review_note && (
                <div className="col-span-2">
                  <span className="text-slate-400 block">Ghi chú phê duyệt</span>
                  <p className="text-slate-800 mt-1 bg-amber-50 p-3 rounded-xl border border-amber-200">
                    {detailLeave.review_note}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDetailLeave(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Đóng
              </button>

              {detailLeave.status === 'Chờ duyệt' &&
                (detailLeave.employee_id === state.user.employee_id ||
                  canEdit(state.user.role)) && (
                  <button
                    type="button"
                    onClick={() => handleCancelLeave(detailLeave)}
                    className="rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    Hủy đơn
                  </button>
                )}

              {canReviewLeave(detailLeave) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError('');
                      setReviewModal({ leave: detailLeave, approve: false });
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Từ chối</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError('');
                      setReviewModal({ leave: detailLeave, approve: true });
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Duyệt đơn (4.3)</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Xác nhận Duyệt / Từ chối (4.3) */}
      <Modal
        open={!!reviewModal}
        title={
          reviewModal?.approve
            ? 'Phê duyệt đơn nghỉ phép (4.3)'
            : 'Từ chối đơn nghỉ phép (4.3)'
        }
        onClose={() => setReviewModal(null)}
      >
        {reviewModal && (
          <form onSubmit={handleReviewSubmit} className="space-y-4">
            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
              Nhân viên:{' '}
              <strong>
                {emp(reviewModal.leave.employee_id)?.name ||
                  reviewModal.leave.employee_id}
              </strong>{' '}
              · {reviewModal.leave.days} ngày (
              {formatDate(reviewModal.leave.start_date)} –{' '}
              {formatDate(reviewModal.leave.end_date)})
            </p>
            {formError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
                {formError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {reviewModal.approve
                  ? 'Ghi chú duyệt (không bắt buộc)'
                  : 'Lý do từ chối *'}
              </label>
              <textarea
                name="review_note"
                rows={3}
                required={!reviewModal.approve}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReviewModal(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Quay lại
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`rounded-xl px-4 py-2 text-xs font-semibold text-white ${
                  reviewModal.approve
                    ? 'bg-brand-600 hover:bg-brand-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {reviewModal.approve ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal Điều chỉnh Quỹ phép năm (4.4) */}
      <Modal
        open={!!balanceModal}
        title="Điều chỉnh tổng quỹ phép năm (4.4)"
        onClose={() => setBalanceModal(null)}
      >
        {balanceModal && (
          <form onSubmit={handleSaveBalance} className="space-y-4">
            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
              Nhân viên:{' '}
              <strong>
                {emp(balanceModal.employee_id)?.name ||
                  balanceModal.employee_id}
              </strong>{' '}
              · Đã nghỉ: <strong>{balanceModal.used} ngày</strong>. Tổng ngày
              phép mới không được nhỏ hơn số ngày đã sử dụng.
            </p>
            {formError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Năm *
                </label>
                <input
                  name="year"
                  type="number"
                  required
                  min={2000}
                  max={2100}
                  defaultValue={balanceModal.year}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tổng ngày phép năm *
                </label>
                <input
                  name="total"
                  type="number"
                  required
                  min={balanceModal.used}
                  max={366}
                  defaultValue={balanceModal.total}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBalanceModal(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Lưu quỹ phép
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
