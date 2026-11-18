import React, { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Input,
  Select,
  Modal,
  Space,
  Avatar,
  Alert,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  DownloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { AppState, Assignment } from '../types';
import { apiRequest } from '../api';
import {
  canAssign,
  downloadCsv,
  formatDate,
  getAntTagColor,
  getAvatarHex,
  getInitials,
  matchEmployeeQuery,
} from '../utils/format';

const { Title, Text } = Typography;

interface AssignmentsViewProps {
  state: AppState;
  onRefresh: () => Promise<void>;
  notify: (msg: string, isError?: boolean) => void;
}

export const AssignmentsView: React.FC<AssignmentsViewProps> = ({
  state,
  onRefresh,
  notify,
}) => {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeEmployees = state.employees.filter(
    (e) => ['Đang làm việc', 'Thử việc'].includes(e.status)
  );
  const [selectedEmpId, setSelectedEmpId] = useState(
    activeEmployees[0]?.id || ''
  );
  const [newDeptId, setNewDeptId] = useState(state.departments[0]?.id || '');
  const [newPosId, setNewPosId] = useState(state.positions[0]?.id || '');
  const [moveType, setMoveType] = useState<string>('Điều chuyển');
  const [effectiveDate, setEffectiveDate] = useState(state.today);
  const [reason, setReason] = useState('');

  const emp = (id: string) => state.employees.find((e) => e.id === id);
  const deptName = (id: string | null) =>
    state.departments.find((d) => d.id === id)?.name || id || 'Không thuộc phòng ban';
  const posName = (id: string) =>
    state.positions.find((p) => p.id === id)?.name || id;

  const filtered = state.assignments.filter((a) =>
    matchEmployeeQuery(emp(a.employee_id), search, deptFilter)
  );

  const handleOpenForm = () => {
    const first = activeEmployees[0];
    setSelectedEmpId(first?.id || '');
    setNewDeptId(first?.department_id || state.departments[0]?.id || '');
    setNewPosId(first?.position_id || state.positions[0]?.id || '');
    setMoveType('Điều chuyển');
    setEffectiveDate(state.today);
    setReason('');
    setFormError('');
    setFormOpen(true);
  };

  const updateSuggestedType = (empId: string, dId: string, pId: string) => {
    const e = emp(empId);
    if (!e) return;
    if (e.department_id !== dId && e.position_id !== pId) {
      setMoveType('Điều chuyển và bổ nhiệm');
    } else if (e.department_id !== dId) {
      setMoveType('Điều chuyển');
    } else if (e.position_id !== pId) {
      setMoveType('Bổ nhiệm');
    }
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest(
        '/api/assignments',
        {
          employee_id: selectedEmpId,
          type: moveType,
          new_department_id: newDeptId,
          new_position_id: newPosId,
          effective_date: effectiveDate,
          reason,
        },
        'POST'
      );
      setFormOpen(false);
      notify('Đã ghi nhận quá trình công tác và cập nhật hồ sơ nhân viên.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    downloadCsv(
      `peopleops-quatrinhcongtac-${state.today}.csv`,
      [
        'Mã QT (MaQT)',
        'Nhân viên (MaNV)',
        'Loại sự kiện (LoaiSuKien)',
        'Phòng ban chuyển đến (MaPB)',
        'Chức vụ bổ nhiệm (MaCV)',
        'Ngày hiệu lực (NgayHieuLuc)',
        'Ghi chú (GhiChu)',
      ],
      filtered.map((a) => [
        a.id,
        emp(a.employee_id)?.name || a.employee_id,
        a.type,
        deptName(a.new_department_id),
        posName(a.new_position_id),
        a.effective_date,
        a.reason,
      ])
    );
  };

  const columns = [
    {
      title: 'Mã QT (MaQT)',
      dataIndex: 'id',
      key: 'id',
      width: 110,
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: 'Nhân viên (MaNV)',
      key: 'employee',
      render: (_: unknown, a: Assignment) => {
        const e = emp(a.employee_id);
        return (
          <Space>
            <Avatar style={{ backgroundColor: getAvatarHex(e?.id) }}>
              {getInitials(e?.name)}
            </Avatar>
            <div>
              <div className="font-semibold text-slate-900">
                {e?.name || a.employee_id}
              </div>
              <div className="text-xs text-slate-400">{a.employee_id}</div>
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Loại sự kiện (LoaiSuKien)',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Tag color={getAntTagColor(type)}>{type}</Tag>,
    },
    {
      title: 'Phòng ban chuyển đến (MaPB)',
      key: 'dept',
      render: (_: unknown, a: Assignment) => (
        <strong>{deptName(a.new_department_id)}</strong>
      ),
    },
    {
      title: 'Chức vụ bổ nhiệm (MaCV)',
      key: 'pos',
      render: (_: unknown, a: Assignment) => (
        <strong>{posName(a.new_position_id)}</strong>
      ),
    },
    {
      title: 'Ngày hiệu lực (NgayHieuLuc)',
      dataIndex: 'effective_date',
      key: 'effective_date',
      render: (d: string) => formatDate(d),
    },
    {
      title: 'Ghi chú (GhiChu)',
      dataIndex: 'reason',
      key: 'reason',
      render: (r: string) => (
        <span className="text-xs text-slate-600">{r || '—'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Title level={3} style={{ margin: '4px 0' }}>
            Quá trình công tác
          </Title>
          <Text type="secondary">
            Ghi nhận quá trình công tác (4.1), phân bổ nhân sự (2.3) và bổ nhiệm chức vụ (2.4) theo thực thể QUATRINHCONGTAC.
          </Text>
        </div>

        <Space className="no-print w-full sm:w-auto flex-wrap">
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Xuất lịch sử
          </Button>
          {canAssign(state.user.role) && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenForm}
            >
              Ghi nhận công tác
            </Button>
          )}
        </Space>
      </div>

      <Card bordered={false} className="shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <Text strong>Lịch sử quá trình công tác ({filtered.length})</Text>
          <Space wrap className="w-full sm:w-auto">
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

      {/* Modal Ghi nhận quá trình công tác (Thực thể QUATRINHCONGTAC) */}
      <Modal
        open={formOpen}
        title="Ghi nhận quá trình công tác (QUATRINHCONGTAC)"
        onCancel={() => setFormOpen(false)}
        footer={null}
        width={620}
      >
        <form onSubmit={handleSaveAssignment} className="space-y-4 mt-3">
          {formError && (
            <Alert type="error" showIcon message={formError} />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nhân viên (MaNV) *
              </label>
              <Select
                value={selectedEmpId}
                onChange={(id) => {
                  setSelectedEmpId(id);
                  const target = emp(id);
                  if (target) {
                    setNewDeptId(target.department_id || state.departments[0]?.id || '');
                    setNewPosId(target.position_id);
                  }
                }}
                className="w-full"
                options={activeEmployees.map((e) => ({
                  value: e.id,
                  label: `${e.name} (${e.id}) — Hiện tại: ${deptName(
                    e.department_id
                  )} · ${posName(e.position_id)}`,
                }))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phòng ban chuyển đến (MaPB) *
              </label>
              <Select
                value={newDeptId}
                onChange={(val) => {
                  setNewDeptId(val);
                  updateSuggestedType(selectedEmpId, val, newPosId);
                }}
                className="w-full"
                options={state.departments.map((d) => ({
                  value: d.id,
                  label: d.name,
                }))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chức vụ bổ nhiệm (MaCV) *
              </label>
              <Select
                value={newPosId}
                onChange={(val) => {
                  setNewPosId(val);
                  updateSuggestedType(selectedEmpId, newDeptId, val);
                }}
                className="w-full"
                options={state.positions.map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Loại sự kiện (LoaiSuKien) *
              </label>
              <Select
                value={moveType}
                onChange={setMoveType}
                className="w-full"
                options={[
                  { value: 'Điều chuyển', label: 'Điều chuyển (Phân bổ nhân sự 2.3)' },
                  { value: 'Bổ nhiệm', label: 'Bổ nhiệm chức vụ (2.4)' },
                  { value: 'Điều chuyển và bổ nhiệm', label: 'Điều chuyển và bổ nhiệm' },
                ]}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày hiệu lực (NgayHieuLuc) *
              </label>
              <Input
                type="date"
                required
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ghi chú (GhiChu) *
              </label>
              <Input.TextArea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ghi chú nội dung điều chuyển phòng ban hoặc bổ nhiệm chức vụ..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setFormOpen(false)}>Đóng</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Lưu quá trình công tác
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
