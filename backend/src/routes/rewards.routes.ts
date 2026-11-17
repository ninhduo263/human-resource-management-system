import { Router } from 'express';
import { db, withTransaction, auditLog } from '../db/pool.js';
import {
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { generateId } from '../utils/crypto.js';
import { choice, date, fail, numeric, text } from '../utils/validation.js';
import { asyncHandler, paramId } from '../utils/http.js';
import { nextRewardDisciplineId } from '../utils/business-id.js';

export const rewardsRouter = Router();

rewardsRouter.use(requireAuth);

const REWARD_TYPES = ['Khen thưởng', 'Kỷ luật'] as const;

// Danh sách khen thưởng / kỷ luật (phân quyền theo vai trò)
rewardsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    let rows;
    if (['admin', 'hr', 'director'].includes(u.role)) {
      rows = await db.all(`
        SELECT rd.*, e.name as employee_name, d.name as department_name, p.name as position_name,
               dec.number as decision_number, dec.signer, dec.signed_date
        FROM rewards_disciplines rd
        JOIN employees e ON e.id = rd.employee_id
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN positions p ON p.id = e.position_id
        JOIN decisions dec ON dec.id = rd.decision_id
        ORDER BY rd.effective_date DESC, rd.id DESC
      `);
    } else if (u.role === 'manager') {
      rows = await db.all(`
        SELECT rd.*, e.name as employee_name, d.name as department_name, p.name as position_name,
               dec.number as decision_number, dec.signer, dec.signed_date
        FROM rewards_disciplines rd
        JOIN employees e ON e.id = rd.employee_id
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN positions p ON p.id = e.position_id
        JOIN decisions dec ON dec.id = rd.decision_id
        WHERE e.department_id = $1
        ORDER BY rd.effective_date DESC, rd.id DESC
      `, [u.department_id]);
    } else {
      rows = await db.all(`
        SELECT rd.*, e.name as employee_name, d.name as department_name, p.name as position_name,
               dec.number as decision_number, dec.signer, dec.signed_date
        FROM rewards_disciplines rd
        JOIN employees e ON e.id = rd.employee_id
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN positions p ON p.id = e.position_id
        JOIN decisions dec ON dec.id = rd.decision_id
        WHERE rd.employee_id = $1
        ORDER BY rd.effective_date DESC, rd.id DESC
      `, [u.employee_id]);
    }

    res.json(rows.map((r: any) => ({ ...r, amount: Number(r.amount) })));
  })
);

// Tạo mới bản ghi Khen thưởng hoặc Kỷ luật (BFD 3.4)
rewardsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr', 'director']);

    const b = req.body;
    const type = choice(b, 'type', REWARD_TYPES);
    const category = text(b, 'category', 100);
    const amount = numeric({ amount: b.amount ?? 0 }, 'amount', 0, 100_000_000_000);
    const effective = date(b, 'effective_date');
    const signed = date(b, 'signed_date');
    const reason = text(b, 'reason', 1000);
    const number = text(b, 'number', 60);
    const signer = text(b, 'signer', 120);

    if (signed > effective) {
      fail('Ngày ký quyết định không được sau ngày có hiệu lực.');
    }

    const newId = await withTransaction(async (tx) => {
      const empId = text(b, 'employee_id');
      await tx.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [empId]);
      const emp = await requireActiveEmployee(tx, empId);

      // Lưu hoặc tái sử dụng Quyết định đã có (decisions)
      const did = generateId('QD');
      await tx.run(
        `INSERT INTO decisions(id, number, type, signed_date, effective_date, signer, content)
         VALUES($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (number) DO NOTHING`,
        [did, number, type, signed, effective, signer, reason]
      );
      const dec = (await tx.one<any>('SELECT * FROM decisions WHERE number = $1', [number]))!;
      if (dec.type !== type || dec.signer !== signer) {
        fail('Số quyết định này đã tồn tại nhưng thông tin không khớp.', 409);
      }

      const id = await nextRewardDisciplineId(tx, type);
      await tx.run(
        `INSERT INTO rewards_disciplines(id, employee_id, decision_id, type, category, amount, effective_date, reason)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, emp.id, dec.id, type, category, amount, effective, reason]
      );

      await auditLog(tx, u.id, `Ghi nhận ${type.toLowerCase()}`, id, {
        employee_id: emp.id,
        decision_number: number,
        category,
        amount,
        effective_date: effective,
      });

      return id;
    });

    res.status(201).json({ id: newId });
  })
);

// Hủy / xóa bản ghi Khen thưởng hoặc Kỷ luật
rewardsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr', 'director']);
    const rid = paramId(req);

    await withTransaction(async (tx) => {
      const existing = await tx.one<any>('SELECT * FROM rewards_disciplines WHERE id = $1 FOR UPDATE', [rid]);
      if (!existing) fail('Không tìm thấy bản ghi khen thưởng/kỷ luật.', 404);

      await tx.run('DELETE FROM rewards_disciplines WHERE id = $1', [rid]);
      await auditLog(tx, u.id, `Hủy ${existing.type.toLowerCase()}`, rid, {
        employee_id: existing.employee_id,
        decision_id: existing.decision_id,
      });
    });

    res.json({ ok: true });
  })
);
