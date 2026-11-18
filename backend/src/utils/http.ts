import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Bọc handler async để mọi lỗi được chuyển tới error handler chung. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export interface RequestContext {
  ip: string;
}

/** Lưu thông tin theo từng request (IP) để nhật ký kiểm toán đọc được mà không phải truyền tay. */
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function paramId(req: Request, name = 'id'): string {
  return decodeURIComponent(String(req.params[name]));
}
