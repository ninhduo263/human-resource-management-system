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
} from 'antd';
import {
  PlusOutlined,
  DownloadOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { AppState, LeaveBalance, LeaveRequest } from '../types';
import { apiRequest } from '../api';
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
  const [tab, setTab] = useState<'requests' | 'balances'>('requests');
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

  const emp = (id: string) => state.employees.find((e) => e.id === id);
  const deptName = (id: string | null) =>
    state.departments.find((d) => d.id === id)?.name || id || 'Không thuộc phòng ban';
  const leaveTypeName = (id: string) =>
    state.leaveTypes.find((t) => t.id === id)?.name || id;

  const canReviewLeave = (l: LeaveRequest) =>
    ['admin', 'manager'].includes(state.user.role) &&
    l.employee_id !== state.user.employee_id &&
    l.status === 'Chờ duyệt';

  const filteredRequests = state.leaves.filter(
    (l) =>
      (!statusFilter || l.status === statusFilter) &&
      matchEmployeeQuery(emp(l.employee_id), search, deptFilter)
  );

  const availableYears = Array.from(
    new Set([currentYear, ...state.balances.map((b) => b.year)])
  ).sort((a, b) => b - a);

  const filteredBalances = state.balances.filter((b) => {
    const e = emp(b.employee_id);
    return (
      b.year === selectedYear &&
      e &&
      ['Đang làm việc', 'Thử việc'].includes(e.status) &&
      matchEmployeeQuery(e, search, deptFilter)
    );
  });

  const isSelfOnly = ['employee', 'manager'].includes(state.user.role);

  const handleOpenCreate = () => {
    setFormError('');
    leaveForm.resetFields();
    leaveForm.setFieldsValue({
      employee_id: state.user.employee_id,
      type_id: state.leaveTypes[0]?.id,
      start_date: state.today,
      end_date: state.today,
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
          employee_id: isSelfOnly ? state.user.employee_id : values.employee_id,
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
        `/api/leaves/${encodeURIComponent(l.id)}/cancel`,
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
        `/api/leaves/${encodeURIComponent(reviewModal.leave.id)}/review`,
        {
          status: reviewModal.approve ? 'Đã duyệt' : 'Từ chối',
          review_note: values.review_note || '',
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
          employee_id: balanceModal.employee_id,
          year: Number(values.year),
          total: Number(values.total),
        },
        'POST'
      );
      setSelectedYear(Number(values.year));
      setBalanceModal(null);
      notify('Đã cập nhật tổng quỹ phép năm.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    if (tab === 'balances') {
      downloadCsv(
        `peopleops-leave-balances-${selectedYear}.csv`,
        [
          'Nhân viên',
          'Phòng ban',
          'Năm',
          'Tổng phép',
          'Đã nghỉ',
          'Còn lại',
        ],
        filteredBalances.map((b) => {
          const e = emp(b.employee_id);
          return [
            e?.name || 'Nhân viên',
            e ? deptName(e.department_id) : '',
            b.year,
            b.total,
            b.used,
            b.remaining,
          ];
        })
      );
    } else {
      downloadCsv(
        `peopleops-leave-requests-${state.today}.csv`,
        [
          'Mã đơn',
          'Nhân viên',
          'Loại nghỉ',
          'Từ ngày',
          'Đến ngày',
          'Số ngày',
          'Trạng thái',
          'Người duyệt',
        ],
        filteredRequests.map((l) => [
          l.id,
          emp(l.employee_id)?.name || 'Nhân viên',
          leaveTypeName(l.type_id),
          l.start_date,
          l.end_date,
          l.days,
          l.status,
          l.approver_name || l.approver_id || '—',
        ])
      );
    }
  };

  const requestColumns = [
    {
      title: 'Nhân viên',
      key: 'employee',
      render: (_: unknown, l: LeaveRequest) => {
        const e = emp(l.employee_id);
        return (
          <Space>
            <Avatar style={{ backgroundColor: getAvatarHex(e?.id) }}>
              {getInitials(e?.name)}
            </Avatar>
            <div>
              <div className="font-semibold text-slate-900">
                {e?.name || 'Nhân viên'}
              </div>
              <div className="text-xs text-slate-400">{l.id}</div>
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Loại nghỉ',
      dataIndex: 'type_id',
      key: 'type_id',
      render: (id: string) => leaveTypeName(id),
    },
    {
      title: 'Thời gian nghỉ',
      key: 'dates',
      render: (_: unknown, l: LeaveRequest) =>
        `${formatDate(l.start_date)} – ${formatDate(l.end_date)}`,
    },
    {
      title: 'Số ngày',
      dataIndex: 'days',
      key: 'days',
      render: (days: number) => <strong>{days} ngày</strong>,
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
      title: 'Người duyệt',
      key: 'approver',
      render: (_: unknown, l: LeaveRequest) =>
        l.approver_name ||
        (l.approver_id ? emp(l.approver_id)?.name || l.approver_id : '—'),
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
        const e = emp(b.employee_id)!;
        return (
          <Space>
            <Avatar style={{ backgroundColor: getAvatarHex(e.id) }}>
              {getInitials(e.name)}
            </Avatar>
            <div>
              <div className="font-semibold text-slate-900">{e.name}</div>
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Phòng ban',
      key: 'dept',
      render: (_: unknown, b: LeaveBalance) => {
        const e = emp(b.employee_id);
        return e ? deptName(e.department_id) : '—';
      },
    },
    {
      title: 'Năm',
      dataIndex: 'year',
      key: 'year',
      render: (y: number) => <Text code>{y}</Text>,
    },
    {
      title: 'Tổng ngày phép',
      dataIndex: 'total',
      key: 'total',
      render: (t: number) => `${t} ngày`,
    },
    {
      title: 'Số ngày đã nghỉ',
      dataIndex: 'used',
      key: 'used',
      render: (u: number) => <Tag color="warning">{u} ngày</Tag>,
    },
    {
      title: 'Số ngày còn lại',
      dataIndex: 'remaining',
      key: 'remaining',
      render: (r: number) => <Tag color="success">{r} ngày</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, b: LeaveBalance) =>
        canEdit(state.user.role) ? (
          <Button
            size="small"
            type="link"
            icon={<EditOutlined />}
            onClick={() => {
              setFormError('');
              balanceForm.setFieldsValue({
                year: b.year,
                total: b.total,
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

        <Space className="no-print">
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Xuất CSV
          </Button>
          {state.user.role !== 'director' && (
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
        message="Số ngày nghỉ tính theo ngày lịch (gồm ngày bắt đầu và kết thúc). Chỉ các đơn loại Phép năm đã được phê duyệt mới khấu trừ vào quỹ phép năm (mặc định 12 ngày/năm)."
      />

      <Card bordered={false} className="shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as 'requests' | 'balances')}
            items={[
              {
                key: 'requests',
                label: `Đơn nghỉ phép (${state.leaves.length})`,
              },
              {
                key: 'balances',
                label: `Quỹ phép năm ${selectedYear}`,
              },
            ]}
          />

          <Space wrap>
            {tab === 'balances' && (
              <Select
                value={selectedYear}
                onChange={setSelectedYear}
                style={{ width: 120 }}
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
              style={{ width: 200 }}
            />

            <Select
              value={deptFilter}
              onChange={setDeptFilter}
              style={{ width: 170 }}
              options={[
                { value: '', label: 'Tất cả phòng ban' },
                ...state.departments.map((d) => ({
                  value: d.id,
                  label: d.name,
                })),
              ]}
            />

            {tab === 'requests' && (
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 160 }}
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
            rowKey="id"
            columns={requestColumns}
            dataSource={filteredRequests}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            size="middle"
          />
        ) : (
          <Table
            rowKey={(r) => `${r.employee_id}-${r.year}`}
            columns={balanceColumns}
            dataSource={filteredBalances}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            size="middle"
          />
        )}
      </Card>

      {/* Modal Đăng ký nghỉ phép */}
      <Modal
        open={createOpen}
        title="Đăng ký nghỉ phép"
        onCancel={() => setCreateOpen(false)}
        footer={null}
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
              message={`Người đăng ký: ${state.user.name}`}
            />
          ) : (
            <Form.Item
              name="employee_id"
              label="Nhân viên"
              rules={[{ required: true }]}
            >
              <Select
                options={state.employees
                  .filter((e) => ['Đang làm việc', 'Thử việc'].includes(e.status))
                  .map((e) => ({
                    value: e.id,
                    label: `${e.name} (${e.email})`,
                  }))}
              />
            </Form.Item>
          )}

          <Form.Item
            name="type_id"
            label="Loại nghỉ phép"
            rules={[{ required: true }]}
          >
            <Select
              options={state.leaveTypes.map((t) => ({
                value: t.id,
                label: `${t.name} (Tối đa ${t.max_days} ngày/đơn · ${
                  t.deduct_annual ? 'Trừ phép năm' : 'Không trừ phép năm'
                })`,
              }))}
            />
          </Form.Item>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item
              name="start_date"
              label="Từ ngày"
              rules={[{ required: true, message: 'Chọn ngày bắt đầu' }]}
            >
              <Input type="date" min={state.today} />
            </Form.Item>
            <Form.Item
              name="end_date"
              label="Đến ngày"
              rules={[{ required: true, message: 'Chọn ngày kết thúc' }]}
            >
              <Input type="date" min={state.today} />
            </Form.Item>
          </div>

          <Form.Item
            name="reason"
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
        footer={
          detailLeave && (
            <Space>
              <Button onClick={() => setDetailLeave(null)}>Đóng</Button>
              {detailLeave.status === 'Chờ duyệt' &&
                (detailLeave.employee_id === state.user.employee_id ||
                  canEdit(state.user.role)) && (
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
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="Mã đơn">
              <Text code>{detailLeave.id}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color={getAntTagColor(detailLeave.status)}>
                {detailLeave.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Nhân viên">
              <strong>
                {emp(detailLeave.employee_id)?.name || 'Nhân viên'}
              </strong>
            </Descriptions.Item>
            <Descriptions.Item label="Loại nghỉ">
              {leaveTypeName(detailLeave.type_id)}
            </Descriptions.Item>
            <Descriptions.Item label="Thời gian">
              {formatDate(detailLeave.start_date)} –{' '}
              {formatDate(detailLeave.end_date)}
            </Descriptions.Item>
            <Descriptions.Item label="Số ngày">
              <strong>{detailLeave.days} ngày</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Ngày nộp">
              {formatDate(detailLeave.submitted_date)}
            </Descriptions.Item>
            <Descriptions.Item label="Người duyệt">
              {detailLeave.approver_name ||
                (detailLeave.approver_id
                  ? emp(detailLeave.approver_id)?.name ||
                    detailLeave.approver_id
                  : 'Chưa xử lý')}
            </Descriptions.Item>
            <Descriptions.Item label="Lý do xin nghỉ" span={2}>
              {detailLeave.reason}
            </Descriptions.Item>
            {detailLeave.review_note && (
              <Descriptions.Item label="Ghi chú phê duyệt" span={2}>
                {detailLeave.review_note}
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
      >
        {reviewModal && (
          <Form form={reviewForm} layout="vertical" onFinish={handleReviewSubmit}>
            <Alert
              type="info"
              showIcon
              className="mb-4"
              message={`Nhân viên: ${
                emp(reviewModal.leave.employee_id)?.name ||
                reviewModal.leave.employee_id
              } · ${reviewModal.leave.days} ngày`}
            />
            {formError && (
              <Alert
                type="error"
                showIcon
                message={formError}
                className="mb-4"
              />
            )}
            <Form.Item
              name="review_note"
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
      >
        {balanceModal && (
          <Form form={balanceForm} layout="vertical" onFinish={handleSaveBalance}>
            <Alert
              type="info"
              showIcon
              className="mb-4"
              message={`Nhân viên: ${
                emp(balanceModal.employee_id)?.name || 'Nhân viên'
              } · Đã nghỉ: ${balanceModal.used} ngày. Tổng ngày phép mới không được nhỏ hơn số ngày đã sử dụng.`}
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
                name="year"
                label="Năm"
                rules={[{ required: true }]}
              >
                <InputNumber min={2000} max={2100} className="w-full" />
              </Form.Item>
              <Form.Item
                name="total"
                label="Tổng ngày phép năm"
                rules={[{ required: true }]}
              >
                <InputNumber
                  min={balanceModal.used}
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
