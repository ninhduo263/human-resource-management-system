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
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={245}
          theme="dark"
          className="no-print"
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
            onClick={({ key }) => {
              if (key === 'employees') {
                setEmpDeptFilter('');
                setEmpSearchQuery('');
              }
              setRoute(key as RouteKey);
            }}
            style={{ marginTop: 8 }}
          />
        </Sider>

        <Layout>
          <Header
            style={{
              background: '#fff',
              padding: '0 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #f0f0f0',
            }}
            className="no-print"
          >
            <Input
              prefix={<SearchOutlined className="text-slate-400" />}
              placeholder="Tra cứu nhanh nhân viên (Nhấn Enter)..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onPressEnter={() => {
                setEmpDeptFilter('');
                setEmpSearchQuery(globalSearch);
                setRoute('employees');
              }}
              style={{ maxWidth: 300 }}
              allowClear
            />

            <Space size="middle">
              <Text type="secondary" className="hidden md:inline text-xs">
                {formatDate(state.today)}
              </Text>

              <Badge count={pendingLeavesCount} size="small">
                <Button
                  type="text"
                  shape="circle"
                  icon={<BellOutlined />}
                  onClick={() => setRoute('leaves')}
                  title="Đơn nghỉ phép chờ duyệt"
                />
              </Badge>

              <Space>
                <Avatar
                  style={{
                    backgroundColor: getAvatarHex(state.user.employee_id),
                  }}
                >
                  {getInitials(state.user.name)}
                </Avatar>
                <div className="hidden sm:block leading-tight">
                  <div className="text-xs font-semibold text-slate-900">
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
                Đăng xuất
              </Button>
            </Space>
          </Header>

          <Content style={{ margin: '24px', maxWidth: 1360 }}>
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
          </Content>

          <Footer
            style={{ textAlign: 'center', fontSize: 12, color: '#64748b' }}
            className="no-print"
          >
            © {state.today.slice(0, 4)} PeopleOps HRMS · Hệ thống Quản lý Nhân sự
            Nhóm 16 (Ant Design · React · Express · PostgreSQL · Docker)
          </Footer>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};
