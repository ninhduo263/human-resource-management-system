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
  departmentId: string,
  current: string | null
): Promise<string | null> {
  if (!('head_id' in b)) return current;
  if (b.head_id === null || b.head_id === '') return null;
  const head = await existsInTable<any>(tx, 'employees', text(b, 'head_id'));
  if (head.department_id !== departmentId) {
    fail('Trưởng phòng phải là nhân viên thuộc chính phòng ban này.');
  }
  if (['Đã lưu trữ', 'Đã nghỉ việc'].includes(head.status)) {
    fail('Trưởng phòng phải là nhân viên đang làm việc.');
  }
  return head.id;
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
    const name = text(b, 'name', 120);
    const description = optional(b, 'description');
    const founded = date(b, 'founded_date');

    const rid = await withTransaction(async (tx) => {
      const rid = await nextBusinessId(tx, 'departments');
      await tx.run(
        'INSERT INTO departments(id, name, description, founded_date) VALUES($1, $2, $3, $4)',
        [rid, name, description, founded]
      );
      await auditLog(tx, u.id, 'Thêm phòng ban', rid);
      return rid;
    });
    res.status(201).json({ ok: true, id: rid });
  })
);

catalogsRouter.put(
  '/departments/:id',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);
    const b = req.body;
    const name = text(b, 'name', 120);
    const description = optional(b, 'description');
    const founded = date(b, 'founded_date');

    await withTransaction(async (tx) => {
      const old = await existsInTable<any>(tx, 'departments', rid);
      const active = readFlag(b, 'active', old.active);
      const head = await readHead(tx, b, rid, old.head_id);
      await tx.run(
        `UPDATE departments SET name = $1, description = $2, founded_date = $3, active = $4, head_id = $5
         WHERE id = $6`,
        [name, description, founded, active, head, rid]
      );
      await auditLog(
        tx,
        u.id,
        'Cập nhật phòng ban',
        rid,
        diffFields(old, { name, description, founded_date: founded, active, head_id: head })
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
      await existsInTable(tx, 'departments', rid);
      const used = await usageSummary(tx, [
        ['nhân viên', 'SELECT COUNT(*) AS n FROM employees WHERE department_id = $1', [rid]],
        [
          'quyết định công tác',
          'SELECT COUNT(*) AS n FROM assignments WHERE old_department_id = $1 OR new_department_id = $1',
          [rid],
        ],
      ]);
      if (used.length) {
        fail(
          `Phòng ban đang được sử dụng (${used.join(', ')}). Hãy chuyển nhân sự đi hoặc chuyển sang trạng thái ngừng sử dụng.`,
          409
        );
      }
      await tx.run('DELETE FROM departments WHERE id = $1', [rid]);
      await auditLog(tx, u.id, 'Xóa phòng ban', rid);
    });
    res.json({ ok: true });
  })
);

// 2.2 Quản lý chức vụ
function readPosition(b: Record<string, unknown>, oldRow?: any) {
  const level = b.level !== undefined && b.level !== null && b.level !== ''
    ? numeric(b, 'level', 1, 10)
    : (oldRow?.level ?? 2);
  if (!Number.isInteger(level)) fail('Cấp bậc phải là số nguyên.');
  const defaultRole =
    b.default_role === undefined
      ? oldRow?.default_role ?? null
      : b.default_role === null || b.default_role === ''
      ? null
      : choice(b, 'default_role', CATALOG_ROLES);
  return {
    name: text(b, 'name', 120),
    description: optional(b, 'description'),
    level,
    isExecutive: readFlag(b, 'is_executive', oldRow?.is_executive ?? false),
    defaultRole,
    active: readFlag(b, 'active', oldRow?.active ?? true),
  };
}

catalogsRouter.post(
  '/positions',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const p = readPosition(req.body);

    const rid = await withTransaction(async (tx) => {
      const rid = await nextBusinessId(tx, 'positions');
      await tx.run(
        `INSERT INTO positions(id, name, description, level, is_executive, default_role, active)
         VALUES($1, $2, $3, $4, $5, $6, $7)`,
        [rid, p.name, p.description, p.level, p.isExecutive, p.defaultRole, p.active]
      );
      await auditLog(tx, u.id, 'Thêm chức vụ', rid);
      return rid;
    });
    res.status(201).json({ ok: true, id: rid });
  })
);

catalogsRouter.put(
  '/positions/:id',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);

    await withTransaction(async (tx) => {
      const old = await existsInTable<any>(tx, 'positions', rid);
      const p = readPosition(req.body, old);
      await tx.run(
        `UPDATE positions SET name = $1, description = $2, level = $3, is_executive = $4,
                default_role = $5, active = $6 WHERE id = $7`,
        [p.name, p.description, p.level, p.isExecutive, p.defaultRole, p.active, rid]
      );
      await auditLog(
        tx,
        u.id,
        'Cập nhật chức vụ',
        rid,
        diffFields(old, {
          name: p.name,
          description: p.description,
          level: p.level,
          is_executive: p.isExecutive,
          default_role: p.defaultRole,
          active: p.active,
        })
      );
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
      await existsInTable(tx, 'positions', rid);
      const used = await usageSummary(tx, [
        ['nhân viên', 'SELECT COUNT(*) AS n FROM employees WHERE position_id = $1', [rid]],
        [
          'quyết định công tác',
          'SELECT COUNT(*) AS n FROM assignments WHERE old_position_id = $1 OR new_position_id = $1',
          [rid],
        ],
      ]);
      if (used.length) {
        fail(
          `Chức vụ đang được sử dụng (${used.join(', ')}). Hãy chuyển sang trạng thái ngừng sử dụng.`,
          409
        );
      }
      await tx.run('DELETE FROM positions WHERE id = $1', [rid]);
      await auditLog(tx, u.id, 'Xóa chức vụ', rid);
    });
    res.json({ ok: true });
  })
);

