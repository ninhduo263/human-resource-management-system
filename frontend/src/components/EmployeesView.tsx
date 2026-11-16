import React, { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Input,
  Select,
  Tabs,
  Modal,
  Form,
  Space,
  Avatar,
  Descriptions,
  Popconfirm,
  Alert,
  Typography,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  DownloadOutlined,
  SearchOutlined,
  EditOutlined,
  EyeOutlined,
  InboxOutlined,
  RollbackOutlined,
  PhoneOutlined,
} from '@ant-design/icons';
import { AppState, Employee } from '../types';
import { apiRequest } from '../api';
import {
  canEdit,
  downloadCsv,
  formatDate,
  getAntTagColor,
  getAvatarHex,
  getContractStatus,
  getInitials,
  matchEmployeeQuery,
} from '../utils/format';

const { Title, Text } = Typography;

interface EmployeesViewProps {
  state: AppState;
  initialDeptFilter?: string;
  initialSearch?: string;
  onRefresh: () => Promise<void>;
  notify: (msg: string, isError?: boolean) => void;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  state,
  initialDeptFilter = '',
  initialSearch = '',
  onRefresh,
  notify,
}) => {
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [search, setSearch] = useState(initialSearch);
  const [deptFilter, setDeptFilter] = useState(initialDeptFilter);
  const [statusFilter, setStatusFilter] = useState('');

  const [detailEmp, setDetailEmp] = useState<Employee | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [selfContactModal, setSelfContactModal] = useState<Employee | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [empForm] = Form.useForm();
  const [contactForm] = Form.useForm();

  const deptName = (id: string) =>
    state.departments.find((d) => d.id === id)?.name || id;
  const posName = (id: string) =>
    state.positions.find((p) => p.id === id)?.name || id;

  const filtered = state.employees.filter((e) => {
    const matchTab =
      tab === 'archived' ? e.status === 'Đã lưu trữ' : e.status !== 'Đã lưu trữ';
    const matchStatus = !statusFilter || e.status === statusFilter;
    return matchTab && matchStatus && matchEmployeeQuery(e, search, deptFilter);
  });

  const handleOpenAdd = () => {
    setEditingEmp(null);
    setFormError('');
    empForm.resetFields();
    empForm.setFieldsValue({
      gender: 'Nam',
      join_date: state.today,
      status: 'Đang làm việc',
      department_id: state.departments[0]?.id,
      position_id: 'CV01',
    });
    setFormOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setDetailEmp(null);
    setEditingEmp(emp);
    setFormError('');
    empForm.setFieldsValue({
      ...emp,
    });
    setFormOpen(true);
  };

  const handleSaveEmployee = async (values: Record<string, any>) => {
    setFormError('');
    setSubmitting(true);
    try {
      if (editingEmp) {
        const body = {
          ...values,
          department_id: editingEmp.department_id,
          position_id: editingEmp.position_id,
        };
        await apiRequest(
          `/api/employees/${encodeURIComponent(editingEmp.id)}`,
          body,
          'PUT'
        );
        notify('Đã cập nhật hồ sơ nhân viên.');
      } else {
        await apiRequest('/api/employees', values, 'POST');
        notify('Đã thêm hồ sơ nhân viên mới.');
      }
      setFormOpen(false);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSelfContact = async (values: Record<string, any>) => {
    if (!selfContactModal) return;
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest(
        `/api/employees/${encodeURIComponent(selfContactModal.id)}`,
        { ...values, self_contact: true },
        'PUT'
      );
      notify('Đã cập nhật thông tin liên hệ cá nhân.');
      setSelfContactModal(null);
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (emp: Employee) => {
    try {
      await apiRequest(
        `/api/employees/${encodeURIComponent(emp.id)}/archive`,
        {},
        'POST'
      );
      setDetailEmp(null);
      notify('Đã lưu trữ hồ sơ nhân viên.');
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleRestore = async (emp: Employee) => {
    try {
      await apiRequest(
        `/api/employees/${encodeURIComponent(emp.id)}/restore`,
        {},
        'POST'
      );
      setDetailEmp(null);
      notify('Đã khôi phục hồ sơ nhân viên.');
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleExport = () => {
    downloadCsv(
      `peopleops-employees-${state.today}.csv`,
      [
        'Mã NV',
        'Họ tên',
        'Ngày sinh',
        'Giới tính',
        'Email',
        'Số điện thoại',
        'Phòng ban',
        'Chức vụ',
        'Ngày vào làm',
        'Trạng thái',
      ],
      filtered.map((e) => [
        e.id,
        e.name,
        e.birth_date,
        e.gender,
        e.email,
        e.phone,
        deptName(e.department_id),
        posName(e.position_id),
        e.join_date,
        e.status,
      ])
    );
  };

  const columns = [
    {
      title: 'Nhân viên',
      key: 'employee',
      render: (_: unknown, e: Employee) => (
        <Space>
          <Avatar style={{ backgroundColor: getAvatarHex(e.id) }}>
            {getInitials(e.name)}
          </Avatar>
          <div>
            <div className="font-semibold text-slate-900">{e.name}</div>
            <div className="text-xs text-slate-500">
              {e.email} · {e.phone}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Mã NV',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: 'Phòng ban',
      dataIndex: 'department_id',
      key: 'department_id',
      render: (id: string) => deptName(id),
    },
    {
      title: 'Chức vụ',
      dataIndex: 'position_id',
      key: 'position_id',
      render: (id: string) => posName(id),
    },
    {
      title: 'Ngày vào làm',
      dataIndex: 'join_date',
      key: 'join_date',
      render: (d: string) => formatDate(d),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getAntTagColor(status)}>{status}</Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, e: Employee) => (
        <Space>
          <Button
            size="small"
            type="link"
            icon={<EyeOutlined />}
            onClick={() => setDetailEmp(e)}
          >
            Chi tiết
          </Button>
          {canEdit(state.user.role) && e.status !== 'Đã lưu trữ' && (
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleOpenEdit(e)}
            >
              Sửa
            </Button>
          )}
          {!canEdit(state.user.role) &&
            e.id === state.user.employee_id &&
            e.status !== 'Đã lưu trữ' && (
              <Button
                size="small"
                type="text"
                icon={<PhoneOutlined />}
                onClick={() => {
                  setFormError('');
                  contactForm.setFieldsValue({
                    phone: e.phone,
                    email: e.email,
                    address: e.address,
                  });
                  setSelfContactModal(e);
                }}
              >
                Sửa liên hệ
              </Button>
            )}
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Text className="text-xs font-bold uppercase tracking-wider text-[#12584b]">
            PHÂN HỆ 1.0 · BFD 1.1 – 1.4
          </Text>
          <Title level={3} style={{ margin: '4px 0' }}>
            Hồ sơ nhân viên
          </Title>
          <Text type="secondary">
            Thêm mới, cập nhật, tra cứu đa tiêu chí và lưu trữ hồ sơ nhân sự (Kho D1).
          </Text>
        </div>

        <Space className="no-print">
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Xuất danh sách
          </Button>
          {canEdit(state.user.role) && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenAdd}
            >
              Thêm nhân viên (1.1)
            </Button>
          )}
        </Space>
      </div>

      <Card bordered={false} className="shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as 'active' | 'archived')}
            items={[
              {
                key: 'active',
                label: `Đang làm việc (${
                  state.employees.filter((e) => e.status !== 'Đã lưu trữ').length
                })`,
              },
              {
                key: 'archived',
                label: `Đã lưu trữ (${
                  state.employees.filter((e) => e.status === 'Đã lưu trữ').length
                })`,
              },
            ]}
          />

          <Space wrap>
            <Input
              prefix={<SearchOutlined className="text-slate-400" />}
              placeholder="Tìm tên, mã NV, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              style={{ width: 220 }}
            />
            <Select
              value={deptFilter}
              onChange={setDeptFilter}
              style={{ width: 180 }}
              options={[
                { value: '', label: 'Tất cả phòng ban' },
                ...state.departments.map((d) => ({
                  value: d.id,
                  label: d.name,
                })),
              ]}
            />
            {tab === 'active' && (
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 160 }}
                options={[
                  { value: '', label: 'Tất cả trạng thái' },
                  { value: 'Đang làm việc', label: 'Đang làm việc' },
                  { value: 'Thử việc', label: 'Thử việc' },
                ]}
              />
            )}
          </Space>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          size="middle"
        />
      </Card>

      {/* Modal Chi tiết Hồ sơ (1.3 / 1.4) */}
      <Modal
        open={!!detailEmp}
        title="Chi tiết hồ sơ nhân viên (1.3)"
        onCancel={() => setDetailEmp(null)}
        width={760}
        footer={
          detailEmp && (
            <Space>
              <Button onClick={() => setDetailEmp(null)}>Đóng</Button>
              {canEdit(state.user.role) &&
                (detailEmp.status === 'Đã lưu trữ' ? (
                  <Button
                    type="primary"
                    icon={<RollbackOutlined />}
                    onClick={() => handleRestore(detailEmp)}
                  >
                    Khôi phục hồ sơ (1.4)
                  </Button>
                ) : (
                  <>
                    <Popconfirm
                      title="Lưu trữ hồ sơ nhân viên?"
                      description="Nhân viên phải không còn hợp đồng hiệu lực và đơn phép chờ duyệt."
                      onConfirm={() => handleArchive(detailEmp)}
                      okText="Lưu trữ"
                      cancelText="Hủy"
                    >
                      <Button danger icon={<InboxOutlined />}>
                        Lưu trữ hồ sơ (1.4)
                      </Button>
                    </Popconfirm>
                    <Button
                      type="primary"
                      icon={<EditOutlined />}
                      onClick={() => handleOpenEdit(detailEmp)}
                    >
                      Chỉnh sửa (1.2)
                    </Button>
                  </>
                ))}
            </Space>
          )
        }
      >
        {detailEmp && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 pb-3 border-b border-slate-100">
              <Avatar
                size={56}
                style={{ backgroundColor: getAvatarHex(detailEmp.id) }}
              >
                {getInitials(detailEmp.name)}
              </Avatar>
              <div>
                <Title level={4} style={{ margin: 0 }}>
                  {detailEmp.name}
                </Title>
                <Text type="secondary">
                  Mã NV: <strong>{detailEmp.id}</strong> ·{' '}
                  {posName(detailEmp.position_id)} ·{' '}
                  {deptName(detailEmp.department_id)}
                </Text>
                <div className="mt-1">
                  <Tag color={getAntTagColor(detailEmp.status)}>
                    {detailEmp.status}
                  </Tag>
                </div>
              </div>
            </div>

            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Ngày sinh">
                {formatDate(detailEmp.birth_date)}
              </Descriptions.Item>
              <Descriptions.Item label="Giới tính">
                {detailEmp.gender}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày vào làm">
                {formatDate(detailEmp.join_date)}
              </Descriptions.Item>
              <Descriptions.Item label="Số điện thoại">
                {detailEmp.phone}
              </Descriptions.Item>
              <Descriptions.Item label="Email" span={2}>
                {detailEmp.email}
              </Descriptions.Item>
              <Descriptions.Item label="Địa chỉ" span={2}>
                {detailEmp.address || '—'}
              </Descriptions.Item>
              {detailEmp.archived_date && (
                <Descriptions.Item label="Ngày lưu trữ" span={2}>
                  <Text type="danger">{formatDate(detailEmp.archived_date)}</Text>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Divider orientation="left" plain>
              Hợp đồng lao động liên kết
            </Divider>
            <div className="space-y-2">
              {state.contracts
                .filter((c) => c.employee_id === detailEmp.id)
                .map((c) => (
                  <Card key={c.id} size="small">
                    <div className="flex items-center justify-between">
                      <div>
                        <strong>{c.id}</strong> · {c.type}
                        <div className="text-xs text-slate-500">
                          {formatDate(c.start_date)} → {formatDate(c.end_date)}
                        </div>
                      </div>
                      <Tag color={getAntTagColor(getContractStatus(c, state.today))}>
                        {getContractStatus(c, state.today)}
                      </Tag>
                    </div>
                  </Card>
                ))}
              {state.contracts.filter((c) => c.employee_id === detailEmp.id)
                .length === 0 && (
                <Text type="secondary">Chưa có hợp đồng.</Text>
              )}
            </div>

            <Divider orientation="left" plain>
              Quá trình công tác (Điều chuyển / Bổ nhiệm)
            </Divider>
            <div className="space-y-2">
              {state.assignments
                .filter((a) => a.employee_id === detailEmp.id)
                .map((a) => (
                  <Card key={a.id} size="small">
                    <div className="flex justify-between font-semibold">
                      <span>{a.type}</span>
                      <span>Hiệu lực: {formatDate(a.effective_date)}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Phòng ban: {deptName(a.old_department_id)} →{' '}
                      <strong>{deptName(a.new_department_id)}</strong> | Chức vụ:{' '}
                      {posName(a.old_position_id)} →{' '}
                      <strong>{posName(a.new_position_id)}</strong>
                    </div>
                  </Card>
                ))}
              {state.assignments.filter((a) => a.employee_id === detailEmp.id)
                .length === 0 && (
                <Text type="secondary">Chưa có biến động công tác.</Text>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Thêm / Sửa Hồ sơ (1.1 & 1.2) */}
      <Modal
        open={formOpen}
        title={
          editingEmp
            ? 'Cập nhật hồ sơ nhân viên (1.2)'
            : 'Thêm hồ sơ nhân viên mới (1.1)'
        }
        onCancel={() => setFormOpen(false)}
        footer={null}
        width={680}
      >
        <Form
          form={empForm}
          layout="vertical"
          onFinish={handleSaveEmployee}
          className="mt-3"
        >
          <Alert
            type="info"
            showIcon
            className="mb-4"
            message={
              editingEmp
                ? 'Để thay đổi Phòng ban hoặc Chức vụ, vui lòng dùng chức năng Quá trình công tác (4.1) để lưu kèm Quyết định.'
                : 'Hồ sơ mới được cấp tự động quỹ phép mặc định 12 ngày cho năm hiện tại.'
            }
          />

          {formError && (
            <Alert
              type="error"
              showIcon
              message={formError}
              className="mb-4"
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item
              name="id"
              label="Mã nhân viên"
              rules={[{ required: true, message: 'Nhập mã nhân viên' }]}
            >
              <Input disabled={!!editingEmp} placeholder="VD: NV013" />
            </Form.Item>

            <Form.Item
              name="name"
              label="Họ và tên"
              rules={[{ required: true, message: 'Nhập họ và tên' }]}
            >
              <Input placeholder="Nhập họ tên..." />
            </Form.Item>

            <Form.Item
              name="birth_date"
              label="Ngày sinh"
              rules={[{ required: true, message: 'Chọn ngày sinh' }]}
            >
              <Input type="date" max={state.today} />
            </Form.Item>

            <Form.Item
              name="gender"
              label="Giới tính"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  { value: 'Nam', label: 'Nam' },
                  { value: 'Nữ', label: 'Nữ' },
                  { value: 'Khác', label: 'Khác' },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="phone"
              label="Số điện thoại"
              rules={[{ required: true, message: 'Nhập số điện thoại' }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, type: 'email', message: 'Nhập email hợp lệ' },
              ]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="join_date"
              label="Ngày vào làm"
              rules={[{ required: true, message: 'Chọn ngày vào làm' }]}
            >
              <Input type="date" />
            </Form.Item>

            <Form.Item
              name="status"
              label="Trạng thái"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  { value: 'Đang làm việc', label: 'Đang làm việc' },
                  { value: 'Thử việc', label: 'Thử việc' },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="department_id"
              label="Phòng ban"
              rules={[{ required: true }]}
            >
              <Select
                disabled={!!editingEmp}
                options={state.departments.map((d) => ({
                  value: d.id,
                  label: d.name,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="position_id"
              label="Chức vụ"
              rules={[{ required: true }]}
            >
              <Select
                disabled={!!editingEmp}
                options={state.positions.map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="address"
              label="Địa chỉ"
              className="sm:col-span-2"
            >
              <Input />
            </Form.Item>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setFormOpen(false)}>Đóng</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Lưu thông tin
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal Nhân viên tự cập nhật thông tin liên hệ cá nhân (DFD 1.2) */}
      <Modal
        open={!!selfContactModal}
        title="Cập nhật thông tin liên hệ cá nhân (1.2)"
        onCancel={() => setSelfContactModal(null)}
        footer={null}
      >
        <Form
          form={contactForm}
          layout="vertical"
          onFinish={handleSaveSelfContact}
        >
          {formError && (
            <Alert type="error" showIcon message={formError} className="mb-4" />
          )}
          <Form.Item
            name="phone"
            label="Số điện thoại"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ">
            <Input />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setSelfContactModal(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Lưu liên hệ
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
