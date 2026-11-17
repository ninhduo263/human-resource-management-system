import React, { useEffect, useState } from 'react';
import {
  ConfigProvider,
  Layout,
  Menu,
  Input,
  Badge,
  Avatar,
  Button,
  Space,
  Typography,
  Spin,
  message,
  Drawer,
} from 'antd';
import viVN from 'antd/locale/vi_VN';
import {
  AppstoreOutlined,
  TeamOutlined,
  BankOutlined,
  FileTextOutlined,
  AuditOutlined,
  CalendarOutlined,
  BarChartOutlined,
  SafetyCertificateOutlined,
  LogoutOutlined,
  BellOutlined,
  SearchOutlined,
  MenuOutlined,
  MoreOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { AppState, RouteKey } from './types';
import { apiRequest } from './api';
import {
  formatDate,
  getAvatarHex,
  getInitials,
  ROLE_NAMES,
} from './utils/format';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { EmployeesView } from './components/EmployeesView';
import { DepartmentsView } from './components/DepartmentsView';
import { ContractsView } from './components/ContractsView';
import { AssignmentsView } from './components/AssignmentsView';
import { RewardsView } from './components/RewardsView';
import { LeavesView } from './components/LeavesView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';

const { Sider, Header, Content, Footer } = Layout;
const { Text } = Typography;

export const App: React.FC = () => {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<RouteKey>('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const [empDeptFilter, setEmpDeptFilter] = useState('');
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');

  const [messageApi, contextHolder] = message.useMessage();

  const notify = (msg: string, isError = false) => {
    if (isError) {
      messageApi.error(msg);
    } else {
      messageApi.success(msg);
    }
  };

  const navigateTo = (newRoute: RouteKey) => {
    if (newRoute === 'employees') {
      setEmpDeptFilter('');
      setEmpSearchQuery('');
    }
    setRoute(newRoute);
    setMobileDrawerOpen(false);
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

  const themeConfig = {
    token: {
      colorPrimary: '#12584b',
      borderRadius: 10,
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    },
  };

  if (loading) {
    return (
      <ConfigProvider locale={viVN} theme={themeConfig}>
        {contextHolder}
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
          <Spin size="large" />
          <Text type="secondary">
            Đang khởi tạo không gian quản lý nhân sự PeopleOps (Ant Design)...
          </Text>
        </div>
      </ConfigProvider>
    );
  }

  if (!state) {
    return (
      <ConfigProvider locale={viVN} theme={themeConfig}>
        {contextHolder}
        <LoginView onSuccess={refreshState} />
      </ConfigProvider>
    );
  }

  const pendingLeavesCount = state.leaves.filter(
    (l) => l.status === 'Chờ duyệt'
  ).length;

  const menuItems = [
    {
      key: 'dashboard',
      icon: <AppstoreOutlined />,
      label: 'Tổng quan',
    },
    {
      key: 'employees',
      icon: <TeamOutlined />,
      label: 'Hồ sơ nhân viên',
    },
    {
      key: 'departments',
      icon: <BankOutlined />,
      label: 'Phòng ban & Chức vụ',
    },
    {
      key: 'contracts',
      icon: <FileTextOutlined />,
      label: 'Hợp đồng lao động',
    },
    {
      key: 'assignments',
      icon: <AuditOutlined />,
      label: 'Quá trình công tác',
    },
    {
      key: 'rewards',
      icon: <TrophyOutlined />,
      label: 'Khen thưởng & Kỷ luật',
    },
    {
      key: 'leaves',
      icon: <CalendarOutlined />,
      label: (
        <span className="flex items-center justify-between">
          <span>Nghỉ phép</span>
          {pendingLeavesCount > 0 && (
            <Badge count={pendingLeavesCount} size="small" />
          )}
        </span>
      ),
    },
    {
      key: 'reports',
      icon: <BarChartOutlined />,
      label: 'Báo cáo nhân sự',
    },
    {
      key: 'settings',
      icon: <SafetyCertificateOutlined />,
      label:
        state.user.role === 'admin' ? 'Quản trị hệ thống' : 'Tài khoản của tôi',
    },
  ];

  return (
    <ConfigProvider locale={viVN} theme={themeConfig}>
      {contextHolder}
      <Layout style={{ minHeight: '100vh' }}>
        {/* Desktop Sider */}
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={245}
          theme="dark"
          className="hidden lg:block no-print shrink-0"
        >
          <div className="p-4 flex items-center gap-3 border-b border-slate-800">
            <div className="h-9 w-9 rounded-xl bg-[#1f7a68] flex items-center justify-center text-lg font-bold text-white shrink-0">
              p
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <strong className="text-white block leading-none truncate">
                  PeopleOps<span className="text-emerald-400">.</span>
                </strong>
                <small className="text-[11px] text-slate-400 truncate block mt-0.5">
                  Nhóm 16 · Ant Design UI
                </small>
              </div>
            )}
          </div>

          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[route]}
            items={menuItems}
            onClick={({ key }) => navigateTo(key as RouteKey)}
            style={{ marginTop: 8 }}
          />
        </Sider>

        {/* Mobile / Tablet / Fold Navigation Drawer */}
        <Drawer
          placement="left"
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          width={280}
          className="no-print"
          styles={{
            body: {
              padding: 0,
              backgroundColor: '#001529',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            },
            header: {
              backgroundColor: '#001529',
              borderBottom: '1px solid #1e293b',
              color: '#fff',
            },
          }}
          title={
            <div className="flex items-center gap-3 py-1">
              <div className="h-8 w-8 rounded-xl bg-[#1f7a68] flex items-center justify-center text-base font-bold text-white shrink-0">
                p
              </div>
              <div>
                <strong className="text-white block leading-none text-base">
                  PeopleOps<span className="text-emerald-400">.</span>
                </strong>
                <small className="text-[11px] text-slate-400 block mt-0.5 font-normal">
                  Nhóm 16 · Quản lý nhân sự
                </small>
              </div>
            </div>
          }
        >
          <div className="flex-1 overflow-y-auto">
            <Menu
              theme="dark"
              mode="inline"
              selectedKeys={[route]}
              items={menuItems}
              onClick={({ key }) => navigateTo(key as RouteKey)}
              style={{ marginTop: 8 }}
            />
          </div>

          <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
            <Space>
              <Avatar
                style={{
                  backgroundColor: getAvatarHex(state.user.employee_id),
                }}
              >
                {getInitials(state.user.name)}
              </Avatar>
              <div className="leading-tight">
                <div className="text-xs font-semibold text-white truncate max-w-[130px]">
                  {state.user.name}
                </div>
                <div className="text-[11px] text-slate-400">
                  {ROLE_NAMES[state.user.role]}
                </div>
              </div>
            </Space>
            <Button
              type="text"
              danger
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              title="Đăng xuất"
            />
          </div>
        </Drawer>

        <Layout className="flex flex-col min-w-0">
          {/* Header */}
          <Header
            style={{
              background: '#fff',
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #f0f0f0',
              position: 'sticky',
              top: 0,
              zIndex: 30,
            }}
            className="no-print sm:px-6"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setMobileDrawerOpen(true)}
                className="lg:hidden"
                title="Mở menu điều hướng"
              />

              <div className="flex items-center gap-2 lg:hidden font-bold text-slate-800 text-sm shrink-0">
                <div className="h-7 w-7 rounded-lg bg-[#1f7a68] flex items-center justify-center text-xs font-bold text-white">
                  p
                </div>
                <span className="hidden xs:inline">PeopleOps</span>
              </div>

              <Input
                prefix={<SearchOutlined className="text-slate-400" />}
                placeholder="Tra cứu nhân viên..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onPressEnter={() => {
                  setEmpDeptFilter('');
                  setEmpSearchQuery(globalSearch);
                  navigateTo('employees');
                }}
                className="w-24 xs:w-36 sm:w-56 md:w-72"
                allowClear
                size="middle"
              />
            </div>

            <Space size="small">
              <Text type="secondary" className="hidden lg:inline text-xs">
                {formatDate(state.today)}
              </Text>

              <Badge count={pendingLeavesCount} size="small">
                <Button
                  type="text"
                  shape="circle"
                  icon={<BellOutlined />}
                  onClick={() => navigateTo('leaves')}
                  title="Đơn nghỉ phép chờ duyệt"
                />
              </Badge>

              <Space size={6}>
                <Avatar
                  style={{
                    backgroundColor: getAvatarHex(state.user.employee_id),
                  }}
                  size="default"
                >
                  {getInitials(state.user.name)}
                </Avatar>
                <div className="hidden sm:block leading-tight">
                  <div className="text-xs font-semibold text-slate-900 max-w-[120px] truncate">
                    {state.user.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {ROLE_NAMES[state.user.role]}
                  </div>
                </div>
              </Space>

              <Button
                type="text"
                danger
                icon={<LogoutOutlined />}
                onClick={handleLogout}
                title="Đăng xuất"
              >
                <span className="hidden sm:inline ml-0.5">Đăng xuất</span>
              </Button>
            </Space>
          </Header>

          {/* Main Content Area */}
          <Content className="p-3 sm:p-5 md:p-6 pb-24 lg:pb-8 max-w-[1360px] mx-auto w-full min-w-0">
            {route === 'dashboard' && (
              <DashboardView state={state} onNavigate={navigateTo} />
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
                onNavigate={navigateTo}
                onViewDepartmentMembers={(deptId) => {
                  setEmpDeptFilter(deptId);
                  setEmpSearchQuery('');
                  navigateTo('employees');
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
            {route === 'rewards' && (
              <RewardsView
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
          </Content>

          {/* Footer */}
          <Footer
            style={{ textAlign: 'center', fontSize: 12, color: '#64748b', padding: '16px' }}
            className="no-print pb-24 lg:pb-4"
          >
            © {state.today.slice(0, 4)} PeopleOps HRMS · Hệ thống Quản lý Nhân sự Nhóm 16
          </Footer>

          {/* Mobile Bottom Navigation Bar for Mobile, Fold & Smart Devices */}
          <nav
            aria-label="Điều hướng nhanh thiết bị di động"
            className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 flex items-center justify-around py-1.5 px-1 lg:hidden shadow-lg mobile-safe-bottom no-print"
          >
            <button
              type="button"
              onClick={() => navigateTo('dashboard')}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-xs transition-colors ${
                route === 'dashboard'
                  ? 'text-[#12584b] font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <AppstoreOutlined className="text-lg" />
              <span className="text-[10px] mt-0.5">Tổng quan</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('employees')}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-xs transition-colors ${
                route === 'employees'
                  ? 'text-[#12584b] font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <TeamOutlined className="text-lg" />
              <span className="text-[10px] mt-0.5">Hồ sơ</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('departments')}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-xs transition-colors ${
                route === 'departments'
                  ? 'text-[#12584b] font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <BankOutlined className="text-lg" />
              <span className="text-[10px] mt-0.5">Phòng ban</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('leaves')}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-xs transition-colors relative ${
                route === 'leaves'
                  ? 'text-[#12584b] font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Badge count={pendingLeavesCount} size="small" offset={[6, -2]}>
                <CalendarOutlined className="text-lg" />
              </Badge>
              <span className="text-[10px] mt-0.5">Nghỉ phép</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="flex flex-col items-center justify-center py-1 px-2 rounded-lg text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              <MoreOutlined className="text-lg" />
              <span className="text-[10px] mt-0.5">Thêm</span>
            </button>
          </nav>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};
