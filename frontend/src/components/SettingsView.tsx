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

  const userColumns = [
    {
      title: 'Tên đăng nhập',
      dataIndex: 'username',
      key: 'username',
      render: (u: string) => <Text code>{u}</Text>,
    },
    {
      title: 'Nhân viên liên kết',
      key: 'employee',
      render: (_: unknown, u: UserAccount) => `${u.name} (${u.employee_id})`,
    },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      key: 'role',
      render: (r: UserRole) => <Tag color="processing">{ROLE_NAMES[r]}</Tag>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'active',
      key: 'active',
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
        u.id !== state.user.id ? (
          <Popconfirm
            title={`${u.active ? 'Khóa' : 'Mở khóa'} tài khoản "${u.username}"?`}
            onConfirm={() => handleToggleUser(u.id)}
            okText="Xác nhận"
            cancelText="Hủy"
          >
            <Button
              size="small"
              type="link"
              danger={!!u.active}
              icon={<SafetyOutlined />}
            >
              {u.active ? 'Khóa tài khoản' : 'Mở khóa'}
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  const auditColumns = [
    {
      title: 'Thời gian',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (d: string) => new Date(d).toLocaleString('vi-VN'),
    },
    {
      title: 'Tài khoản',
      dataIndex: 'username',
      key: 'username',
      render: (u: string | null) => <Text code>{u || 'Hệ thống'}</Text>,
    },
    {
      title: 'Hoạt động',
      dataIndex: 'action',
      key: 'action',
      render: (a: string) => <strong>{a}</strong>,
    },
    {
      title: 'Đối tượng',
      dataIndex: 'target',
      key: 'target',
      render: (t: string) => <Text code>{t}</Text>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Text className="text-xs font-bold uppercase tracking-wider text-[#12584b]">
            QUẢN TRỊ & BẢO MẬT
          </Text>
          <Title level={3} style={{ margin: '4px 0' }}>
            {state.user.role === 'admin'
              ? 'Quản trị hệ thống'
              : 'Tài khoản của tôi'}
          </Title>
          <Text type="secondary">
            Quản lý mật khẩu, phân quyền tài khoản và theo dõi nhật ký hoạt động.
          </Text>
        </div>

        <Space>
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
          {state.user.role === 'admin' && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setFormError('');
                userForm.resetFields();
                userForm.setFieldsValue({
                  role: 'employee',
                  employee_id: state.employees.find(
                    (e) => e.status !== 'Đã lưu trữ'
                  )?.id,
                });
                setAddUserOpen(true);
              }}
            >
              Tạo tài khoản
            </Button>
          )}
        </Space>
      </div>

      {state.user.role !== 'admin' ? (
        <Card bordered={false} className="shadow-xs">
          <Descriptions title="Thông tin tài khoản cá nhân" bordered column={2}>
            <Descriptions.Item label="Họ và tên">
              <strong>{state.user.name}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Tên đăng nhập">
              <Text code>{state.user.username}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Mã nhân viên">
              <Text code>{state.user.employee_id}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Vai trò">
              <Tag color="processing">{ROLE_NAMES[state.user.role]}</Tag>
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
              rowKey="id"
              columns={userColumns}
              dataSource={state.users}
              pagination={false}
              size="middle"
            />
          ) : (
            <Table
              rowKey={(r: AuditEntry) => r.id}
              columns={auditColumns}
              dataSource={state.audit}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              size="middle"
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
            name="current_password"
            label="Mật khẩu hiện tại"
            rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="new_password"
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
            name="username"
            label="Tên đăng nhập"
            rules={[{ required: true, min: 3, message: 'Nhập tên đăng nhập' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="employee_id"
            label="Nhân viên liên kết"
            rules={[{ required: true }]}
          >
            <Select
              options={state.employees
                .filter((e) => e.status !== 'Đã lưu trữ')
                .map((e) => ({
                  value: e.id,
                  label: `${e.id} - ${e.name}`,
                }))}
            />
          </Form.Item>
          <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
            <Select
              options={Object.entries(ROLE_NAMES).map(([id, label]) => ({
                value: id,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="password"
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
