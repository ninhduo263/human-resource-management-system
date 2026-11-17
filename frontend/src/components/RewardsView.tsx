import React, { useState } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Tag,
  Button,
  Input,
  Select,
  Modal,
  Form,
  InputNumber,
  Space,
  Avatar,
  Descriptions,
  Alert,
  Typography,
  Popconfirm,
  Statistic,
  Radio,
} from 'antd';
import {
  TrophyOutlined,
  AlertOutlined,
  PlusOutlined,
  DownloadOutlined,
  SearchOutlined,
  DeleteOutlined,
  EyeOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { AppState, RewardDiscipline } from '../types';
import { apiRequest } from '../api';
import {
  canEdit,
  downloadCsv,
  formatDate,
  formatMoney,
  getAntTagColor,
  getAvatarHex,
  getInitials,
} from '../utils/format';

const { Title, Text, Paragraph } = Typography;

interface RewardsViewProps {
  state: AppState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, isError?: boolean) => void;
}

const CATEGORY_SUGGESTIONS: Record<'Khen thưởng' | 'Kỷ luật', string[]> = {
  'Khen thưởng': [
    'Thưởng tiền mặt',
    'Bằng khen hoàn thành xuất sắc nhiệm vụ',
    'Giấy khen lao động tiên tiến',
    'Tuyên dương toàn công ty',
    'Nâng bậc lương trước hạn',
  ],
  'Kỷ luật': [
    'Khiển trách',
    'Cảnh cáo',
    'Kéo dài thời hạn nâng lương',
    'Cách chức / Miễn nhiệm',
    'Sa thải',
  ],
};

export const RewardsView: React.FC<RewardsViewProps> = ({
  state,
  onRefresh,
  notify,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<RewardDiscipline | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedType, setSelectedType] = useState<'Khen thưởng' | 'Kỷ luật'>('Khen thưởng');

  const [form] = Form.useForm();

  const rewards = state.rewards || [];

  const emp = (id: string) => state.employees.find((e) => e.id === id);
  const dept = (id: string | null | undefined) =>
    state.departments.find((d) => d.id === id)?.name || 'Không thuộc phòng ban';
  const pos = (id: string | undefined) =>
    state.positions.find((p) => p.id === id)?.name || 'Chuyên viên';

  const filtered = rewards.filter((r) => {
    const e = emp(r.employee_id);
    const matchesSearch =
      !search ||
      r.id.toLowerCase().includes(search.toLowerCase()) ||
      r.reason.toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase()) ||
      (e && e.name.toLowerCase().includes(search.toLowerCase()));

    const matchesType = typeFilter === 'all' || r.type === typeFilter;
    const matchesDept =
      deptFilter === 'all' || (e && e.department_id === deptFilter);

    return matchesSearch && matchesType && matchesDept;
  });

  const totalRewards = rewards.filter((r) => r.type === 'Khen thưởng').length;
  const totalDisciplines = rewards.filter((r) => r.type === 'Kỷ luật').length;
  const totalBonusAmount = rewards
    .filter((r) => r.type === 'Khen thưởng')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const handleCreate = async (values: Record<string, any>) => {
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest('/api/rewards', values, 'POST');
      notify(`Đã ghi nhận ${values.type.toLowerCase()} thành công.`);
      setCreateOpen(false);
      form.resetFields();
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/api/rewards/${encodeURIComponent(id)}`, {}, 'DELETE');
      notify('Đã hủy bản ghi khen thưởng / kỷ luật.');
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleExport = () => {
    downloadCsv(
      `peopleops-khen-thuong-ky-luat-${state.today}.csv`,
      [
        'Mã bản ghi',
        'Nhân viên',
        'Phòng ban',
        'Loại hình',
        'Hình thức',
        'Số tiền (VND)',
        'Ngày hiệu lực',
        'Số quyết định',
        'Lý do',
      ],
      filtered.map((r) => {
        const e = emp(r.employee_id);
        const dec = state.decisions.find((d) => d.id === r.decision_id);
        return [
          r.id,
          e?.name || r.employee_id,
          e ? dept(e.department_id) : '',
          r.type,
          r.category,
          r.amount || 0,
          r.effective_date,
          dec?.number || r.decision_number || '',
          r.reason,
        ];
      })
    );
  };

  const activeEmployees = state.employees.filter((e) =>
    ['Đang làm việc', 'Thử việc'].includes(e.status)
  );

  const columns = [
    {
      title: 'Mã',
      dataIndex: 'id',
      key: 'id',
      width: 90,
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: 'Nhân viên',
      key: 'employee',
      render: (_: unknown, r: RewardDiscipline) => {
        const e = emp(r.employee_id);
        return (
          <Space direction="horizontal" size="middle">
            <Avatar style={{ backgroundColor: getAvatarHex(r.employee_id) }}>
              {getInitials(e?.name)}
            </Avatar>
            <div>
              <div className="font-semibold text-slate-800">
                {e?.name || r.employee_name || r.employee_id}
              </div>
              <div className="text-xs text-slate-400">
                {dept(e?.department_id)} · {pos(e?.position_id)}
              </div>
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Loại hình',
      dataIndex: 'type',
      key: 'type',
      width: 130,
      render: (t: string) => (
        <Tag color={t === 'Khen thưởng' ? 'gold' : 'magenta'} icon={t === 'Khen thưởng' ? <TrophyOutlined /> : <AlertOutlined />}>
          {t}
        </Tag>
      ),
    },
    {
      title: 'Hình thức & Số tiền',
      key: 'category',
      render: (_: unknown, r: RewardDiscipline) => (
        <div>
          <div className="font-medium text-slate-800">{r.category}</div>
          {Number(r.amount) > 0 && (
            <div className="text-xs text-emerald-700 font-semibold">
              + {formatMoney(r.amount)}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Ngày hiệu lực',
      dataIndex: 'effective_date',
      key: 'effective_date',
      width: 120,
      render: (d: string) => formatDate(d),
    },
    {
      title: 'Căn cứ Quyết định',
      key: 'decision',
      render: (_: unknown, r: RewardDiscipline) => {
        const dec = state.decisions.find((d) => d.id === r.decision_id);
        return (
          <div>
            <Tag color="purple">{dec?.number || r.decision_number || 'Theo quyết định'}</Tag>
            <div className="text-xs text-slate-400 mt-0.5">
              Ký bởi: {dec?.signer || r.signer || 'Ban Giám đốc'}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right' as const,
      width: 140,
      render: (_: unknown, r: RewardDiscipline) => (
        <Space>
          <Button
            size="small"
            type="link"
            icon={<EyeOutlined />}
            onClick={() => setDetailItem(r)}
          >
            Chi tiết
          </Button>
          {canEdit(state.user.role) && (
            <Popconfirm
              title="Hủy bản ghi này?"
              description="Bản ghi sẽ bị xóa khỏi hồ sơ thi đua kỷ luật của nhân viên."
              onConfirm={() => handleDelete(r.id)}
              okText="Xóa"
              cancelText="Hủy"
            >
              <Button size="small" type="link" danger icon={<DeleteOutlined />}>
                Xóa
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Title level={3} style={{ margin: '4px 0' }}>
            Khen thưởng & Kỷ luật
          </Title>
          <Text type="secondary">
            Ghi nhận và tra cứu quyết định thi đua, khen thưởng và kỷ luật nhân viên (BFD 3.4).
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
              onClick={() => {
                setFormError('');
                setSelectedType('Khen thưởng');
                form.resetFields();
                form.setFieldsValue({
                  type: 'Khen thưởng',
                  effective_date: state.today,
                  signed_date: state.today,
                  signer: 'Trần Hải Đăng',
                  amount: 0,
                  employee_id: activeEmployees[0]?.id,
                });
                setCreateOpen(true);
              }}
            >
              Thêm Khen thưởng / Kỷ luật
            </Button>
          )}
        </Space>
      </div>

      {/* Thống kê nhanh */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-xs bg-amber-50/40 border border-amber-100">
            <Statistic
              title={<span className="text-amber-900 font-medium">Quyết định Khen thưởng</span>}
              value={totalRewards}
              prefix={<TrophyOutlined className="text-amber-500" />}
              suffix="lượt"
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-xs bg-rose-50/40 border border-rose-100">
            <Statistic
              title={<span className="text-rose-900 font-medium">Quyết định Kỷ luật</span>}
              value={totalDisciplines}
              prefix={<AlertOutlined className="text-rose-500" />}
              suffix="lượt"
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-xs bg-emerald-50/40 border border-emerald-100">
            <Statistic
              title={<span className="text-emerald-900 font-medium">Tổng tiền thưởng đã chi</span>}
              value={totalBonusAmount}
              prefix={<DollarOutlined className="text-emerald-600" />}
              formatter={(v) => formatMoney(Number(v))}
            />
          </Card>
        </Col>
      </Row>

      {/* Bảng dữ liệu và Bộ lọc */}
      <Card bordered={false} className="shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          <Input
            placeholder="Tìm theo mã, tên nhân viên, lý do..."
            prefix={<SearchOutlined className="text-slate-400" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            className="w-full sm:w-72"
          />

          <Space className="w-full sm:w-auto flex-wrap">
            <Select
              value={typeFilter}
              onChange={setTypeFilter}
              className="w-full sm:w-40"
              options={[
                { value: 'all', label: 'Tất cả loại hình' },
                { value: 'Khen thưởng', label: 'Khen thưởng' },
                { value: 'Kỷ luật', label: 'Kỷ luật' },
              ]}
            />
            <Select
              value={deptFilter}
              onChange={setDeptFilter}
              className="w-full sm:w-48"
              options={[
                { value: 'all', label: 'Tất cả phòng ban' },
                ...state.departments.map((d) => ({
                  value: d.id,
                  label: d.name,
                })),
              ]}
            />
          </Space>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          scroll={{ x: 800 }}
          size="middle"
        />
      </Card>

      {/* Modal Tạo mới Khen thưởng / Kỷ luật */}
      <Modal
        open={createOpen}
        title="Ghi nhận Quyết định Khen thưởng / Kỷ luật"
        onCancel={() => setCreateOpen(false)}
        footer={null}
        width={640}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          className="mt-3"
        >
          {formError && (
            <Alert type="error" showIcon message={formError} className="mb-4" />
          )}

          <Form.Item
            name="type"
            label="Loại quyết định"
            rules={[{ required: true }]}
          >
            <Radio.Group
              buttonStyle="solid"
              onChange={(e) => {
                setSelectedType(e.target.value);
                form.setFieldsValue({
                  category: CATEGORY_SUGGESTIONS[e.target.value as 'Khen thưởng' | 'Kỷ luật'][0],
                  amount: e.target.value === 'Khen thưởng' ? 1000000 : 0,
                });
              }}
            >
              <Radio.Button value="Khen thưởng">
                <TrophyOutlined className="mr-1 text-amber-500" /> Khen thưởng
              </Radio.Button>
              <Radio.Button value="Kỷ luật">
                <AlertOutlined className="mr-1 text-rose-500" /> Kỷ luật
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item
              name="employee_id"
              label="Nhân viên"
              rules={[{ required: true, message: 'Chọn nhân viên' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={activeEmployees.map((e) => ({
                  value: e.id,
                  label: `${e.name} (${dept(e.department_id)})`,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="category"
              label="Hình thức cụ thể"
              rules={[{ required: true, message: 'Chọn hoặc nhập hình thức' }]}
            >
              <Select
                showSearch
                options={CATEGORY_SUGGESTIONS[selectedType].map((c) => ({
                  value: c,
                  label: c,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="amount"
              label="Số tiền thưởng / phạt (VND)"
              extra="Nhập 0 nếu là hình thức danh dự hoặc kỷ luật phi tài chính"
            >
              <InputNumber
                min={0}
                max={100000000000}
                className="w-full"
                formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0')}
              />
            </Form.Item>

            <Form.Item
              name="effective_date"
              label="Ngày hiệu lực"
              rules={[{ required: true, message: 'Chọn ngày hiệu lực' }]}
            >
              <Input type="date" />
            </Form.Item>

            <Form.Item
              name="number"
              label="Số quyết định"
              rules={[{ required: true, message: 'Nhập số quyết định' }]}
              extra="VD: 04/2026/QD-KT"
            >
              <Input placeholder="Số quyết định" />
            </Form.Item>

            <Form.Item
              name="signer"
              label="Người ký quyết định"
              rules={[{ required: true, message: 'Nhập người ký' }]}
            >
              <Input placeholder="Đại diện Ban Giám đốc" />
            </Form.Item>

            <Form.Item
              name="signed_date"
              label="Ngày ký quyết định"
              rules={[{ required: true, message: 'Chọn ngày ký' }]}
            >
              <Input type="date" />
            </Form.Item>
          </div>

          <Form.Item
            name="reason"
            label="Lý do / Trích yếu nội dung quyết định"
            rules={[{ required: true, message: 'Nhập lý do' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="Ghi rõ thành tích được khen thưởng hoặc lỗi vi phạm dẫn đến kỷ luật..."
            />
          </Form.Item>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setCreateOpen(false)}>Đóng</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Lưu Quyết định
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal Chi tiết Khen thưởng / Kỷ luật */}
      <Modal
        open={!!detailItem}
        title="Chi tiết Quyết định Khen thưởng / Kỷ luật"
        onCancel={() => setDetailItem(null)}
        footer={[
          <Button key="close" onClick={() => setDetailItem(null)}>
            Đóng
          </Button>,
        ]}
        width={640}
      >
        {detailItem && (
          <Descriptions
            bordered
            size="small"
            column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
          >
            <Descriptions.Item label="Mã bản ghi">
              <Text code>{detailItem.id}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Loại hình">
              <Tag color={detailItem.type === 'Khen thưởng' ? 'gold' : 'magenta'}>
                {detailItem.type}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Nhân viên">
              <strong>
                {emp(detailItem.employee_id)?.name || detailItem.employee_name}
              </strong>
            </Descriptions.Item>
            <Descriptions.Item label="Phòng ban">
              {dept(emp(detailItem.employee_id)?.department_id)}
            </Descriptions.Item>
            <Descriptions.Item label="Hình thức">
              {detailItem.category}
            </Descriptions.Item>
            <Descriptions.Item label="Số tiền">
              <strong>{formatMoney(detailItem.amount)}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Ngày hiệu lực">
              {formatDate(detailItem.effective_date)}
            </Descriptions.Item>
            <Descriptions.Item label="Số quyết định">
              <Tag color="purple">
                {state.decisions.find((d) => d.id === detailItem.decision_id)?.number ||
                  detailItem.decision_number ||
                  detailItem.decision_id}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Người ký" span={2}>
              {state.decisions.find((d) => d.id === detailItem.decision_id)?.signer ||
                detailItem.signer ||
                'Ban Giám đốc'}
            </Descriptions.Item>
            <Descriptions.Item label="Lý do / Nội dung" span={2}>
              {detailItem.reason}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};
