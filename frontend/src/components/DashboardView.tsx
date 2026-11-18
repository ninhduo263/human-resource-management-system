import React from 'react';
import {
  Card,
  Row,
  Col,
  Progress,
  Table,
  Tag,
  Button,
  Avatar,
  Space,
  Typography,
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
  ClockCircleOutlined,
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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Chào buổi sáng';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onNavigate,
}) => {
  const activeEmployees = state.employees.filter((e) =>
    ['Đang làm việc', 'Thử việc'].includes(e.TrangThai)
  );
  const officialCount = activeEmployees.filter(
    (e) => e.TrangThai === 'Đang làm việc'
  ).length;
  const trialCount = activeEmployees.filter(
    (e) => e.TrangThai === 'Thử việc'
  ).length;
  const pendingLeaves = state.leaves.filter((l) => l.TrangThai === 'Chờ duyệt');
  const expiringContracts = state.contracts.filter(
    (c) => getContractStatus(c, state.today) === 'Sắp hết hạn'
  );
  const newcomers = activeEmployees.filter(
    (e) => e.NgayVaoLam.slice(0, 7) === state.today.slice(0, 7)
  );

  const deptName = (id: string | null) =>
    state.departments.find((d) => d.MaPB === id)?.TenPB ||
    id ||
    'Không thuộc phòng ban';
  const posName = (id: string) =>
    state.positions.find((p) => p.MaCV === id)?.TenCV || id;
  const empName = (id: string) =>
    state.employees.find((e) => e.MaNV === id)?.HoTen || id;

  const maxDeptCount = Math.max(
    1,
    ...state.departments.map(
      (d) => activeEmployees.filter((e) => e.MaPB === d.MaPB).length
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
            <div className="font-semibold text-[#172b23]">{e.HoTen}</div>
            <div className="text-xs text-[#5e7066]">{e.Email}</div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Phòng ban',
      dataIndex: 'MaPB',
      key: 'MaPB',
      render: (id: string) => deptName(id),
    },
    {
      title: 'Chức vụ',
      dataIndex: 'MaCV',
      key: 'MaCV',
      render: (id: string) => posName(id),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'TrangThai',
      key: 'TrangThai',
      render: (status: string) => (
        <Tag color={getAntTagColor(status)}>{status}</Tag>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-1">
        <div>
          <Title level={2} style={{ margin: '0 0 4px', fontSize: 26 }}>
            {getGreeting()}, {state.user.HoTen}
          </Title>
          <Text type="secondary" className="text-sm">
            Nhịp độ tổ chức, nhân sự đang làm việc và các đầu việc cần lưu ý hôm nay.
          </Text>
        </div>

        <Space className="no-print w-full sm:w-auto flex-wrap">
          <Button icon={<DownloadOutlined />} onClick={handleExportOverview}>
            Xuất danh sách nhân sự
          </Button>
          {canEdit(state.user.VaiTro) ? (
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
                onNavigate(state.user.VaiTro === 'director' ? 'reports' : 'leaves')
              }
            >
              {state.user.VaiTro === 'director' ? 'Xem báo cáo' : 'Nghỉ phép'}
            </Button>
          )}
        </Space>
      </div>

      {/* Asymmetric Bento Metrics */}
      <Row gutter={[16, 16]}>
        {/* Featured Primary Card */}
        <Col xs={24} sm={12} lg={7}>
          <Card
            bordered={false}
            className="hero-forest-card h-full"
            styles={{ body: { padding: '22px 24px' } }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-[#b8d4c5]">
                Nhân sự đang làm việc
              </span>
              <span className="h-8 w-8 rounded-lg bg-white/10 text-[#c9f3bd] flex items-center justify-center">
                <TeamOutlined />
              </span>
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-4xl font-bold tracking-tight text-white tabular-nums">
                {activeEmployees.length}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#c9f3bd]/20 text-[#d0efaf] font-semibold">
                +{newcomers.length} tháng này
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-4 text-xs text-[#b8d4c5]">
              <span>
                Chính thức: <strong className="text-white tabular-nums">{officialCount}</strong>
              </span>
              <span>
                Thử việc: <strong className="text-white tabular-nums">{trialCount}</strong>
              </span>
            </div>
          </Card>
        </Col>

        {/* Secondary Card 1 */}
        <Col xs={24} sm={12} lg={5}>
          <Card
            bordered={false}
            className="h-full hover:border-[#b7cbbd] transition-colors cursor-pointer"
            onClick={() => onNavigate('departments')}
            styles={{ body: { padding: '22px 20px' } }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-[#5e7066]">
                Cơ cấu đơn vị
              </span>
              <span className="h-8 w-8 rounded-lg bg-[#eaf1e2] text-[#155e4b] flex items-center justify-center">
                <BankOutlined />
              </span>
            </div>
            <div className="text-3xl font-bold text-[#172b23] tabular-nums">
              {state.departments.length}
              <span className="text-sm font-normal text-[#5e7066] ml-1.5">
                phòng ban
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-[#edf1e8] text-xs text-[#5e7066]">
              {state.positions.length} chức danh đang áp dụng
            </div>
          </Card>
        </Col>

        {/* Secondary Card 2 */}
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            className="h-full hover:border-[#e6c48a] transition-colors cursor-pointer"
            onClick={() => onNavigate('contracts')}
            styles={{ body: { padding: '22px 20px' } }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-[#5e7066]">
                Hợp đồng sắp hết hạn
              </span>
              <span className="h-8 w-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <FileExclamationOutlined />
              </span>
            </div>
            <div
              className="text-3xl font-bold tabular-nums"
              style={{
                color: expiringContracts.length > 0 ? '#b45309' : '#172b23',
              }}
            >
              {expiringContracts.length}
              <span className="text-sm font-normal text-[#5e7066] ml-1.5">
                hợp đồng
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-[#edf1e8] text-xs text-[#5e7066]">
              Cần gia hạn hoặc chốt trong 30 ngày tới
            </div>
          </Card>
        </Col>

        {/* Secondary Card 3 */}
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            className="h-full hover:border-[#b7cbbd] transition-colors cursor-pointer"
            onClick={() => onNavigate('leaves')}
            styles={{ body: { padding: '22px 20px' } }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-[#5e7066]">
                Đơn nghỉ phép chờ duyệt
              </span>
              <span className="h-8 w-8 rounded-lg bg-[#eaf1e2] text-[#155e4b] flex items-center justify-center">
                <CalendarOutlined />
              </span>
            </div>
            <div className="text-3xl font-bold text-[#172b23] tabular-nums">
              {pendingLeaves.length}
              <span className="text-sm font-normal text-[#5e7066] ml-1.5">
                đơn chờ
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-[#edf1e8] text-xs text-[#5e7066]">
              Theo tuyến Trưởng phòng và Giám đốc
            </div>
          </Card>
        </Col>
      </Row>

      {/* Distribution & Actionable Alerts */}
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
            className="h-full"
          >
            <div className="space-y-4">
              {state.departments.map((d) => {
                const count = activeEmployees.filter(
                  (e) => e.MaPB === d.MaPB
                ).length;
                const pct = Math.round((count / maxDeptCount) * 100);
                return (
                  <div key={d.MaPB}>
                    <div className="flex justify-between items-baseline text-xs mb-1.5">
                      <span className="font-semibold text-[#172b23]">
                        {d.TenPB}
                      </span>
                      <span className="text-[#5e7066] tabular-nums">
                        <strong className="text-[#172b23]">{count}</strong> nhân viên
                      </span>
                    </div>
                    <Progress
                      percent={pct}
                      showInfo={false}
                      strokeColor="#155e4b"
                      trailColor="#eef2e8"
                      size={['100%', 8]}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title="Việc cần xử lý hôm nay"
            bordered={false}
            className="h-full"
          >
            <div className="space-y-3">
              {expiringContracts.slice(0, 3).map((c) => (
                <div
                  key={c.MaHD}
                  className="flex items-start justify-between gap-3 rounded-xl bg-amber-50/70 border border-amber-200/80 p-3.5"
                >
                  <div className="flex items-start gap-2.5">
                    <ClockCircleOutlined className="text-amber-600 mt-0.5 text-sm" />
                    <div>
                      <div className="text-xs font-semibold text-[#172b23]">
                        Hợp đồng sắp hết hạn trong{' '}
                        <span className="tabular-nums">
                          {daysUntil(c.NgayKetThuc!, state.today)}
                        </span>{' '}
                        ngày
                      </div>
                      <div className="text-xs text-[#5e7066] mt-0.5">
                        {empName(c.MaNV)} · Hết hạn: {c.NgayKetThuc}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => onNavigate('contracts')}
                    className="shrink-0"
                  >
                    Xử lý
                  </Button>
                </div>
              ))}

              {pendingLeaves.length > 0 && (
                <div className="flex items-start justify-between gap-3 rounded-xl bg-[#f4f8ef] border border-[#dce6d2] p-3.5">
                  <div className="flex items-start gap-2.5">
                    <CalendarOutlined className="text-[#155e4b] mt-0.5 text-sm" />
                    <div>
                      <div className="text-xs font-semibold text-[#172b23]">
                        <span className="tabular-nums">{pendingLeaves.length}</span>{' '}
                        đơn nghỉ phép đang chờ duyệt
                      </div>
                      <div className="text-xs text-[#5e7066] mt-0.5">
                        Kiểm tra lịch làm việc và quỹ phép năm của nhân viên.
                      </div>
                    </div>
                  </div>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => onNavigate('leaves')}
                    className="shrink-0"
                  >
                    Xem đơn
                  </Button>
                </div>
              )}

              {expiringContracts.length === 0 && pendingLeaves.length === 0 && (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Mọi hợp đồng và đơn nghỉ phép đã được xử lý"
                />
              )}
            </div>
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
      >
        <Table
          rowKey="MaNV"
          columns={columns}
          dataSource={activeEmployees.slice(0, 5)}
          pagination={false}
          size="middle"
          scroll={{ x: 600 }}
        />
      </Card>
    </div>
  );
};
