import React, { useState } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Alert,
  Typography,
  Space,
  Tag,
  Divider,
} from 'antd';
import {
  UserOutlined,
  LockOutlined,
  LoginOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { apiRequest } from '../api';

const { Title, Text, Paragraph } = Typography;

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
  const [form] = Form.useForm();
  const [selectedRole, setSelectedRole] = useState('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFinish = async (values: { username: string; password: string }) => {
    setError('');
    setLoading(true);
    try {
      await apiRequest('/api/login', values);
      await onSuccess();
    } catch (err: any) {
      setError(err.message || 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  const selectDemo = (username: string) => {
    setSelectedRole(username);
    setError('');
    form.setFieldsValue({ username, password: 'Demo@12345' });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-slate-900">
      {/* Left Intro Banner */}
      <section className="lg:col-span-5 bg-gradient-to-br from-[#0f473d] via-[#0c3830] to-slate-900 text-white p-8 lg:p-14 flex flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-400/20 border border-emerald-300/30 flex items-center justify-center text-xl font-bold text-emerald-300">
            p
          </div>
          <div>
            <strong className="text-lg tracking-tight block text-white">
              PeopleOps.
            </strong>
            <small className="text-emerald-200/80 text-xs">
              People · Work · Together
            </small>
          </div>
        </div>

        <div className="my-10">
          <Tag color="success" className="mb-3 uppercase font-semibold">
            HỆ THỐNG THÔNG TIN QUẢN LÝ NHÂN SỰ
          </Tag>
          <Title level={1} style={{ color: '#fff', marginBottom: 16 }}>
            Đồng hành cùng <br />
            mỗi hành trình nhân sự.
          </Title>
          <Paragraph style={{ color: 'rgba(209, 250, 229, 0.85)', fontSize: 14 }}>
            Quản lý tập trung Hồ sơ nhân viên (1.0), Phòng ban & Chức vụ (2.0),
            Hợp đồng lao động (3.0), Công tác & Nghỉ phép (4.0) và Báo cáo thống
            kê (5.0) với Ant Design · PostgreSQL · Express · Docker.
          </Paragraph>
        </div>

        <div className="text-xs text-emerald-200/80 flex items-center gap-2">
          <SafetyCertificateOutlined className="text-emerald-400 text-base" />
          <span>NHÓM 16 · BÀI TẬP LỚN HỆ THỐNG THÔNG TIN QUẢN LÝ</span>
        </div>
      </section>

      {/* Right Login Card */}
      <section className="lg:col-span-7 bg-slate-50 flex items-center justify-center p-6 lg:p-16">
        <Card
          className="w-full max-w-md shadow-xl rounded-2xl border-slate-200"
          styles={{ body: { padding: 32 } }}
        >
          <Text
            type="secondary"
            className="text-xs font-bold uppercase tracking-wider text-[#12584b]"
          >
            CHÀO MỪNG TRỞ LẠI
          </Text>
          <Title level={3} style={{ marginTop: 4, marginBottom: 4 }}>
            Đăng nhập hệ thống
          </Title>
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 24 }}>
            Chọn nhanh tài khoản mẫu 5 vai trò hoặc nhập thông tin đăng nhập.
          </Paragraph>

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              className="mb-4 rounded-lg"
            />
          )}

          <Form
            form={form}
            layout="vertical"
            initialValues={{ username: 'admin', password: 'Demo@12345' }}
            onFinish={handleFinish}
            size="large"
          >
            <Form.Item
              name="username"
              label="Tên đăng nhập"
              rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' }]}
            >
              <Input
                prefix={<UserOutlined className="text-slate-400" />}
                placeholder="Nhập tên đăng nhập..."
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Mật khẩu"
              rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-slate-400" />}
                placeholder="Nhập mật khẩu..."
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 12 }}>
              <Button
                type="primary"
                htmlType="submit"
                icon={<LoginOutlined />}
                loading={loading}
                block
              >
                Đăng nhập vào hệ thống
              </Button>
            </Form.Item>
          </Form>

          <Divider plain style={{ fontSize: 12 }}>
            Tài khoản mẫu · Mật khẩu: <Tag color="processing">Demo@12345</Tag>
          </Divider>

          <Space wrap className="w-full justify-center">
            {DEMO_ACCOUNTS.map((acc) => (
              <Button
                key={acc.id}
                size="small"
                type={selectedRole === acc.id ? 'primary' : 'default'}
                ghost={selectedRole === acc.id}
                onClick={() => selectDemo(acc.id)}
                title={acc.desc}
              >
                {acc.label} (@{acc.id})
              </Button>
            ))}
          </Space>
        </Card>
      </section>
    </div>
  );
};
