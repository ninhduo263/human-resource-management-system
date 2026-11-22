import React, { useEffect, useRef, useState } from 'react';
import { Button, Input, Tag, Tooltip } from 'antd';
import { CloseOutlined, DeleteOutlined, RobotOutlined, SendOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { apiRequest } from '../api';
import { SessionUser } from '../types';
import { ROLE_NAMES } from '../utils/format';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
  error?: boolean;
}

const SUGGESTIONS: Record<SessionUser['VaiTro'], string[]> = {
  employee: ['Tôi còn bao nhiêu ngày phép?', 'Hợp đồng của tôi hết hạn khi nào?', 'Ngày lễ năm nay?'],
  manager: ['Có đơn nào chờ tôi duyệt không?', 'Ai trong phòng nghỉ tuần này?', 'Thống kê nhân sự phòng tôi'],
  director: ['Thống kê nhân sự toàn công ty', 'Đơn nào đang chờ tôi duyệt?', 'Hợp đồng nào sắp hết hạn?'],
  hr: ['Hợp đồng nào sắp hết hạn trong 30 ngày?', 'Việc cần xử lý của tôi', 'Ai nghỉ hôm nay?'],
  admin: ['Việc cần xử lý của tôi', 'Thống kê nhân sự theo phòng ban', 'Ai nghỉ trong tuần này?'],
};

/** Hiển thị markdown tối giản (đậm, gạch đầu dòng) bằng phần tử React — không dùng innerHTML. */
function renderText(text: string) {
  const inline = (s: string, key: number) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : part
    );
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`ul-${out.length}`} className="list-disc pl-4 my-1 space-y-0.5">{list}</ul>);
    list = [];
  };
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (m) {
      list.push(<li key={i}>{inline(m[1], i)}</li>);
    } else {
      flush();
      if (line.trim()) out.push(<p key={i} className="my-1">{inline(line.replace(/^#+\s*/, ''), i)}</p>);
    }
  });
  flush();
  return out;
}

export const AssistantChat: React.FC<{ user: SessionUser }> = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'ai' | 'offline' | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || mode) return;
    apiRequest<{ mode: 'ai' | 'offline' }>('/api/assistant/status')
      .then((r) => setMode(r.mode))
      .catch(() => setMode('offline'));
  }, [open, mode]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || sending) return;
    const history = [...messages.filter((m) => !m.error), { role: 'user' as const, content: q }];
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');
    setSending(true);
    try {
      const r = await apiRequest<{ reply: string; tools: string[]; mode: 'ai' | 'offline' }>('/api/assistant/chat', {
        messages: history.slice(-20).map(({ role, content }) => ({ role, content })),
      });
      setMode(r.mode);
      setMessages((prev) => [...prev, { role: 'assistant', content: r.reply, tools: r.tools }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: err.message || 'Không thể kết nối trợ lý.', error: true }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {!open && (
        <Tooltip title="Trợ lý HR" placement="left">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Mở Trợ lý HR"
            className="no-print fixed z-50 right-4 bottom-20 lg:bottom-6 h-14 w-14 rounded-2xl bg-[#0d392f] text-[#c9f3bd] shadow-xl flex items-center justify-center text-2xl hover:scale-105 transition-transform"
          >
            <RobotOutlined />
          </button>
        </Tooltip>
      )}

      {open && (
        <section
          aria-label="Trợ lý HR"
          className="no-print fixed z-50 inset-x-2 bottom-2 top-16 sm:inset-auto sm:right-4 sm:bottom-20 lg:bottom-6 sm:w-[400px] sm:h-[600px] sm:max-h-[calc(100vh-96px)] bg-white rounded-2xl shadow-2xl border border-[#e4e9e0] flex flex-col overflow-hidden"
        >
          <header className="bg-[#0d392f] text-white px-4 py-3 flex items-center gap-3">
            <span className="h-9 w-9 rounded-xl bg-[#c9f3bd] text-[#0d392f] flex items-center justify-center text-lg">
              <RobotOutlined />
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm leading-tight">Trợ lý PeopleOps</div>
              <div className="text-[11px] text-[#a9c4b7] flex items-center gap-1">
                {mode === 'ai' ? '● AI (Claude)' : mode === 'offline' ? '● Chế độ ngoại tuyến' : 'Đang kết nối…'}
              </div>
            </div>
            <Tooltip title="Xóa hội thoại">
              <Button type="text" size="small" icon={<DeleteOutlined />} className="!text-[#a9c4b7]" onClick={() => setMessages([])} />
            </Tooltip>
            <Button type="text" size="small" icon={<CloseOutlined />} className="!text-white" onClick={() => setOpen(false)} aria-label="Đóng" />
          </header>

          <div className="px-4 py-2 bg-[#f4f8ef] border-b border-[#e4e9e0] text-[11px] text-[#41584c] flex items-start gap-1.5">
            <SafetyCertificateOutlined className="text-[#155e4b] mt-0.5" />
            <span>
              Chỉ trả lời trong phạm vi quyền của <strong>{ROLE_NAMES[user.VaiTro]}</strong> — không thể sửa dữ liệu.
            </span>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-[#fbfcfa]">
            {messages.length === 0 && (
              <div className="text-center pt-4">
                <div className="text-sm font-semibold text-[#172b23]">Xin chào {user.HoTen.split(' ').slice(-1)[0]} 👋</div>
                <div className="text-xs text-[#5e7066] mt-1 mb-4">Hỏi mình về nghỉ phép, hợp đồng, nhân sự…</div>
                <div className="flex flex-col gap-2 items-stretch">
                  {SUGGESTIONS[user.VaiTro].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="text-left text-xs px-3 py-2 rounded-xl border border-[#dce6d2] bg-white hover:border-[#155e4b] hover:text-[#155e4b] transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#155e4b] text-white rounded-br-md'
                      : m.error
                      ? 'bg-rose-50 text-rose-700 border border-rose-200 rounded-bl-md'
                      : 'bg-white text-[#172b23] border border-[#e4e9e0] rounded-bl-md'
                  }`}
                >
                  {m.role === 'user' ? m.content : renderText(m.content)}
                  {!!m.tools?.length && (
                    <div className="mt-1.5 pt-1.5 border-t border-[#edf1e8] flex flex-wrap gap-1">
                      {m.tools.map((t) => (
                        <Tag key={t} bordered={false} className="!text-[10px] !m-0 !bg-[#eaf1e2] !text-[#155e4b]">
                          🔎 {t}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-[#e4e9e0] rounded-2xl rounded-bl-md px-3 py-2 text-xs text-[#5e7066]">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#155e4b] animate-bounce" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#155e4b] animate-bounce [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#155e4b] animate-bounce [animation-delay:240ms]" />
                  </span>
                  <span className="ml-2">Đang tra cứu dữ liệu…</span>
                </div>
              </div>
            )}
          </div>

          <form
            className="p-3 border-t border-[#e4e9e0] flex gap-2 items-end bg-white"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <Input.TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Nhập câu hỏi… (Enter để gửi)"
              autoSize={{ minRows: 1, maxRows: 4 }}
              maxLength={2000}
              disabled={sending}
            />
            <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={sending} disabled={!input.trim()} aria-label="Gửi" />
          </form>
        </section>
      )}
    </>
  );
};
