import React, { useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../api';

interface LoginViewProps {
  onSuccess: () => Promise<void>;
}

const DEMO_ACCOUNTS = [
  { id: 'admin', label: 'Quản trị', desc: 'NV001 · Toàn quyền hệ thống' },
  { id: 'nhansu', label: 'Nhân sự', desc: 'NV009 · Hồ sơ, HĐ, Công tác' },
  { id: 'truongphong', label: 'Trưởng phòng', desc: 'NV002 · Phòng Công nghệ' },
  { id: 'nhanvien', label: 'Nhân viên', desc: 'NV003 · Tự phục vụ cá nhân' },
  { id: 'giamdoc', label: 'Giám đốc', desc: 'NV010 · Báo cáo & Quyết định' },
];

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Demo@12345');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiRequest('/api/login', { username, password });
      await onSuccess();
    } catch (err: any) {
      setError(err.message || 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-12 bg-slate-900">
      <section className="lg:col-span-5 bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900 text-white p-8 lg:p-14 flex flex-col justify-between relative overflow-hidden">
        <div className="flex items-center gap-3 z-10">
          <span className="h-10 w-10 rounded-xl bg-emerald-400/20 border border-emerald-300/30 flex items-center justify-center text-xl font-bold text-emerald-300">
            p
          </span>
          <div>
            <strong className="text-lg tracking-tight block">PeopleOps.</strong>
            <small className="text-emerald-200/80 text-xs">
              People · Work · Together
            </small>
          </div>
        </div>

        <div className="my-12 z-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300 mb-3">
            HỆ THỐNG THÔNG TIN QUẢN LÝ NHÂN SỰ
          </p>
          <h1 className="text-3xl lg:text-4xl font-bold leading-tight mb-4">
            Đồng hành cùng <br />
            mỗi hành trình nhân sự.
          </h1>
          <p className="text-emerald-100/80 text-sm leading-relaxed max-w-md">
            Kết nối hồ sơ nhân viên, cơ cấu phòng ban, hợp đồng lao động, quá trình
            công tác, nghỉ phép và báo cáo thống kê trên nền tảng Docker · PostgreSQL
            · Express · React.
          </p>
        </div>

        <div className="text-xs text-emerald-200/70 flex items-center gap-2 z-10">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>NHÓM 16 · BÀI TẬP LỚN HỆ THỐNG THÔNG TIN QUẢN LÝ</span>
        </div>
      </section>

      <section className="lg:col-span-7 bg-slate-50 flex items-center justify-center p-6 lg:p-16">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600 mb-1">
            CHÀO MỪNG TRỞ LẠI
          </p>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Đăng nhập hệ thống
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Chọn vai trò mẫu bên dưới hoặc nhập thông tin tài khoản của bạn.
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên đăng nhập
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
                placeholder="Nhập tên đăng nhập..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mật khẩu
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
                placeholder="Nhập mật khẩu..."
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-2.5 px-4 text-sm transition shadow-sm"
            >
              <span>{loading ? 'Đang xác thực...' : 'Đăng nhập'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2.5">
              <span>Tài khoản mẫu (5 vai trò DFD)</span>
              <code className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-mono">
                Demo@12345
              </code>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    setUsername(acc.id);
                    setPassword('Demo@12345');
                    setError('');
                  }}
                  title={acc.desc}
                  className={`text-left px-3 py-2 rounded-xl border text-xs transition ${
                    username === acc.id
                      ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50/60'
                  }`}
                >
                  <div className="font-medium">{acc.label}</div>
                  <div className="text-[10px] text-slate-400 truncate">@{acc.id}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};
