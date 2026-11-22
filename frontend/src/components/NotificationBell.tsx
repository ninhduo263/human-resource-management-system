import React, { useEffect, useState } from 'react';
import { Badge, Button, Empty, Popover, Tooltip } from 'antd';
import {
  BellOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { AppAlert, AlertSeverity, RouteKey } from '../types';

const STYLE: Record<AlertSeverity, { icon: React.ReactNode; cls: string }> = {
  danger: { icon: <ExclamationCircleOutlined />, cls: 'text-rose-600 bg-rose-50' },
  warning: { icon: <ClockCircleOutlined />, cls: 'text-amber-600 bg-amber-50' },
  info: { icon: <InfoCircleOutlined />, cls: 'text-sky-600 bg-sky-50' },
  success: { icon: <CheckCircleOutlined />, cls: 'text-[#155e4b] bg-[#eaf1e2]' },
};

export const AlertIcon: React.FC<{ severity: AlertSeverity }> = ({ severity }) => (
  <span className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${STYLE[severity].cls}`}>
    {STYLE[severity].icon}
  </span>
);

/** Lưu danh sách id đã đọc theo tài khoản (chỉ là tiện ích trên trình duyệt này). */
function useReadIds(userKey: string) {
  const storageKey = `peopleops:alerts-read:${userKey}`;
  const [read, setRead] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
    } catch {
      return new Set();
    }
  });
  const save = (next: Set<string>) => {
    setRead(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next].slice(-500)));
    } catch {
      // bỏ qua (chế độ ẩn danh / chặn lưu trữ)
    }
  };
  return { read, save };
}

interface NotificationBellProps {
  alerts: AppAlert[];
  userKey: string;
  live: boolean;
  onNavigate: (route: RouteKey) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ alerts, userKey, live, onNavigate }) => {
  const [open, setOpen] = useState(false);
  const { read, save } = useReadIds(userKey);
  const unread = alerts.filter((a) => !read.has(a.id));

  // Dọn các id không còn tồn tại để localStorage không phình mãi.
  useEffect(() => {
    const ids = new Set(alerts.map((a) => a.id));
    const kept = new Set([...read].filter((id) => ids.has(id)));
    if (kept.size !== read.size) save(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts]);

  const content = (
    <div className="w-[min(92vw,380px)]">
      <div className="flex items-center justify-between pb-2 mb-1 border-b border-[#edf1e8]">
        <div>
          <strong className="text-sm text-[#172b23]">Thông báo</strong>
          <span className="ml-2 text-xs text-[#5e7066]">{unread.length} chưa đọc</span>
        </div>
        <Button
          type="link"
          size="small"
          icon={<CheckOutlined />}
          disabled={!unread.length}
          onClick={() => save(new Set(alerts.map((a) => a.id)))}
        >
          Đọc tất cả
        </Button>
      </div>
      {alerts.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có thông báo nào" />
      ) : (
        <div className="max-h-[60vh] overflow-y-auto -mx-1">
          {alerts.map((a) => {
            const isUnread = !read.has(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  save(new Set([...read, a.id]));
                  setOpen(false);
                  onNavigate(a.route);
                }}
                className={`w-full text-left flex gap-2.5 p-2 mx-1 rounded-lg hover:bg-[#f4f8ef] transition-colors ${
                  isUnread ? '' : 'opacity-60'
                }`}
              >
                <AlertIcon severity={a.severity} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[#172b23] flex items-center gap-1.5">
                    <span className="truncate">{a.title}</span>
                    {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-[#155e4b] shrink-0" />}
                  </div>
                  <div className="text-[11px] text-[#5e7066] line-clamp-2">{a.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="pt-2 mt-1 border-t border-[#edf1e8] text-[11px] text-[#8a9a90] flex items-center gap-1.5">
        <WifiOutlined className={live ? 'text-[#155e4b]' : 'text-slate-400'} />
        {live ? 'Đang cập nhật theo thời gian thực' : 'Mất kết nối thời gian thực — đang thử lại'}
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={setOpen} placement="bottomRight" arrow={false}>
      <Tooltip title="Thông báo" open={open ? false : undefined}>
        <Badge count={unread.length} size="small" overflowCount={99}>
          <Button type="text" shape="circle" icon={<BellOutlined />} aria-label="Thông báo" />
        </Badge>
      </Tooltip>
    </Popover>
  );
};
