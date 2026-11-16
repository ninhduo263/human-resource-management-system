import React, { useState } from 'react';
import { Printer, Download, RotateCcw } from 'lucide-react';
import { AppState } from '../types';
import {
  downloadCsv,
  formatDate,
  formatMoney,
  getContractStatus,
} from '../utils/format';

interface ReportsViewProps {
  state: AppState;
  notify: (msg: string, isError?: boolean) => void;
}

type ReportType = 'personnel' | 'movements' | 'contracts' | 'leaves';

const REPORT_LABELS: Record<ReportType, string> = {
  personnel: '5.1 Thống kê nhân sự',
  movements: '5.2 Báo cáo biến động nhân sự',
  contracts: '5.3 Báo cáo hợp đồng lao động',
  leaves: '5.4 Báo cáo nghỉ phép',
};

export const ReportsView: React.FC<ReportsViewProps> = ({ state, notify }) => {
  const [reportType, setReportType] = useState<ReportType>('personnel');
  const [reportDept, setReportDept] = useState('');
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');

  const emp = (id: string) => state.employees.find((e) => e.id === id);
  const empName = (id: string) => emp(id)?.name || id;
  const deptName = (id: string) =>
    state.departments.find((d) => d.id === id)?.name || id;
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

  const buildReportData = (): { headers: string[]; rows: (string | number)[][] } => {
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
          'Mã hợp đồng',
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
            c.id,
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

    return {
      headers: [
        'Mã nhân viên',
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
          e.id,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
            PHÂN HỆ 5.0 · BFD 5.1 – 5.4
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Báo cáo nhân sự</h1>
          <p className="text-sm text-slate-500">
            Tổng hợp dữ liệu từ các kho D1–D5 phục vụ Ban giám đốc & Cán bộ nhân sự.
          </p>
        </div>

        <div className="flex items-center gap-2.5 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <Printer className="h-4 w-4" />
            <span>In / Lưu PDF</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
          >
            <Download className="h-4 w-4" />
            <span>Tải báo cáo CSV</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <section className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs no-print">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-800"
          >
            {Object.entries(REPORT_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={reportDept}
            onChange={(e) => setReportDept(e.target.value)}
            className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs"
          >
            <option value="">Tất cả phòng ban</option>
            {state.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Từ ngày:</span>
            <input
              type="date"
              value={reportFrom}
              onChange={(e) => {
                if (reportTo && e.target.value && e.target.value > reportTo) {
                  notify('Từ ngày không được sau đến ngày.', true);
                  return;
                }
                setReportFrom(e.target.value);
              }}
              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Đến ngày:</span>
            <input
              type="date"
              value={reportTo}
              onChange={(e) => {
                if (reportFrom && e.target.value && e.target.value < reportFrom) {
                  notify('Đến ngày không được trước từ ngày.', true);
                  return;
                }
                setReportTo(e.target.value);
              }}
              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              setReportDept('');
              setReportFrom('');
              setReportTo('');
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 ml-auto"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Đặt lại bộ lọc</span>
          </button>
        </div>
      </section>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 print-card">
          <span className="text-xs font-semibold uppercase text-slate-400">
            Số lượng bản ghi
          </span>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {data.rows.length} kết quả
          </div>
          <p className="text-xs text-slate-500 mt-1">Theo bộ lọc hiện tại</p>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 print-card">
          <span className="text-xs font-semibold uppercase text-slate-400">
            Phạm vi phòng ban
          </span>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {reportDept ? deptName(reportDept) : 'Toàn bộ đơn vị'}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Trong phạm vi phân quyền của tài khoản
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 print-card">
          <span className="text-xs font-semibold uppercase text-slate-400">
            Ngày lập báo cáo
          </span>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {formatDate(state.today)}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Người lập: {state.user.name}
          </p>
        </div>
      </div>

      {/* Report Table */}
      <section className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden print-card">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {REPORT_LABELS[reportType]}
            </h2>
            <p className="text-xs text-slate-500">
              Khoảng thời gian:{' '}
              {reportFrom ? formatDate(reportFrom) : 'Từ đầu dữ liệu'} →{' '}
              {reportTo ? formatDate(reportTo) : 'Mới nhất'}
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {data.rows.length} dòng
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold text-slate-500 uppercase">
                {data.headers.map((h) => (
                  <th key={h} className="py-3 px-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={data.headers.length}
                    className="py-10 text-center text-sm text-slate-400"
                  >
                    Không có dữ liệu phù hợp với tiêu chí lọc.
                  </td>
                </tr>
              ) : (
                data.rows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    {r.map((cell, cIdx) => (
                      <td key={cIdx} className="py-3 px-5 text-xs text-slate-700">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
