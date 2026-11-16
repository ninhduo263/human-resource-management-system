import React, { useState } from 'react';
import { Plus, Download, Search, FileText } from 'lucide-react';
import { AppState, Decision } from '../types';
import { apiRequest } from '../api';
import {
  canAssign,
  downloadCsv,
  formatDate,
  getAvatarColor,
  getInitials,
  getStatusBadgeClass,
  matchEmployeeQuery,
} from '../utils/format';
import { Modal } from './Modal';

interface AssignmentsViewProps {
  state: AppState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, isError?: boolean) => void;
}

export const AssignmentsView: React.FC<AssignmentsViewProps> = ({
  state,
  onRefresh,
  notify,
}) => {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [detailDecision, setDetailDecision] = useState<Decision | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // State cho biểu mẫu ghi nhận công tác (hỗ trợ tái sử dụng Quyết định 1-N)
  const activeEmployees = state.employees.filter(
    (e) => e.status !== 'Đã lưu trữ'
  );
  const [selectedEmpId, setSelectedEmpId] = useState(
    activeEmployees[0]?.id || ''
  );
  const [newDeptId, setNewDeptId] = useState(state.departments[0]?.id || '');
  const [newPosId, setNewPosId] = useState(state.positions[0]?.id || '');
  const [moveType, setMoveType] = useState<string>('Điều chuyển');
  const [decisionNumber, setDecisionNumber] = useState('');
  const [signedDate, setSignedDate] = useState(state.today);
  const [effectiveDate, setEffectiveDate] = useState(state.today);
  const [signer, setSigner] = useState('Trần Hải Đăng');
  const [reason, setReason] = useState('');

  const emp = (id: string) => state.employees.find((e) => e.id === id);
  const deptName = (id: string) =>
    state.departments.find((d) => d.id === id)?.name || id;
  const posName = (id: string) =>
    state.positions.find((p) => p.id === id)?.name || id;

  const filtered = state.assignments.filter((a) =>
    matchEmployeeQuery(emp(a.employee_id), search, deptFilter)
  );

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleOpenForm = () => {
    const first = activeEmployees[0];
    setSelectedEmpId(first?.id || '');
    setNewDeptId(first?.department_id || state.departments[0]?.id || '');
    setNewPosId(first?.position_id || state.positions[0]?.id || '');
    setMoveType('Điều chuyển');
    setDecisionNumber('');
    setSignedDate(state.today);
    setEffectiveDate(state.today);
    setSigner('Trần Hải Đăng');
    setReason('');
    setFormError('');
    setFormOpen(true);
  };

  // Tự động gợi ý loại biến động khi chọn Phòng ban mới / Chức vụ mới
  const updateSuggestedType = (empId: string, dId: string, pId: string) => {
    const e = emp(empId);
    if (!e) return;
    if (e.department_id !== dId && e.position_id !== pId) {
      setMoveType('Điều chuyển và bổ nhiệm');
    } else if (e.department_id !== dId) {
      setMoveType('Điều chuyển');
    } else if (e.position_id !== pId) {
      setMoveType('Bổ nhiệm');
    }
  };

  const handleSelectExistingDecision = (decId: string) => {
    const d = state.decisions.find((x) => x.id === decId);
    if (!d) return;
    setDecisionNumber(d.number);
    setMoveType(d.type);
    setSignedDate(d.signed_date);
    setEffectiveDate(d.effective_date);
    setSigner(d.signer);
    setReason(d.content);
  };

  const handleSaveAssignment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest(
        '/api/assignments',
        {
          employee_id: selectedEmpId,
          type: moveType,
          number: decisionNumber,
          new_department_id: newDeptId,
          new_position_id: newPosId,
          signed_date: signedDate,
          effective_date: effectiveDate,
          signer,
          reason,
        },
        'POST'
      );
      setFormOpen(false);
      notify('Đã ghi nhận quyết định công tác và cập nhật hồ sơ nhân viên.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    downloadCsv(
      `peopleops-assignments-${state.today}.csv`,
      [
        'Nhân viên',
        'Loại biến động',
        'Phòng ban cũ',
        'Phòng ban mới',
        'Chức vụ cũ',
        'Chức vụ mới',
        'Ngày hiệu lực',
        'Số quyết định',
      ],
      filtered.map((a) => [
        emp(a.employee_id)?.name || a.employee_id,
        a.type,
        deptName(a.old_department_id),
        deptName(a.new_department_id),
        posName(a.old_position_id),
        posName(a.new_position_id),
        a.effective_date,
        state.decisions.find((d) => d.id === a.decision_id)?.number ||
          a.decision_id,
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
            PHÂN HỆ 2.0 & 4.0 · BFD 2.3, 2.4 & 4.1
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            Quá trình công tác & Quyết định
          </h1>
          <p className="text-sm text-slate-500">
            Lưu vết điều chuyển phòng ban (2.3), bổ nhiệm chức vụ (2.4) và quyết định nhân sự 1–N (4.1) (Kho D4).
          </p>
        </div>

        <div className="flex items-center gap-2.5 no-print">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <Download className="h-4 w-4" />
            <span>Xuất lịch sử</span>
          </button>
          {canAssign(state.user.role) && (
            <button
              type="button"
              onClick={handleOpenForm}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Ghi nhận công tác (4.1)</span>
            </button>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-2xl bg-brand-50 border border-brand-200 px-5 py-3.5 text-xs text-brand-800">
        Mỗi thay đổi phòng ban hoặc chức vụ đều gắn với một <strong>Quyết định (QUYETDINH)</strong> và cập nhật đồng thời vào hồ sơ nhân viên trong cùng một giao dịch. Nhiều nhân viên có thể dùng chung một Quyết định (quan hệ 1–N).
      </div>

      {/* Table */}
      <section className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <strong className="text-xs uppercase tracking-wider text-slate-500">
            Lịch sử biến động nhân sự ({filtered.length})
          </strong>
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
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500 uppercase">
                <th className="py-3 px-6">Nhân viên</th>
                <th className="py-3 px-4">Loại biến động</th>
                <th className="py-3 px-4">Phòng ban (Cũ → Mới)</th>
                <th className="py-3 px-4">Chức vụ (Cũ → Mới)</th>
                <th className="py-3 px-4">Ngày hiệu lực</th>
                <th className="py-3 px-4">Số quyết định</th>
                <th className="py-3 px-6 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-400">
                    Chưa có lịch sử quá trình công tác.
                  </td>
                </tr>
              ) : (
                rows.map((a) => {
                  const e = emp(a.employee_id);
                  const dec = state.decisions.find(
                    (d) => d.id === a.decision_id
                  );
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/80">
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
                              {e?.name || a.employee_id}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {a.employee_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(
                            a.type
                          )}`}
                        >
                          {a.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        <span className="text-slate-400">
                          {deptName(a.old_department_id)}
                        </span>{' '}
                        →{' '}
                        <strong className="text-slate-900">
                          {deptName(a.new_department_id)}
                        </strong>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        <span className="text-slate-400">
                          {posName(a.old_position_id)}
                        </span>{' '}
                        →{' '}
                        <strong className="text-slate-900">
                          {posName(a.new_position_id)}
                        </strong>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {formatDate(a.effective_date)}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800">
                        {dec?.number || a.decision_id}
                      </td>
                      <td className="py-3 px-6 text-right">
                        {dec && (
                          <button
                            type="button"
                            onClick={() => setDetailDecision(dec)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>Xem QĐ</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Ghi nhận công tác (4.1) */}
      <Modal
        open={formOpen}
        title="Ghi nhận quá trình công tác & Quyết định (4.1)"
        onClose={() => setFormOpen(false)}
        wide
      >
        <form onSubmit={handleSaveAssignment} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
              {formError}
            </div>
          )}

          {state.decisions.length > 0 && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dùng chung Quyết định đã ban hành (Quan hệ ERD 1 Quyết định – Nhiều Quá trình công tác)
              </label>
              <select
                onChange={(e) => handleSelectExistingDecision(e.target.value)}
                defaultValue=""
                className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs bg-white"
              >
                <option value="">
                  — Tạo quyết định mới hoặc chọn quyết định có sẵn để điền nhanh —
                </option>
                {state.decisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.number} · {d.type} · Ngày HL: {d.effective_date} (Người ký: {d.signer})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nhân viên *
              </label>
              <select
                value={selectedEmpId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedEmpId(id);
                  const target = emp(id);
                  if (target) {
                    setNewDeptId(target.department_id);
                    setNewPosId(target.position_id);
                  }
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {activeEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id} - {e.name} (Hiện tại: {deptName(e.department_id)} ·{' '}
                    {posName(e.position_id)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phòng ban mới *
              </label>
              <select
                value={newDeptId}
                onChange={(e) => {
                  setNewDeptId(e.target.value);
                  updateSuggestedType(selectedEmpId, e.target.value, newPosId);
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
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
                Chức vụ mới *
              </label>
              <select
                value={newPosId}
                onChange={(e) => {
                  setNewPosId(e.target.value);
                  updateSuggestedType(selectedEmpId, newDeptId, e.target.value);
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {state.positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Loại biến động *
              </label>
              <select
                value={moveType}
                onChange={(e) => setMoveType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Điều chuyển">Điều chuyển</option>
                <option value="Bổ nhiệm">Bổ nhiệm</option>
                <option value="Điều chuyển và bổ nhiệm">
                  Điều chuyển và bổ nhiệm
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số quyết định *
              </label>
              <input
                type="text"
                required
                value={decisionNumber}
                onChange={(e) => setDecisionNumber(e.target.value)}
                maxLength={60}
                placeholder="VD: 02/2026/QD-NS"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày ký quyết định *
              </label>
              <input
                type="date"
                required
                max={state.today}
                value={signedDate}
                onChange={(e) => setSignedDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày hiệu lực *
              </label>
              <input
                type="date"
                required
                max={state.today}
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Người ký quyết định *
              </label>
              <input
                type="text"
                required
                value={signer}
                onChange={(e) => setSigner(e.target.value)}
                maxLength={120}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nội dung quyết định / Lý do biến động *
              </label>
              <textarea
                rows={3}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Lưu quyết định & Cập nhật hồ sơ
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Chi tiết Quyết định */}
      <Modal
        open={!!detailDecision}
        title="Chi tiết Quyết định nhân sự (Thực thể QUYETDINH)"
        onClose={() => setDetailDecision(null)}
      >
        {detailDecision && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-slate-400 block">Mã bản ghi</span>
                <strong className="text-slate-900 font-mono">
                  {detailDecision.id}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Số quyết định</span>
                <strong className="text-slate-900 font-mono">
                  {detailDecision.number}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Loại quyết định</span>
                <strong className="text-slate-900">
                  {detailDecision.type}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Người ký</span>
                <strong className="text-slate-900">
                  {detailDecision.signer}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Ngày ký</span>
                <strong className="text-slate-900">
                  {formatDate(detailDecision.signed_date)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Ngày hiệu lực</span>
                <strong className="text-slate-900">
                  {formatDate(detailDecision.effective_date)}
                </strong>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block">Nội dung quyết định</span>
                <p className="text-slate-800 mt-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {detailDecision.content}
                </p>
              </div>
            </div>

            <div>
              <span className="text-slate-400 block mb-1.5">
                Danh sách nhân sự áp dụng theo quyết định này:
              </span>
              <div className="space-y-1.5">
                {state.assignments
                  .filter((a) => a.decision_id === detailDecision.id)
                  .map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-slate-200 px-3 py-2 flex justify-between"
                    >
                      <strong>
                        {emp(a.employee_id)?.name || a.employee_id}
                      </strong>
                      <span className="text-slate-500">
                        {deptName(a.old_department_id)} →{' '}
                        {deptName(a.new_department_id)} |{' '}
                        {posName(a.old_position_id)} →{' '}
                        {posName(a.new_position_id)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
