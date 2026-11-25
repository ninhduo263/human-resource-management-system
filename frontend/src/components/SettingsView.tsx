import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Tabs,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Popconfirm,
  Descriptions,
  Alert,
  Typography,
} from 'antd';
import {
  CalendarOutlined,
  DeleteOutlined,
  KeyOutlined,
  PlusOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { AppState, AuditEntry, UserAccount, UserRole } from '../types';
import { apiRequest } from '../api';
import { formatDate, ROLE_NAMES } from '../utils/format';

interface HolidayRow {
  Ngay: string;
  TenNgayLe: string;
}

const { Title, Text } = Typography;

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
  const [tab, setTab] = useState<'users' | 'holidays' | 'audit'>('users');
  const [pwOpen, setPwOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addHolidayOpen, setAddHolidayOpen] = useState(false);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [pwForm] = Form.useForm();
  const [userForm] = Form.useForm();
  const [holidayForm] = Form.useForm();

  const canManageHolidays = ['admin', 'hr'].includes(state.user.VaiTro);

  const loadHolidays = async () => {
    try {
      const rows = await apiRequest<HolidayRow[]>('/api/holidays');
      setHolidays(
        rows.map((r) => ({
          Ngay: String(r.Ngay).slice(0, 10),
          TenNgayLe: r.TenNgayLe,
        }))
      );
    } catch {
      setHolidays([]);
    }
  };

  useEffect(() => {
    loadHolidays();
  }, [state.today]);

  const handleSaveHoliday = async (values: { Ngay: string; TenNgayLe: string }) => {
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest('/api/holidays', values, 'POST');
      setAddHolidayOpen(false);
      notify('Đã lưu ngày nghỉ lễ.');
      await loadHolidays();
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteHoliday = async (day: string) => {
    try {
      await apiRequest(`/api/holidays/${encodeURIComponent(day)}`, {}, 'DELETE');
      notify('Đã xóa ngày nghỉ lễ.');
      await loadHolidays();
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleChangePassword = async (values: Record<string, any>) => {
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest('/api/password', values, 'POST');
      setPwOpen(false);
      notify('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
      onForceLogout();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateUser = async (values: Record<string, any>) => {
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest('/api/users', values, 'POST');
      setAddUserOpen(false);
      notify('Đã tạo tài khoản người dùng mới.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleUser = async (id: string) => {
    try {
      await apiRequest(
        `/api/users/${encodeURIComponent(id)}/toggle`,
        {},
        'POST'
      );
      notify('Đã cập nhật trạng thái tài khoản.');
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleResetPassword = async (u: UserAccount) => {
    try {
      const result = await apiRequest(
        `/api/users/${encodeURIComponent(u.MaTK)}/reset-password`,
        {},
        'POST'
      );
      Modal.info({
        title: `Mật khẩu mới của "${u.TenDangNhap}"`,
        content: (
          <div>
            <p>Chỉ hiển thị một lần. Hãy gửi cho người dùng qua kênh an toàn.</p>
            <Text code copyable>{result.MatKhau}</Text>
          </div>
        ),
      });
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleChangeRole = async (u: UserAccount, role: UserRole) => {
    try {
      await apiRequest(`/api/users/${encodeURIComponent(u.MaTK)}/role`, { VaiTro: role }, 'PUT');
      notify('Đã đổi vai trò; người dùng cần đăng nhập lại.');
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const userColumns = [
    {
      title: 'Tên đăng nhập',
      dataIndex: 'TenDangNhap',
      key: 'TenDangNhap',
      render: (u: string) => <Text code>{u}</Text>,
    },
    {
      title: 'Nhân viên liên kết',
      key: 'employee',
      render: (_: unknown, u: UserAccount) => u.HoTen,
    },
    {
      title: 'Vai trò',
      dataIndex: 'VaiTro',
      key: 'VaiTro',
      render: (r: UserRole, u: UserAccount) =>
        u.MaTK === state.user.MaTK ? (
          <Tag color="processing">{ROLE_NAMES[r]}</Tag>
        ) : (
          <Select
            size="small"
            value={r}
            style={{ width: 160 }}
            onChange={(role) => handleChangeRole(u, role as UserRole)}
            options={Object.entries(ROLE_NAMES).map(([value, label]) => ({ value, label }))}
          />
        ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'HoatDong',
      key: 'HoatDong',
      render: (active: number) => (
        <Tag color={active ? 'success' : 'error'}>
          {active ? 'Đang hoạt động' : 'Đã khóa'}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, u: UserAccount) =>
        u.MaTK !== state.user.MaTK ? (
          <Space size={0}>
          <Popconfirm
            title={`Đặt lại mật khẩu cho "${u.TenDangNhap}"? Mọi phiên đăng nhập của họ sẽ bị đăng xuất.`}
            onConfirm={() => handleResetPassword(u)}
            okText="Đặt lại"
            cancelText="Hủy"
          >
            <Button size="small" type="link" icon={<KeyOutlined />}>
              Đặt lại mật khẩu
            </Button>
          </Popconfirm>
          <Popconfirm
            title={`${u.HoatDong ? 'Khóa' : 'Mở khóa'} tài khoản "${u.TenDangNhap}"?`}
            onConfirm={() => handleToggleUser(u.MaTK)}
            okText="Xác nhận"
            cancelText="Hủy"
          >
            <Button
              size="small"
              type="link"
              danger={!!u.HoatDong}
              icon={<SafetyOutlined />}
            >
              {u.HoatDong ? 'Khóa tài khoản' : 'Mở khóa'}
            </Button>
          </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  const auditColumns = [
    {
      title: 'Thời gian',
      dataIndex: 'ThoiGian',
      key: 'ThoiGian',
      render: (d: string) => new Date(d).toLocaleString('vi-VN'),
    },
    {
      title: 'Tài khoản',
      dataIndex: 'TenDangNhap',
      key: 'TenDangNhap',
      render: (u: string | null) => <Text code>{u || 'Hệ thống'}</Text>,
    },
    {
      title: 'Hoạt động',
      dataIndex: 'HanhDong',
      key: 'HanhDong',
      render: (a: string) => <strong>{a}</strong>,
    },
    {
      title: 'Đối tượng',
      dataIndex: 'DoiTuong',
      key: 'DoiTuong',
      render: (t: string) => {
        const employee = state.employees.find((e) => e.MaNV === t);
        const department = state.departments.find((d) => d.MaPB === t);
        const contract = state.contracts.find((c) => c.MaHD === t);
        return <Text>{employee?.HoTen || department?.TenPB || (contract
          ? `Hợp đồng của ${state.employees.find((e) => e.MaNV === contract.MaNV)?.HoTen || 'nhân viên'}`
          : /^(NV|PB|HD)\d+$/.test(t) ? 'Bản ghi' : t)}</Text>;
      },
    },
  ];

  const holidayColumns = [
    {
      title: 'Ngày lễ (Ngay)',
      dataIndex: 'Ngay',
      key: 'Ngay',
      render: (d: string) => <Text code>{formatDate(d)} ({d})</Text>,
    },
    {
      title: 'Tên ngày nghỉ lễ (TenNgayLe)',
      dataIndex: 'TenNgayLe',
      key: 'TenNgayLe',
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Năm',
      key: 'year',
      render: (_: unknown, r: HolidayRow) => <Tag color="blue">{r.Ngay.slice(0, 4)}</Tag>,
    },
    ...(canManageHolidays
      ? [
          {
            title: 'Thao tác',
            key: 'actions',
            align: 'right' as const,
            render: (_: unknown, r: HolidayRow) => (
              <Popconfirm
                title={`Xóa ngày lễ "${r.TenNgayLe}" (${formatDate(r.Ngay)})?`}
                onConfirm={() => handleDeleteHoliday(r.Ngay)}
                okText="Xóa"
                cancelText="Hủy"
              >
                <Button size="small" type="link" danger icon={<DeleteOutlined />}>
                  Xóa
                </Button>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Title level={3} style={{ margin: '0 0 4px' }}>
            {state.user.VaiTro === 'admin'
              ? 'Quản trị hệ thống'
              : 'Tài khoản của tôi'}
          </Title>
          <Text type="secondary">
            Quản lý mật khẩu, phân quyền tài khoản, lịch ngày nghỉ lễ và theo dõi nhật ký hoạt động.
          </Text>
        </div>

        <Space className="no-print w-full sm:w-auto flex-wrap">
          <Button
            icon={<KeyOutlined />}
            onClick={() => {
              setFormError('');
              pwForm.resetFields();
              setPwOpen(true);
            }}
          >
            Đổi mật khẩu
          </Button>
          {canManageHolidays && (
            <Button
              icon={<CalendarOutlined />}
              onClick={() => {
                setFormError('');
                holidayForm.resetFields();
                holidayForm.setFieldsValue({ Ngay: state.today });
                setAddHolidayOpen(true);
              }}
            >
              Thêm ngày lễ
            </Button>
          )}
          {state.user.VaiTro === 'admin' && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setFormError('');
                userForm.resetFields();
                userForm.setFieldsValue({
                  VaiTro: 'employee',
                  MaNV: state.employees.find(
                    (e) => ['Đang làm việc', 'Thử việc'].includes(e.TrangThai)
                  )?.MaNV,
                });
                setAddUserOpen(true);
              }}
            >
              Tạo tài khoản
            </Button>
          )}
        </Space>
      </div>

      {state.user.VaiTro !== 'admin' ? (
        <div className="space-y-6">
          <Card bordered={false} className="shadow-xs">
            <Descriptions
              title="Thông tin tài khoản cá nhân"
              bordered
              column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
            >
              <Descriptions.Item label="Họ và tên">
                <strong>{state.user.HoTen}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Tên đăng nhập">
                <Text code>{state.user.TenDangNhap}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Vai trò">
                <Tag color="processing">{ROLE_NAMES[state.user.VaiTro]}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {canManageHolidays && (
            <Card
              bordered={false}
              className="shadow-xs"
              title={`Quản lý ngày lễ (${holidays.length}) — Bảng NGAYLE`}
            >
              <Table
                rowKey="Ngay"
                columns={holidayColumns}
                dataSource={holidays}
                pagination={{ pageSize: 10, showSizeChanger: false }}
                size="middle"
              />
            </Card>
          )}
        </div>
      ) : (
        <Card bordered={false} className="shadow-xs">
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as 'users' | 'holidays' | 'audit')}
            items={[
              {
                key: 'users',
                label: `Tài khoản người dùng (${state.users.length})`,
              },
              {
                key: 'holidays',
                label: `Quản lý ngày lễ (${holidays.length})`,
              },
              {
                key: 'audit',
                label: `Nhật ký hoạt động (${state.audit.length})`,
              },
            ]}
          />

          {tab === 'users' ? (
            <Table
              rowKey="MaTK"
              columns={userColumns}
              dataSource={state.users}
              pagination={false}
              size="middle"
              scroll={{ x: 650 }}
            />
          ) : tab === 'holidays' ? (
            <Table
              rowKey="Ngay"
              columns={holidayColumns}
              dataSource={holidays}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              size="middle"
              scroll={{ x: 550 }}
            />
          ) : (
            <Table
              rowKey={(r: AuditEntry) => r.MaNK}
              columns={auditColumns}
              dataSource={state.audit}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              size="middle"
              scroll={{ x: 750 }}
            />
          )}
        </Card>
      )}

      {/* Modal Đổi mật khẩu */}
      <Modal
        open={pwOpen}
        title="Đổi mật khẩu tài khoản"
        onCancel={() => setPwOpen(false)}
        footer={null}
      >
        <Form form={pwForm} layout="vertical" onFinish={handleChangePassword}>
          {formError && (
            <Alert type="error" showIcon message={formError} className="mb-4" />
          )}
          <Form.Item
            name="matkhauhientai"
            label="Mật khẩu hiện tại"
            rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="matkhaumoi"
            label="Mật khẩu mới (tối thiểu 10 ký tự)"
            rules={[
              { required: true, min: 10, message: 'Mật khẩu mới tối thiểu 10 ký tự' },
            ]}
          >
            <Input.Password />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setPwOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Đổi mật khẩu
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal Tạo tài khoản */}
      <Modal
        open={addUserOpen}
        title="Tạo tài khoản mới"
        onCancel={() => setAddUserOpen(false)}
        footer={null}
      >
        <Form form={userForm} layout="vertical" onFinish={handleCreateUser}>
          {formError && (
            <Alert type="error" showIcon message={formError} className="mb-4" />
          )}
          <Form.Item
            name="TenDangNhap"
            label="Tên đăng nhập"
            rules={[{ required: true, min: 3, message: 'Nhập tên đăng nhập' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="MaNV"
            label="Nhân viên liên kết"
            rules={[{ required: true }]}
          >
            <Select
              options={state.employees
                .filter((e) => ['Đang làm việc', 'Thử việc'].includes(e.TrangThai))
                .map((e) => ({
                  value: e.MaNV,
                  label: `${e.HoTen} (${e.Email})`,
                }))}
            />
          </Form.Item>
          <Form.Item name="VaiTro" label="Vai trò" rules={[{ required: true }]}>
            <Select
              options={Object.entries(ROLE_NAMES).map(([id, label]) => ({
                value: id,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="MatKhau"
            label="Mật khẩu ban đầu (>= 10 ký tự)"
            rules={[{ required: true, min: 10 }]}
          >
            <Input.Password />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAddUserOpen(false)}>Đóng</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Tạo tài khoản
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal Thêm / Cập nhật ngày lễ (6.3 Quản lý ngày lễ) */}
      <Modal
        open={addHolidayOpen}
        title="Thêm / Cập nhật ngày nghỉ lễ (Bảng NGAYLE)"
        onCancel={() => setAddHolidayOpen(false)}
        footer={null}
      >
        <Form form={holidayForm} layout="vertical" onFinish={handleSaveHoliday}>
          {formError && (
            <Alert type="error" showIcon message={formError} className="mb-4" />
          )}
          <Form.Item
            name="Ngay"
            label="Ngày nghỉ lễ (YYYY-MM-DD)"
            rules={[{ required: true, message: 'Chọn ngày nghỉ lễ' }]}
          >
            <Input type="date" />
          </Form.Item>
          <Form.Item
            name="TenNgayLe"
            label="Tên ngày nghỉ lễ"
            rules={[{ required: true, message: 'Nhập tên ngày nghỉ lễ' }]}
          >
            <Input placeholder="Ví dụ: Giỗ Tổ Hùng Vương, Tết Nguyên Đán..." />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAddHolidayOpen(false)}>Đóng</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Lưu ngày lễ
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
