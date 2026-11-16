import React, { useState } from 'react';
import {
  Plus,
  Download,
  Search,
  Edit3,
  Archive,
  RotateCcw,
  Eye,
  Phone,
} from 'lucide-react';
import { AppState, Employee } from '../types';
import { apiRequest } from '../api';
import {
  canEdit,
  downloadCsv,
  formatDate,
  getAvatarColor,
  getContractStatus,
  getInitials,
  getStatusBadgeClass,
  matchEmployeeQuery,
} from '../utils/format';
import { Modal } from './Modal';

interface EmployeesViewProps {
  state: AppState;
  initialDeptFilter?: string;
  initialSearch?: string;
  onRefresh: () => Promise<void>;
  notify: (msg: string, isError?: boolean) => void;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  state,
  initialDeptFilter = '',
  initialSearch = '',
  onRefresh,
  notify,
}) => {
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [search, setSearch] = useState(initialSearch);
  const [deptFilter, setDeptFilter] = useState(initialDeptFilter);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [detailEmp, setDetailEmp] = useState<Employee | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [selfContactModal, setSelfContactModal] = useState<Employee | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const deptName = (id: string) =>
    state.departments.find((d) => d.id === id)?.name || id;
  const posName = (id: string) =>
    state.positions.find((p) => p.id === id)?.name || id;

  const filtered = state.employees.filter((e) => {
    const matchTab =
      tab === 'archived' ? e.status === 'Đã lưu trữ' : e.status !== 'Đã lưu trữ';
    const matchStatus = !statusFilter || e.status === statusFilter;
    return matchTab && matchStatus && matchEmployeeQuery(e, search, deptFilter);
  });

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleOpenAdd = () => {
    setEditingEmp(null);
    setFormError('');
    setFormOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setDetailEmp(null);
    setEditingEmp(emp);
    setFormError('');
    setFormOpen(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, any> = Object.fromEntries(fd.entries());

    try {
      if (editingEmp) {
        body.department_id = editingEmp.department_id;
        body.position_id = editingEmp.position_id;
        await apiRequest(
          `/api/employees/${encodeURIComponent(editingEmp.id)}`,
          body,
          'PUT'
        );
        notify('Đã cập nhật hồ sơ nhân viên.');
      } else {
        await apiRequest('/api/employees', body, 'POST');
        notify('Đã thêm hồ sơ nhân viên mới.');
      }
      setFormOpen(false);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSelfContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selfContactModal) return;
    setFormError('');
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      ...Object.fromEntries(fd.entries()),
      self_contact: true,
    };
    try {
      await apiRequest(
        `/api/employees/${encodeURIComponent(selfContactModal.id)}`,
        body,
        'PUT'
      );
      notify('Đã cập nhật thông tin liên hệ cá nhân.');
      setSelfContactModal(null);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (emp: Employee) => {
    if (
      !window.confirm(
        `Lưu trữ hồ sơ nhân viên ${emp.name} (${emp.id})? Lưu ý: Nhân viên phải không còn hợp đồng hiệu lực và đơn phép chờ duyệt.`
      )
    )
      return;
    try {
      await apiRequest(
        `/api/employees/${encodeURIComponent(emp.id)}/archive`,
        {},
        'POST'
      );
      setDetailEmp(null);
      notify('Đã lưu trữ hồ sơ nhân viên.');
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleRestore = async (emp: Employee) => {
    try {
      await apiRequest(
        `/api/employees/${encodeURIComponent(emp.id)}/restore`,
        {},
        'POST'
      );
      setDetailEmp(null);
      notify('Đã khôi phục hồ sơ nhân viên.');
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleExport = () => {
    downloadCsv(
      `peopleops-employees-${state.today}.csv`,
      [
        'Mã NV',
        'Họ tên',
        'Ngày sinh',
        'Giới tính',
        'Email',
        'Số điện thoại',
        'Phòng ban',
        'Chức vụ',
        'Ngày vào làm',
        'Trạng thái',
      ],
      filtered.map((e) => [
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
            PHÂN HỆ 1.0 · BFD 1.1 – 1.4
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Hồ sơ nhân viên</h1>
          <p className="text-sm text-slate-500">
            Thêm mới, cập nhật, tra cứu đa tiêu chí và lưu trữ hồ sơ nhân sự (Kho D1).
          </p>
        </div>
        <div className="flex items-center gap-2.5 no-print">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <Download className="h-4 w-4" />
            <span>Xuất danh sách</span>
          </button>
          {canEdit(state.user.role) && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Thêm nhân viên (1.1)</span>
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <section className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setTab('active');
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                tab === 'active'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Đang làm việc (
              {state.employees.filter((e) => e.status !== 'Đã lưu trữ').length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('archived');
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                tab === 'archived'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Đã lưu trữ (
              {state.employees.filter((e) => e.status === 'Đã lưu trữ').length})
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
                placeholder="Tìm tên, mã NV, email..."
                className="pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:border-brand-600 focus:outline-none w-56"
              />
            </div>

            <select
              value={deptFilter}
              onChange={(e) => {
                setDeptFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
            >
              <option value="">Tất cả phòng ban</option>
              {state.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            {tab === 'active' && (
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="Đang làm việc">Đang làm việc</option>
                <option value="Thử việc">Thử việc</option>
              </select>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500 uppercase">
                <th className="py-3 px-6">Nhân viên</th>
                <th className="py-3 px-4">Mã NV</th>
                <th className="py-3 px-4">Phòng ban</th>
                <th className="py-3 px-4">Chức vụ</th>
                <th className="py-3 px-4">Ngày vào làm</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-6 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-400">
                    Không tìm thấy hồ sơ nhân sự phù hợp.
                  </td>
                </tr>
              ) : (
                rows.map((e) => (
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
                          <div className="text-xs text-slate-500">
                            {e.email} · {e.phone}
                          </div>
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
                    <td className="py-3 px-4 text-slate-600 text-xs">
                      {formatDate(e.join_date)}
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
                    <td className="py-3 px-6 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => setDetailEmp(e)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Chi tiết</span>
                      </button>
                      {canEdit(state.user.role) && e.status !== 'Đã lưu trữ' && (
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(e)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Sửa</span>
                        </button>
                      )}
                      {!canEdit(state.user.role) &&
                        e.id === state.user.employee_id &&
                        e.status !== 'Đã lưu trữ' && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormError('');
                              setSelfContactModal(e);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            <span>Sửa liên hệ</span>
                          </button>
                        )}
                    </td>
                  </tr>
                ))
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
            trong tổng số {filtered.length} hồ sơ
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

      {/* Modal Chi tiết Hồ sơ (1.3 / 1.4) */}
      <Modal
        open={!!detailEmp}
        title="Chi tiết hồ sơ nhân viên (1.3)"
        onClose={() => setDetailEmp(null)}
        wide
      >
        {detailEmp && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
              <span
                className={`h-14 w-14 rounded-2xl border flex items-center justify-center text-lg font-bold ${getAvatarColor(
                  detailEmp.id
                )}`}
              >
                {getInitials(detailEmp.name)}
              </span>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900">
                  {detailEmp.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Mã NV: <strong>{detailEmp.id}</strong> ·{' '}
                  {posName(detailEmp.position_id)} ·{' '}
                  {deptName(detailEmp.department_id)}
                </p>
                <div className="mt-1.5">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(
                      detailEmp.status
                    )}`}
                  >
                    {detailEmp.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Ngày sinh</span>
                <strong className="text-slate-800">
                  {formatDate(detailEmp.birth_date)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Giới tính</span>
                <strong className="text-slate-800">{detailEmp.gender}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Ngày vào làm</span>
                <strong className="text-slate-800">
                  {formatDate(detailEmp.join_date)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Email</span>
                <strong className="text-slate-800">{detailEmp.email}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Số điện thoại</span>
                <strong className="text-slate-800">{detailEmp.phone}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Địa chỉ</span>
                <strong className="text-slate-800">
                  {detailEmp.address || '—'}
                </strong>
              </div>
              {detailEmp.archived_date && (
                <div>
                  <span className="text-slate-400 block">Ngày lưu trữ</span>
                  <strong className="text-rose-700">
                    {formatDate(detailEmp.archived_date)}
                  </strong>
                </div>
              )}
            </div>

            {/* Hợp đồng của nhân viên */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Hợp đồng lao động liên kết
              </h4>
              <div className="space-y-2">
                {state.contracts
                  .filter((c) => c.employee_id === detailEmp.id)
                  .map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-xs"
                    >
                      <div>
                        <strong className="text-slate-900">{c.id}</strong> ·{' '}
                        {c.type}
                        <div className="text-slate-500">
                          {formatDate(c.start_date)} → {formatDate(c.end_date)}
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(
                          getContractStatus(c, state.today)
                        )}`}
                      >
                        {getContractStatus(c, state.today)}
                      </span>
                    </div>
                  ))}
                {state.contracts.filter((c) => c.employee_id === detailEmp.id)
                  .length === 0 && (
                  <p className="text-xs text-slate-400">Chưa có hợp đồng.</p>
                )}
              </div>
            </div>

            {/* Lịch sử công tác */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Quá trình công tác (Điều chuyển / Bổ nhiệm)
              </h4>
              <div className="space-y-2">
                {state.assignments
                  .filter((a) => a.employee_id === detailEmp.id)
                  .map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs"
                    >
                      <div className="flex justify-between font-semibold text-slate-800">
                        <span>{a.type}</span>
                        <span>Hiệu lực: {formatDate(a.effective_date)}</span>
                      </div>
                      <div className="text-slate-600 mt-1">
                        Phòng ban: {deptName(a.old_department_id)} →{' '}
                        <strong>{deptName(a.new_department_id)}</strong> | Chức
                        vụ: {posName(a.old_position_id)} →{' '}
                        <strong>{posName(a.new_position_id)}</strong>
                      </div>
                    </div>
                  ))}
                {state.assignments.filter((a) => a.employee_id === detailEmp.id)
                  .length === 0 && (
                  <p className="text-xs text-slate-400">
                    Chưa có biến động công tác.
                  </p>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDetailEmp(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Đóng
              </button>
              {canEdit(state.user.role) &&
                (detailEmp.status === 'Đã lưu trữ' ? (
                  <button
                    type="button"
                    onClick={() => handleRestore(detailEmp)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Khôi phục hồ sơ (1.4)</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleArchive(detailEmp)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      <span>Lưu trữ hồ sơ (1.4)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(detailEmp)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Chỉnh sửa (1.2)</span>
                    </button>
                  </>
                ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Thêm / Sửa Hồ sơ (1.1 & 1.2) */}
      <Modal
        open={formOpen}
        title={
          editingEmp ? 'Cập nhật hồ sơ nhân viên (1.2)' : 'Thêm hồ sơ nhân viên mới (1.1)'
        }
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSaveEmployee} className="space-y-4">
          <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            {editingEmp
              ? 'Lưu ý: Để thay đổi Phòng ban hoặc Chức vụ của nhân viên, vui lòng sử dụng chức năng Quá trình công tác (4.1) để lưu kèm Quyết định.'
              : 'Hồ sơ nhân viên mới sẽ được tự động khởi tạo quỹ phép mặc định 12 ngày cho năm hiện tại.'}
          </p>

          {formError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã nhân viên *
              </label>
              <input
                name="id"
                type="text"
                required
                readOnly={!!editingEmp}
                defaultValue={editingEmp?.id || ''}
                maxLength={25}
                pattern="[A-Za-z0-9_-]+"
                placeholder="VD: NV013"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm read-only:bg-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Họ và tên *
              </label>
              <input
                name="name"
                type="text"
                required
                defaultValue={editingEmp?.name || ''}
                maxLength={120}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày sinh *
              </label>
              <input
                name="birth_date"
                type="date"
                required
                max={state.today}
                defaultValue={editingEmp?.birth_date || ''}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Giới tính *
              </label>
              <select
                name="gender"
                defaultValue={editingEmp?.gender || 'Nam'}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
                <option value="Khác">Khác</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số điện thoại *
              </label>
              <input
                name="phone"
                type="tel"
                required
                defaultValue={editingEmp?.phone || ''}
                maxLength={20}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email *
              </label>
              <input
                name="email"
                type="email"
                required
                defaultValue={editingEmp?.email || ''}
                maxLength={150}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày vào làm *
              </label>
              <input
                name="join_date"
                type="date"
                required
                defaultValue={editingEmp?.join_date || state.today}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Trạng thái *
              </label>
              <select
                name="status"
                defaultValue={editingEmp?.status || 'Đang làm việc'}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Đang làm việc">Đang làm việc</option>
                <option value="Thử việc">Thử việc</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phòng ban *
              </label>
              <select
                name="department_id"
                disabled={!!editingEmp}
                defaultValue={
                  editingEmp?.department_id || state.departments[0]?.id
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              >
                {state.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chức vụ *
              </label>
              <select
                name="position_id"
                disabled={!!editingEmp}
                defaultValue={editingEmp?.position_id || 'CV01'}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              >
                {state.positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Địa chỉ
              </label>
              <input
                name="address"
                type="text"
                defaultValue={editingEmp?.address || ''}
                maxLength={500}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'Đang lưu...' : 'Lưu thông tin'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Nhân viên tự cập nhật thông tin liên hệ cá nhân (DFD 1.2) */}
      <Modal
        open={!!selfContactModal}
        title="Cập nhật thông tin liên hệ cá nhân (1.2)"
        onClose={() => setSelfContactModal(null)}
      >
        {selfContactModal && (
          <form onSubmit={handleSaveSelfContact} className="space-y-4">
            {formError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
                {formError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số điện thoại *
              </label>
              <input
                name="phone"
                type="tel"
                required
                defaultValue={selfContactModal.phone}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email *
              </label>
              <input
                name="email"
                type="email"
                required
                defaultValue={selfContactModal.email}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Địa chỉ
              </label>
              <input
                name="address"
                type="text"
                defaultValue={selfContactModal.address}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelfContactModal(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Lưu liên hệ
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
