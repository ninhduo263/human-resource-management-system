import React from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Table,
  Tag,
  Button,
  Avatar,
  Space,
  Typography,
  Alert,
  Empty,
} from 'antd';
import {
  TeamOutlined,
  BankOutlined,
  FileExclamationOutlined,
  CalendarOutlined,
  DownloadOutlined,
  PlusOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { AppState, Employee, RouteKey } from '../types';
import {
  canEdit,
  daysUntil,
  downloadCsv,
  getAntTagColor,
  getAvatarHex,
  getContractStatus,
  getInitials,
} from '../utils/format';

const { Title, Text } = Typography;

interface DashboardViewProps {
  state: AppState;
  onNavigate: (route: RouteKey) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onNavigate,
}) => {
  const activeEmployees = state.employees.filter(
    (e) => ['Đang làm việc', 'Thử việc'].includes(e.status)
  );
  const pendingLeaves = state.leaves.filter((l) => l.status === 'Chờ duyệt');
  const expiringContracts = state.contracts.filter(
    (c) => getContractStatus(c, state.today) === 'Sắp hết hạn'
  );
  const newcomers = activeEmployees.filter(
    (e) => e.join_date.slice(0, 7) === state.today.slice(0, 7)
  );

  const deptName = (id: string | null) =>
    state.departments.find((d) => d.id === id)?.name || id || 'Không thuộc phòng ban';
  const posName = (id: string) =>
    state.positions.find((p) => p.id === id)?.name || id;
  const empName = (id: string) =>
    state.employees.find((e) => e.id === id)?.name || id;

  const maxDeptCount = Math.max(
    1,
    ...state.departments.map(
      (d) => activeEmployees.filter((e) => e.department_id === d.id).length
    )
  );

  const handleExportOverview = () => {
    downloadCsv(
      `peopleops-nhan-su-${state.today}.csv`,
      [
        'Họ tên',
        'Ngày sinh',
        'Giới tính',
        'Email',
        'Điện thoại',
        'Phòng ban',
        'Chức vụ',
        'Ngày vào làm',
        'Trạng thái',
      ],
      activeEmployees.map((e) => [
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
            <div className="text-xs text-slate-500">{e.email}</div>
          </div>
        </Space>
      ),
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
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getAntTagColor(status)}>{status}</Tag>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Text className="text-xs font-bold uppercase tracking-wider text-[#12584b]">
            TỔNG QUAN HỆ THỐNG (ANT DESIGN UI)
          </Text>
          <Title level={3} style={{ margin: '4px 0' }}>
            Xin chào, {state.user.name}
          </Title>
          <Text type="secondary">
            Theo dõi nhanh số liệu nhân sự, cơ cấu phòng ban, hợp đồng sắp hết hạn và đơn chờ duyệt.
          </Text>
        </div>

        <Space className="no-print">
          <Button icon={<DownloadOutlined />} onClick={handleExportOverview}>
            Xuất CSV
          </Button>
          {canEdit(state.user.role) ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => onNavigate('employees')}
            >
              Quản lý hồ sơ
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<ArrowRightOutlined />}
              onClick={() =>
                onNavigate(state.user.role === 'director' ? 'reports' : 'leaves')
              }
            >
              {state.user.role === 'director' ? 'Xem báo cáo' : 'Nghỉ phép'}
            </Button>
          )}
        </Space>
      </div>

      {/* Stat Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-xs">
            <Statistic
              title="Tổng nhân sự đang làm việc"
              value={activeEmployees.length}
              suffix="nhân viên"
              prefix={<TeamOutlined className="text-[#12584b] mr-1" />}
            />
            <div className="mt-2 text-xs text-slate-500">
              <strong>{newcomers.length} nhân sự mới</strong> trong tháng này
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-xs">
            <Statistic
              title="Phòng ban & Đơn vị"
              value={state.departments.length}
              suffix="phòng ban"
              prefix={<BankOutlined className="text-sky-600 mr-1" />}
            />
            <div className="mt-2 text-xs text-slate-500">
              Cùng {state.positions.length} chức danh trong danh mục
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-xs">
            <Statistic
              title="Hợp đồng sắp hết hạn"
              value={expiringContracts.length}
              suffix="hợp đồng"
              valueStyle={{
                color: expiringContracts.length > 0 ? '#d97706' : undefined,
              }}
              prefix={<FileExclamationOutlined className="text-amber-600 mr-1" />}
            />
            <div className="mt-2 text-xs text-slate-500">
              Cần theo dõi trong <strong>30 ngày tới</strong>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="shadow-xs">
            <Statistic
              title="Đơn nghỉ phép chờ duyệt"
              value={pendingLeaves.length}
              suffix="đơn"
              prefix={<CalendarOutlined className="text-purple-600 mr-1" />}
            />
            <div className="mt-2 text-xs text-slate-500">
              Đang chờ Trưởng phòng / Quản trị duyệt
            </div>
          </Card>
        </Col>
      </Row>

      {/* Distribution & Alerts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title="Phân bổ nhân sự theo phòng ban"
            extra={
              <Button
                type="link"
                size="small"
                onClick={() => onNavigate('departments')}
              >
                Xem cơ cấu <ArrowRightOutlined />
              </Button>
            }
            bordered={false}
            className="shadow-xs h-full"
          >
            <div className="space-y-3">
              {state.departments.map((d) => {
                const count = activeEmployees.filter(
                  (e) => e.department_id === d.id
                ).length;
                const pct = Math.round((count / maxDeptCount) * 100);
                return (
                  <div key={d.id}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>
                        <strong>{d.name}</strong>{' '}
                      </span>
                      <Text strong>{count} nhân viên</Text>
                    </div>
                    <Progress
                      percent={pct}
                      showInfo={false}
                      strokeColor="#12584b"
                      size="small"
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title="Cảnh báo & Nhắc việc"
            bordered={false}
            className="shadow-xs h-full"
          >
            <Space direction="vertical" className="w-full" size="middle">
              {expiringContracts.slice(0, 3).map((c) => (
                <Alert
                  key={c.id}
                  type="warning"
                  showIcon
                  message={
                    <div className="flex items-center justify-between">
                      <strong>
                        Hợp đồng còn{' '}
                        {daysUntil(c.end_date!, state.today)} ngày
                      </strong>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => onNavigate('contracts')}
                      >
                        Xử lý
                      </Button>
                    </div>
                  }
                  description={`${empName(c.employee_id)} · Hết hạn: ${
                    c.end_date
                  }`}
                />
              ))}

              {pendingLeaves.length > 0 && (
                <Alert
                  type="info"
                  showIcon
                  message={
                    <div className="flex items-center justify-between">
                      <strong>
                        {pendingLeaves.length} đơn nghỉ phép đang chờ duyệt
                      </strong>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => onNavigate('leaves')}
                      >
                        Xem đơn
                      </Button>
                    </div>
                  }
                  description="Kiểm tra lịch nghỉ và quỹ phép năm của nhân viên."
                />
              )}

              {expiringContracts.length === 0 && pendingLeaves.length === 0 && (
                <Empty description="Mọi hợp đồng và đơn nghỉ phép đã được xử lý" />
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Quick employee table */}
      <Card
        title="Nhân sự trong phạm vi quản lý"
        extra={
          <Button
            type="link"
            size="small"
            onClick={() => onNavigate('employees')}
          >
            Xem tất cả ({activeEmployees.length}) <ArrowRightOutlined />
          </Button>
        }
        bordered={false}
        className="shadow-xs"
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={activeEmployees.slice(0, 5)}
          pagination={false}
          size="middle"
        />
      </Card>
    </div>
  );
};
