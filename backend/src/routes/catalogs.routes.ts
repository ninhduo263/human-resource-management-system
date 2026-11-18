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
  MaPB: string,
  current: string | null
): Promise<string | null> {
  if (!('MaTruongPhong' in b)) return current;
  if (b.MaTruongPhong === null || b.MaTruongPhong === '') return null;
  const head = await existsInTable<any>(tx, 'NHANVIEN', text(b, 'MaTruongPhong'));
  if (head.MaPB !== MaPB) {
    fail('Trưởng phòng phải là nhân viên thuộc chính phòng ban này.');
  }
  if (['Đã lưu trữ', 'Đã nghỉ việc'].includes(head.TrangThai)) {
    fail('Trưởng phòng phải là nhân viên đang làm việc.');
  }
  return head.MaNV;
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
    const TenPB = text(b, 'TenPB', 120);
    const MoTa = optional(b, 'MoTa');
    const NgayThanhLap = date(b, 'NgayThanhLap');

    const MaPB = await withTransaction(async (tx) => {
      const MaPB = await nextBusinessId(tx, 'PHONGBAN');
      await tx.run('INSERT INTO "PHONGBAN"("MaPB", "TenPB", "MoTa", "NgayThanhLap") VALUES($1, $2, $3, $4)', [
        MaPB,
        TenPB,
        MoTa,
        NgayThanhLap,
      ]);
      await auditLog(tx, u.MaTK, 'Thêm phòng ban', MaPB);
      return MaPB;
    });
    res.status(201).json({ ok: true, id: MaPB });
  })
);

catalogsRouter.put(
  '/departments/:id',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);
    const b = req.body;
    const TenPB = text(b, 'TenPB', 120);
    const MoTa = optional(b, 'MoTa');
    const NgayThanhLap = date(b, 'NgayThanhLap');

    await withTransaction(async (tx) => {
      const old = await existsInTable<any>(tx, 'PHONGBAN', rid);
      const HoatDong = readFlag(b, 'HoatDong', old.HoatDong);
      const MaTruongPhong = await readHead(tx, b, rid, old.MaTruongPhong);
      await tx.run(
        `UPDATE "PHONGBAN" SET "TenPB" = $1, "MoTa" = $2, "NgayThanhLap" = $3, "HoatDong" = $4, "MaTruongPhong" = $5
         WHERE "MaPB" = $6`,
        [TenPB, MoTa, NgayThanhLap, HoatDong, MaTruongPhong, rid]
      );
      await auditLog(
        tx,
        u.MaTK,
        'Cập nhật phòng ban',
        rid,
        diffFields(old, { TenPB, MoTa, NgayThanhLap, HoatDong, MaTruongPhong })
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
      await existsInTable(tx, 'PHONGBAN', rid);
      const used = await usageSummary(tx, [
        ['nhân viên', 'SELECT COUNT(*) AS n FROM "NHANVIEN" WHERE "MaPB" = $1', [rid]],
        [
          'quyết định công tác',
          'SELECT COUNT(*) AS n FROM "QUATRINHCONGTAC" WHERE "MaPBCu" = $1 OR "MaPBMoi" = $1',
          [rid],
        ],
      ]);
      if (used.length) {
        fail(
          `Phòng ban đang được sử dụng (${used.join(', ')}). Hãy chuyển nhân sự đi hoặc chuyển sang trạng thái ngừng sử dụng.`,
          409
        );
      }
      await tx.run('DELETE FROM "PHONGBAN" WHERE "MaPB" = $1', [rid]);
      await auditLog(tx, u.MaTK, 'Xóa phòng ban', rid);
    });
    res.json({ ok: true });
  })
);

// 2.2 Quản lý chức vụ
function readPosition(b: Record<string, unknown>, oldRow?: any) {
  const CapBac =
    b.CapBac !== undefined && b.CapBac !== null && b.CapBac !== ''
      ? numeric(b, 'CapBac', 1, 10)
      : oldRow?.CapBac ?? 2;
  if (!Number.isInteger(CapBac)) fail('Cấp bậc phải là số nguyên.');
  const VaiTroMacDinh =
    b.VaiTroMacDinh === undefined
      ? oldRow?.VaiTroMacDinh ?? null
      : b.VaiTroMacDinh === null || b.VaiTroMacDinh === ''
      ? null
      : choice(b, 'VaiTroMacDinh', CATALOG_ROLES);
  return {
    TenCV: text(b, 'TenCV', 120),
    MoTa: optional(b, 'MoTa'),
    CapBac,
    LaDieuHanh: readFlag(b, 'LaDieuHanh', oldRow?.LaDieuHanh ?? false),
    VaiTroMacDinh,
    HoatDong: readFlag(b, 'HoatDong', oldRow?.HoatDong ?? true),
  };
}

catalogsRouter.post(
  '/positions',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const p = readPosition(req.body);

    const MaCV = await withTransaction(async (tx) => {
      const MaCV = await nextBusinessId(tx, 'CHUCVU');
      await tx.run(
        `INSERT INTO "CHUCVU"("MaCV", "TenCV", "MoTa", "CapBac", "LaDieuHanh", "VaiTroMacDinh", "HoatDong")
         VALUES($1, $2, $3, $4, $5, $6, $7)`,
        [MaCV, p.TenCV, p.MoTa, p.CapBac, p.LaDieuHanh, p.VaiTroMacDinh, p.HoatDong]
      );
      await auditLog(tx, u.MaTK, 'Thêm chức vụ', MaCV);
      return MaCV;
    });
    res.status(201).json({ ok: true, id: MaCV });
  })
);

catalogsRouter.put(
  '/positions/:id',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);

    await withTransaction(async (tx) => {
      const old = await existsInTable<any>(tx, 'CHUCVU', rid);
      const p = readPosition(req.body, old);
      await tx.run(
        `UPDATE "CHUCVU" SET "TenCV" = $1, "MoTa" = $2, "CapBac" = $3, "LaDieuHanh" = $4,
                "VaiTroMacDinh" = $5, "HoatDong" = $6 WHERE "MaCV" = $7`,
        [p.TenCV, p.MoTa, p.CapBac, p.LaDieuHanh, p.VaiTroMacDinh, p.HoatDong, rid]
      );
      await auditLog(tx, u.MaTK, 'Cập nhật chức vụ', rid, diffFields(old, p));
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
      await existsInTable(tx, 'CHUCVU', rid);
      const used = await usageSummary(tx, [
        ['nhân viên', 'SELECT COUNT(*) AS n FROM "NHANVIEN" WHERE "MaCV" = $1', [rid]],
        [
          'quyết định công tác',
          'SELECT COUNT(*) AS n FROM "QUATRINHCONGTAC" WHERE "MaCVCu" = $1 OR "MaCVMoi" = $1',
          [rid],
        ],
      ]);
      if (used.length) {
        fail(
          `Chức vụ đang được sử dụng (${used.join(', ')}). Hãy chuyển sang trạng thái ngừng sử dụng.`,
          409
        );
      }
      await tx.run('DELETE FROM "CHUCVU" WHERE "MaCV" = $1', [rid]);
      await auditLog(tx, u.MaTK, 'Xóa chức vụ', rid);
    });
    res.json({ ok: true });
  })
);
