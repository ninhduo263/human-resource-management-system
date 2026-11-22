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
  Dropdown,
} from 'antd';
import {
  PrinterOutlined,
  DownloadOutlined,
  ReloadOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import { AppState } from '../types';
import {
  downloadCsv,
  formatDate,
  formatMoney,
  getContractStatus,
  ROLE_NAMES,
} from '../utils/format';
import { exportExcel, printReportPdf, ReportSpec } from '../utils/exportFiles';

const { Title, Text } = Typography;

interface ReportsViewProps {
  state: AppState;
  notify: (msg: string, isError?: boolean) => void;
}

type ReportType = 'personnel' | 'movements' | 'contracts' | 'leaves';

const REPORT_LABELS: Record<ReportType, string> = {
  personnel: 'Thống kê nhân sự',
  movements: 'Báo cáo biến động nhân sự',
  contracts: 'Báo cáo hợp đồng lao động',
  leaves: 'Báo cáo nghỉ phép',
};

export const ReportsView: React.FC<ReportsViewProps> = ({ state, notify }) => {
  const [reportType, setReportType] = useState<ReportType>('personnel');
  const [reportDept, setReportDept] = useState('');
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const emp = (id: string) => state.employees.find((e) => e.MaNV === id);
  const empName = (id: string) => emp(id)?.HoTen || id;
  const deptName = (id: string | null) =>
    state.departments.find((d) => d.MaPB === id)?.TenPB || id || 'Không thuộc phòng ban';
  const posName = (id: string) =>
    state.positions.find((p) => p.MaCV === id)?.TenCV || id;

  const matchRecord = (empId: string, dateVal: string) => {
    const e = emp(empId);
    if (!e) return false;
    if (reportDept && e.MaPB !== reportDept) return false;
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
          .filter((a) => (a.TrangThai ?? 'Hiệu lực') === 'Hiệu lực')
          .filter((a) => matchRecord(a.MaNV, a.NgayHieuLuc))
          .map((a) => [
            empName(a.MaNV),
            a.LoaiBienDong,
            deptName(a.MaPBCu),
            deptName(a.MaPBMoi),
            posName(a.MaCVMoi),
            a.NgayHieuLuc,
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
          .filter((c) => matchRecord(c.MaNV, c.NgayBatDau))
          .map((c) => [
            empName(c.MaNV),
            c.LoaiHD,
            c.NgayBatDau,
            c.NgayKetThuc || 'Không xác định',
            formatMoney(c.MucLuong),
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
          .filter((l) => matchRecord(l.MaNV, l.TuNgay))
          .map((l) => [
            empName(l.MaNV),
            state.leaveTypes.find((t) => t.MaLoai === l.MaLoai)?.TenLoai || l.MaLoai,
            l.TuNgay,
            l.DenNgay,
            l.SoNgay,
            l.TrangThai,
            l.tennguoiduyet ||
              (l.MaNVDuyet ? empName(l.MaNVDuyet) : '—'),
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
        .filter((e) => matchRecord(e.MaNV, e.NgayVaoLam))
        .map((e) => [
          e.HoTen,
          e.GioiTinh,
          deptName(e.MaPB),
          posName(e.MaCV),
          e.NgayVaoLam,
          e.TrangThai,
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

  const reportSpec = (): ReportSpec => ({
    title: REPORT_LABELS[reportType],
    fileName: `bao-cao-${reportType}-${state.today}`,
    headers: data.headers,
    rows: data.rows,
    author: state.user.HoTen,
    numericColumns: reportType === 'leaves' ? [4] : reportType === 'contracts' ? [4] : [],
    meta: [
      ['Phạm vi phòng ban', reportDept ? deptName(reportDept) : 'Toàn bộ đơn vị'],
      [
        'Khoảng thời gian',
        reportFrom || reportTo
          ? `${reportFrom ? formatDate(reportFrom) : '…'} – ${reportTo ? formatDate(reportTo) : '…'}`
          : 'Tất cả',
      ],
      ['Người lập', `${state.user.HoTen} (${ROLE_NAMES[state.user.VaiTro]})`],
    ],
  });

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await exportExcel(reportSpec());
      notify(`Đã xuất ${data.rows.length} bản ghi ra file Excel.`);
    } catch (err: any) {
      notify(err?.message || 'Không thể tạo file Excel.', true);
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = () => {
    printReportPdf(reportSpec());
    notify('Chọn "Lưu dưới dạng PDF" trong hộp thoại in để lưu báo cáo.');
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
          <Button icon={<FilePdfOutlined />} onClick={handleExportPdf}>
            Xuất PDF
          </Button>
          <Dropdown.Button
            type="primary"
            loading={exporting}
            onClick={handleExportExcel}
            icon={<DownloadOutlined />}
            menu={{
              items: [
                { key: 'csv', label: 'Tải file CSV' },
                { key: 'print', icon: <PrinterOutlined />, label: 'In trang hiện tại' },
              ],
              onClick: ({ key }) => (key === 'csv' ? handleExportCsv() : window.print()),
            }}
          >
            <FileExcelOutlined /> Xuất Excel
          </Dropdown.Button>
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
                value: d.MaPB,
                label: d.TenPB,
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
              suffix={`(${state.user.HoTen})`}
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
