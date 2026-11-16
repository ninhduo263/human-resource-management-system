import React, { useEffect, useState } from 'react';
import {
  LayoutGrid,
  Users,
  Building2,
  FileText,
  Briefcase,
  Calendar,
  BarChart3,
  Shield,
  LogOut,
  Search,
  Bell,
  Menu,
  X,
} from 'lucide-react';
import { AppState, RouteKey } from './types';
import { apiRequest } from './api';
import {
  formatDate,
  getAvatarColor,
  getInitials,
  ROLE_NAMES,
} from './utils/format';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { EmployeesView } from './components/EmployeesView';
import { DepartmentsView } from './components/DepartmentsView';
import { ContractsView } from './components/ContractsView';
import { AssignmentsView } from './components/AssignmentsView';
import { LeavesView } from './components/LeavesView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';

const NAV_ITEMS: { id: RouteKey; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Tổng quan', icon: LayoutGrid },
  { id: 'employees', label: 'Hồ sơ nhân viên', icon: Users },
  { id: 'departments', label: 'Phòng ban & chức vụ', icon: Building2 },
  { id: 'contracts', label: 'Hợp đồng lao động', icon: FileText },
  { id: 'assignments', label: 'Quá trình công tác', icon: Briefcase },
  { id: 'leaves', label: 'Nghỉ phép', icon: Calendar },
  { id: 'reports', label: 'Báo cáo nhân sự', icon: BarChart3 },
];

export const App: React.FC = () => {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<RouteKey>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [empDeptFilter, setEmpDeptFilter] = useState('');
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');

  const [toast, setToast] = useState<{ msg: string; isError: boolean } | null>(
    null
  );

  const notify = (msg: string, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => {
      setToast((prev) => (prev?.msg === msg ? null : prev));
    }, 4500);
  };

  const refreshState = async () => {
    try {
      const data = await apiRequest<AppState>('/api/state');
      setState(data);
    } catch (err: any) {
      if (err.status === 401) {
        setState(null);
      } else {
        notify(err.message || 'Không thể tải dữ liệu.', true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshState();
  }, []);

  const handleLogout = async () => {
    try {
      await apiRequest('/api/logout', {}, 'POST');
    } catch {
      // ignore
    }
    setState(null);
  };

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setEmpDeptFilter('');
    setEmpSearchQuery(globalSearch);
    setRoute('employees');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">
        Đang khởi tạo không gian quản lý nhân sự PeopleOps...
      </div>
    );
  }

  if (!state) {
    return (
      <>
        <LoginView onSuccess={refreshState} />
        {toast && (
          <div
            className={`fixed bottom-5 right-5 z-50 rounded-xl px-4 py-3 text-xs font-semibold shadow-lg border ${
              toast.isError
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-slate-900 text-white border-slate-800'
            }`}
          >
            {toast.msg}
          </div>
        )}
      </>
    );
  }

  const pendingLeavesCount = state.leaves.filter(
    (l) => l.status === 'Chờ duyệt'
  ).length;
  const activeRouteLabel =
    route === 'settings'
      ? state.user.role === 'admin'
        ? 'Quản trị hệ thống'
        : 'Tài khoản của tôi'
      : NAV_ITEMS.find((i) => i.id === route)?.label || 'Tổng quan';

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`no-print fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-200 flex flex-col justify-between transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={() => setRoute('dashboard')}
              className="flex items-center gap-3 text-left"
            >
              <span className="h-9 w-9 rounded-xl bg-brand-500 flex items-center justify-center text-lg font-bold text-white">
                p
              </span>
              <div>
                <strong className="text-base font-bold text-white block leading-none">
                  PeopleOps<span className="text-emerald-400">.</span>
                </strong>
                <small className="text-[11px] text-slate-400">
                  Nhóm 16 · Docker HRMS
                </small>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            PHÂN HỆ NGHIỆP VỤ (BFD)
          </p>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = route === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'employees') {
                      setEmpDeptFilter('');
                      setEmpSearchQuery('');
                    }
                    setRoute(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                    active
                      ? 'bg-brand-600 text-white font-semibold shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'leaves' && pendingLeavesCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950">
                      {pendingLeavesCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-5 border-t border-slate-800 space-y-4">
          <button
            type="button"
            onClick={() => {
              setRoute('settings');
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition ${
              route === 'settings'
                ? 'bg-brand-600 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>
              {state.user.role === 'admin'
                ? 'Quản trị hệ thống'
                : 'Tài khoản của tôi'}
            </span>
          </button>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`h-8 w-8 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${getAvatarColor(
                  state.user.employee_id
                )}`}
              >
                {getInitials(state.user.name)}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">
                  {state.user.name}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {ROLE_NAMES[state.user.role]}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Đăng xuất"
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="no-print h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="text-xs text-slate-500">
              Không gian làm việc /{' '}
              <strong className="text-slate-900">{activeRouteLabel}</strong>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <form
              onSubmit={handleGlobalSearch}
              className="hidden sm:flex items-center relative"
            >
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Tra cứu nhanh nhân viên..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:bg-white focus:border-brand-600 focus:outline-none w-52"
              />
            </form>

            <span className="hidden md:inline text-xs text-slate-400">
              {formatDate(state.today)}
            </span>

            <button
              type="button"
              onClick={() => setRoute('leaves')}
              className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition"
              title="Đơn nghỉ phép chờ duyệt"
            >
              <Bell className="h-4 w-4" />
              {pendingLeavesCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500" />
              )}
            </button>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {route === 'dashboard' && (
            <DashboardView state={state} onNavigate={setRoute} />
          )}
          {route === 'employees' && (
            <EmployeesView
              key={`${empDeptFilter}-${empSearchQuery}`}
              state={state}
              initialDeptFilter={empDeptFilter}
              initialSearch={empSearchQuery}
              onRefresh={refreshState}
              notify={notify}
            />
          )}
          {route === 'departments' && (
            <DepartmentsView
              state={state}
              onRefresh={refreshState}
              notify={notify}
              onNavigate={setRoute}
              onViewDepartmentMembers={(deptId) => {
                setEmpDeptFilter(deptId);
                setEmpSearchQuery('');
                setRoute('employees');
              }}
            />
          )}
          {route === 'contracts' && (
            <ContractsView
              state={state}
              onRefresh={refreshState}
              notify={notify}
            />
          )}
          {route === 'assignments' && (
            <AssignmentsView
              state={state}
              onRefresh={refreshState}
              notify={notify}
            />
          )}
          {route === 'leaves' && (
            <LeavesView
              state={state}
              onRefresh={refreshState}
              notify={notify}
            />
          )}
          {route === 'reports' && (
            <ReportsView state={state} notify={notify} />
          )}
          {route === 'settings' && (
            <SettingsView
              state={state}
              onRefresh={refreshState}
              onForceLogout={() => setState(null)}
              notify={notify}
            />
          )}
        </main>

        {/* Footer */}
        <footer className="no-print px-6 py-4 border-t border-slate-200/60 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between max-w-7xl w-full mx-auto">
          <span>
            © {state.today.slice(0, 4)} PeopleOps HRMS · Hệ thống Quản lý Nhân sự Nhóm 16
          </span>
          <span>PostgreSQL · Express/TypeScript · React/Vite/Tailwind · Docker</span>
        </footer>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 rounded-xl px-4 py-3 text-xs font-semibold shadow-lg border transition ${
            toast.isError
              ? 'bg-rose-600 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-800'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
};
