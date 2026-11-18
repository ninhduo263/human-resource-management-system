import React, { useState } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Alert,
  Typography,
  Divider,
} from 'antd';
import {
  UserOutlined,
  LockOutlined,
  LoginOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  FileDoneOutlined,
  CalendarOutlined,
  CheckOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { apiRequest } from '../api';

const { Title, Text, Paragraph } = Typography;

interface LoginViewProps {
  onSuccess: () => Promise<void>;
}

const DEMO_ACCOUNTS = [
  { id: 'admin', label: 'Quản trị', desc: 'Toàn quyền hệ thống' },
  { id: 'nhansu', label: 'Nhân sự', desc: 'Hồ sơ, HĐ, Công tác' },
  { id: 'truongphong', label: 'Trưởng phòng', desc: 'Phòng Công nghệ' },
  { id: 'nhanvien', label: 'Nhân viên', desc: 'Tự phục vụ cá nhân' },
  { id: 'giamdoc', label: 'Giám đốc', desc: 'Báo cáo & Quyết định' },
];

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const [form] = Form.useForm();
  const [selectedRole, setSelectedRole] = useState('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFinish = async (values: { tendangnhap: string; matkhau: string }) => {
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
    form.setFieldsValue({ tendangnhap: username, matkhau: 'Demo@12345' });
  };

  return (
    <div className="login-page">
      {/* Left Intro Banner */}
      <section className="login-story" aria-label="Giới thiệu hệ thống nhân sự Nhóm 16">
        <div className="login-brand">
          <div className="login-brand-mark">16</div>
          <div><strong>Nhân sự<span>.</span></strong><small>NHÓM 16 · KẾT NỐI ĐỂ PHÁT TRIỂN</small></div>
        </div>

        <div className="login-story-body">
          <div className="login-eyebrow"><span /> QUẢN LÝ NHÂN SỰ, THẬT NHẸ NHÀNG</div>
          <h1>Đồng hành cùng<br />mỗi hành trình<br /><em>nhân sự.</em></h1>
          <p className="login-story-description">Một không gian kết nối con người và công việc.<br className="login-desktop-break" /> Để bạn dành nhiều thời gian hơn cho điều quan trọng.</p>

          <div className="login-preview" aria-hidden="true">
            <div className="login-preview-top"><span className="login-preview-logo">16.</span><span>Không gian nhân sự</span><span className="login-preview-dots">•••</span></div>
            <div className="login-preview-body">
              <div className="login-preview-greeting"><div><small>CÙNG NHAU PHÁT TRIỂN</small><strong>Một đội ngũ. Một hành trình.</strong></div><span className="login-preview-arrow"><ArrowRightOutlined /></span></div>
              <div className="login-team-row"><div className="login-avatar-stack"><span>MA</span><span>QL</span><span>TH</span><span><TeamOutlined /></span></div><div><strong>Kết nối đội ngũ</strong><small>Mọi thông tin, luôn trong tầm tay</small></div></div>
              <div className="login-preview-features">
                <div><TeamOutlined /><span>Hồ sơ nhân sự</span><i /></div>
                <div><FileDoneOutlined /><span>Hợp đồng</span><i /></div>
                <div><CalendarOutlined /><span>Nghỉ phép</span><i /></div>
              </div>
            </div>
            <div className="login-preview-note"><span><CheckOutlined /></span> Sẵn sàng cho một ngày làm việc hiệu quả</div>
          </div>
          <div className="login-story-caption"><span /> Tập trung hơn. Kết nối hơn. Phát triển cùng nhau.</div>
        </div>

        <footer className="login-story-footer"><span>© {new Date().getFullYear()} Nhóm 16 · Quản lý nhân sự</span><span>Cùng đội ngũ, tạo giá trị. <span className="login-footer-spark">✧</span></span></footer>
      </section>

      {/* Right Login Card */}
      <section className="login-form-panel" aria-label="Đăng nhập">
        <div className="login-form-wrap">
        <div className="login-access-icon"><LockOutlined /></div>
        <Card
          className="login-form-card"
          bordered={false}
          styles={{ body: { padding: 0 } }}
        >
          <Title level={2} className="login-form-title" style={{ marginTop: 0 }}>
            Một ngày mới, khởi đầu mới.
          </Title>
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 24 }}>
            Đăng nhập để bắt đầu ngày làm việc của bạn.
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
              name="tendangnhap"
              label="Email / Tên đăng nhập"
              rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' }]}
            >
              <Input
                prefix={<UserOutlined className="text-slate-400" />}
                placeholder="Nhập email hoặc tên đăng nhập..."
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="matkhau"
              label="Mật khẩu"
              rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-slate-400" />}
                placeholder="Nhập mật khẩu..."
                autoComplete="current-password"
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

          <Divider plain style={{ fontSize: 12, color: '#82908c', marginTop: 28 }}>
            Khám phá với tài khoản mẫu
          </Divider>

          <div className="login-demo-grid">
            {DEMO_ACCOUNTS.map((acc) => (
              <Button
                key={acc.id}
                className={selectedRole === acc.id ? 'login-demo-button is-selected' : 'login-demo-button'}
                onClick={() => selectDemo(acc.id)}
                title={acc.desc}
              >
                {acc.label}{selectedRole === acc.id && <CheckOutlined />}
              </Button>
            ))}
          </div>
          <p className="login-demo-help">Mật khẩu mẫu: <code>Demo@12345</code></p>
        </Card>
        <div className="login-form-security"><SafetyCertificateOutlined /> Không gian làm việc dành riêng cho đội ngũ của bạn</div>
        </div>
      </section>
    </div>
  );
};
