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
  Descriptions,
  Alert,
  Typography,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  DownloadOutlined,
  SearchOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { AppState, Assignment, Decision } from '../types';
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
  const [detailDecision, setDetailDecision] = useState<Decision | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeEmployees = state.employees.filter(
    (e) => ['Đang làm việc', 'Thử việc'].includes(e.TrangThai)
  );
  const [selectedEmpId, setSelectedEmpId] = useState(
    activeEmployees[0]?.MaNV || ''
  );
  const [newDeptId, setNewDeptId] = useState(state.departments[0]?.MaPB || '');
  const [newPosId, setNewPosId] = useState(state.positions[0]?.MaCV || '');
  const [moveType, setMoveType] = useState<string>('Điều chuyển');
  const [decisionNumber, setDecisionNumber] = useState('');
  const [signedDate, setSignedDate] = useState(state.today);
  const [effectiveDate, setEffectiveDate] = useState(state.today);
  const [signer, setSigner] = useState('Trần Hải Đăng');
  const [reason, setReason] = useState('');

  const emp = (id: string) => state.employees.find((e) => e.MaNV === id);
  const deptName = (id: string | null) =>
    state.departments.find((d) => d.MaPB === id)?.TenPB || id || 'Không thuộc phòng ban';
  const posName = (id: string) =>
    state.positions.find((p) => p.MaCV === id)?.TenCV || id;

  const filtered = state.assignments.filter((a) =>
    matchEmployeeQuery(emp(a.MaNV), search, deptFilter)
  );

  const handleOpenForm = () => {
    const first = activeEmployees[0];
    setSelectedEmpId(first?.MaNV || '');
    setNewDeptId(first?.MaPB || state.departments[0]?.MaPB || '');
    setNewPosId(first?.MaCV || state.positions[0]?.MaCV || '');
    setMoveType('Điều chuyển');
    setDecisionNumber('');
    setSignedDate(state.today);
    setEffectiveDate(state.today);
    setSigner('Trần Hải Đăng');
    setReason('');
    setFormError('');
    setFormOpen(true);
  };

  const updateSuggestedType = (empId: string, dId: string, pId: string) => {
    const e = emp(empId);
    if (!e) return;
    if (e.MaPB !== dId && e.MaCV !== pId) {
      setMoveType('Điều chuyển và bổ nhiệm');
    } else if (e.MaPB !== dId) {
      setMoveType('Điều chuyển');
    } else if (e.MaCV !== pId) {
      setMoveType('Bổ nhiệm');
    }
  };

  const handleSelectExistingDecision = (decId: string) => {
    const d = state.decisions.find((x) => x.MaQD === decId);
    if (!d) return;
    setDecisionNumber(d.SoQD);
    setMoveType(d.LoaiQD);
    setSignedDate(d.NgayKy);
    setEffectiveDate(d.NgayHieuLuc);
    setSigner(d.NguoiKy);
    setReason(d.NoiDung);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await apiRequest(
        '/api/assignments',
        {
          MaNV: selectedEmpId,
          LoaiBienDong: moveType,
          SoQD: decisionNumber,
          MaPBMoi: newDeptId,
          MaCVMoi: newPosId,
          NgayKy: signedDate,
          NgayHieuLuc: effectiveDate,
          NguoiKy: signer,
          LyDo: reason,
        },
        'POST'
      );
      setFormOpen(false);
      notify('Đã ghi nhận quyết định công tác và cập nhật hồ sơ nhân viên.');
      await onRefresh();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelAssignment = async (a: Assignment) => {
    const reason = window.prompt(
      a.TrangThai === 'Chờ hiệu lực'
        ? 'Lý do hủy quyết định chờ hiệu lực:'
        : 'Lý do hoàn tác quyết định (hồ sơ sẽ trở về phòng ban/chức vụ cũ):'
    );
    if (!reason || !reason.trim()) return;
    try {
      await apiRequest(
        `/api/assignments/${encodeURIComponent(a.MaQT)}/cancel`,
        { LyDoHuy: reason.trim() },
        'POST'
      );
      notify('Đã hủy quyết định công tác.');
      await onRefresh();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleExport = () => {
    downloadCsv(
      `peopleops-assignments-${state.today}.csv`,
      [
        'Nhân viên',
        'Loại biến động',
        'Phòng ban cũ',
        'Phòng ban mới',
        'Chức vụ cũ',
        'Chức vụ mới',
        'Ngày hiệu lực',
        'Số quyết định',
      ],
      filtered.map((a) => [
        emp(a.MaNV)?.HoTen || 'Nhân viên',
        a.LoaiBienDong,
        deptName(a.MaPBCu),
        deptName(a.MaPBMoi),
        posName(a.MaCVCu),
        posName(a.MaCVMoi),
        a.NgayHieuLuc,
        state.decisions.find((d) => d.MaQD === a.MaQD)?.SoQD ||
          a.MaQD,
      ])
    );
  };

  const columns = [
    {
      title: 'Nhân viên',
      key: 'employee',
      render: (_: unknown, a: Assignment) => {
        const e = emp(a.MaNV);
        return (
          <Space>
            <Avatar style={{ backgroundColor: getAvatarHex(e?.MaNV) }}>
              {getInitials(e?.HoTen)}
            </Avatar>
            <div>
              <div className="font-semibold text-slate-900">
                {e?.HoTen || 'Nhân viên'}
              </div>
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Loại biến động',
      dataIndex: 'LoaiBienDong',
      key: 'LoaiBienDong',
      render: (type: string) => <Tag color={getAntTagColor(type)}>{type}</Tag>,
    },
    {
      title: 'Phòng ban (Cũ → Mới)',
      key: 'dept',
      render: (_: unknown, a: Assignment) => (
        <span className="text-xs">
          <Text type="secondary">{deptName(a.MaPBCu)}</Text> →{' '}
          <strong>{deptName(a.MaPBMoi)}</strong>
        </span>
      ),
    },
    {
      title: 'Chức vụ (Cũ → Mới)',
      key: 'pos',
      render: (_: unknown, a: Assignment) => (
        <span className="text-xs">
          <Text type="secondary">{posName(a.MaCVCu)}</Text> →{' '}
          <strong>{posName(a.MaCVMoi)}</strong>
        </span>
      ),
    },
    {
      title: 'Ngày hiệu lực',
      dataIndex: 'NgayHieuLuc',
      key: 'NgayHieuLuc',
      render: (d: string) => formatDate(d),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_: unknown, a: Assignment) => {
        const status = a.TrangThai || 'Hiệu lực';
        return (
          <Tag color={status === 'Hiệu lực' ? 'success' : status === 'Chờ hiệu lực' ? 'warning' : 'default'}>
            {status}
          </Tag>
        );
      },
    },
    {
      title: 'Số quyết định',
      key: 'decision',
      render: (_: unknown, a: Assignment) => {
        const dec = state.decisions.find((d) => d.MaQD === a.MaQD);
        return <Text code>{dec?.SoQD || a.MaQD}</Text>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, a: Assignment) => {
        const dec = state.decisions.find((d) => d.MaQD === a.MaQD);
        const canCancel =
          ['admin', 'hr', 'director'].includes(state.user.VaiTro) && a.TrangThai !== 'Đã hủy';
        return (
          <Space size={0}>
            {dec && (
              <Button
                size="small"
                type="link"
                icon={<FileTextOutlined />}
                onClick={() => setDetailDecision(dec)}
              >
                Xem QĐ
              </Button>
            )}
            {canCancel && (
              <Button size="small" type="link" danger onClick={() => handleCancelAssignment(a)}>
                Hủy QĐ
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Title level={3} style={{ margin: '4px 0' }}>
            Quá trình công tác & Quyết định
          </Title>
          <Text type="secondary">
            Lưu vết điều chuyển phòng ban, bổ nhiệm chức vụ và quyết định nhân sự 1–N.
          </Text>
        </div>

        <Space className="no-print w-full sm:w-auto flex-wrap">
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Xuất lịch sử
          </Button>
          {canAssign(state.user.VaiTro) && (
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

      <Alert
        type="info"
        showIcon
        message="Mỗi thay đổi phòng ban hoặc chức vụ đều gắn với một Quyết định (QUYETDINH) và cập nhật đồng thời vào hồ sơ nhân viên trong cùng một giao dịch. Nhiều nhân viên có thể dùng chung một Quyết định (quan hệ 1–N)."
      />

      <Card bordered={false} className="shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <Text strong>Lịch sử biến động nhân sự ({filtered.length})</Text>
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
                  value: d.MaPB,
                  label: d.TenPB,
                })),
              ]}
            />
          </Space>
        </div>

        <Table
          rowKey="MaQT"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          size="middle"
          scroll={{ x: 850 }}
        />
      </Card>

      {/* Modal Ghi nhận công tác */}
      <Modal
        open={formOpen}
        title="Ghi nhận quá trình công tác & Quyết định"
        onCancel={() => setFormOpen(false)}
        footer={null}
        width={680}
      >
        <form onSubmit={handleSaveAssignment} className="space-y-4 mt-3">
          {formError && (
            <Alert type="error" showIcon message={formError} />
          )}

          {state.decisions.length > 0 && (
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="text-xs font-semibold text-slate-700 mb-1.5">
                Dùng chung Quyết định đã ban hành (Quan hệ ERD 1 Quyết định – Nhiều Quá trình công tác)
              </div>
              <Select
                className="w-full"
                placeholder="— Tạo quyết định mới hoặc chọn quyết định có sẵn để điền nhanh —"
                allowClear
                onChange={(val) => val && handleSelectExistingDecision(val)}
                options={state.decisions.map((d) => ({
                  value: d.MaQD,
                  label: `${d.SoQD} · ${d.LoaiQD} · Ngày HL: ${d.NgayHieuLuc} (Người ký: ${d.NguoiKy})`,
                }))}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nhân viên *
              </label>
              <Select
                value={selectedEmpId}
                onChange={(id) => {
                  setSelectedEmpId(id);
                  const target = emp(id);
                  if (target) {
                    setNewDeptId(target.MaPB || state.departments[0]?.MaPB || '');
                    setNewPosId(target.MaCV);
                  }
                }}
                className="w-full"
                options={activeEmployees.map((e) => ({
                  value: e.MaNV,
                  label: `${e.HoTen} (${e.Email}) (Hiện tại: ${deptName(
                    e.MaPB
                  )} · ${posName(e.MaCV)})`,
                }))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phòng ban mới *
              </label>
              <Select
                value={newDeptId}
                onChange={(val) => {
                  setNewDeptId(val);
                  updateSuggestedType(selectedEmpId, val, newPosId);
                }}
                className="w-full"
                options={state.departments.map((d) => ({
                  value: d.MaPB,
                  label: d.TenPB,
                }))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chức vụ mới *
              </label>
              <Select
                value={newPosId}
                onChange={(val) => {
                  setNewPosId(val);
                  updateSuggestedType(selectedEmpId, newDeptId, val);
                }}
                className="w-full"
                options={state.positions.map((p) => ({
                  value: p.MaCV,
                  label: p.TenCV,
                }))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Loại biến động *
              </label>
              <Select
                value={moveType}
                onChange={setMoveType}
                className="w-full"
                options={[
                  { value: 'Điều chuyển', label: 'Điều chuyển' },
                  { value: 'Bổ nhiệm', label: 'Bổ nhiệm' },
                  { value: 'Miễn nhiệm', label: 'Miễn nhiệm' },
                  {
                    value: 'Điều chuyển và bổ nhiệm',
                    label: 'Điều chuyển và bổ nhiệm',
                  },
                ]}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số quyết định *
              </label>
              <Input
                required
                value={decisionNumber}
                onChange={(e) => setDecisionNumber(e.target.value)}
                placeholder="VD: 02/2026/QD-NS"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày ký quyết định *
              </label>
              <Input
                type="date"
                required
                max={state.today}
                value={signedDate}
                onChange={(e) => setSignedDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày hiệu lực *
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
                Người ký quyết định *
              </label>
              <Input
                required
                value={signer}
                onChange={(e) => setSigner(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nội dung quyết định / Lý do biến động *
              </label>
              <Input.TextArea
                rows={3}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setFormOpen(false)}>Đóng</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Lưu quyết định & Cập nhật hồ sơ
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Chi tiết Quyết định */}
      <Modal
        open={!!detailDecision}
        title="Chi tiết Quyết định nhân sự (Thực thể QUYETDINH)"
        onCancel={() => setDetailDecision(null)}
        width={640}
        footer={
          <Button onClick={() => setDetailDecision(null)}>Đóng</Button>
        }
      >
        {detailDecision && (
          <div className="space-y-4">
            <Descriptions
              bordered
              size="small"
              column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
            >
              <Descriptions.Item label="Mã bản ghi">
                <Text code>{detailDecision.MaQD}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Số quyết định">
                <Text code>{detailDecision.SoQD}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Loại quyết định">
                {detailDecision.LoaiQD}
              </Descriptions.Item>
              <Descriptions.Item label="Người ký">
                {detailDecision.NguoiKy}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày ký">
                {formatDate(detailDecision.NgayKy)}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày hiệu lực">
                {formatDate(detailDecision.NgayHieuLuc)}
              </Descriptions.Item>
              <Descriptions.Item label="Nội dung" span={2}>
                {detailDecision.NoiDung}
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" plain>
              Nhân sự áp dụng theo quyết định này
            </Divider>
            <div className="space-y-2">
              {state.assignments
                .filter((a) => a.MaQD === detailDecision.MaQD)
                .map((a) => (
                  <Card key={a.MaQT} size="small">
                    <div className="flex justify-between text-xs">
                      <strong>
                        {emp(a.MaNV)?.HoTen || 'Nhân viên'}
                      </strong>
                      <Text type="secondary">
                        {deptName(a.MaPBCu)} →{' '}
                        {deptName(a.MaPBMoi)} |{' '}
                        {posName(a.MaCVCu)} →{' '}
                        {posName(a.MaCVMoi)}
                      </Text>
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
