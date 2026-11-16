import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Edit3,
  Trash2,
  Users,
  ArrowRightLeft,
} from 'lucide-react';
import { AppState, Department, Position, RouteKey } from '../types';
import { apiRequest } from '../api';
import {
  canAssign,
  canEdit,
  formatDate,
  getAvatarColor,
  getInitials,
} from '../utils/format';
import { Modal } from './Modal';

interface DepartmentsViewProps {
  state: AppState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, isError?: boolean) => void;
  onViewDepartmentMembers: (deptId: string) => void;
  onNavigate: (route: RouteKey) => void;
}

export const DepartmentsView: React.FC<DepartmentsViewProps> = ({
  state,
  onRefresh,
  notify,
  onViewDepartmentMembers,
  onNavigate,
}) => {
  const [tab, setTab] = useState<'departments' | 'positions'>('departments');
  const [deptModal, setDeptModal] = useState<{
    open: boolean;
    item: Department | null;
  }>({ open: false, item: null });
  const [posModal, setPosModal] = useState<{
    open: boolean;
    item: Position | null;
  }>({ open: false, item: null });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeEmployees = state.employees.filter(
    (e) => e.status !== 'Đã lưu trữ'
  );

  const handleSaveDepartment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      if (deptModal.item) {
        await apiRequest(
          `/api/departments/${encodeURIComponent(deptModal.item.id)}`,
          body,
          'PUT'
        );
        notify('Đã cập nhật phòng ban.');
      } else {
        await apiRequest('/api/departments', body, 'POST');
        notify('Đã thêm phòng ban mới.');
      }
      setDeptModal({ open: false, item: null });
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    if (
      !window.confirm(
        `Xóa phòng ban ${id}? Chỉ xóa được danh mục chưa có nhân sự hoặc lịch sử công tác.`
      )
    )
      return;
    try {
      await apiRequest(
        `/api/departments/${encodeURIComponent(id)}`,
        {},
        'DELETE'
      );
      setDeptModal({ open: false, item: null });
      notify('Đã xóa phòng ban.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const handleSavePosition = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    const body = { ...raw, level: Number(raw.level) };
    try {
      if (posModal.item) {
        await apiRequest(
          `/api/positions/${encodeURIComponent(posModal.item.id)}`,
          body,
          'PUT'
        );
        notify('Đã cập nhật chức vụ.');
      } else {
        await apiRequest('/api/positions', body, 'POST');
        notify('Đã thêm chức vụ mới.');
      }
      setPosModal({ open: false, item: null });
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePosition = async (id: string) => {
    if (
      !window.confirm(
        `Xóa chức vụ ${id}? Chỉ xóa được chức vụ chưa được sử dụng.`
      )
    )
      return;
    try {
      await apiRequest(`/api/positions/${encodeURIComponent(id)}`, {}, 'DELETE');
      setPosModal({ open: false, item: null });
      notify('Đã xóa chức vụ.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
            PHÂN HỆ 2.0 · BFD 2.1 – 2.4
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            Phòng ban & Chức vụ
          </h1>
          <p className="text-sm text-slate-500">
            Quản lý cơ cấu phòng ban (2.1), danh mục chức vụ (2.2), phân bổ (2.3) và bổ nhiệm (2.4) (Kho D2).
          </p>
        </div>

        <div className="flex items-center gap-2.5 no-print">
          {canAssign(state.user.role) && (
            <button
              type="button"
              onClick={() => onNavigate('assignments')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              <ArrowRightLeft className="h-4 w-4" />
              <span>Phân bổ / Bổ nhiệm (2.3 & 2.4)</span>
            </button>
          )}
          {canEdit(state.user.role) && (
            <button
              type="button"
              onClick={() => {
                setFormError('');
                if (tab === 'departments')
                  setDeptModal({ open: true, item: null });
                else setPosModal({ open: true, item: null });
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>
                {tab === 'departments'
                  ? 'Thêm phòng ban (2.1)'
                  : 'Thêm chức vụ (2.2)'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('departments')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
            tab === 'departments'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Phòng ban ({state.departments.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('positions')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
            tab === 'positions'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Chức vụ ({state.positions.length})
        </button>
      </div>

      {/* Content */}
      {tab === 'departments' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {state.departments.map((d) => {
            const members = activeEmployees.filter(
              (e) => e.department_id === d.id
            );
            return (
              <section
                key={d.id}
                className="rounded-2xl bg-white p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="p-2.5 rounded-xl bg-brand-50 text-brand-600">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-slate-100 text-slate-700">
                      {d.id}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">
                    {d.name}
                  </h3>
                  <p className="text-xs text-slate-500 mb-3 min-h-[2rem]">
                    {d.description || 'Chưa có mô tả phòng ban.'}
                  </p>
                  <p className="text-[11px] text-slate-400 mb-4">
                    Thành lập: {formatDate(d.founded_date)}
                  </p>

                  <div className="flex -space-x-2 overflow-hidden mb-4 min-h-[2rem]">
                    {members.slice(0, 6).map((e) => (
                      <span
                        key={e.id}
                        title={e.name}
                        className={`inline-flex h-8 w-8 rounded-full ring-2 ring-white items-center justify-center text-[11px] font-bold border ${getAvatarColor(
                          e.id
                        )}`}
                      >
                        {getInitials(e.name)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    {members.length} nhân viên
                  </span>
                  <div className="space-x-3">
                    <button
                      type="button"
                      onClick={() => onViewDepartmentMembers(d.id)}
                      className="font-semibold text-brand-600 hover:underline"
                    >
                      Xem nhân sự
                    </button>
                    {canEdit(state.user.role) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormError('');
                          setDeptModal({ open: true, item: d });
                        }}
                        className="font-semibold text-slate-600 hover:text-slate-900"
                      >
                        Sửa
                      </button>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500 uppercase">
                  <th className="py-3 px-6">Mã chức vụ</th>
                  <th className="py-3 px-4">Tên chức vụ</th>
                  <th className="py-3 px-4">Cấp bậc (1–10)</th>
                  <th className="py-3 px-4">Mô tả</th>
                  <th className="py-3 px-4">Số nhân viên</th>
                  <th className="py-3 px-6 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.positions.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-6 font-mono text-xs text-slate-700">
                      {p.id}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {p.name}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-700">
                        Cấp {p.level}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {p.description || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {
                        activeEmployees.filter((e) => e.position_id === p.id)
                          .length
                      }{' '}
                      nhân viên
                    </td>
                    <td className="py-3 px-6 text-right">
                      {canEdit(state.user.role) && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormError('');
                            setPosModal({ open: true, item: p });
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Chỉnh sửa</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal Phòng ban */}
      <Modal
        open={deptModal.open}
        title={
          deptModal.item ? 'Chỉnh sửa phòng ban (2.1)' : 'Thêm phòng ban mới (2.1)'
        }
        onClose={() => setDeptModal({ open: false, item: null })}
      >
        <form onSubmit={handleSaveDepartment} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã phòng ban *
              </label>
              <input
                name="id"
                type="text"
                required
                readOnly={!!deptModal.item}
                defaultValue={deptModal.item?.id || ''}
                maxLength={25}
                pattern="[A-Za-z0-9_-]+"
                placeholder="VD: PB07"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm read-only:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày thành lập *
              </label>
              <input
                name="founded_date"
                type="date"
                required
                defaultValue={deptModal.item?.founded_date || state.today}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên phòng ban *
              </label>
              <input
                name="name"
                type="text"
                required
                defaultValue={deptModal.item?.name || ''}
                maxLength={120}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mô tả chức năng nhiệm vụ
              </label>
              <textarea
                name="description"
                rows={3}
                defaultValue={deptModal.item?.description || ''}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            {deptModal.item ? (
              <button
                type="button"
                onClick={() => handleDeleteDepartment(deptModal.item!.id)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Xóa danh mục</span>
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeptModal({ open: false, item: null })}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal Chức vụ */}
      <Modal
        open={posModal.open}
        title={
          posModal.item ? 'Chỉnh sửa chức vụ (2.2)' : 'Thêm chức vụ mới (2.2)'
        }
        onClose={() => setPosModal({ open: false, item: null })}
      >
        <form onSubmit={handleSavePosition} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã chức vụ *
              </label>
              <input
                name="id"
                type="text"
                required
                readOnly={!!posModal.item}
                defaultValue={posModal.item?.id || ''}
                maxLength={25}
                pattern="[A-Za-z0-9_-]+"
                placeholder="VD: CV06"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm read-only:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cấp bậc (1–10) *
              </label>
              <input
                name="level"
                type="number"
                required
                min={1}
                max={10}
                step={1}
                defaultValue={posModal.item?.level || 2}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên chức vụ *
              </label>
              <input
                name="name"
                type="text"
                required
                defaultValue={posModal.item?.name || ''}
                maxLength={120}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mô tả
              </label>
              <textarea
                name="description"
                rows={3}
                defaultValue={posModal.item?.description || ''}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            {posModal.item ? (
              <button
                type="button"
                onClick={() => handleDeletePosition(posModal.item!.id)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Xóa danh mục</span>
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPosModal({ open: false, item: null })}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
