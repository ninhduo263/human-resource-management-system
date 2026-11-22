import type { Request, Response } from 'express';

/**
 * Kênh thông báo thời gian thực bằng Server-Sent Events (SSE).
 * Sự kiện CHỈ báo "dữ liệu phân hệ X vừa thay đổi" — không mang dữ liệu nghiệp vụ.
 * Trình duyệt nhận được sẽ tự gọi lại /api/state, nên mỗi người vẫn chỉ thấy dữ liệu
 * trong phạm vi quyền của mình (không rò rỉ dữ liệu qua kênh đẩy).
 */
const clients = new Set<Response>();
const MAX_CLIENTS = 1000;

const heartbeat = setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25_000);
heartbeat.unref();

export function openEventStream(req: Request, res: Response): void {
  if (clients.size >= MAX_CLIENTS) {
    res.status(503).json({ error: 'Máy chủ đang quá tải kết nối thời gian thực.' });
    return;
  }
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // tắt bộ đệm của nginx
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  res.write(`event: ready\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

export function broadcastChange(topic: string): void {
  const payload = `event: changed\ndata: ${JSON.stringify({ topic, at: Date.now() })}\n\n`;
  for (const res of clients) res.write(payload);
}
