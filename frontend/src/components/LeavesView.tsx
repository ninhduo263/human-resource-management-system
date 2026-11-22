import React, { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Input,
  InputNumber,
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
  Dropdown,
} from 'antd';
import {
  PlusOutlined,
  DownloadOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  CalendarOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import { AppState, LeaveBalance, LeaveRequest } from '../types';
import { apiRequest } from '../api';
import { LeaveCalendar, findOverlaps } from './LeaveCalendar';
import { exportExcel, printReportPdf } from '../utils/exportFiles';
import {
  canEdit,
  downloadCsv,
  formatDate,
  getAntTagColor,
  getAvatarHex,
  getInitials,
  matchEmployeeQuery,
} from '../utils/format';

const { Title, Text } = Typography;

interface LeavesViewProps {
  state: AppState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, isError?: boolean) => void;
}

export const LeavesView: React.FC<LeavesViewProps> = ({
  state,
  onRefresh,
  notify,
}) => {
  const currentYear = Number(state.today.slice(0, 4));
  const [tab, setTab] = useState<'requests' | 'calendar' | 'balances'>('requests');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [detailLeave, setDetailLeave] = useState<LeaveRequest | null>(null);
  const [reviewModal, setReviewModal] = useState<{
    leave: LeaveRequest;
    approve: boolean;
  } | null>(null);
  const [balanceModal, setBalanceModal] = useState<LeaveBalance | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [leaveForm] = Form.useForm();
  const [reviewForm] = Form.useForm();
  const [balanceForm] = Form.useForm();

  const emp = (id: string) => state.employees.find((e) => e.MaNV === id);
  const deptName = (id: string | null) =>
    state.departments.find((d) => d.MaPB === id)?.TenPB || id || 'Không thuộc phòng ban';
  const leaveTypeName = (id: string) =>
    state.leaveTypes.find((t) => t.MaLoai === id)?.TenLoai || id;

  // Quyền duyệt do máy chủ quyết định theo vai trò, phòng ban và tuyến duyệt.
  const canReviewLeave = (l: LeaveRequest) => l.coquyenduyet === true;

  // Đơn chờ duyệt: chủ đơn hoặc HR/admin hủy được; đơn đã duyệt: chỉ khi chưa đến ngày nghỉ.
  const canCancelLeave = (l: LeaveRequest) => {
    const privileged = ['admin', 'hr'].includes(state.user.VaiTro);
    const owner = l.MaNV === state.user.MaNV;
    if (!owner && !privileged) return false;
    if (l.TrangThai === 'Chờ duyệt') return true;
    if (l.TrangThai === 'Đã duyệt') {
      return privileged ? l.DenNgay >= state.today : l.TuNgay > state.today;
    }
    return false;
  };

  const filteredRequests = state.leaves.filter(
    (l) =>
      (!statusFilter || l.TrangThai === statusFilter) &&
      matchEmployeeQuery(emp(l.MaNV), search, deptFilter)
  );

  const availableYears = Array.from(
    new Set([currentYear, ...state.balances.map((b) => b.Nam)])
  ).sort((a, b) => b - a);

  const filteredBalances = state.balances.filter((b) => {
    const e = emp(b.MaNV);
    return (
      b.Nam === selectedYear &&
      e &&
      ['Đang làm việc', 'Thử việc'].includes(e.TrangThai) &&
      matchEmployeeQuery(e, search, deptFilter)
    );
  });

  const isSelfOnly = ['employee', 'manager', 'director'].includes(state.user.VaiTro);

  const handleOpenCreate = () => {
    setFormError('');
    leaveForm.resetFields();
    leaveForm.setFieldsValue({
      MaNV: state.user.MaNV,
      MaLoai: state.leaveTypes[0]?.MaLoai,
      TuNgay: state.today,
      DenNgay: state.today,
    });
    setCreateOpen(true);
  };

  const handleSubmitLeave = async (values: Record<string, any>) => {
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest(
        '/api/leaves',
        {
          ...values,
          MaNV: isSelfOnly ? state.user.MaNV : values.MaNV,
        },
        'POST'
      );
      setCreateOpen(false);
      notify('Đã gửi đơn đăng ký nghỉ phép.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelLeave = async (l: LeaveRequest) => {
    try {
      await apiRequest(
        `/api/leaves/${encodeURIComponent(l.MaDon)}/cancel`,
        {},
        'POST'
      );
      setDetailLeave(null);
      notify('Đã hủy đơn nghỉ phép.');
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleReviewSubmit = async (values: Record<string, any>) => {
    if (!reviewModal) return;
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest(
        `/api/leaves/${encodeURIComponent(reviewModal.leave.MaDon)}/review`,
        {
          TrangThai: reviewModal.approve ? 'Đã duyệt' : 'Từ chối',
          GhiChuDuyet: values.GhiChuDuyet || '',
        },
        'POST'
      );
      setReviewModal(null);
      setDetailLeave(null);
      notify(
        reviewModal.approve
          ? 'Đã phê duyệt đơn nghỉ phép.'
          : 'Đã từ chối đơn nghỉ phép.'
      );
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveBalance = async (values: Record<string, any>) => {
    if (!balanceModal) return;
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest(
        '/api/balances',
        {
          MaNV: balanceModal.MaNV,
          Nam: Number(values.Nam),
          TongSoNgayPhep: Number(values.TongSoNgayPhep),
        },
        'POST'
      );
      setSelectedYear(Number(values.Nam));
      setBalanceModal(null);
      notify('Đã cập nhật tổng quỹ phép năm.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const exportData = () =>
    tab === 'balances'
      ? {
          name: `quy-phep-${selectedYear}`,
          title: `Quỹ phép năm ${selectedYear}`,
          headers: ['Nhân viên', 'Phòng ban', 'Năm', 'Tổng phép', 'Đã nghỉ', 'Còn lại'],
          numeric: [2, 3, 4, 5],
          rows: filteredBalances.map((b) => {
            const e = emp(b.MaNV);
            return [
              e?.HoTen || 'Nhân viên',
              e ? deptName(e.MaPB) : '',
              b.Nam,
              b.TongSoNgayPhep,
              b.SoNgayDaNghi,
              b.SoNgayConLai,
            ];
          }),
        }
      : {
          name: `don-nghi-phep-${state.today}`,
          title: 'Danh sách đơn nghỉ phép',
          headers: ['Mã đơn', 'Nhân viên', 'Loại nghỉ', 'Từ ngày', 'Đến ngày', 'Số ngày', 'Trạng thái', 'Người duyệt'],
          numeric: [5],
          rows: filteredRequests.map((l) => [
            l.MaDon,
            emp(l.MaNV)?.HoTen || 'Nhân viên',
            leaveTypeName(l.MaLoai),
            formatDate(l.TuNgay),
            formatDate(l.DenNgay),
            Number(l.SoNgay),
            l.TrangThai,
            l.tennguoiduyet || l.MaNVDuyet || '—',
          ]),
        };

  const handleExport = async (format: 'xlsx' | 'pdf' | 'csv') => {
    const d = exportData();
    if (format === 'csv') return downloadCsv(`${d.name}.csv`, d.headers, d.rows);
    const spec = {
      title: d.title,
      fileName: d.name,
      headers: d.headers,
      rows: d.rows,
      numericColumns: d.numeric,
      author: state.user.HoTen,
      meta: [['Phòng ban', deptFilter ? deptName(deptFilter) : 'Tất cả']] as [string, string][],
    };
    try {
      if (format === 'pdf') printReportPdf(spec);
      else await exportExcel(spec);
      notify(`Đã xuất ${d.rows.length} dòng.`);
    } catch (err: any) {
      notify(err?.message || 'Không thể xuất file.', true);
    }
  };

  const reviewOverlaps = reviewModal ? findOverlaps(state, reviewModal.leave) : [];

  const requestColumns = [
    {
      title: 'Nhân viên',
      key: 'employee',
      render: (_: unknown, l: LeaveRequest) => {
        const e = emp(l.MaNV);
        return (
          <Space>
            <Avatar style={{ backgroundColor: getAvatarHex(e?.MaNV) }}>
              {getInitials(e?.HoTen)}
            </Avatar>
            <div>
              <div className="font-semibold text-slate-900">
                {e?.HoTen || 'Nhân viên'}
              </div>
              <div className="text-xs text-slate-400">{l.MaDon}</div>
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Loại nghỉ',
      dataIndex: 'MaLoai',
      key: 'MaLoai',
      render: (id: string) => leaveTypeName(id),
    },
    {
      title: 'Thời gian nghỉ',
      key: 'dates',
      render: (_: unknown, l: LeaveRequest) =>
        `${formatDate(l.TuNgay)} – ${formatDate(l.DenNgay)}`,
    },
    {
      title: 'Số ngày',
      dataIndex: 'SoNgay',
      key: 'SoNgay',
      render: (days: number) => <strong>{days} ngày</strong>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'TrangThai',
      key: 'TrangThai',
      render: (status: string) => (
        <Tag color={getAntTagColor(status)}>{status}</Tag>
      ),
    },
    {
      title: 'Người duyệt',
      key: 'approver',
      render: (_: unknown, l: LeaveRequest) =>
        l.tennguoiduyet ||
        (l.MaNVDuyet ? emp(l.MaNVDuyet)?.HoTen || l.MaNVDuyet : '—'),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, l: LeaveRequest) => (
        <Button
          size="small"
          type="link"
          icon={<EyeOutlined />}
          onClick={() => setDetailLeave(l)}
        >
          {canReviewLeave(l) ? 'Xử lý duyệt' : 'Chi tiết'}
        </Button>
      ),
    },
  ];

  const balanceColumns = [
    {
      title: 'Nhân viên',
      key: 'employee',
      render: (_: unknown, b: LeaveBalance) => {
        const e = emp(b.MaNV)!;
        return (
          <Space>
            <Avatar style={{ backgroundColor: getAvatarHex(e.MaNV) }}>
              {getInitials(e.HoTen)}
            </Avatar>
            <div>
              <div className="font-semibold text-slate-900">{e.HoTen}</div>
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Phòng ban',
      key: 'dept',
      render: (_: unknown, b: LeaveBalance) => {
        const e = emp(b.MaNV);
        return e ? deptName(e.MaPB) : '—';
      },
    },
    {
      title: 'Năm',
      dataIndex: 'Nam',
      key: 'Nam',
      render: (y: number) => <Text code>{y}</Text>,
    },
    {
      title: 'Tổng ngày phép',
      dataIndex: 'TongSoNgayPhep',
      key: 'TongSoNgayPhep',
      render: (t: number) => `${t} ngày`,
    },
    {
      title: 'Số ngày đã nghỉ',
      dataIndex: 'SoNgayDaNghi',
      key: 'SoNgayDaNghi',
      render: (u: number) => <Tag color="warning">{u} ngày</Tag>,
    },
    {
      title: 'Số ngày còn lại',
      dataIndex: 'SoNgayConLai',
      key: 'SoNgayConLai',
      render: (r: number) => <Tag color="success">{r} ngày</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, b: LeaveBalance) =>
        canEdit(state.user.VaiTro) ? (
          <Button
            size="small"
            type="link"
            icon={<EditOutlined />}
            onClick={() => {
              setFormError('');
              balanceForm.setFieldsValue({
                Nam: b.Nam,
                TongSoNgayPhep: b.TongSoNgayPhep,
              });
              setBalanceModal(b);
            }}
          >
            Điều chỉnh
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Title level={3} style={{ margin: '4px 0' }}>
            Đăng ký, Duyệt & Theo dõi Nghỉ phép
          </Title>
          <Text type="secondary">
            Đăng ký nghỉ phép, phê duyệt đơn và theo dõi quỹ phép năm.
          </Text>
        </div>

        <Space className="no-print w-full sm:w-auto flex-wrap">
          <Dropdown
            menu={{
              items: [
                { key: 'xlsx', icon: <FileExcelOutlined />, label: 'Excel (.xlsx)' },
                { key: 'pdf', icon: <FilePdfOutlined />, label: 'PDF (in / lưu)' },
                { key: 'csv', label: 'CSV' },
              ],
              onClick: ({ key }) => handleExport(key as 'xlsx' | 'pdf' | 'csv'),
            }}
          >
            <Button icon={<DownloadOutlined />}>
              Xuất {tab === 'balances' ? 'quỹ phép' : 'danh sách đơn'}
            </Button>
          </Dropdown>
          {state.user.VaiTro !== 'director' && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreate}
            >
              Đăng ký nghỉ phép
            </Button>
          )}
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        message="Số ngày nghỉ tính theo ngày làm việc (không tính thứ Bảy, Chủ nhật và ngày lễ). Chỉ các đơn loại Phép năm đã được phê duyệt mới khấu trừ vào quỹ phép năm (mặc định 12 ngày/năm)."
      />

      <Card bordered={false} className="shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as 'requests' | 'calendar' | 'balances')}
            items={[
              {
                key: 'requests',
                label: `Đơn nghỉ phép (${state.leaves.length})`,
              },
              {
                key: 'calendar',
                label: (
                  <span>
                    <CalendarOutlined /> Lịch nghỉ
                  </span>
                ),
              },
              {
                key: 'balances',
                label: `Quỹ phép năm ${selectedYear}`,
              },
            ]}
          />

          <Space wrap className="w-full lg:w-auto">
            {tab === 'balances' && (
              <Select
                value={selectedYear}
                onChange={setSelectedYear}
                className="w-full xs:w-28"
                options={availableYears.map((y) => ({
                  value: y,
                  label: `Năm ${y}`,
                }))}
              />
            )}

            <Input
              prefix={<SearchOutlined className="text-slate-400" />}
              placeholder="Tìm nhân viên..."
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

            {tab === 'requests' && (
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                className="w-full xs:w-40 sm:w-44"
                options={[
                  { value: '', label: 'Tất cả trạng thái' },
                  ...['Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Đã hủy'].map(
                    (s) => ({ value: s, label: s })
                  ),
                ]}
              />
            )}
          </Space>
        </div>

        {tab === 'requests' ? (
          <Table
            rowKey="MaDon"
            columns={requestColumns}
            dataSource={filteredRequests}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            size="middle"
            scroll={{ x: 800 }}
          />
        ) : tab === 'calendar' ? (
          <LeaveCalendar
            state={state}
            search={search}
            deptFilter={deptFilter}
            onOpenLeave={setDetailLeave}
          />
        ) : (
          <Table
            rowKey={(r) => `${r.MaNV}-${r.Nam}`}
            columns={balanceColumns}
            dataSource={filteredBalances}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            size="middle"
            scroll={{ x: 750 }}
          />
        )}
      </Card>

      {/* Modal Đăng ký nghỉ phép */}
      <Modal
        open={createOpen}
        title="Đăng ký nghỉ phép"
        onCancel={() => setCreateOpen(false)}
        footer={null}
        width={560}
      >
        <Form
          form={leaveForm}
          layout="vertical"
          onFinish={handleSubmitLeave}
          className="mt-3"
        >
          {formError && (
            <Alert type="error" showIcon message={formError} className="mb-4" />
          )}

          {isSelfOnly ? (
            <Alert
              type="info"
              showIcon
              className="mb-4"
              message={`Người đăng ký: ${state.user.HoTen}`}
            />
          ) : (
            <Form.Item
              name="MaNV"
              label="Nhân viên"
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
          )}

          <Form.Item
            name="MaLoai"
            label="Loại nghỉ phép"
            rules={[{ required: true }]}
          >
            <Select
              options={state.leaveTypes.map((t) => ({
                value: t.MaLoai,
                label: `${t.TenLoai} (Tối đa ${t.SoNgayToiDa} ngày/đơn · ${
                  t.TruPhepNam ? 'Trừ phép năm' : 'Không trừ phép năm'
                })`,
              }))}
            />
          </Form.Item>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item
              name="TuNgay"
              label="Từ ngày"
              rules={[{ required: true, message: 'Chọn ngày bắt đầu' }]}
            >
              <Input type="date" min={['admin', 'hr'].includes(state.user.VaiTro) ? undefined : state.today} />
            </Form.Item>
            <Form.Item
              name="DenNgay"
              label="Đến ngày"
              rules={[{ required: true, message: 'Chọn ngày kết thúc' }]}
            >
              <Input type="date" min={['admin', 'hr'].includes(state.user.VaiTro) ? undefined : state.today} />
            </Form.Item>
          </div>

          <Form.Item
            name="LyDo"
            label="Lý do xin nghỉ"
            rules={[{ required: true, message: 'Nhập lý do xin nghỉ' }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>

          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreateOpen(false)}>Đóng</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Gửi đơn nghỉ phép
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal Chi tiết Đơn nghỉ phép */}
      <Modal
        open={!!detailLeave}
        title="Chi tiết đơn nghỉ phép"
        onCancel={() => setDetailLeave(null)}
        width={640}
        footer={
          detailLeave && (
            <Space wrap>
              <Button onClick={() => setDetailLeave(null)}>Đóng</Button>
              {canCancelLeave(detailLeave) && (
                  <Popconfirm
                    title="Hủy đơn nghỉ phép này?"
                    onConfirm={() => handleCancelLeave(detailLeave)}
                    okText="Hủy đơn"
                    cancelText="Không"
                  >
                    <Button>Hủy đơn</Button>
                  </Popconfirm>
                )}

              {canReviewLeave(detailLeave) && (
                <>
                  <Button
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => {
                      setFormError('');
                      reviewForm.resetFields();
                      setReviewModal({ leave: detailLeave, approve: false });
                    }}
                  >
                    Từ chối
                  </Button>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => {
                      setFormError('');
                      reviewForm.resetFields();
                      setReviewModal({ leave: detailLeave, approve: true });
                    }}
                  >
                    Duyệt đơn
                  </Button>
                </>
              )}
            </Space>
          )
        }
      >
        {detailLeave && (
          <Descriptions
            bordered
            size="small"
            column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
          >
            <Descriptions.Item label="Mã đơn">
              <Text code>{detailLeave.MaDon}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color={getAntTagColor(detailLeave.TrangThai)}>
                {detailLeave.TrangThai}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Nhân viên">
              <strong>
                {emp(detailLeave.MaNV)?.HoTen || 'Nhân viên'}
              </strong>
            </Descriptions.Item>
            <Descriptions.Item label="Loại nghỉ">
              {leaveTypeName(detailLeave.MaLoai)}
            </Descriptions.Item>
            <Descriptions.Item label="Thời gian">
              {formatDate(detailLeave.TuNgay)} –{' '}
              {formatDate(detailLeave.DenNgay)}
            </Descriptions.Item>
            <Descriptions.Item label="Số ngày">
              <strong>{detailLeave.SoNgay} ngày</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Ngày nộp">
              {formatDate(detailLeave.NgayNop)}
            </Descriptions.Item>
            <Descriptions.Item label="Người duyệt">
              {detailLeave.tennguoiduyet ||
                (detailLeave.MaNVDuyet
                  ? emp(detailLeave.MaNVDuyet)?.HoTen ||
                    detailLeave.MaNVDuyet
                  : 'Chưa xử lý')}
            </Descriptions.Item>
            <Descriptions.Item label="Lý do xin nghỉ" span={2}>
              {detailLeave.LyDo}
            </Descriptions.Item>
            {detailLeave.GhiChuDuyet && (
              <Descriptions.Item label="Ghi chú phê duyệt" span={2}>
                {detailLeave.GhiChuDuyet}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      {/* Modal Duyệt / Từ chối */}
      <Modal
        open={!!reviewModal}
        title={
          reviewModal?.approve
            ? 'Phê duyệt đơn nghỉ phép'
            : 'Từ chối đơn nghỉ phép'
        }
        onCancel={() => setReviewModal(null)}
        footer={null}
        width={520}
      >
        {reviewModal && (
          <Form form={reviewForm} layout="vertical" onFinish={handleReviewSubmit}>
            <Alert
              type="info"
              showIcon
              className="mb-4"
              message={`Nhân viên: ${
                emp(reviewModal.leave.MaNV)?.HoTen ||
                reviewModal.leave.MaNV
              } · ${reviewModal.leave.SoNgay} ngày`}
            />
            {reviewModal.approve && reviewOverlaps.length > 0 && (
              <Alert
                type="warning"
                showIcon
                className="mb-4"
                message={`Trùng lịch: ${reviewOverlaps.length} người cùng phòng cũng nghỉ trong khoảng này`}
                description={
                  <ul className="list-disc pl-4 m-0 text-xs">
                    {reviewOverlaps.slice(0, 5).map((l) => (
                      <li key={l.MaDon}>
                        {emp(l.MaNV)?.HoTen} · {formatDate(l.TuNgay)} – {formatDate(l.DenNgay)} ({l.TrangThai})
                      </li>
                    ))}
                  </ul>
                }
              />
            )}
            {formError && (
              <Alert
                type="error"
                showIcon
                message={formError}
                className="mb-4"
              />
            )}
            <Form.Item
              name="GhiChuDuyet"
              label={
                reviewModal.approve
                  ? 'Ghi chú duyệt (không bắt buộc)'
                  : 'Lý do từ chối *'
              }
              rules={[
                {
                  required: !reviewModal.approve,
                  message: 'Vui lòng nhập lý do từ chối',
                },
              ]}
            >
              <Input.TextArea rows={3} />
            </Form.Item>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setReviewModal(null)}>Quay lại</Button>
              <Button
                type="primary"
                danger={!reviewModal.approve}
                htmlType="submit"
                loading={submitting}
              >
                {reviewModal.approve ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
              </Button>
            </div>
          </Form>
        )}
      </Modal>

      {/* Modal Điều chỉnh Quỹ phép năm */}
      <Modal
        open={!!balanceModal}
        title="Điều chỉnh tổng quỹ phép năm"
        onCancel={() => setBalanceModal(null)}
        footer={null}
        width={520}
      >
        {balanceModal && (
          <Form form={balanceForm} layout="vertical" onFinish={handleSaveBalance}>
            <Alert
              type="info"
              showIcon
              className="mb-4"
              message={`Nhân viên: ${
                emp(balanceModal.MaNV)?.HoTen || 'Nhân viên'
              } · Đã nghỉ: ${balanceModal.SoNgayDaNghi} ngày. Tổng ngày phép mới không được nhỏ hơn số ngày đã sử dụng.`}
            />
            {formError && (
              <Alert
                type="error"
                showIcon
                message={formError}
                className="mb-4"
              />
            )}
            <div className="grid grid-cols-2 gap-4">
              <Form.Item
                name="Nam"
                label="Năm"
                rules={[{ required: true }]}
              >
                <InputNumber min={2000} max={2100} className="w-full" />
              </Form.Item>
              <Form.Item
                name="TongSoNgayPhep"
                label="Tổng ngày phép năm"
                rules={[{ required: true }]}
              >
                <InputNumber
                  min={balanceModal.SoNgayDaNghi}
                  max={366}
                  className="w-full"
                />
              </Form.Item>
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setBalanceModal(null)}>Đóng</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Lưu quỹ phép
              </Button>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  );
};
