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
  Alert,
  Typography,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  DownloadOutlined,
  SearchOutlined,
  EyeOutlined,
  CalendarOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { AppState, Contract } from '../types';
import { apiRequest } from '../api';
import {
  canEdit,
  downloadCsv,
  formatDate,
  formatMoney,
  getAntTagColor,
  getAvatarHex,
  getContractStatus,
  getInitials,
  matchEmployeeQuery,
} from '../utils/format';

const { Title, Text } = Typography;

interface ContractsViewProps {
  state: AppState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, isError?: boolean) => void;
}

export const ContractsView: React.FC<ContractsViewProps> = ({
  state,
  onRefresh,
  notify,
}) => {
  const [tab, setTab] = useState<'all' | 'expiring'>('all');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [contractType, setContractType] = useState<string>('Xác định thời hạn');
  const [detailContract, setDetailContract] = useState<Contract | null>(null);
  const [extendTarget, setExtendTarget] = useState<Contract | null>(null);
  const [terminateTarget, setTerminateTarget] = useState<Contract | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [createForm] = Form.useForm();
  const [extendForm] = Form.useForm();
  const [terminateForm] = Form.useForm();

  const emp = (id: string) => state.employees.find((e) => e.id === id);
  const activeEmployees = state.employees.filter(
    (e) => e.status !== 'Đã lưu trữ'
  );

  const filtered = state.contracts.filter((c) => {
    const cStatus = getContractStatus(c, state.today);
    const matchTab = tab !== 'expiring' || cStatus === 'Sắp hết hạn';
    const matchStatus = !statusFilter || cStatus === statusFilter;
    return (
      matchTab &&
      matchStatus &&
      matchEmployeeQuery(emp(c.employee_id), search, deptFilter)
    );
  });

  const handleOpenCreate = () => {
    setFormError('');
    setContractType('Xác định thời hạn');
    createForm.resetFields();
    createForm.setFieldsValue({
      employee_id: activeEmployees[0]?.id,
      type: 'Xác định thời hạn',
      start_date: state.today,
    });
    setCreateOpen(true);
  };

  const handleCreateContract = async (values: Record<string, any>) => {
    setFormError('');
    setSubmitting(true);
    const body = {
      ...values,
      salary: Number(values.salary),
      end_date:
        values.type === 'Không xác định thời hạn'
          ? null
          : values.end_date || null,
    };
    try {
      await apiRequest('/api/contracts', body, 'POST');
      setCreateOpen(false);
      notify('Đã lập hợp đồng lao động mới.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExtendContract = async (values: Record<string, any>) => {
    if (!extendTarget) return;
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest(
        `/api/contracts/${encodeURIComponent(extendTarget.id)}/extend`,
        values,
        'POST'
      );
      setExtendTarget(null);
      setDetailContract(null);
      notify('Đã gia hạn hợp đồng và lưu lịch sử gia hạn.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTerminateContract = async (values: Record<string, any>) => {
    if (!terminateTarget) return;
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest(
        `/api/contracts/${encodeURIComponent(terminateTarget.id)}/terminate`,
        values,
        'POST'
      );
      setTerminateTarget(null);
      setDetailContract(null);
      notify('Đã chấm dứt hợp đồng lao động.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    downloadCsv(
      `peopleops-contracts-${state.today}.csv`,
      [
        'Mã hợp đồng',
        'Nhân viên',
        'Loại hợp đồng',
        'Ngày bắt đầu',
        'Ngày kết thúc',
        'Mức lương',
        'Trạng thái',
      ],
      filtered.map((c) => [
        c.id,
        emp(c.employee_id)?.name || c.employee_id,
        c.type,
        c.start_date,
        c.end_date || 'Không xác định',
        c.salary ?? 'Hạn chế truy cập',
        getContractStatus(c, state.today),
      ])
    );
  };

  const columns = [
    {
      title: 'Mã HĐ',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: 'Nhân viên',
      key: 'employee',
      render: (_: unknown, c: Contract) => {
        const e = emp(c.employee_id);
        return (
          <Space>
            <Avatar style={{ backgroundColor: getAvatarHex(e?.id) }}>
              {getInitials(e?.name)}
            </Avatar>
            <div>
              <div className="font-semibold text-slate-900">
                {e?.name || c.employee_id}
              </div>
              <div className="text-xs text-slate-400">{c.employee_id}</div>
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Loại hợp đồng',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: 'Thời hạn',
      key: 'duration',
      render: (_: unknown, c: Contract) => (
        <div className="text-xs">
          <div>{formatDate(c.start_date)}</div>
          <Text type="secondary">đến {formatDate(c.end_date)}</Text>
        </div>
      ),
    },
    {
      title: 'Mức lương / tháng',
      dataIndex: 'salary',
      key: 'salary',
      render: (salary: number | null) => (
        <Text strong={salary != null} type={salary == null ? 'secondary' : undefined}>
          {formatMoney(salary)}
        </Text>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_: unknown, c: Contract) => {
        const st = getContractStatus(c, state.today);
        return <Tag color={getAntTagColor(st)}>{st}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, c: Contract) => (
        <Button
          size="small"
          type="link"
          icon={<EyeOutlined />}
          onClick={() => setDetailContract(c)}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Text className="text-xs font-bold uppercase tracking-wider text-[#12584b]">
            PHÂN HỆ 3.0 · BFD 3.1 – 3.4
          </Text>
          <Title level={3} style={{ margin: '4px 0' }}>
            Hợp đồng lao động
          </Title>
          <Text type="secondary">
            Lập hợp đồng (3.1), gia hạn có lịch sử (3.2), chấm dứt (3.3) và theo dõi hết hạn 30 ngày (3.4) (Kho D3).
          </Text>
        </div>

        <Space className="no-print">
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Xuất CSV
          </Button>
          {canEdit(state.user.role) && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreate}
            >
              Lập hợp đồng (3.1)
            </Button>
          )}
        </Space>
      </div>

      <Card bordered={false} className="shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as 'all' | 'expiring')}
            items={[
              {
                key: 'all',
                label: `Tất cả hợp đồng (${state.contracts.length})`,
              },
              {
                key: 'expiring',
                label: `Sắp hết hạn 30 ngày (${
                  state.contracts.filter(
                    (c) => getContractStatus(c, state.today) === 'Sắp hết hạn'
                  ).length
                })`,
              },
            ]}
          />

          <Space wrap>
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
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 170 }}
              options={[
                { value: '', label: 'Tất cả trạng thái' },
                ...[
                  'Hiệu lực',
                  'Sắp hết hạn',
                  'Hết hạn',
                  'Chưa hiệu lực',
                  'Đã chấm dứt',
                ].map((s) => ({ value: s, label: s })),
              ]}
            />
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

      {/* Modal Lập hợp đồng mới (3.1) */}
      <Modal
        open={createOpen}
        title="Lập hợp đồng lao động mới (3.1)"
        onCancel={() => setCreateOpen(false)}
        footer={null}
        width={640}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateContract}
          className="mt-3"
        >
          {formError && (
            <Alert type="error" showIcon message={formError} className="mb-4" />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item
              name="id"
              label="Mã hợp đồng"
              rules={[{ required: true, message: 'Nhập mã hợp đồng' }]}
            >
              <Input placeholder="VD: HD013" />
            </Form.Item>

            <Form.Item
              name="employee_id"
              label="Nhân viên"
              rules={[{ required: true, message: 'Chọn nhân viên' }]}
            >
              <Select
                options={activeEmployees.map((e) => ({
                  value: e.id,
                  label: `${e.id} - ${e.name}`,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="type"
              label="Loại hợp đồng"
              rules={[{ required: true }]}
            >
              <Select
                onChange={(val) => setContractType(val)}
                options={[
                  { value: 'Thử việc', label: 'Thử việc' },
                  { value: 'Xác định thời hạn', label: 'Xác định thời hạn' },
                  {
                    value: 'Không xác định thời hạn',
                    label: 'Không xác định thời hạn',
                  },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="salary"
              label="Mức lương tháng (VND)"
              rules={[{ required: true, message: 'Nhập mức lương' }]}
            >
              <InputNumber
                min={1}
                max={100000000000}
                className="w-full"
                placeholder="VD: 15000000"
              />
            </Form.Item>

            <Form.Item
              name="start_date"
              label="Ngày bắt đầu"
              rules={[{ required: true, message: 'Chọn ngày bắt đầu' }]}
            >
              <Input type="date" />
            </Form.Item>

            <Form.Item
              name="end_date"
              label="Ngày kết thúc"
              rules={[
                {
                  required: contractType !== 'Không xác định thời hạn',
                  message: 'Chọn ngày kết thúc',
                },
              ]}
            >
              <Input
                type="date"
                disabled={contractType === 'Không xác định thời hạn'}
              />
            </Form.Item>
          </div>

          <Alert
            type="info"
            showIcon
            className="mb-4"
            message="Hệ thống tự động kiểm tra ngày bắt đầu không trước ngày vào làm và không trùng thời gian với hợp đồng hiện hành."
          />

          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreateOpen(false)}>Đóng</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Lưu hợp đồng
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal Chi tiết Hợp đồng */}
      <Modal
        open={!!detailContract}
        title="Chi tiết hợp đồng lao động"
        onCancel={() => setDetailContract(null)}
        width={720}
        footer={
          detailContract && (
            <Space>
              <Button onClick={() => setDetailContract(null)}>Đóng</Button>
              {canEdit(state.user.role) &&
                detailContract.status !== 'Đã chấm dứt' && (
                  <>
                    <Button
                      danger
                      icon={<CloseCircleOutlined />}
                      onClick={() => {
                        setFormError('');
                        terminateForm.resetFields();
                        terminateForm.setFieldsValue({
                          terminated_date: state.today,
                        });
                        setTerminateTarget(detailContract);
                      }}
                    >
                      Chấm dứt HĐ (3.3)
                    </Button>
                    {detailContract.end_date && (
                      <Button
                        type="primary"
                        icon={<CalendarOutlined />}
                        onClick={() => {
                          setFormError('');
                          extendForm.resetFields();
                          setExtendTarget(detailContract);
                        }}
                      >
                        Gia hạn hợp đồng (3.2)
                      </Button>
                    )}
                  </>
                )}
            </Space>
          )
        }
      >
        {detailContract && (
          <div className="space-y-4">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Mã hợp đồng">
                <Text code>{detailContract.id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag
                  color={getAntTagColor(
                    getContractStatus(detailContract, state.today)
                  )}
                >
                  {getContractStatus(detailContract, state.today)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Nhân viên">
                <strong>
                  {emp(detailContract.employee_id)?.name ||
                    detailContract.employee_id}
                </strong>{' '}
                ({detailContract.employee_id})
              </Descriptions.Item>
              <Descriptions.Item label="Loại hợp đồng">
                {detailContract.type}
              </Descriptions.Item>
              <Descriptions.Item label="Mức lương / tháng">
                <strong>{formatMoney(detailContract.salary)}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Thời hạn">
                {formatDate(detailContract.start_date)} →{' '}
                {formatDate(detailContract.end_date)}
              </Descriptions.Item>
              {detailContract.terminated_date && (
                <>
                  <Descriptions.Item label="Ngày chấm dứt">
                    <Text type="danger">
                      {formatDate(detailContract.terminated_date)}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Lý do chấm dứt">
                    {detailContract.termination_reason}
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>

            <Divider orientation="left" plain>
              Lịch sử gia hạn hợp đồng (3.2 - Thực thể GIAHANHOPDONG)
            </Divider>
            <div className="space-y-2">
              {state.extensions
                .filter((ex) => ex.contract_id === detailContract.id)
                .map((ex) => (
                  <Card key={ex.id} size="small">
                    <div className="flex justify-between font-semibold">
                      <span>
                        Lần gia hạn thứ {ex.sequence} ({ex.id})
                      </span>
                      <span>Ngày lập: {formatDate(ex.created_date)}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Hạn cũ: {formatDate(ex.old_end_date)} → Hạn mới:{' '}
                      <strong className="text-emerald-700">
                        {formatDate(ex.new_end_date)}
                      </strong>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Lý do: {ex.reason}
                    </div>
                  </Card>
                ))}
              {state.extensions.filter(
                (ex) => ex.contract_id === detailContract.id
              ).length === 0 && (
                <Text type="secondary">Chưa có lần gia hạn nào.</Text>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Gia hạn Hợp đồng (3.2) */}
      <Modal
        open={!!extendTarget}
        title="Gia hạn hợp đồng lao động (3.2)"
        onCancel={() => setExtendTarget(null)}
        footer={null}
      >
        {extendTarget && (
          <Form
            form={extendForm}
            layout="vertical"
            onFinish={handleExtendContract}
          >
            <Alert
              type="info"
              showIcon
              className="mb-4"
              message={`Hợp đồng ${extendTarget.id} · Ngày kết thúc hiện tại: ${formatDate(
                extendTarget.end_date
              )}`}
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
              name="new_end_date"
              label="Ngày kết thúc mới"
              rules={[{ required: true, message: 'Chọn ngày kết thúc mới' }]}
            >
              <Input type="date" />
            </Form.Item>
            <Form.Item
              name="reason"
              label="Lý do gia hạn"
              rules={[{ required: true, message: 'Nhập lý do gia hạn' }]}
            >
              <Input.TextArea rows={3} />
            </Form.Item>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setExtendTarget(null)}>Hủy</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Xác nhận gia hạn
              </Button>
            </div>
          </Form>
        )}
      </Modal>

      {/* Modal Chấm dứt Hợp đồng (3.3) */}
      <Modal
        open={!!terminateTarget}
        title="Chấm dứt hợp đồng lao động (3.3)"
        onCancel={() => setTerminateTarget(null)}
        footer={null}
      >
        {terminateTarget && (
          <Form
            form={terminateForm}
            layout="vertical"
            onFinish={handleTerminateContract}
          >
            <Alert
              type="warning"
              showIcon
              className="mb-4"
              message={`Hợp đồng ${terminateTarget.id} · Toàn bộ lịch sử gia hạn được bảo lưu sau khi chấm dứt.`}
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
              name="terminated_date"
              label="Ngày chấm dứt"
              rules={[{ required: true, message: 'Chọn ngày chấm dứt' }]}
            >
              <Input type="date" max={state.today} />
            </Form.Item>
            <Form.Item
              name="reason"
              label="Lý do chấm dứt"
              rules={[{ required: true, message: 'Nhập lý do chấm dứt' }]}
            >
              <Input.TextArea rows={3} />
            </Form.Item>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setTerminateTarget(null)}>Hủy</Button>
              <Button
                danger
                type="primary"
                htmlType="submit"
                loading={submitting}
              >
                Chấm dứt hợp đồng
              </Button>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  );
};
