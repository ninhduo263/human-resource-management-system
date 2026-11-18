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
    (e) => ['Đang làm việc', 'Thử việc'].includes(e.TrangThai)
  );

  const openDeptModal = (item: Department | null) => {
    setFormError('');
    deptForm.resetFields();
    if (item) {
      deptForm.setFieldsValue(item);
    } else {
      deptForm.setFieldsValue({ NgayThanhLap: state.today, MoTa: '', HoatDong: true });
    }
    setDeptModal({ open: true, item });
  };

  const openPosModal = (item: Position | null) => {
    setFormError('');
    posForm.resetFields();
    if (item) {
      posForm.setFieldsValue(item);
    } else {
      posForm.setFieldsValue({ CapBac: 2, MoTa: '', HoatDong: true, LaDieuHanh: false });
    }
    setPosModal({ open: true, item });
  };

  const handleSaveDepartment = async (values: Record<string, any>) => {
    setFormError('');
    setSubmitting(true);
    try {
      if (deptModal.item) {
        await apiRequest(
          `/api/departments/${encodeURIComponent(deptModal.item.MaPB)}`,
          { ...values, MaTruongPhong: values.MaTruongPhong ?? null },
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
      const body = { ...values, CapBac: Number(values.CapBac) };
      if (posModal.item) {
        await apiRequest(
          `/api/positions/${encodeURIComponent(posModal.item.MaCV)}`,
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
      title: 'Mã chức vụ',
      dataIndex: 'MaCV',
      key: 'MaCV',
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: 'Tên chức vụ',
      dataIndex: 'TenCV',
      key: 'TenCV',
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Cấp bậc (1–10)',
      dataIndex: 'CapBac',
      key: 'CapBac',
      render: (level: number) => <Tag color="processing">Cấp {level}</Tag>,
    },
    {
      title: 'Mô tả',
      dataIndex: 'MoTa',
      key: 'MoTa',
      render: (d: string) => d || '—',
    },
    {
      title: 'Số nhân viên',
      key: 'count',
      render: (_: unknown, p: Position) =>
        `${
          activeEmployees.filter((e) => e.MaCV === p.MaCV).length
        } nhân viên`,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, p: Position) =>
        canEdit(state.user.VaiTro) ? (
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
          {canAssign(state.user.VaiTro) && (
            <Button
              icon={<SwapOutlined />}
              onClick={() => onNavigate('assignments')}
            >
              Phân bổ / Bổ nhiệm
            </Button>
          )}
          {canEdit(state.user.VaiTro) && (
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
              (e) => e.MaPB === d.MaPB
            );
            return (
              <Col xs={24} md={12} lg={8} key={d.MaPB}>
                <Card
                  bordered={false}
                  className="shadow-xs h-full flex flex-col justify-between"
                  title={
                    <Space>
                      <BankOutlined className="text-[#12584b]" />
                      <span>{d.TenPB}</span>
                    </Space>
                  }
                  actions={[
                    <Button
                      key="view"
                      type="link"
                      size="small"
                      icon={<TeamOutlined />}
                      onClick={() => onViewDepartmentMembers(d.MaPB)}
                    >
                      Xem ({members.length} NV)
                    </Button>,
                    ...(canEdit(state.user.VaiTro)
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
                    {d.MoTa || 'Chưa có mô tả phòng ban.'}
                  </Paragraph>
                  <div className="text-xs text-slate-400 mb-2">
                    Thành lập: {formatDate(d.NgayThanhLap)}
                  </div>
                  {(() => {
                    const head = state.employees.find((e) => e.MaNV === d.MaTruongPhong);
                    return head ? (
                      <div className="text-xs text-slate-700 font-medium mb-3 flex items-center gap-1.5">
                        <Tag color="cyan" className="m-0">Trưởng phòng</Tag>
                        <span className="font-semibold text-slate-800">{head.HoTen}</span>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
                        <Tag color="default" className="m-0">Chưa có Trưởng phòng</Tag>
                      </div>
                    );
                  })()}
                  <Avatar.Group max={{ count: 6 }}>
                    {members.map((e) => (
                      <Avatar
                        key={e.MaNV}
                        style={{ backgroundColor: getAvatarHex(e.MaNV) }}
                      >
                        {getInitials(e.HoTen)}
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
            rowKey="MaCV"
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
          <Form.Item
            name="TenPB"
            label="Tên phòng ban"
            rules={[{ required: true, message: 'Nhập tên phòng ban' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="NgayThanhLap"
            label="Ngày thành lập"
            rules={[{ required: true, message: 'Chọn ngày thành lập' }]}
          >
            <Input type="date" />
          </Form.Item>
          <Form.Item name="MoTa" label="Mô tả chức năng">
            <Input.TextArea rows={3} />
          </Form.Item>
          {deptModal.item && (
            <>
              <Form.Item name="MaTruongPhong" label="Trưởng phòng">
                <Select
                  allowClear
                  placeholder="Chưa có trưởng phòng"
                  options={state.employees
                    .filter(
                      (e) =>
                        e.MaPB === deptModal.item!.MaPB &&
                        ['Đang làm việc', 'Thử việc'].includes(e.TrangThai)
                    )
                    .map((e) => ({ value: e.MaNV, label: `${e.HoTen} (${e.MaNV})` }))}
                />
              </Form.Item>
              <Form.Item name="HoatDong" label="Đang sử dụng" valuePropName="checked">
                <Switch />
              </Form.Item>
            </>
          )}

          <div className="flex items-center justify-between pt-2">
            {deptModal.item ? (
              <Popconfirm
                title="Xóa phòng ban này?"
                description="Chỉ xóa được danh mục chưa có nhân viên hoặc lịch sử công tác."
                onConfirm={() => handleDeleteDepartment(deptModal.item!.MaPB)}
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
            <Form.Item name="MaCV" label="Mã chức vụ">
              <Input disabled />
            </Form.Item>
          )}
          <Form.Item
            name="TenCV"
            label="Tên chức vụ"
            rules={[{ required: true, message: 'Nhập tên chức vụ' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="CapBac"
            label="Cấp bậc (1–10)"
            rules={[{ required: true, message: 'Nhập cấp bậc từ 1 đến 10' }]}
          >
            <InputNumber min={1} max={10} className="w-full" />
          </Form.Item>
          <Form.Item name="MoTa" label="Mô tả">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item
            name="LaDieuHanh"
            label="Chức vụ điều hành (không thuộc phòng ban)"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="VaiTroMacDinh"
            label="Vai trò tài khoản mặc định"
            extra="Khi bổ nhiệm vào chức vụ này, vai trò tài khoản tự đồng bộ theo."
          >
            <Select
              allowClear
              placeholder="Giữ nguyên vai trò hiện tại"
              options={[
                { value: 'employee', label: 'Nhân viên' },
                { value: 'manager', label: 'Trưởng phòng' },
                { value: 'director', label: 'Giám đốc' },
              ]}
            />
          </Form.Item>
          {posModal.item && (
            <Form.Item name="HoatDong" label="Đang sử dụng" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}

          <div className="flex items-center justify-between pt-2">
            {posModal.item ? (
              <Popconfirm
                title="Xóa chức vụ này?"
                description="Chỉ xóa được chức vụ chưa được sử dụng."
                onConfirm={() => handleDeletePosition(posModal.item!.MaCV)}
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
