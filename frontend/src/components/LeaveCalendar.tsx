import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, Badge, Calendar, Empty, Grid, Segmented, Space, Tag, Tooltip, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { AppState, LeaveRequest } from '../types';
import { apiRequest } from '../api';
import { formatDate, getAvatarHex, getInitials, matchEmployeeQuery } from '../utils/format';

const { Text } = Typography;

interface Holiday {
  Ngay: string;
  TenNgayLe: string;
}

interface LeaveCalendarProps {
  state: AppState;
  search: string;
  deptFilter: string;
  onOpenLeave: (l: LeaveRequest) => void;
}

const shortName = (name?: string) => (name ? name.trim().split(/\s+/).slice(-2).join(' ') : '?');

/** Những người khác cùng phòng có lịch nghỉ trùng khoảng ngày của một đơn (dùng khi duyệt). */
export function findOverlaps(state: AppState, leave: LeaveRequest): LeaveRequest[] {
  const emp = state.employees.find((e) => e.MaNV === leave.MaNV);
  return state.leaves.filter((l) => {
    if (l.MaDon === leave.MaDon || l.MaNV === leave.MaNV) return false;
    if (l.TrangThai !== 'Đã duyệt' && l.TrangThai !== 'Chờ duyệt') return false;
    const other = state.employees.find((e) => e.MaNV === l.MaNV);
    if (!other || !emp || other.MaPB !== emp.MaPB) return false;
    return l.TuNgay <= leave.DenNgay && l.DenNgay >= leave.TuNgay;
  });
}

export const LeaveCalendar: React.FC<LeaveCalendarProps> = ({ state, search, deptFilter, onOpenLeave }) => {
  const screens = Grid.useBreakpoint();
  const [value, setValue] = useState<Dayjs>(dayjs(state.today));
  const [selected, setSelected] = useState<string>(state.today);
  const [show, setShow] = useState<'all' | 'approved'>('all');
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  const year = value.year();

  useEffect(() => {
    let alive = true;
    apiRequest<Holiday[]>(`/api/holidays?year=${year}`)
      .then((rows) => {
        if (!alive) return;
        const map: Record<string, string> = {};
        rows.forEach((h) => (map[String(h.Ngay).slice(0, 10)] = h.TenNgayLe));
        setHolidays(map);
      })
      .catch(() => alive && setHolidays({}));
    return () => {
      alive = false;
    };
  }, [year]);

  const emp = (id: string) => state.employees.find((e) => e.MaNV === id);
  const leaveTypeName = (id: string) => state.leaveTypes.find((t) => t.MaLoai === id)?.TenLoai || id;

  const visible = useMemo(
    () =>
      state.leaves.filter(
        (l) =>
          (l.TrangThai === 'Đã duyệt' || (show === 'all' && l.TrangThai === 'Chờ duyệt')) &&
          matchEmployeeQuery(emp(l.MaNV), search, deptFilter)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.leaves, state.employees, show, search, deptFilter]
  );

  const leavesOn = (day: string) => {
    const d = dayjs(day);
    if (d.day() === 0 || d.day() === 6 || holidays[day]) return [];
    return visible.filter((l) => l.TuNgay <= day && l.DenNgay >= day);
  };

  // Thống kê tháng đang xem: ngày đông người nghỉ nhất.
  const monthStats = useMemo(() => {
    const start = value.startOf('month');
    let peak = { day: '', count: 0 };
    const people = new Set<string>();
    for (let i = 0; i < value.daysInMonth(); i++) {
      const day = start.add(i, 'day').format('YYYY-MM-DD');
      const list = leavesOn(day);
      list.forEach((l) => people.add(l.MaNV));
      if (list.length > peak.count) peak = { day, count: list.length };
    }
    return { peak, people: people.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, visible, holidays]);

  const cellRender = (current: Dayjs, info: { type: string; originNode: React.ReactNode }) => {
    if (info.type !== 'date') return info.originNode;
    const day = current.format('YYYY-MM-DD');
    const holiday = holidays[day];
    const list = leavesOn(day);
    if (!screens.md) {
      return list.length || holiday ? (
        <div className="flex justify-center gap-0.5 mt-0.5">
          {holiday && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
          {list.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[#155e4b]" />}
        </div>
      ) : null;
    }
    return (
      <div className="space-y-0.5">
        {holiday && (
          <div className="text-[10px] font-semibold text-rose-600 truncate" title={holiday}>
            🎌 {holiday}
          </div>
        )}
        {list.slice(0, 3).map((l) => (
          <Tooltip key={l.MaDon} title={`${emp(l.MaNV)?.HoTen} · ${leaveTypeName(l.MaLoai)} · ${l.TrangThai}`}>
            <div
              onClick={(ev) => {
                ev.stopPropagation();
                onOpenLeave(l);
              }}
              className={`text-[11px] leading-4 px-1.5 rounded truncate cursor-pointer ${
                l.TrangThai === 'Đã duyệt'
                  ? 'bg-[#e3f1e6] text-[#0d392f]'
                  : 'bg-amber-50 text-amber-800 border border-dashed border-amber-300'
              }`}
            >
              {shortName(emp(l.MaNV)?.HoTen)}
            </div>
          </Tooltip>
        ))}
        {list.length > 3 && <div className="text-[10px] text-[#5e7066]">+{list.length - 3} người khác</div>}
      </div>
    );
  };

  const selectedList = leavesOn(selected);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <Space wrap size="middle">
          <Segmented
            value={show}
            onChange={(v) => setShow(v as 'all' | 'approved')}
            options={[
              { value: 'all', label: 'Đã duyệt + chờ duyệt' },
              { value: 'approved', label: 'Chỉ đã duyệt' },
            ]}
          />
          <Space size={12} className="text-xs text-[#5e7066]">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-[#e3f1e6] inline-block" /> Đã duyệt
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-amber-50 border border-dashed border-amber-300 inline-block" /> Chờ duyệt
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-rose-100 inline-block" /> Ngày lễ
            </span>
          </Space>
        </Space>
        <Text type="secondary" className="text-xs">
          Tháng {value.format('MM/YYYY')}: <strong>{monthStats.people}</strong> người có lịch nghỉ
          {monthStats.peak.count > 1 && (
            <>
              {' '}
              · đông nhất <strong>{formatDate(monthStats.peak.day)}</strong> ({monthStats.peak.count} người)
            </>
          )}
        </Text>
      </div>

      <div className="leave-calendar rounded-xl border border-[#e4e9e0] overflow-hidden">
        <Calendar
          value={value}
          fullscreen={!!screens.md}
          onPanelChange={(d) => setValue(d)}
          onSelect={(d) => {
            setValue(d);
            setSelected(d.format('YYYY-MM-DD'));
          }}
          cellRender={cellRender}
        />
      </div>

      <div className="rounded-xl bg-[#f6f7f3] border border-[#e4e9e0] p-4">
        <div className="flex items-center justify-between mb-3">
          <strong className="text-sm text-[#172b23]">
            Lịch nghỉ ngày {formatDate(selected)}
            {holidays[selected] && <Tag color="red" className="ml-2">{holidays[selected]}</Tag>}
          </strong>
          <Badge count={selectedList.length} showZero color="#155e4b" />
        </div>
        {selectedList.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={holidays[selected] ? 'Ngày lễ — toàn công ty nghỉ' : 'Không có ai nghỉ ngày này'}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {selectedList.map((l) => {
              const e = emp(l.MaNV);
              return (
                <button
                  type="button"
                  key={l.MaDon}
                  onClick={() => onOpenLeave(l)}
                  className="text-left flex items-center gap-2.5 bg-white rounded-lg border border-[#e4e9e0] p-2.5 hover:border-[#9fbfae] transition-colors"
                >
                  <Avatar size="small" style={{ backgroundColor: getAvatarHex(e?.MaNV) }}>
                    {getInitials(e?.HoTen)}
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[#172b23] truncate">{e?.HoTen}</div>
                    <div className="text-[11px] text-[#5e7066] truncate">
                      {leaveTypeName(l.MaLoai)} · {formatDate(l.TuNgay)} – {formatDate(l.DenNgay)}
                    </div>
                  </div>
                  <Tag color={l.TrangThai === 'Đã duyệt' ? 'success' : 'warning'} className="m-0">
                    {l.TrangThai}
                  </Tag>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
