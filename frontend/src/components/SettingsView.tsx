import React, { useState } from 'react';
import { KeyRound, Plus, Shield } from 'lucide-react';
import { AppState } from '../types';
import { apiRequest } from '../api';
import { getStatusBadgeClass, ROLE_NAMES } from '../utils/format';
import { Modal } from './Modal';

interface SettingsViewProps {
  state: AppState;
  onRefresh: () => Promise<void>;
  onForceLogout: () => void;
  notify: (msg: string, isError?: boolean) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  state,
  onRefresh,
  onForceLogout,
  notify,
}) => {
  const [tab, setTab] = useState<'users' | 'audit'>('users');
  const [pwOpen, setPwOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      await apiRequest('/api/password', body, 'POST');
      setPwOpen(false);
      notify('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
      onForceLogout();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      await apiRequest('/api/users', body, 'POST');
      setAddUserOpen(false);
      notify('Đã tạo tài khoản người dùng mới.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleUser = async (id: string, username: string, active: number) => {
    if (
      !window.confirm(
        `${active ? 'Khóa' : 'Mở khóa'} tài khoản "${username}"?`
      )
    )
      return;
    try {
      await apiRequest(`/api/users/${encodeURIComponent(id)}/toggle`, {}, 'POST');
      notify('Đã cập nhật trạng thái tài khoản.');
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
            QUẢN TRỊ & BẢO MẬT
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            {state.user.role === 'admin'
              ? 'Quản trị hệ thống'
              : 'Tài khoản của tôi'}
          </h1>
          <p className="text-sm text-slate-500">
            Quản lý mật khẩu, phân quyền tài khoản và theo dõi nhật ký hoạt động.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setPwOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <KeyRound className="h-4 w-4" />
            <span>Đổi mật khẩu</span>
          </button>
          {state.user.role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                setFormError('');
                setAddUserOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Tạo tài khoản</span>
            </button>
          )}
        </div>
      </div>

      {state.user.role !== 'admin' ? (
        <section className="rounded-2xl bg-white p-6 border border-slate-200/80 shadow-xs">
          <h2 className="text-base font-bold text-slate-900">
            {state.user.name}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Tên đăng nhập: <strong>{state.user.username}</strong> · Mã nhân
            viên: <strong>{state.user.employee_id}</strong> · Vai trò:{' '}
            <strong>{ROLE_NAMES[state.user.role]}</strong>
          </p>
        </section>
      ) : (
        <section className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('users')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                tab === 'users'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tài khoản ({state.users.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('audit')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                tab === 'audit'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Nhật ký hoạt động ({state.audit.length})
            </button>
          </div>

          {tab === 'users' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500 uppercase">
                    <th className="py-3 px-6">Tên đăng nhập</th>
                    <th className="py-3 px-4">Nhân viên liên kết</th>
                    <th className="py-3 px-4">Vai trò</th>
                    <th className="py-3 px-4">Trạng thái</th>
                    <th className="py-3 px-6 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-6 font-mono text-xs font-bold text-slate-900">
                        {u.username}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        {u.name} ({u.employee_id})
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        {ROLE_NAMES[u.role]}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(
                            u.active ? 'Đang làm việc' : 'Đã hủy'
                          )}`}
                        >
                          {u.active ? 'Đang hoạt động' : 'Đã khóa'}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-right">
                        {u.id !== state.user.id && (
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleUser(u.id, u.username, u.active)
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                          >
                            <Shield className="h-3.5 w-3.5" />
                            <span>
                              {u.active ? 'Khóa tài khoản' : 'Mở khóa'}
                            </span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500 uppercase">
                    <th className="py-3 px-6">Thời gian</th>
                    <th className="py-3 px-4">Tài khoản</th>
                    <th className="py-3 px-4">Hoạt động</th>
                    <th className="py-3 px-6">Đối tượng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.audit.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-6 text-xs text-slate-500">
                        {new Date(a.created_at).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-800">
                        {a.username || 'Hệ thống'}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-slate-800">
                        {a.action}
                      </td>
                      <td className="py-3 px-6 font-mono text-xs text-slate-600">
                        {a.target}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Modal Đổi mật khẩu */}
      <Modal
        open={pwOpen}
        title="Đổi mật khẩu tài khoản"
        onClose={() => setPwOpen(false)}
      >
        <form onSubmit={handleChangePassword} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
              {formError}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mật khẩu hiện tại *
            </label>
            <input
              name="current_password"
              type="password"
              required
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mật khẩu mới (tối thiểu 10 ký tự) *
            </label>
            <input
              name="new_password"
              type="password"
              required
              minLength={10}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPwOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Đổi mật khẩu
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Tạo tài khoản */}
      <Modal
        open={addUserOpen}
        title="Tạo tài khoản mới"
        onClose={() => setAddUserOpen(false)}
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs text-rose-700">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên đăng nhập *
              </label>
              <input
                name="username"
                type="text"
                required
                minLength={3}
                maxLength={50}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nhân viên liên kết *
              </label>
              <select
                name="employee_id"
                required
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
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vai trò *
              </label>
              <select
                name="role"
                defaultValue="employee"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {Object.entries(ROLE_NAMES).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mật khẩu ban đầu (>= 10 ký tự) *
              </label>
              <input
                name="password"
                type="password"
                required
                minLength={10}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setAddUserOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Tạo tài khoản
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
