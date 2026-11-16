import React, { useState } from 'react';
import {
  Plus,
  Download,
  Search,
  Eye,
  CalendarPlus,
  XCircle,
} from 'lucide-react';
import { AppState, Contract } from '../types';
import { apiRequest } from '../api';
import {
  canEdit,
  downloadCsv,
  formatDate,
  formatMoney,
  getAvatarColor,
  getContractStatus,
  getInitials,
  getStatusBadgeClass,
  matchEmployeeQuery,
} from '../utils/format';
import { Modal } from './Modal';

interface ContractsViewProps {
  state: AppState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, isError?: boolean) => void;
}

export const ContractsView: React.FC<ContractsViewProps> = ({
  state,
  onRefresh,
  notify,
}) => {
  const [tab, setTab] = useState<'all' | 'expiring'>('all');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [contractType, setContractType] = useState<string>('Xác định thời hạn');
  const [detailContract, setDetailContract] = useState<Contract | null>(null);
  const [extendTarget, setExtendTarget] = useState<Contract | null>(null);
  const [terminateTarget, setTerminateTarget] = useState<Contract | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const emp = (id: string) => state.employees.find((e) => e.id === id);
  const activeEmployees = state.employees.filter(
    (e) => e.status !== 'Đã lưu trữ'
  );

  const filtered = state.contracts.filter((c) => {
    const cStatus = getContractStatus(c, state.today);
    const matchTab = tab !== 'expiring' || cStatus === 'Sắp hết hạn';
    const matchStatus = !statusFilter || cStatus === statusFilter;
    return (
      matchTab &&
      matchStatus &&
      matchEmployeeQuery(emp(c.employee_id), search, deptFilter)
    );
  });

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleCreateContract = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    const body = {
      ...raw,
      salary: Number(raw.salary),
      end_date:
        raw.type === 'Không xác định thời hạn' ? null : raw.end_date || null,
    };
    try {
      await apiRequest('/api/contracts', body, 'POST');
      setCreateOpen(false);
      notify('Đã lập hợp đồng lao động mới.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExtendContract = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!extendTarget) return;
    setFormError('');
    setSubmitting(true);
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      await apiRequest(
        `/api/contracts/${encodeURIComponent(extendTarget.id)}/extend`,
        body,
        'POST'
      );
      setExtendTarget(null);
      setDetailContract(null);
      notify('Đã gia hạn hợp đồng và lưu lịch sử gia hạn.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTerminateContract = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();
    if (!terminateTarget) return;
    setFormError('');
    setSubmitting(true);
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      await apiRequest(
        `/api/contracts/${encodeURIComponent(terminateTarget.id)}/terminate`,
        body,
        'POST'
      );
      setTerminateTarget(null);
      setDetailContract(null);
      notify('Đã chấm dứt hợp đồng lao động.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    downloadCsv(
      `peopleops-contracts-${state.today}.csv`,
      [
        'Mã hợp đồng',
        'Nhân viên',
        'Loại hợp đồng',
        'Ngày bắt đầu',
        'Ngày kết thúc',
        'Mức lương',
        'Trạng thái',
      ],
      filtered.map((c) => [
        c.id,
        emp(c.employee_id)?.name || c.employee_id,
        c.type,
        c.start_date,
        c.end_date || 'Không xác định',
        c.salary ?? 'Hạn chế truy cập',
        getContractStatus(c, state.today),
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
            PHÂN HỆ 3.0 · BFD 3.1 – 3.4
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            Hợp đồng lao động
          </h1>
          <p className="text-sm text-slate-500">
            Lập hợp đồng (3.1), gia hạn có lịch sử (3.2), chấm dứt (3.3) và theo dõi hết hạn 30 ngày (3.4) (Kho D3).
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
          {canEdit(state.user.role) && (
            <button
              type="button"
              onClick={() => {
                setFormError('');
                setContractType('Xác định thời hạn');
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Lập hợp đồng (3.1)</span>
            </button>
          )}
        </div>
      </div>

      {/* Panel */}
      <section className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setTab('all');
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                tab === 'all'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tất cả hợp đồng ({state.contracts.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('expiring');
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                tab === 'expiring'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Sắp hết hạn 30 ngày (
              {
                state.contracts.filter(
                  (c) => getContractStatus(c, state.today) === 'Sắp hết hạn'
                ).length
              }
              )
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
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
                className="pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:border-brand-600 focus:outline-none w-52"
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

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs"
            >
              <option value="">Tất cả trạng thái</option>
              {[
                'Hiệu lực',
                'Sắp hết hạn',
                'Hết hạn',
                'Chưa hiệu lực',
                'Đã chấm dứt',
              ].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500 uppercase">
                <th className="py-3 px-6">Mã HĐ</th>
                <th className="py-3 px-4">Nhân viên</th>
                <th className="py-3 px-4">Loại hợp đồng</th>
                <th className="py-3 px-4">Thời hạn</th>
                <th className="py-3 px-4">Mức lương / tháng</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-6 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-400">
                    Không có hợp đồng phù hợp.
                  </td>
                </tr>
              ) : (
                rows.map((c) => {
                  const e = emp(c.employee_id);
                  const st = getContractStatus(c, state.today);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-6 font-mono text-xs font-bold text-slate-900">
                        {c.id}
                      </td>
                      <td className="py-3 px-4">
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
                              {e?.name || c.employee_id}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {c.employee_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        {c.type}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        <div>{formatDate(c.start_date)}</div>
                        <div className="text-[11px] text-slate-400">
                          đến {formatDate(c.end_date)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-slate-800">
                        {formatMoney(c.salary)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(
                            st
                          )}`}
                        >
                          {st}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailContract(c)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Chi tiết</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            Hiển thị{' '}
            {filtered.length
              ? `${(currentPage - 1) * pageSize + 1}–${Math.min(
                  currentPage * pageSize,
                  filtered.length
                )}`
              : '0'}{' '}
            trong {filtered.length} hợp đồng
          </span>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
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
            ))}
          </div>
        </div>
      </section>

      {/* Modal Lập hợp đồng mới (3.1) */}
      <Modal
        open={createOpen}
        title="Lập hợp đồng lao động mới (3.1)"
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={handleCreateContract} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã hợp đồng *
              </label>
              <input
                name="id"
                type="text"
                required
                maxLength={30}
                placeholder="VD: HD013"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nhân viên *
              </label>
              <select
                name="employee_id"
                required
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {activeEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id} - {e.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Loại hợp đồng *
              </label>
              <select
                name="type"
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Thử việc">Thử việc</option>
                <option value="Xác định thời hạn">Xác định thời hạn</option>
                <option value="Không xác định thời hạn">
                  Không xác định thời hạn
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mức lương tháng (VND) *
              </label>
              <input
                name="salary"
                type="number"
                required
                min={1}
                max={100000000000}
                step={1}
                placeholder="VD: 15000000"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày bắt đầu *
              </label>
              <input
                name="start_date"
                type="date"
                required
                defaultValue={state.today}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày kết thúc{' '}
                {contractType !== 'Không xác định thời hạn' ? '*' : ''}
              </label>
              <input
                name="end_date"
                type="date"
                required={contractType !== 'Không xác định thời hạn'}
                disabled={contractType === 'Không xác định thời hạn'}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
            </div>
          </div>

          <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
            Hệ thống kiểm tra ngày bắt đầu không trước ngày vào làm và không trùng thời hạn với hợp đồng chưa chấm dứt của cùng nhân viên.
          </p>

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
              Lưu hợp đồng
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Chi tiết Hợp đồng & Lịch sử Gia hạn */}
      <Modal
        open={!!detailContract}
        title="Chi tiết hợp đồng lao động"
        onClose={() => setDetailContract(null)}
        wide
      >
        {detailContract && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Hợp đồng {detailContract.id}
                </h3>
                <p className="text-xs text-slate-500">
                  Nhân viên:{' '}
                  <strong>
                    {emp(detailContract.employee_id)?.name ||
                      detailContract.employee_id}
                  </strong>{' '}
                  ({detailContract.employee_id})
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeClass(
                  getContractStatus(detailContract, state.today)
                )}`}
              >
                {getContractStatus(detailContract, state.today)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Loại hợp đồng</span>
                <strong className="text-slate-800">{detailContract.type}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Mức lương / tháng</span>
                <strong className="text-slate-800">
                  {formatMoney(detailContract.salary)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Ngày bắt đầu</span>
                <strong className="text-slate-800">
                  {formatDate(detailContract.start_date)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Ngày kết thúc</span>
                <strong className="text-slate-800">
                  {formatDate(detailContract.end_date)}
                </strong>
              </div>
              {detailContract.terminated_date && (
                <>
                  <div>
                    <span className="text-slate-400 block">Ngày chấm dứt</span>
                    <strong className="text-rose-700">
                      {formatDate(detailContract.terminated_date)}
                    </strong>
                  </div>
                  <div className="col-span-3">
                    <span className="text-slate-400 block">Lý do chấm dứt</span>
                    <strong className="text-slate-800">
                      {detailContract.termination_reason}
                    </strong>
                  </div>
                </>
              )}
            </div>

            {/* Lịch sử gia hạn (GIAHANHOPDONG) */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Lịch sử gia hạn hợp đồng (3.2 - Thực thể GIAHANHOPDONG)
              </h4>
              <div className="space-y-2">
                {state.extensions
                  .filter((ex) => ex.contract_id === detailContract.id)
                  .map((ex) => (
                    <div
                      key={ex.id}
                      className="rounded-xl border border-slate-200 px-4 py-3 text-xs"
                    >
                      <div className="flex justify-between font-semibold text-slate-900">
                        <span>
                          Lần gia hạn thứ {ex.sequence} ({ex.id})
                        </span>
                        <span>Ngày lập: {formatDate(ex.created_date)}</span>
                      </div>
                      <div className="text-slate-600 mt-1">
                        Hạn cũ: {formatDate(ex.old_end_date)} → Hạn mới:{' '}
                        <strong className="text-emerald-700">
                          {formatDate(ex.new_end_date)}
                        </strong>
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        Lý do: {ex.reason}
                      </div>
                    </div>
                  ))}
                {state.extensions.filter(
                  (ex) => ex.contract_id === detailContract.id
                ).length === 0 && (
                  <p className="text-xs text-slate-400">
                    Chưa có lần gia hạn nào.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDetailContract(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Đóng
              </button>
              {canEdit(state.user.role) &&
                detailContract.status !== 'Đã chấm dứt' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setFormError('');
                        setTerminateTarget(detailContract);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Chấm dứt HĐ (3.3)</span>
                    </button>
                    {detailContract.end_date && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormError('');
                          setExtendTarget(detailContract);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        <span>Gia hạn hợp đồng (3.2)</span>
                      </button>
                    )}
                  </>
                )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Gia hạn Hợp đồng (3.2) */}
      <Modal
        open={!!extendTarget}
        title="Gia hạn hợp đồng lao động (3.2)"
        onClose={() => setExtendTarget(null)}
      >
        {extendTarget && (
          <form onSubmit={handleExtendContract} className="space-y-4">
            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
              Hợp đồng <strong>{extendTarget.id}</strong> · Ngày kết thúc hiện
              tại: <strong>{formatDate(extendTarget.end_date)}</strong>
            </p>
            {formError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
                {formError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày kết thúc mới *
              </label>
              <input
                name="new_end_date"
                type="date"
                required
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lý do gia hạn *
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
                onClick={() => setExtendTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Xác nhận gia hạn
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal Chấm dứt Hợp đồng (3.3) */}
      <Modal
        open={!!terminateTarget}
        title="Chấm dứt hợp đồng lao động (3.3)"
        onClose={() => setTerminateTarget(null)}
      >
        {terminateTarget && (
          <form onSubmit={handleTerminateContract} className="space-y-4">
            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
              Hợp đồng <strong>{terminateTarget.id}</strong> · Toàn bộ lịch sử
              gia hạn vẫn được bảo lưu sau khi chấm dứt.
            </p>
            {formError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
                {formError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày chấm dứt *
              </label>
              <input
                name="terminated_date"
                type="date"
                required
                defaultValue={state.today}
                max={state.today}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lý do chấm dứt *
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
                onClick={() => setTerminateTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Chấm dứt hợp đồng
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
