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
  DollarOutlined,
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
  const [convertTarget, setConvertTarget] = useState<Contract | null>(null);
  const [convertType, setConvertType] = useState<string>('Xác định thời hạn');
  const [salaryTarget, setSalaryTarget] = useState<Contract | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [createForm] = Form.useForm();
  const [extendForm] = Form.useForm();
  const [terminateForm] = Form.useForm();
  const [convertForm] = Form.useForm();
  const [salaryForm] = Form.useForm();

  const emp = (id: string) => state.employees.find((e) => e.id === id);
  const activeEmployees = state.employees.filter(
    (e) => ['Đang làm việc', 'Thử việc'].includes(e.status)
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
      notify('Đã lập hợp đồng lao động.');
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
      notify('Đã gia hạn hợp đồng và lưu phụ lục.');
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

  const handleConvertContract = async (values: Record<string, any>) => {
    if (!convertTarget) return;
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest(
        `/api/contracts/${encodeURIComponent(convertTarget.id)}/convert`,
        { ...values, end_date: values.type === 'Không xác định thời hạn' ? null : values.end_date },
        'POST'
      );
      setConvertTarget(null);
      setDetailContract(null);
      notify('Đã ký hợp đồng chính thức; hợp đồng thử việc được kết thúc trước ngày hiệu lực.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidContract = async (c: Contract) => {
    const reason = window.prompt('Lý do hủy bỏ hợp đồng (hợp đồng nhập sai, vẫn được giữ lại để truy vết):');
    if (!reason || !reason.trim()) return;
    try {
      await apiRequest(`/api/contracts/${encodeURIComponent(c.id)}/void`, { reason: reason.trim() }, 'POST');
      setDetailContract(null);
      notify('Đã hủy bỏ hợp đồng.');
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleSalaryChange = async (values: Record<string, any>) => {
    if (!salaryTarget) return;
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest(`/api/contracts/${encodeURIComponent(salaryTarget.id)}/salary`, values, 'POST');
      setSalaryTarget(null);
      setDetailContract(null);
      notify('Đã cập nhật mức lương và lưu phụ lục hợp đồng.');
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
        'Nhân viên',
        'Loại hợp đồng',
        'Ngày bắt đầu',
        'Ngày kết thúc',
        'Mức lương',
        'Trạng thái',
      ],
      filtered.map((c) => [
        emp(c.employee_id)?.name || 'Nhân viên',
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
                {e?.name || 'Nhân viên'}
              </div>
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
          <Title level={3} style={{ margin: '4px 0' }}>
            Hợp đồng lao động
          </Title>
          <Text type="secondary">
            Lập hợp đồng, gia hạn có lịch sử, chấm dứt và theo dõi hết hạn 30 ngày.
          </Text>
        </div>

        <Space className="no-print w-full sm:w-auto flex-wrap">
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Xuất CSV
          </Button>
          {canEdit(state.user.role) && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreate}
            >
              Lập hợp đồng
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

          <Space wrap className="w-full lg:w-auto">
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
                  value: d.id,
                  label: d.name,
                })),
              ]}
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              className="w-full xs:w-40 sm:w-44"
              options={[
                { value: '', label: 'Tất cả trạng thái' },
                ...[
                  'Hiệu lực',
                  'Sắp hết hạn',
                  'Hết hạn',
                  'Chưa hiệu lực',
                  'Đã chấm dứt',
                  'Đã hủy bỏ',
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
          scroll={{ x: 850 }}
        />
      </Card>

      {/* Modal Lập hợp đồng mới */}
      <Modal
        open={createOpen}
        title="Lập hợp đồng lao động mới"
        onCancel={() => setCreateOpen(false)}
        footer={null}
        width={640}
      >
        <Form
          name="createContract"
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
              name="employee_id"
              label="Nhân viên"
              rules={[{ required: true, message: 'Chọn nhân viên' }]}
            >
              <Select
                options={activeEmployees.map((e) => ({
                  value: e.id,
                  label: `${e.name} (${e.email})`,
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
            <Space wrap>
              <Button onClick={() => setDetailContract(null)}>Đóng</Button>
              {canEdit(state.user.role) &&
                detailContract.status !== 'Đã chấm dứt' &&
                detailContract.status !== 'Đã hủy bỏ' && (
                  <>
                    {detailContract.type === 'Thử việc' && (
                      <Button
                        onClick={() => {
                          setFormError('');
                          setConvertType('Xác định thời hạn');
                          convertForm.resetFields();
                          convertForm.setFieldsValue({
                            type: 'Xác định thời hạn',
                            start_date: state.today,
                            salary: detailContract.salary,
                          });
                          setConvertTarget(detailContract);
                        }}
                      >
                        Ký chính thức
                      </Button>
                    )}
                    <Button danger type="dashed" onClick={() => handleVoidContract(detailContract)}>
                      Hủy bỏ HĐ
                    </Button>
                    <Button icon={<DollarOutlined />} onClick={() => {
                      setFormError('');
                      salaryForm.resetFields();
                      salaryForm.setFieldsValue({ salary: detailContract.salary });
                      setSalaryTarget(detailContract);
                    }}>
                      Điều chỉnh lương
                    </Button>
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
                      Chấm dứt HĐ
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
                        Gia hạn hợp đồng
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
            <Descriptions
              bordered
              size="small"
              column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
            >
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
                    'Nhân viên'}
                </strong>{' '}
              </Descriptions.Item>
              <Descriptions.Item label="Loại hợp đồng">
                {detailContract.type}
              </Descriptions.Item>
              <Descriptions.Item label="Mức lương / tháng">
                <strong>{formatMoney(detailContract.salary)}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Thời hạn gốc ban đầu">
                {formatDate(detailContract.start_date)} →{' '}
                {formatDate(detailContract.original_end_date || detailContract.end_date)}
              </Descriptions.Item>
              <Descriptions.Item label="Thời hạn hiện tại">
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
                  <Descriptions.Item label="Hình thức & Lý do">
                    <div>
                      <Tag color="error" className="mr-1">{detailContract.termination_type || 'Thỏa thuận'}</Tag>
                      {detailContract.termination_reason}
                    </div>
                  </Descriptions.Item>
                  {detailContract.termination_decision_id && (
                    <Descriptions.Item label="Căn cứ Quyết định">
                      <Tag color="purple">
                        {state.decisions.find((d) => d.id === detailContract.termination_decision_id)?.number || detailContract.termination_decision_id}
                      </Tag>
                    </Descriptions.Item>
                  )}
                </>
              )}
            </Descriptions>

            <Divider orientation="left" plain>
              Phụ lục hợp đồng — Gia hạn và điều chỉnh lương
            </Divider>
            <div className="space-y-2">
              {state.extensions
                .filter((ex) => ex.contract_id === detailContract.id)
                .map((ex) => (
                  <Card key={ex.id} size="small">
                    <div className="flex justify-between font-semibold">
                      <span>
                        Phụ lục {ex.sequence} · {ex.amendment_type}
                      </span>
                      <span>Ngày lập: {formatDate(ex.created_date)}</span>
                    </div>
                    {(ex.new_salary !== null || ex.amendment_type.includes('lương')) && (
                      <div className="text-xs text-slate-600 mt-1">
                        Lương cũ: {formatMoney(ex.old_salary)} → Lương mới: <strong>{formatMoney(ex.new_salary)}</strong>
                      </div>
                    )}
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
                <Text type="secondary">Chưa có phụ lục hợp đồng.</Text>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Gia hạn Hợp đồng */}
      <Modal
        open={!!extendTarget}
        title="Gia hạn hợp đồng lao động"
        onCancel={() => setExtendTarget(null)}
        footer={null}
      >
        {extendTarget && (
          <Form
            name="extendContract"
            form={extendForm}
            layout="vertical"
            onFinish={handleExtendContract}
          >
            <Alert
              type="info"
              showIcon
              className="mb-4"
              message={`Ngày kết thúc hiện tại: ${formatDate(
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
            <Form.Item name="salary" label="Mức lương mới / tháng (VND, nếu thay đổi)"
              extra={`Lương hiện tại: ${formatMoney(extendTarget.salary)}. Để trống để giữ nguyên.`}>
              <InputNumber min={1} max={100000000000} className="w-full" />
            </Form.Item>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Form.Item
                name="decision_number"
                label="Số quyết định/phụ lục (tùy chọn)"
                extra="Nếu có quyết định gia hạn"
              >
                <Input placeholder="VD: PL01/2026/QD-GH" />
              </Form.Item>
              <Form.Item
                name="signer"
                label="Người ký phụ lục"
                initialValue="Trần Hải Đăng"
              >
                <Input placeholder="Người ký" />
              </Form.Item>
            </div>
            <Alert type="info" showIcon className="mb-4" message="Gia hạn và thay đổi lương được ghi chung vào một phụ lục hợp đồng." />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setExtendTarget(null)}>Hủy</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Xác nhận gia hạn
              </Button>
            </div>
          </Form>
        )}
      </Modal>

      <Modal open={!!salaryTarget} title="Điều chỉnh lương — Lập phụ lục hợp đồng" footer={null}
        onCancel={() => setSalaryTarget(null)}>
        {salaryTarget && <Form name="salaryContract" form={salaryForm} layout="vertical" onFinish={handleSalaryChange}>
          <Alert type="info" showIcon className="mb-4" message={`Lương hiện tại: ${formatMoney(salaryTarget.salary)}`}
            description="Mặc định áp dụng ngay. Chọn ngày hiệu lực trong tương lai để hẹn áp dụng, hoặc ngày trong quá khứ để ghi bù. Phụ lục lưu lương cũ, lương mới và lý do." />
          {formError && <Alert type="error" showIcon message={formError} className="mb-4" />}
          <Form.Item name="salary" label="Mức lương mới / tháng (VND)" rules={[{ required: true, message: 'Nhập mức lương mới' }]}>
            <InputNumber min={1} max={100000000000} className="w-full" />
          </Form.Item>
          <Form.Item name="effective_date" label="Ngày hiệu lực (tùy chọn)">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="reason" label="Lý do điều chỉnh lương" rules={[{ required: true, message: 'Nhập lý do điều chỉnh' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setSalaryTarget(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>Lưu phụ lục và cập nhật lương</Button>
          </div>
        </Form>}
      </Modal>

      {/* Modal Ký hợp đồng chính thức (từ thử việc) */}
      <Modal
        open={!!convertTarget}
        title="Ký hợp đồng chính thức"
        footer={null}
        onCancel={() => setConvertTarget(null)}
      >
        {convertTarget && (
          <Form name="convertContract" form={convertForm} layout="vertical" onFinish={handleConvertContract}>
            <Alert
              type="info"
              showIcon
              className="mb-4"
              message="Hợp đồng thử việc tự kết thúc vào ngày trước khi hợp đồng chính thức bắt đầu."
            />
            {formError && <Alert type="error" showIcon message={formError} className="mb-4" />}
            <Form.Item name="type" label="Loại hợp đồng" rules={[{ required: true }]}>
              <Select
                onChange={(v) => setConvertType(v)}
                options={[
                  { value: 'Xác định thời hạn', label: 'Xác định thời hạn' },
                  { value: 'Không xác định thời hạn', label: 'Không xác định thời hạn' },
                ]}
              />
            </Form.Item>
            <Form.Item name="start_date" label="Ngày bắt đầu" rules={[{ required: true, message: 'Chọn ngày bắt đầu' }]}>
              <Input type="date" />
            </Form.Item>
            {convertType === 'Xác định thời hạn' && (
              <Form.Item name="end_date" label="Ngày kết thúc" rules={[{ required: true, message: 'Chọn ngày kết thúc' }]}>
                <Input type="date" />
              </Form.Item>
            )}
            <Form.Item name="salary" label="Mức lương / tháng (VND)" rules={[{ required: true, message: 'Nhập mức lương' }]}>
              <InputNumber min={1} max={100000000000} className="w-full" />
            </Form.Item>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setConvertTarget(null)}>Hủy</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>Ký hợp đồng chính thức</Button>
            </div>
          </Form>
        )}
      </Modal>

      {/* Modal Chấm dứt Hợp đồng */}
      <Modal
        open={!!terminateTarget}
        title="Chấm dứt hợp đồng lao động"
        onCancel={() => setTerminateTarget(null)}
        footer={null}
      >
        {terminateTarget && (
          <Form
            name="terminateContract"
            form={terminateForm}
            layout="vertical"
            onFinish={handleTerminateContract}
          >
            <Alert
              type="warning"
              showIcon
              className="mb-4"
              message={`Nhân viên chuyển sang Đã nghỉ việc nếu không còn hợp đồng đang hiệu lực. Toàn bộ phụ lục được bảo lưu.`}
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
              <Input type="date" />
            </Form.Item>
            <Form.Item
              name="termination_type"
              label="Hình thức chấm dứt"
              initialValue="Thỏa thuận chấm dứt"
            >
              <Select
                options={[
                  'Hết hạn hợp đồng',
                  'Người lao động xin nghỉ',
                  'Doanh nghiệp chấm dứt',
                  'Thỏa thuận chấm dứt',
                ].map((v) => ({ value: v, label: v }))}
              />
            </Form.Item>
            <Form.Item
              name="reason"
              label="Lý do chấm dứt"
              rules={[{ required: true, message: 'Nhập lý do chấm dứt' }]}
            >
              <Input.TextArea rows={3} />
            </Form.Item>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Form.Item
                name="decision_number"
                label="Số quyết định chấm dứt (tùy chọn)"
                extra="Nếu có quyết định do Ban Giám đốc ký"
              >
                <Input placeholder="VD: 06/2026/QD-CD" />
              </Form.Item>
              <Form.Item
                name="signer"
                label="Người ký quyết định"
                initialValue="Trần Hải Đăng"
              >
                <Input placeholder="Người ký" />
              </Form.Item>
            </div>
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
