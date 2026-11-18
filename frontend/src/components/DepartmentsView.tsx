import React, { useState } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Tag,
  Button,
  Tabs,
  Modal,
  Form,
  Input,
  InputNumber,
  Avatar,
  Space,
  Popconfirm,
  Select,
  Switch,
  Alert,
  Typography,
} from 'antd';
import {
  BankOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SwapOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { AppState, Department, Position, RouteKey } from '../types';
import { apiRequest } from '../api';
import {
  canAssign,
  canEdit,
  formatDate,
  getAvatarHex,
  getInitials,
} from '../utils/format';

const { Title, Text, Paragraph } = Typography;

interface DepartmentsViewProps {
  state: AppState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, isError?: boolean) => void;
  onViewDepartmentMembers: (deptId: string) => void;
  onNavigate: (route: RouteKey) => void;
}

export const DepartmentsView: React.FC<DepartmentsViewProps> = ({
  state,
  onRefresh,
  notify,
  onViewDepartmentMembers,
  onNavigate,
}) => {
  const [tab, setTab] = useState<'departments' | 'positions'>('departments');
  const [deptModal, setDeptModal] = useState<{
    open: boolean;
    item: Department | null;
  }>({ open: false, item: null });
  const [posModal, setPosModal] = useState<{
    open: boolean;
    item: Position | null;
  }>({ open: false, item: null });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [deptForm] = Form.useForm();
  const [posForm] = Form.useForm();

  const activeEmployees = state.employees.filter(
    (e) => ['Đang làm việc', 'Thử việc'].includes(e.status)
  );

  const openDeptModal = (item: Department | null) => {
    setFormError('');
    deptForm.resetFields();
    if (item) {
      deptForm.setFieldsValue(item);
    } else {
      deptForm.setFieldsValue({ founded_date: state.today, description: '', active: true });
    }
    setDeptModal({ open: true, item });
  };

  const openPosModal = (item: Position | null) => {
    setFormError('');
    posForm.resetFields();
    if (item) {
      posForm.setFieldsValue(item);
    } else {
      posForm.setFieldsValue({ level: 2, description: '', active: true, is_executive: false });
    }
    setPosModal({ open: true, item });
  };

  const handleSaveDepartment = async (values: Record<string, any>) => {
    setFormError('');
    setSubmitting(true);
    try {
      if (deptModal.item) {
        await apiRequest(
          `/api/departments/${encodeURIComponent(deptModal.item.id)}`,
          { ...values, head_id: values.head_id ?? null },
          'PUT'
        );
        notify('Đã cập nhật phòng ban.');
      } else {
        await apiRequest('/api/departments', values, 'POST');
        notify('Đã thêm phòng ban mới.');
      }
      setDeptModal({ open: false, item: null });
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    try {
      await apiRequest(
        `/api/departments/${encodeURIComponent(id)}`,
        {},
        'DELETE'
      );
      setDeptModal({ open: false, item: null });
      notify('Đã xóa phòng ban.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const handleSavePosition = async (values: Record<string, any>) => {
    setFormError('');
    setSubmitting(true);
    try {
      const body = { ...values, level: Number(values.level) };
      if (posModal.item) {
        await apiRequest(
          `/api/positions/${encodeURIComponent(posModal.item.id)}`,
          body,
          'PUT'
        );
        notify('Đã cập nhật chức vụ.');
      } else {
        await apiRequest('/api/positions', body, 'POST');
        notify('Đã thêm chức vụ mới.');
      }
      setPosModal({ open: false, item: null });
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePosition = async (id: string) => {
    try {
      await apiRequest(`/api/positions/${encodeURIComponent(id)}`, {}, 'DELETE');
      setPosModal({ open: false, item: null });
      notify('Đã xóa chức vụ.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const posColumns = [
    {
      title: 'Mã chức vụ (MaCV)',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: 'Tên chức vụ (TenCV)',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Mô tả (MoTa)',
      dataIndex: 'description',
      key: 'description',
      render: (d: string) => d || '—',
    },
    {
      title: 'Số nhân viên',
      key: 'count',
      render: (_: unknown, p: Position) =>
        `${
          activeEmployees.filter((e) => e.position_id === p.id).length
        } nhân viên`,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, p: Position) =>
        canEdit(state.user.role) ? (
          <Button
            size="small"
            type="link"
            icon={<EditOutlined />}
            onClick={() => openPosModal(p)}
          >
            Chỉnh sửa
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Title level={3} style={{ margin: '4px 0' }}>
            Phòng ban & Chức vụ
          </Title>
          <Text type="secondary">
            Quản lý cơ cấu phòng ban, danh mục chức vụ, phân bổ và bổ nhiệm.
          </Text>
        </div>

        <Space className="no-print w-full sm:w-auto flex-wrap">
          {canAssign(state.user.role) && (
            <Button
              icon={<SwapOutlined />}
              onClick={() => onNavigate('assignments')}
            >
              Phân bổ / Bổ nhiệm
            </Button>
          )}
          {canEdit(state.user.role) && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() =>
                tab === 'departments' ? openDeptModal(null) : openPosModal(null)
              }
            >
              {tab === 'departments'
                ? 'Thêm phòng ban'
                : 'Thêm chức vụ'}
            </Button>
          )}
        </Space>
      </div>

      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as 'departments' | 'positions')}
        items={[
          {
            key: 'departments',
            label: `Phòng ban (${state.departments.length})`,
          },
          {
            key: 'positions',
            label: `Chức vụ (${state.positions.length})`,
          },
        ]}
      />

      {tab === 'departments' ? (
        <Row gutter={[16, 16]}>
          {state.departments.map((d) => {
            const members = activeEmployees.filter(
              (e) => e.department_id === d.id
            );
            return (
              <Col xs={24} md={12} lg={8} key={d.id}>
                <Card
                  bordered={false}
                  className="shadow-xs h-full flex flex-col justify-between"
                  title={
                    <Space>
                      <BankOutlined className="text-[#12584b]" />
                      <span>{d.name}</span>
                    </Space>
                  }
                  actions={[
                    <Button
                      key="view"
                      type="link"
                      size="small"
                      icon={<TeamOutlined />}
                      onClick={() => onViewDepartmentMembers(d.id)}
                    >
                      Xem ({members.length} NV)
                    </Button>,
                    ...(canEdit(state.user.role)
                      ? [
                          <Button
                            key="edit"
                            type="link"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => openDeptModal(d)}
                          >
                            Chỉnh sửa
                          </Button>,
                        ]
                      : []),
                  ]}
                >
                  <Paragraph
                    type="secondary"
                    ellipsis={{ rows: 2 }}
                    style={{ minHeight: 40, marginBottom: 8 }}
                  >
                    {d.description || 'Chưa có mô tả phòng ban.'}
                  </Paragraph>
                  <div className="text-xs text-slate-500 mb-3 flex items-center justify-between">
                    <span>Mã PB: <Text code>{d.id}</Text></span>
                    <span>Thành lập: {formatDate(d.founded_date)}</span>
                  </div>
                  <Avatar.Group max={{ count: 6 }}>
                    {members.map((e) => (
                      <Avatar
                        key={e.id}
                        style={{ backgroundColor: getAvatarHex(e.id) }}
                      >
                        {getInitials(e.name)}
                      </Avatar>
                    ))}
                  </Avatar.Group>
                </Card>
              </Col>
            );
          })}
        </Row>
      ) : (
        <Card bordered={false} className="shadow-xs">
          <Table
            rowKey="id"
            columns={posColumns}
            dataSource={state.positions}
            pagination={false}
            size="middle"
            scroll={{ x: 650 }}
          />
        </Card>
      )}

      {/* Modal Phòng ban */}
      <Modal
        open={deptModal.open}
        title={
          deptModal.item
            ? 'Chỉnh sửa phòng ban'
            : 'Thêm phòng ban mới'
        }
        onCancel={() => setDeptModal({ open: false, item: null })}
        footer={null}
      >
        <Form form={deptForm} layout="vertical" onFinish={handleSaveDepartment}>
          {formError && (
            <Alert type="error" showIcon message={formError} className="mb-4" />
          )}
          {deptModal.item && (
            <Form.Item name="id" label="Mã phòng ban (MaPB)">
              <Input disabled />
            </Form.Item>
          )}
          <Form.Item
            name="name"
            label="Tên phòng ban (TenPB)"
            rules={[{ required: true, message: 'Nhập tên phòng ban' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="founded_date"
            label="Ngày thành lập (NgayThanhLap)"
            rules={[{ required: true, message: 'Chọn ngày thành lập' }]}
          >
            <Input type="date" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả (MoTa)">
            <Input.TextArea rows={3} />
          </Form.Item>

          <div className="flex items-center justify-between pt-2">
            {deptModal.item ? (
              <Popconfirm
                title="Xóa phòng ban này?"
                description="Chỉ xóa được danh mục chưa có nhân viên hoặc lịch sử công tác."
                onConfirm={() => handleDeleteDepartment(deptModal.item!.id)}
                okText="Xóa"
                cancelText="Hủy"
              >
                <Button danger icon={<DeleteOutlined />}>
                  Xóa danh mục
                </Button>
              </Popconfirm>
            ) : (
              <div />
            )}
            <Space>
              <Button onClick={() => setDeptModal({ open: false, item: null })}>
                Đóng
              </Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Lưu thay đổi
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Modal Chức vụ */}
      <Modal
        open={posModal.open}
        title={
          posModal.item ? 'Chỉnh sửa chức vụ' : 'Thêm chức vụ mới'
        }
        onCancel={() => setPosModal({ open: false, item: null })}
        footer={null}
      >
        <Form form={posForm} layout="vertical" onFinish={handleSavePosition}>
          {formError && (
            <Alert type="error" showIcon message={formError} className="mb-4" />
          )}
          {posModal.item && (
            <Form.Item name="id" label="Mã chức vụ (MaCV)">
              <Input disabled />
            </Form.Item>
          )}
          <Form.Item
            name="name"
            label="Tên chức vụ (TenCV)"
            rules={[{ required: true, message: 'Nhập tên chức vụ' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Mô tả (MoTa)">
            <Input.TextArea rows={3} />
          </Form.Item>

          <div className="flex items-center justify-between pt-2">
            {posModal.item ? (
              <Popconfirm
                title="Xóa chức vụ này?"
                description="Chỉ xóa được chức vụ chưa được sử dụng."
                onConfirm={() => handleDeletePosition(posModal.item!.id)}
                okText="Xóa"
                cancelText="Hủy"
              >
                <Button danger icon={<DeleteOutlined />}>
                  Xóa danh mục
                </Button>
              </Popconfirm>
            ) : (
              <div />
            )}
            <Space>
              <Button onClick={() => setPosModal({ open: false, item: null })}>
                Đóng
              </Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Lưu thay đổi
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
