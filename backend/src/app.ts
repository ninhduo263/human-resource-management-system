import express, { Request, Response, NextFunction } from 'express';
import { authRouter } from './routes/auth.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { employeesRouter } from './routes/employees.routes.js';
import { catalogsRouter } from './routes/catalogs.routes.js';
import { contractsRouter } from './routes/contracts.routes.js';
import { assignmentsRouter } from './routes/assignments.routes.js';
import { leavesRouter } from './routes/leaves.routes.js';
import { fail } from './utils/validation.js';

export function createExpressApp() {
  const app = express();

  app.disable('x-powered-by');

  // Security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Origin check for state-changing requests
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      const origin = req.headers.origin;
      const host = req.headers.host;
      if (origin && host) {
        const allowed = new Set([
          `http://${host}`,
          `https://${host}`,
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
        ]);
        if (!allowed.has(origin)) {
          return next(Object.assign(new Error('Nguồn yêu cầu không hợp lệ.'), { status: 403 }));
        }
      }
      const contentType = req.headers['content-type'] || '';
      if (!contentType.startsWith('application/json')) {
        return next(Object.assign(new Error('Yêu cầu phải là JSON.'), { status: 415 }));
      }
    }
    next();
  });

  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/employees', employeesRouter);
  app.use('/api', catalogsRouter);
  app.use('/api/contracts', contractsRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api', leavesRouter);

  app.use('/api/*', (_req, _res, next) => {
    try {
      fail('Không tìm thấy chức năng.', 404);
    } catch (err) {
      next(err);
    }
  });

  // Global error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    let status = err.status || 500;
    let message = err.message || 'Có lỗi xử lý.';

    if (err.type === 'entity.parse.failed') {
      status = 400;
      message = 'Dữ liệu JSON không hợp lệ.';
    } else if (err.type === 'entity.too.large') {
      status = 413;
      message = 'Dữ liệu gửi lên quá lớn.';
    } else if (err.code === '23505' || /unique constraint|duplicate key/i.test(message)) {
      status = 409;
      message = 'Mã, tên danh mục, email hoặc tên đăng nhập đã tồn tại.';
    } else if (err.code === '23503' || /foreign key constraint/i.test(message)) {
      status = 409;
      message = 'Dữ liệu đang được sử dụng trong hồ sơ hoặc lịch sử; không thể xóa.';
    } else if (status === 500) {
      console.error('[Server Error]:', err);
      message = 'Có lỗi xử lý. Vui lòng kiểm tra lại hoặc thử lại.';
    }

    res.status(status).json({ error: message });
  });

  return app;
}
