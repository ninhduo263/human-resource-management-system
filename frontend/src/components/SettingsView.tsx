import React, { useState } from 'react';
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
  KeyOutlined,
  PlusOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { AppState, AuditEntry, UserAccount, UserRole } from '../types';
import { apiRequest } from '../api';
import { ROLE_NAMES } from '../utils/format';

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
  const [tab, setTab] = useState<'users' | 'audit'>('users');
  const [pwOpen, setPwOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [pwForm] = Form.useForm();
  const [userForm] = Form.useForm();

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
        `/api/users/${encodeURIComponent(u.matk)}/reset-password`,
        {},
        'POST'
      );
      Modal.info({
        title: `Mật khẩu mới của "${u.tendangnhap}"`,
        content: (
          <div>
            <p>Chỉ hiển thị một lần. Hãy gửi cho người dùng qua kênh an toàn.</p>
            <Text code copyable>{result.matkhau}</Text>
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
      await apiRequest(`/api/users/${encodeURIComponent(u.matk)}/role`, { vaitro: role }, 'PUT');
      notify('Đã đổi vai trò; người dùng cần đăng nhập lại.');
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const userColumns = [
    {
      title: 'Tên đăng nhập',
      dataIndex: 'tendangnhap',
      key: 'tendangnhap',
      render: (u: string) => <Text code>{u}</Text>,
    },
    {
      title: 'Nhân viên liên kết',
      key: 'employee',
      render: (_: unknown, u: UserAccount) => u.hoten,
    },
    {
      title: 'Vai trò',
      dataIndex: 'vaitro',
      key: 'vaitro',
      render: (r: UserRole, u: UserAccount) =>
        u.matk === state.user.matk ? (
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
      dataIndex: 'hoatdong',
      key: 'hoatdong',
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
        u.matk !== state.user.matk ? (
          <Space size={0}>
          <Popconfirm
            title={`Đặt lại mật khẩu cho "${u.tendangnhap}"? Mọi phiên đăng nhập của họ sẽ bị đăng xuất.`}
            onConfirm={() => handleResetPassword(u)}
            okText="Đặt lại"
            cancelText="Hủy"
          >
            <Button size="small" type="link" icon={<KeyOutlined />}>
              Đặt lại mật khẩu
            </Button>
          </Popconfirm>
          <Popconfirm
            title={`${u.hoatdong ? 'Khóa' : 'Mở khóa'} tài khoản "${u.tendangnhap}"?`}
            onConfirm={() => handleToggleUser(u.matk)}
            okText="Xác nhận"
            cancelText="Hủy"
          >
            <Button
              size="small"
              type="link"
              danger={!!u.hoatdong}
              icon={<SafetyOutlined />}
            >
              {u.hoatdong ? 'Khóa tài khoản' : 'Mở khóa'}
            </Button>
          </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  const auditColumns = [
    {
      title: 'Thời gian',
      dataIndex: 'thoigian',
      key: 'thoigian',
      render: (d: string) => new Date(d).toLocaleString('vi-VN'),
    },
    {
      title: 'Tài khoản',
      dataIndex: 'tendangnhap',
      key: 'tendangnhap',
      render: (u: string | null) => <Text code>{u || 'Hệ thống'}</Text>,
    },
    {
      title: 'Hoạt động',
      dataIndex: 'hanhdong',
      key: 'hanhdong',
      render: (a: string) => <strong>{a}</strong>,
    },
    {
      title: 'Đối tượng',
      dataIndex: 'doituong',
      key: 'doituong',
      render: (t: string) => {
        const employee = state.employees.find((e) => e.manv === t);
        const department = state.departments.find((d) => d.mapb === t);
        const contract = state.contracts.find((c) => c.mahd === t);
        return <Text>{employee?.hoten || department?.tenpb || (contract
          ? `Hợp đồng của ${state.employees.find((e) => e.manv === contract.manv)?.hoten || 'nhân viên'}`
          : /^(NV|PB|HD)\d+$/.test(t) ? 'Bản ghi' : t)}</Text>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Title level={3} style={{ margin: '0 0 4px' }}>
            {state.user.vaitro === 'admin'
              ? 'Quản trị hệ thống'
              : 'Tài khoản của tôi'}
          </Title>
          <Text type="secondary">
            Quản lý mật khẩu, phân quyền tài khoản và theo dõi nhật ký hoạt động.
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
          {state.user.vaitro === 'admin' && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setFormError('');
                userForm.resetFields();
                userForm.setFieldsValue({
                  vaitro: 'employee',
                  manv: state.employees.find(
                    (e) => ['Đang làm việc', 'Thử việc'].includes(e.trangthai)
                  )?.manv,
                });
                setAddUserOpen(true);
              }}
            >
              Tạo tài khoản
            </Button>
          )}
        </Space>
      </div>

      {state.user.vaitro !== 'admin' ? (
        <Card bordered={false} className="shadow-xs">
          <Descriptions
            title="Thông tin tài khoản cá nhân"
            bordered
            column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
          >
            <Descriptions.Item label="Họ và tên">
              <strong>{state.user.hoten}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Tên đăng nhập">
              <Text code>{state.user.tendangnhap}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Vai trò">
              <Tag color="processing">{ROLE_NAMES[state.user.vaitro]}</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      ) : (
        <Card bordered={false} className="shadow-xs">
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as 'users' | 'audit')}
            items={[
              {
                key: 'users',
                label: `Tài khoản người dùng (${state.users.length})`,
              },
              {
                key: 'audit',
                label: `Nhật ký hoạt động (${state.audit.length})`,
              },
            ]}
          />

          {tab === 'users' ? (
            <Table
              rowKey="matk"
              columns={userColumns}
              dataSource={state.users}
              pagination={false}
              size="middle"
              scroll={{ x: 650 }}
            />
          ) : (
            <Table
              rowKey={(r: AuditEntry) => r.mank}
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
            name="tendangnhap"
            label="Tên đăng nhập"
            rules={[{ required: true, min: 3, message: 'Nhập tên đăng nhập' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="manv"
            label="Nhân viên liên kết"
            rules={[{ required: true }]}
          >
            <Select
              options={state.employees
                .filter((e) => ['Đang làm việc', 'Thử việc'].includes(e.trangthai))
                .map((e) => ({
                  value: e.manv,
                  label: `${e.hoten} (${e.email})`,
                }))}
            />
          </Form.Item>
          <Form.Item name="vaitro" label="Vai trò" rules={[{ required: true }]}>
            <Select
              options={Object.entries(ROLE_NAMES).map(([id, label]) => ({
                value: id,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="matkhau"
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
    </div>
  );
};
