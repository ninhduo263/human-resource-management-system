import React, { useState } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Select,
  Input,
  Button,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  PrinterOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { AppState } from '../types';
import {
  downloadCsv,
  formatDate,
  formatMoney,
  getContractStatus,
} from '../utils/format';

const { Title, Text } = Typography;

interface ReportsViewProps {
  state: AppState;
  notify: (msg: string, isError?: boolean) => void;
}

type ReportType = 'personnel' | 'movements' | 'contracts' | 'leaves' | 'rewards';

const REPORT_LABELS: Record<ReportType, string> = {
  personnel: 'Thống kê nhân sự',
  movements: 'Báo cáo biến động nhân sự',
  contracts: 'Báo cáo hợp đồng lao động',
  leaves: 'Báo cáo nghỉ phép',
  rewards: 'Báo cáo khen thưởng & kỷ luật',
};

export const ReportsView: React.FC<ReportsViewProps> = ({ state, notify }) => {
  const [reportType, setReportType] = useState<ReportType>('personnel');
  const [reportDept, setReportDept] = useState('');
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');

  const emp = (id: string) => state.employees.find((e) => e.id === id);
  const empName = (id: string) => emp(id)?.name || id;
  const deptName = (id: string | null) =>
    state.departments.find((d) => d.id === id)?.name || id || 'Không thuộc phòng ban';
  const posName = (id: string) =>
    state.positions.find((p) => p.id === id)?.name || id;

  const matchRecord = (empId: string, dateVal: string) => {
    const e = emp(empId);
    if (!e) return false;
    if (reportDept && e.department_id !== reportDept) return false;
    if (reportFrom && dateVal < reportFrom) return false;
    if (reportTo && dateVal > reportTo) return false;
    return true;
  };

  const buildReportData = (): {
    headers: string[];
    rows: (string | number)[][];
  } => {
    if (reportType === 'movements') {
      return {
        headers: [
          'Nhân viên',
          'Loại biến động',
          'Phòng ban cũ',
          'Phòng ban mới',
          'Chức vụ mới',
          'Ngày hiệu lực',
        ],
        rows: state.assignments
          .filter((a) => (a.status ?? 'Hiệu lực') === 'Hiệu lực')
          .filter((a) => matchRecord(a.employee_id, a.effective_date))
          .map((a) => [
            empName(a.employee_id),
            a.type,
            deptName(a.old_department_id),
            deptName(a.new_department_id),
            posName(a.new_position_id),
            a.effective_date,
          ]),
      };
    }

    if (reportType === 'contracts') {
      return {
        headers: [
          'Nhân viên',
          'Loại hợp đồng',
          'Ngày bắt đầu',
          'Ngày kết thúc',
          'Mức lương',
          'Trạng thái',
        ],
        rows: state.contracts
          .filter((c) => matchRecord(c.employee_id, c.start_date))
          .map((c) => [
            empName(c.employee_id),
            c.type,
            c.start_date,
            c.end_date || 'Không xác định',
            formatMoney(c.salary),
            getContractStatus(c, state.today),
          ]),
      };
    }

    if (reportType === 'leaves') {
      return {
        headers: [
          'Nhân viên',
          'Loại nghỉ',
          'Từ ngày',
          'Đến ngày',
          'Số ngày',
          'Trạng thái',
          'Người duyệt',
        ],
        rows: state.leaves
          .filter((l) => matchRecord(l.employee_id, l.start_date))
          .map((l) => [
            empName(l.employee_id),
            state.leaveTypes.find((t) => t.id === l.type_id)?.name || l.type_id,
            l.start_date,
            l.end_date,
            l.days,
            l.status,
            l.approver_name ||
              (l.approver_id ? empName(l.approver_id) : '—'),
          ]),
      };
    }

    if (reportType === 'rewards') {
      const rewards = state.rewards || [];
      return {
        headers: [
          'Nhân viên',
          'Phòng ban',
          'Loại hình',
          'Hình thức',
          'Số tiền',
          'Ngày hiệu lực',
          'Lý do',
        ],
        rows: rewards
          .filter((r) => matchRecord(r.employee_id, r.effective_date))
          .map((r) => [
            empName(r.employee_id),
            deptName(emp(r.employee_id)?.department_id || null),
            r.type,
            r.category,
            formatMoney(r.amount),
            r.effective_date,
            r.reason,
          ]),
      };
    }

    return {
      headers: [
        'Họ tên',
        'Giới tính',
        'Phòng ban',
        'Chức vụ',
        'Ngày vào làm',
        'Trạng thái',
      ],
      rows: state.employees
        .filter((e) => matchRecord(e.id, e.join_date))
        .map((e) => [
          e.name,
          e.gender,
          deptName(e.department_id),
          posName(e.position_id),
          e.join_date,
          e.status,
        ]),
    };
  };

  const data = buildReportData();

  const handleExportCsv = () => {
    downloadCsv(
      `peopleops-report-${reportType}-${state.today}.csv`,
      data.headers,
      data.rows
    );
    notify(`Đã xuất ${data.rows.length} bản ghi ra file CSV.`);
  };

  const tableColumns = data.headers.map((h, idx) => ({
    title: h,
    dataIndex: `col_${idx}`,
    key: `col_${idx}`,
  }));

  const tableData = data.rows.map((r, rIdx) => {
    const obj: Record<string, any> = { key: rIdx };
    r.forEach((cell, cIdx) => {
      obj[`col_${cIdx}`] = cell;
    });
    return obj;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Title level={3} style={{ margin: '4px 0' }}>
            Báo cáo nhân sự
          </Title>
          <Text type="secondary">
            Tổng hợp thông tin nhân sự, hợp đồng, công tác và nghỉ phép.
          </Text>
        </div>

        <Space className="no-print w-full sm:w-auto flex-wrap">
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
            In / Lưu PDF
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportCsv}
          >
            Tải báo cáo CSV
          </Button>
        </Space>
      </div>

      {/* Filters */}
      <Card bordered={false} className="shadow-xs no-print">
        <Space wrap size="middle" className="w-full">
          <Select
            value={reportType}
            onChange={(val) => setReportType(val as ReportType)}
            className="w-full sm:w-64"
            options={Object.entries(REPORT_LABELS).map(([id, label]) => ({
              value: id,
              label,
            }))}
          />

          <Select
            value={reportDept}
            onChange={setReportDept}
            className="w-full sm:w-52"
            options={[
              { value: '', label: 'Tất cả phòng ban' },
              ...state.departments.map((d) => ({
                value: d.id,
                label: d.name,
              })),
            ]}
          />

          <Space className="w-full sm:w-auto justify-between">
            <Text type="secondary" className="text-xs shrink-0">
              Từ ngày:
            </Text>
            <Input
              type="date"
              value={reportFrom}
              onChange={(e) => {
                if (reportTo && e.target.value && e.target.value > reportTo) {
                  notify('Từ ngày không được sau đến ngày.', true);
                  return;
                }
                setReportFrom(e.target.value);
              }}
              style={{ width: 140 }}
            />
          </Space>

          <Space className="w-full sm:w-auto justify-between">
            <Text type="secondary" className="text-xs shrink-0">
              Đến ngày:
            </Text>
            <Input
              type="date"
              value={reportTo}
              onChange={(e) => {
                if (
                  reportFrom &&
                  e.target.value &&
                  e.target.value < reportFrom
                ) {
                  notify('Đến ngày không được trước từ ngày.', true);
                  return;
                }
                setReportTo(e.target.value);
              }}
              style={{ width: 140 }}
            />
          </Space>

          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setReportDept('');
              setReportFrom('');
              setReportTo('');
            }}
          >
            Đặt lại bộ lọc
          </Button>
        </Space>
      </Card>

      {/* Summary Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-xs print-card">
            <Statistic
              title="Số lượng bản ghi"
              value={data.rows.length}
              suffix="kết quả"
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-xs print-card">
            <Statistic
              title="Phạm vi phòng ban"
              value={reportDept ? deptName(reportDept) : 'Toàn bộ đơn vị'}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="shadow-xs print-card">
            <Statistic
              title="Ngày lập báo cáo"
              value={formatDate(state.today)}
              suffix={`(${state.user.name})`}
            />
          </Card>
        </Col>
      </Row>

      {/* Report Table */}
      <Card
        title={REPORT_LABELS[reportType]}
        extra={<Tag color="processing">{data.rows.length} dòng</Tag>}
        bordered={false}
        className="shadow-xs print-card"
      >
        <Table
          columns={tableColumns}
          dataSource={tableData}
          pagination={{ pageSize: 12, showSizeChanger: false }}
          size="middle"
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
};
