import React, { useEffect, useState } from 'react';
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
  ROLE_NAMES,
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
  const [tab, setTab] = useState<'active' | 'departed' | 'archived'>('active');
  const [search, setSearch] = useState(initialSearch);
  const [deptFilter, setDeptFilter] = useState(initialDeptFilter);
  const [statusFilter, setStatusFilter] = useState('');

  const [detailEmp, setDetailEmp] = useState<Employee | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [selfContactModal, setSelfContactModal] = useState<Employee | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<{ TenDangNhap: string; MatKhau: string } | null>(null);

  const [empForm] = Form.useForm();
  const [contactForm] = Form.useForm();
  const selectedRole = Form.useWatch('VaiTro', empForm);
  const selectedPosition = Form.useWatch('MaCV', empForm);
  const accountEmail = Form.useWatch('Email', empForm);
  const isDirector = editingEmp
    ? editingEmp.MaPB === null ||
      !!state.positions.find((p) => p.MaCV === editingEmp.MaCV)?.LaDieuHanh
    : selectedRole === 'director' ||
      !!state.positions.find((p) => p.MaCV === selectedPosition)?.LaDieuHanh;

  const deptName = (id: string | null) =>
    state.departments.find((d) => d.MaPB === id)?.TenPB || id || 'Không thuộc phòng ban';
  const posName = (id: string) =>
    state.positions.find((p) => p.MaCV === id)?.TenCV || id;

  const filtered = state.employees.filter((e) => {
    const matchTab =
      tab === 'archived' ? e.TrangThai === 'Đã lưu trữ' : tab === 'departed'
        ? e.TrangThai === 'Đã nghỉ việc' : ['Đang làm việc', 'Thử việc'].includes(e.TrangThai);
    const matchStatus = !statusFilter || e.TrangThai === statusFilter;
    return matchTab && matchStatus && matchEmployeeQuery(e, search, deptFilter);
  });

  // Giá trị ban đầu của form Thêm/Sửa. Gán SAU khi modal đã render (useEffect bên dưới):
  // antd chỉ render nội dung Modal khi mở, nên gán trước lúc đó thì ô "Phòng ban"
  // (render có điều kiện, preserve={false}) bị mất giá trị và form không lưu được.
  const [formInit, setFormInit] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!formOpen || !formInit) return;
    empForm.resetFields();
    empForm.setFieldsValue(formInit);
  }, [formOpen, formInit, empForm]);

  const handleOpenAdd = () => {
    setEditingEmp(null);
    setFormError('');
    setFormInit({
      GioiTinh: 'Nam',
      NgayVaoLam: state.today,
      TrangThai: 'Đang làm việc',
      MaPB: state.departments[0]?.MaPB,
      MaCV: 'CV01',
      VaiTro: 'employee',
    });
    setFormOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setDetailEmp(null);
    setEditingEmp(emp);
    setFormError('');
    setFormInit({ ...emp });
    setFormOpen(true);
  };

  const handleSaveEmployee = async (values: Record<string, any>) => {
    setFormError('');
    setSubmitting(true);
    try {
      if (editingEmp) {
        const body = {
          ...values,
          MaPB: editingEmp.MaPB,
          MaCV: editingEmp.MaCV,
          PhienBan: editingEmp.PhienBan,
        };
        await apiRequest(
          `/api/employees/${encodeURIComponent(editingEmp.MaNV)}`,
          body,
          'PUT'
        );
        notify('Đã cập nhật hồ sơ nhân viên.');
      } else {
        const result = await apiRequest('/api/employees', { ...values, MaPB: isDirector ? null : values.MaPB }, 'POST');
        setCreatedAccount(result.taikhoan);
        notify('Đã thêm nhân viên và tạo tài khoản đăng nhập bằng email.');
      }
      setFormOpen(false);
      await onRefresh();
    } catch (err: any) {
      if (!editingEmp && err.status === 409 && /trùng hồ sơ/.test(err.message)) {
        // Nghi trùng hồ sơ: cho người dùng xác nhận rồi mới tạo mới.
        Modal.confirm({
          title: 'Có thể trùng hồ sơ',
          content: err.message,
          okText: 'Vẫn tạo mới',
          cancelText: 'Quay lại',
          onOk: async () => {
            try {
              const result = await apiRequest(
                '/api/employees',
                { ...values, MaPB: isDirector ? null : values.MaPB, confirm_duplicate: true },
                'POST'
              );
              setCreatedAccount(result.taikhoan);
              notify('Đã thêm nhân viên và tạo tài khoản đăng nhập bằng email.');
              setFormOpen(false);
              await onRefresh();
            } catch (e: any) {
              setFormError(e.message);
            }
          },
        });
      } else {
        setFormError(err.message);
      }
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
        `/api/employees/${encodeURIComponent(selfContactModal.MaNV)}`,
        { ...values, self_contact: true, PhienBan: state.employees.find((x) => x.MaNV === selfContactModal.MaNV)?.PhienBan },
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
        `/api/employees/${encodeURIComponent(emp.MaNV)}/archive`,
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
        `/api/employees/${encodeURIComponent(emp.MaNV)}/restore`,
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
        e.HoTen,
        e.NgaySinh,
        e.GioiTinh,
        e.Email,
        e.SoDienThoai,
        deptName(e.MaPB),
        posName(e.MaCV),
        e.NgayVaoLam,
        e.TrangThai,
      ])
    );
  };

  const columns = [
    {
      title: 'Nhân viên',
      key: 'employee',
      render: (_: unknown, e: Employee) => (
        <Space>
          <Avatar style={{ backgroundColor: getAvatarHex(e.MaNV) }}>
            {getInitials(e.HoTen)}
          </Avatar>
          <div>
            <div className="font-semibold text-slate-900">{e.HoTen}</div>
            <div className="text-xs text-slate-500">
              {e.Email} · {e.SoDienThoai}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Phòng ban',
      dataIndex: 'MaPB',
      key: 'department_id',
      render: (id: string) => deptName(id),
    },
    {
      title: 'Chức vụ',
      dataIndex: 'MaCV',
      key: 'position_id',
      render: (id: string) => posName(id),
    },
    {
      title: 'Ngày vào làm',
      dataIndex: 'NgayVaoLam',
      key: 'join_date',
      render: (d: string) => formatDate(d),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'TrangThai',
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
          {canEdit(state.user.VaiTro) && ['Đang làm việc', 'Thử việc'].includes(e.TrangThai) && (
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleOpenEdit(e)}
            >
              Sửa
            </Button>
          )}
          {!canEdit(state.user.VaiTro) &&
            e.MaNV === state.user.MaNV &&
            e.TrangThai !== 'Đã lưu trữ' && (
              <Button
                size="small"
                type="text"
                icon={<PhoneOutlined />}
                onClick={() => {
                  setFormError('');
                  contactForm.setFieldsValue({
                    SoDienThoai: e.SoDienThoai,
                    Email: e.Email,
                    DiaChi: e.DiaChi,
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
          <Title level={3} style={{ margin: '4px 0' }}>
            Hồ sơ nhân viên
          </Title>
          <Text type="secondary">
            Thêm mới, cập nhật, tra cứu đa tiêu chí và lưu trữ hồ sơ nhân sự.
          </Text>
        </div>

        <Space className="no-print w-full sm:w-auto flex-wrap">
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Xuất danh sách
          </Button>
          {canEdit(state.user.VaiTro) && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenAdd}
            >
              Thêm nhân viên
            </Button>
          )}
        </Space>
      </div>

      <Card bordered={false} className="shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <Tabs
            activeKey={tab}
            onChange={(k) => { setTab(k as typeof tab); setStatusFilter(''); }}
            items={[
              {
                key: 'active',
                label: `Đang làm việc (${
                  state.employees.filter((e) => ['Đang làm việc', 'Thử việc'].includes(e.TrangThai)).length
                })`,
              },
              {
                key: 'departed',
                label: `Đã nghỉ việc (${state.employees.filter((e) => e.TrangThai === 'Đã nghỉ việc').length})`,
              },
              {
                key: 'archived',
                label: `Đã lưu trữ (${
                  state.employees.filter((e) => e.TrangThai === 'Đã lưu trữ').length
                })`,
              },
            ]}
          />

          <Space wrap className="w-full lg:w-auto">
            <Input
              prefix={<SearchOutlined className="text-slate-400" />}
              placeholder="Tìm tên, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              className="w-full xs:w-48 sm:w-56"
            />
            <Select
              value={deptFilter}
              onChange={setDeptFilter}
              className="w-full xs:w-44 sm:w-48"
              options={[
                { value: '', label: 'Tất cả phòng ban' },
                ...state.departments.map((d) => ({
                  value: d.MaPB,
                  label: d.TenPB,
                })),
              ]}
            />
            {tab === 'active' && (
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                className="w-full xs:w-40 sm:w-44"
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
          rowKey="MaNV"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          size="middle"
          scroll={{ x: 800 }}
        />
      </Card>

      {/* Modal Chi tiết Hồ sơ */}
      <Modal
        open={!!detailEmp}
        title="Chi tiết hồ sơ nhân viên"
        onCancel={() => setDetailEmp(null)}
        width={760}
        footer={
          detailEmp && (
            <Space wrap>
              <Button onClick={() => setDetailEmp(null)}>Đóng</Button>
              {canEdit(state.user.VaiTro) &&
                (detailEmp.TrangThai === 'Đã lưu trữ' ? (
                  <Button
                    type="primary"
                    icon={<RollbackOutlined />}
                    onClick={() => handleRestore(detailEmp)}
                  >
                    Khôi phục hồ sơ
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
                        Lưu trữ hồ sơ
                      </Button>
                    </Popconfirm>
                    <Button
                      type="primary"
                      disabled={detailEmp.TrangThai === 'Đã nghỉ việc'}
                      icon={<EditOutlined />}
                      onClick={() => handleOpenEdit(detailEmp)}
                    >
                      Chỉnh sửa
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
                style={{ backgroundColor: getAvatarHex(detailEmp.MaNV) }}
              >
                {getInitials(detailEmp.HoTen)}
              </Avatar>
              <div>
                <Title level={4} style={{ margin: 0 }}>
                  {detailEmp.HoTen}
                </Title>
                <Text type="secondary">
                  {posName(detailEmp.MaCV)} ·{' '}
                  {deptName(detailEmp.MaPB)}
                </Text>
                <div className="mt-1">
                  <Tag color={getAntTagColor(detailEmp.TrangThai)}>
                    {detailEmp.TrangThai}
                  </Tag>
                </div>
              </div>
            </div>

            <Descriptions
              bordered
              size="small"
              column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
            >
              <Descriptions.Item label="Ngày sinh">
                {formatDate(detailEmp.NgaySinh)}
              </Descriptions.Item>
              <Descriptions.Item label="Giới tính">
                {detailEmp.GioiTinh}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày vào làm">
                {formatDate(detailEmp.NgayVaoLam)}
              </Descriptions.Item>
              <Descriptions.Item label="Số điện thoại">
                {detailEmp.SoDienThoai}
              </Descriptions.Item>
              <Descriptions.Item label="Email" span={2}>
                {detailEmp.Email}
              </Descriptions.Item>
              <Descriptions.Item label="Địa chỉ" span={2}>
                {detailEmp.DiaChi || '—'}
              </Descriptions.Item>
              {detailEmp.NgayLuuTru && (
                <Descriptions.Item label="Ngày lưu trữ" span={2}>
                  <Text type="danger">{formatDate(detailEmp.NgayLuuTru)}</Text>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Divider orientation="left" plain>
              Hợp đồng lao động liên kết
            </Divider>
            <div className="space-y-2">
              {state.contracts
                .filter((c) => c.MaNV === detailEmp.MaNV)
                .map((c) => (
                  <Card key={c.MaHD} size="small">
                    <div className="flex items-center justify-between">
                      <div>
                        {c.LoaiHD}
                        <div className="text-xs text-slate-500">
                          {formatDate(c.NgayBatDau)} → {formatDate(c.NgayKetThuc)}
                        </div>
                      </div>
                      <Tag color={getAntTagColor(getContractStatus(c, state.today))}>
                        {getContractStatus(c, state.today)}
                      </Tag>
                    </div>
                  </Card>
                ))}
              {state.contracts.filter((c) => c.MaNV === detailEmp.MaNV)
                .length === 0 && (
                <Text type="secondary">Chưa có hợp đồng.</Text>
              )}
            </div>

            <Divider orientation="left" plain>
              Quá trình công tác (Điều chuyển / Bổ nhiệm)
            </Divider>
            <div className="space-y-2">
              {state.assignments
                .filter((a) => a.MaNV === detailEmp.MaNV)
                .map((a) => (
                  <Card key={a.MaQT} size="small">
                    <div className="flex justify-between font-semibold">
                      <span>{a.LoaiBienDong}</span>
                      <span>Hiệu lực: {formatDate(a.NgayHieuLuc)}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Phòng ban: {deptName(a.MaPBCu)} →{' '}
                      <strong>{deptName(a.MaPBMoi)}</strong> | Chức vụ:{' '}
                      {posName(a.MaCVCu)} →{' '}
                      <strong>{posName(a.MaCVMoi)}</strong>
                    </div>
                  </Card>
                ))}
              {state.assignments.filter((a) => a.MaNV === detailEmp.MaNV)
                .length === 0 && (
                <Text type="secondary">Chưa có biến động công tác.</Text>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Thêm / Sửa Hồ sơ */}
      <Modal
        open={formOpen}
        title={
          editingEmp
            ? 'Cập nhật hồ sơ nhân viên'
            : 'Thêm hồ sơ nhân viên mới'
        }
        onCancel={() => setFormOpen(false)}
        footer={null}
        width={680}
      >
        <Form
          name="employeeProfile"
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
                ? 'Để thay đổi Phòng ban hoặc Chức vụ, vui lòng dùng chức năng Quá trình công tác để lưu kèm Quyết định.'
                : 'Email là tên đăng nhập. Mật khẩu được tạo tự động và hiển thị sau khi lưu. Hồ sơ mới được cấp 12 ngày phép cho năm hiện tại.'
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
              name="HoTen"
              label="Họ và tên"
              rules={[{ required: true, message: 'Nhập họ và tên' }]}
            >
              <Input placeholder="Nhập họ tên..." />
            </Form.Item>

            <Form.Item
              name="NgaySinh"
              label="Ngày sinh"
              rules={[{ required: true, message: 'Chọn ngày sinh' }]}
            >
              <Input type="date" max={state.today} />
            </Form.Item>

            <Form.Item
              name="GioiTinh"
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
              name="SoDienThoai"
              label="Số điện thoại"
              rules={[{ required: true, message: 'Nhập số điện thoại' }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="Email"
              label="Email"
              rules={[
                { required: true, type: 'email', message: 'Nhập email hợp lệ' },
              ]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="NgayVaoLam"
              label="Ngày vào làm"
              rules={[{ required: true, message: 'Chọn ngày vào làm' }]}
            >
              <Input type="date" />
            </Form.Item>

            {/* Khi sửa hồ sơ, trạng thái do hợp đồng quyết định nên không cho nhập tay. */}
            {!editingEmp && (
              <Form.Item
                name="TrangThai"
                label="Trạng thái ban đầu"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { value: 'Đang làm việc', label: 'Đang làm việc' },
                    { value: 'Thử việc', label: 'Thử việc' },
                  ]}
                />
              </Form.Item>
            )}

            {!editingEmp && (
              <Form.Item name="VaiTro" label="Vai trò tài khoản" rules={[{ required: true }]}>
                <Select
                  options={Object.entries(ROLE_NAMES).filter(([role]) => role !== 'admin' || state.user.VaiTro === 'admin')
                    .map(([value, label]) => ({ value, label }))}
                  onChange={(role) => {
                    if (role === 'director') {
                      empForm.setFieldsValue({ MaPB: undefined,
                        MaCV: state.positions.find((p) => p.TenCV === 'Giám đốc')?.MaCV || selectedPosition });
                    } else {
                      empForm.setFieldsValue({ MaPB: state.departments[0]?.MaPB,
                        ...(state.positions.find((p) => p.MaCV === selectedPosition)?.TenCV === 'Giám đốc'
                          ? { MaCV: state.positions.find((p) => p.TenCV !== 'Giám đốc')?.MaCV } : {}) });
                    }
                  }}
                />
              </Form.Item>
            )}

            {!isDirector && <Form.Item
              name="MaPB"
              label="Phòng ban"
              rules={[{ required: !editingEmp, message: 'Chọn phòng ban' }]}
            >
              <Select
                disabled={!!editingEmp}
                options={state.departments.map((d) => ({
                  value: d.MaPB,
                  label: d.TenPB,
                }))}
              />
            </Form.Item>}

            <Form.Item
              name="MaCV"
              label="Chức vụ"
              rules={[{ required: true }]}
            >
              <Select
                disabled={!!editingEmp}
                onChange={(positionId) => {
                  if (state.positions.find((p) => p.MaCV === positionId)?.TenCV === 'Giám đốc') {
                    empForm.setFieldsValue({ VaiTro: 'director', MaPB: undefined });
                  } else if (selectedRole === 'director') {
                    empForm.setFieldsValue({ VaiTro: 'employee', MaPB: state.departments[0]?.MaPB });
                  }
                }}
                options={state.positions.map((p) => ({
                  value: p.MaCV,
                  label: p.TenCV,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="DiaChi"
              label="Địa chỉ"
              className="sm:col-span-2"
            >
              <Input />
            </Form.Item>
          </div>

          {!editingEmp && <Alert type="info" className="mb-4" showIcon
            message={`Tài khoản đăng nhập: ${accountEmail || '(nhập email nhân viên)'}`}
            description={isDirector ? 'Giám đốc không thuộc phòng ban. Mật khẩu sẽ hiển thị sau khi tạo thành công.' : 'Mật khẩu sẽ hiển thị sau khi tạo thành công.'} />}

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setFormOpen(false)}>Đóng</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Lưu thông tin
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal open={!!createdAccount} title="Đã tạo tài khoản nhân viên" footer={<Button type="primary" onClick={() => setCreatedAccount(null)}>Đã lưu thông tin</Button>}
        onCancel={() => setCreatedAccount(null)}>
        {createdAccount && <>
          <Alert type="success" showIcon message="Gửi thông tin này cho nhân viên để đăng nhập." className="mb-4" />
          <Descriptions bordered column={1}>
            <Descriptions.Item label="Tài khoản (email)"><Text copyable>{createdAccount.TenDangNhap}</Text></Descriptions.Item>
            <Descriptions.Item label="Mật khẩu ban đầu"><Text copyable>{createdAccount.MatKhau}</Text></Descriptions.Item>
          </Descriptions>
          <p className="mt-3">Hãy lưu mật khẩu trước khi đóng. Nhân viên có thể đổi mật khẩu sau khi đăng nhập.</p>
        </>}
      </Modal>

      {/* Modal Nhân viên tự cập nhật thông tin liên hệ cá nhân (DFD 1.2) */}
      <Modal
        open={!!selfContactModal}
        title="Cập nhật thông tin liên hệ cá nhân"
        onCancel={() => setSelfContactModal(null)}
        footer={null}
      >
        <Form
          name="employeeContact"
          form={contactForm}
          layout="vertical"
          onFinish={handleSaveSelfContact}
        >
          {formError && (
            <Alert type="error" showIcon message={formError} className="mb-4" />
          )}
          <Form.Item
            name="SoDienThoai"
            label="Số điện thoại"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="Email"
            label="Email"
            rules={[{ required: true, type: 'email' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="DiaChi" label="Địa chỉ">
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
