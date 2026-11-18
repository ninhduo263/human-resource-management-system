import { Router } from 'express';
import { DbExecutor, auditLog, diffFields, withTransaction } from '../db/pool.js';
import { nextBusinessId } from '../utils/business-id.js';
import { existsInTable, requireAuth, requireRole } from '../middleware/auth.js';
import { choice, date, fail, numeric, optional, text } from '../utils/validation.js';
import { asyncHandler, paramId } from '../utils/http.js';

export const catalogsRouter = Router();

catalogsRouter.use(requireAuth);

const CATALOG_ROLES = ['employee', 'manager', 'director'] as const;

function readFlag(b: Record<string, unknown>, k: string, fallback: boolean): boolean {
  const v = b[k];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== 'boolean') fail(`Giá trị ${k} không hợp lệ.`);
  return v;
}

async function readHead(
  tx: DbExecutor,
  b: Record<string, unknown>,
  mapb: string,
  current: string | null
): Promise<string | null> {
  if (!('matruongphong' in b)) return current;
  if (b.matruongphong === null || b.matruongphong === '') return null;
  const head = await existsInTable<any>(tx, 'nhanvien', text(b, 'matruongphong'));
  if (head.mapb !== mapb) {
    fail('Trưởng phòng phải là nhân viên thuộc chính phòng ban này.');
  }
  if (['Đã lưu trữ', 'Đã nghỉ việc'].includes(head.trangthai)) {
    fail('Trưởng phòng phải là nhân viên đang làm việc.');
  }
  return head.manv;
}

async function usageSummary(tx: DbExecutor, parts: [string, string, any[]][]): Promise<string[]> {
  const used: string[] = [];
  for (const [label, sql, params] of parts) {
    const row = await tx.one<{ n: string }>(sql, params);
    if (Number(row?.n ?? 0) > 0) used.push(`${row!.n} ${label}`);
  }
  return used;
}

// 2.1 Quản lý phòng ban
catalogsRouter.post(
  '/departments',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const b = req.body;
    const tenpb = text(b, 'tenpb', 120);
    const mota = optional(b, 'mota');
    const ngaythanhlap = date(b, 'ngaythanhlap');

    const mapb = await withTransaction(async (tx) => {
      const mapb = await nextBusinessId(tx, 'phongban');
      await tx.run('INSERT INTO phongban(mapb, tenpb, mota, ngaythanhlap) VALUES($1, $2, $3, $4)', [
        mapb,
        tenpb,
        mota,
        ngaythanhlap,
      ]);
      await auditLog(tx, u.matk, 'Thêm phòng ban', mapb);
      return mapb;
    });
    res.status(201).json({ ok: true, id: mapb });
  })
);

catalogsRouter.put(
  '/departments/:id',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);
    const b = req.body;
    const tenpb = text(b, 'tenpb', 120);
    const mota = optional(b, 'mota');
    const ngaythanhlap = date(b, 'ngaythanhlap');

    await withTransaction(async (tx) => {
      const old = await existsInTable<any>(tx, 'phongban', rid);
      const hoatdong = readFlag(b, 'hoatdong', old.hoatdong);
      const matruongphong = await readHead(tx, b, rid, old.matruongphong);
      await tx.run(
        `UPDATE phongban SET tenpb = $1, mota = $2, ngaythanhlap = $3, hoatdong = $4, matruongphong = $5
         WHERE mapb = $6`,
        [tenpb, mota, ngaythanhlap, hoatdong, matruongphong, rid]
      );
      await auditLog(
        tx,
        u.matk,
        'Cập nhật phòng ban',
        rid,
        diffFields(old, { tenpb, mota, ngaythanhlap, hoatdong, matruongphong })
      );
    });
    res.json({ ok: true });
  })
);

catalogsRouter.delete(
  '/departments/:id',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);

    await withTransaction(async (tx) => {
      await existsInTable(tx, 'phongban', rid);
      const used = await usageSummary(tx, [
        ['nhân viên', 'SELECT COUNT(*) AS n FROM nhanvien WHERE mapb = $1', [rid]],
        [
          'quyết định công tác',
          'SELECT COUNT(*) AS n FROM quatrinhcongtac WHERE mapbcu = $1 OR mapbmoi = $1',
          [rid],
        ],
      ]);
      if (used.length) {
        fail(
          `Phòng ban đang được sử dụng (${used.join(', ')}). Hãy chuyển nhân sự đi hoặc chuyển sang trạng thái ngừng sử dụng.`,
          409
        );
      }
      await tx.run('DELETE FROM phongban WHERE mapb = $1', [rid]);
      await auditLog(tx, u.matk, 'Xóa phòng ban', rid);
    });
    res.json({ ok: true });
  })
);

// 2.2 Quản lý chức vụ
function readPosition(b: Record<string, unknown>, oldRow?: any) {
  const capbac =
    b.capbac !== undefined && b.capbac !== null && b.capbac !== ''
      ? numeric(b, 'capbac', 1, 10)
      : oldRow?.capbac ?? 2;
  if (!Number.isInteger(capbac)) fail('Cấp bậc phải là số nguyên.');
  const vaitromacdinh =
    b.vaitromacdinh === undefined
      ? oldRow?.vaitromacdinh ?? null
      : b.vaitromacdinh === null || b.vaitromacdinh === ''
      ? null
      : choice(b, 'vaitromacdinh', CATALOG_ROLES);
  return {
    tencv: text(b, 'tencv', 120),
    mota: optional(b, 'mota'),
    capbac,
    ladieuhanh: readFlag(b, 'ladieuhanh', oldRow?.ladieuhanh ?? false),
    vaitromacdinh,
    hoatdong: readFlag(b, 'hoatdong', oldRow?.hoatdong ?? true),
  };
}

catalogsRouter.post(
  '/positions',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const p = readPosition(req.body);

    const macv = await withTransaction(async (tx) => {
      const macv = await nextBusinessId(tx, 'chucvu');
      await tx.run(
        `INSERT INTO chucvu(macv, tencv, mota, capbac, ladieuhanh, vaitromacdinh, hoatdong)
         VALUES($1, $2, $3, $4, $5, $6, $7)`,
        [macv, p.tencv, p.mota, p.capbac, p.ladieuhanh, p.vaitromacdinh, p.hoatdong]
      );
      await auditLog(tx, u.matk, 'Thêm chức vụ', macv);
      return macv;
    });
    res.status(201).json({ ok: true, id: macv });
  })
);

catalogsRouter.put(
  '/positions/:id',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);

    await withTransaction(async (tx) => {
      const old = await existsInTable<any>(tx, 'chucvu', rid);
      const p = readPosition(req.body, old);
      await tx.run(
        `UPDATE chucvu SET tencv = $1, mota = $2, capbac = $3, ladieuhanh = $4,
                vaitromacdinh = $5, hoatdong = $6 WHERE macv = $7`,
        [p.tencv, p.mota, p.capbac, p.ladieuhanh, p.vaitromacdinh, p.hoatdong, rid]
      );
      await auditLog(tx, u.matk, 'Cập nhật chức vụ', rid, diffFields(old, p));
    });
    res.json({ ok: true });
  })
);

catalogsRouter.delete(
  '/positions/:id',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);

    await withTransaction(async (tx) => {
      await existsInTable(tx, 'chucvu', rid);
      const used = await usageSummary(tx, [
        ['nhân viên', 'SELECT COUNT(*) AS n FROM nhanvien WHERE macv = $1', [rid]],
        [
          'quyết định công tác',
          'SELECT COUNT(*) AS n FROM quatrinhcongtac WHERE macvcu = $1 OR macvmoi = $1',
          [rid],
        ],
      ]);
      if (used.length) {
        fail(
          `Chức vụ đang được sử dụng (${used.join(', ')}). Hãy chuyển sang trạng thái ngừng sử dụng.`,
          409
        );
      }
      await tx.run('DELETE FROM chucvu WHERE macv = $1', [rid]);
      await auditLog(tx, u.matk, 'Xóa chức vụ', rid);
    });
    res.json({ ok: true });
  })
);
