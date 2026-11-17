import { Router } from 'express';
import { db, DbExecutor, withTransaction, auditLog } from '../db/pool.js';
import {
  existsInTable,
  requireActiveEmployee,
  requireAuth,
  requireRole,
} from '../middleware/auth.js';
import { generateId } from '../utils/crypto.js';
import { nextBusinessId } from '../utils/business-id.js';
import {
  addMonths,
  calendarDays,
  choice,
  date,
  fail,
  numeric,
  optional,
  optionalDate,
  shift,
  text,
  today,
} from '../utils/validation.js';
import { asyncHandler, paramId } from '../utils/http.js';
import {
  LIVE_CONTRACT,
  finalizeTermination,
  syncEmployeeStatuses,
} from '../services/employeeStatus.js';

export const contractsRouter = Router();

contractsRouter.use(requireAuth);

const CONTRACT_TYPES = ['Thử việc', 'Xác định thời hạn', 'Không xác định thời hạn'] as const;
const TERMINATION_TYPES = [
  'Hết hạn hợp đồng',
  'Người lao động xin nghỉ',
  'Doanh nghiệp chấm dứt',
  'Thỏa thuận chấm dứt',
] as const;

// Quy định Bộ luật Lao động 2019: thử việc tối đa 60 ngày và chỉ một lần; hợp đồng xác định
// thời hạn tối đa 36 tháng, ký/gia hạn tối đa 2 lần, sau đó phải chuyển sang không xác định thời hạn.
export const LABOR_RULES = {
  maxTrialDays: 60,
  maxFixedTermMonths: 36,
  maxFixedTermTimes: 2,
};

interface NewContract {
  employee: { id: string; join_date: string };
  type: (typeof CONTRACT_TYPES)[number];
  start: string;
  end: string | null;
  salary: number;
  number: string | null;
}

/** Số lần đã ký hoặc gia hạn hợp đồng xác định thời hạn (không tính hợp đồng đã hủy bỏ). */
async function fixedTermTimes(tx: DbExecutor, employeeId: string): Promise<number> {
  const row = await tx.one<{ n: string }>(
    `SELECT
       (SELECT COUNT(*) FROM contracts
         WHERE employee_id = $1 AND type = 'Xác định thời hạn' AND status <> 'Đã hủy bỏ')
     + (SELECT COUNT(*) FROM extensions x JOIN contracts c ON c.id = x.contract_id
         WHERE c.employee_id = $1 AND c.type = 'Xác định thời hạn' AND c.status <> 'Đã hủy bỏ'
           AND x.new_end_date IS DISTINCT FROM x.old_end_date) AS n`,
    [employeeId]
  );
  return Number(row?.n ?? 0);
}

function assertFixedTermLength(start: string, end: string): void {
  if (end > shift(addMonths(start, LABOR_RULES.maxFixedTermMonths), -1)) {
    fail(`Hợp đồng xác định thời hạn tối đa ${LABOR_RULES.maxFixedTermMonths} tháng.`);
  }
}

/** Kiểm tra nghiệp vụ và tạo hợp đồng mới trong transaction (đã khóa dòng nhân viên). */
async function insertContract(tx: DbExecutor, c: NewContract, actorId: string): Promise<string> {
  if (c.start < c.employee.join_date) fail('Hợp đồng không được bắt đầu trước ngày vào làm.');
  if (c.end && c.end < c.start) fail('Ngày kết thúc phải từ ngày bắt đầu trở đi.');

  if (c.type === 'Thử việc') {
    if (calendarDays(c.start, c.end!) > LABOR_RULES.maxTrialDays) {
      fail(`Thời gian thử việc tối đa ${LABOR_RULES.maxTrialDays} ngày.`);
    }
    const trial = await tx.one(
      `SELECT id FROM contracts WHERE employee_id = $1 AND type = 'Thử việc' AND status <> 'Đã hủy bỏ'`,
      [c.employee.id]
    );
    if (trial) fail('Nhân viên đã có hợp đồng thử việc; chỉ được thử việc một lần.');
  }
  if (c.type === 'Xác định thời hạn') {
    assertFixedTermLength(c.start, c.end!);
    if ((await fixedTermTimes(tx, c.employee.id)) >= LABOR_RULES.maxFixedTermTimes) {
      fail(
        `Đã ký/gia hạn hợp đồng xác định thời hạn ${LABOR_RULES.maxFixedTermTimes} lần; hợp đồng tiếp theo phải là không xác định thời hạn.`
      );
    }
  }

  const overlap = await tx.one(
    `SELECT id FROM contracts
     WHERE employee_id = $1 AND ${LIVE_CONTRACT}
       AND start_date <= $2 AND (end_date IS NULL OR end_date >= $3)`,
    [c.employee.id, c.end || '9999-12-31', c.start]
  );
  if (overlap) fail('Khoảng thời gian bị trùng với hợp đồng hiện có.');

  const cid = await nextBusinessId(tx, 'contracts');
  await tx.run(
    `INSERT INTO contracts(id, employee_id, type, start_date, end_date, original_end_date, salary, status, contract_number)
     VALUES($1, $2, $3, $4, $5, $5, $6, 'Hiệu lực', $7)`,
    [cid, c.employee.id, c.type, c.start, c.end, c.salary, c.number]
  );
  await auditLog(tx, actorId, 'Lập hợp đồng', cid);
  await syncEmployeeStatuses(tx, c.employee.id);
  return cid;
}

function readNewContract(b: Record<string, any>, employee: { id: string; join_date: string }): NewContract {
  const type = choice(b, 'type', CONTRACT_TYPES);
  return {
    employee,
    type,
    start: date(b, 'start_date'),
    end: type === 'Không xác định thời hạn' ? null : date(b, 'end_date'),
    salary: numeric(b, 'salary', 1, 100_000_000_000),
    number: optional(b, 'contract_number', 60) || null,
  };
}

async function lockActiveEmployee(tx: DbExecutor, id: string) {
  await tx.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [id]);
  return requireActiveEmployee(tx, id);
}

// 3.1 Lập hợp đồng
contractsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const b = req.body;
    const empId = text(b, 'employee_id');

    const cid = await withTransaction(async (tx) => {
      const e = await lockActiveEmployee(tx, empId);
      return insertContract(tx, readNewContract(b, e), u.id);
    });
    res.status(201).json({ id: cid });
  })
);

// Gia hạn và điều chỉnh lương đều phải lập phụ lục trong cùng transaction.
function amendContract(extend: boolean) {
  return asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const rid = paramId(req);
    const existing = await existsInTable(db, 'contracts', rid);
    const b = req.body;
    const reason = text(b, 'reason', 1000);
    const currentDay = today();

    await withTransaction(async (tx) => {
      await lockActiveEmployee(tx, existing.employee_id);
      const c = (await tx.one<any>('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [rid]))!;
      if (c.status === 'Đã chấm dứt') fail('Hợp đồng đã chấm dứt.');
      if (c.status === 'Đã hủy bỏ') fail('Hợp đồng đã bị hủy bỏ.');
      if (extend && !c.end_date) fail('Hợp đồng không xác định thời hạn không cần gia hạn.');

      const newEnd = extend ? date(b, 'new_end_date') : c.end_date;
      const salary =
        !extend || (b.salary != null && b.salary !== '')
          ? numeric(b, 'salary', 1, 100_000_000_000)
          : Number(c.salary);
      const salaryChanged = salary !== Number(c.salary);
      if (!extend && !salaryChanged) fail('Mức lương mới phải khác mức lương hiện tại.');

      if (extend) {
        if (newEnd <= c.end_date || newEnd < currentDay) {
          fail('Ngày gia hạn phải sau ngày kết thúc cũ và không trước hôm nay.');
        }
        if (c.type === 'Thử việc') fail('Hợp đồng thử việc không gia hạn; hãy ký hợp đồng chính thức.');
        assertFixedTermLength(c.start_date, newEnd);
        if ((await fixedTermTimes(tx, c.employee_id)) >= LABOR_RULES.maxFixedTermTimes) {
          fail(
            `Đã ký/gia hạn hợp đồng xác định thời hạn ${LABOR_RULES.maxFixedTermTimes} lần; hãy ký hợp đồng không xác định thời hạn.`
          );
        }
        const overlap = await tx.one(
          `SELECT id FROM contracts
           WHERE employee_id = $1 AND id != $2 AND ${LIVE_CONTRACT}
             AND start_date <= $3 AND (end_date IS NULL OR end_date >= $4)`,
          [c.employee_id, rid, newEnd, c.start_date]
        );
        if (overlap) fail('Thời hạn mới trùng với hợp đồng khác.');
      }

      // Ngày hiệu lực của mức lương mới: mặc định hôm nay, có thể lùi (ghi bù) hoặc hẹn tương lai.
      const effective = extend ? currentDay : optionalDate(b, 'effective_date') ?? currentDay;
      if (effective < c.start_date) fail('Ngày hiệu lực không được trước ngày bắt đầu hợp đồng.');
      if (effective > addMonths(currentDay, 12)) fail('Ngày hiệu lực không được quá 12 tháng sau hôm nay.');
      const applyNow = effective <= currentDay;
      if (!extend) {
        const pending = await tx.one(
          'SELECT id FROM extensions WHERE contract_id = $1 AND applied = FALSE',
          [rid]
        );
        if (pending) fail('Hợp đồng đang có phụ lục lương chờ hiệu lực.');
      }

      const seqRow = await tx.one<{ n: number }>(
        'SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM extensions WHERE contract_id = $1',
        [rid]
      );
      const seq = Number(seqRow?.n ?? 1);

      let decisionId: string | null = null;
      if (b.decision_number) {
        const decNum = text(b, 'decision_number', 60);
        const signer = text(b, 'signer', 120);
        const signedDate = b.signed_date ? date(b, 'signed_date') : currentDay;
        const did = generateId('QD');
        await tx.run(
          `INSERT INTO decisions(id, number, type, signed_date, effective_date, signer, content)
           VALUES($1, $2, 'Gia hạn hợp đồng', $3, $4, $5, $6)
           ON CONFLICT (number) DO NOTHING`,
          [did, decNum, signedDate, effective, signer, reason]
        );
        const d = await tx.one<any>('SELECT id FROM decisions WHERE number = $1', [decNum]);
        if (d) decisionId = d.id;
      }

      await tx.run(
        `INSERT INTO extensions(id, contract_id, sequence, created_date, old_end_date, new_end_date, reason,
          amendment_type, old_salary, new_salary, effective_date, applied, decision_id)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          generateId('PL'),
          rid,
          seq,
          currentDay,
          c.end_date,
          newEnd,
          reason,
          extend ? (salaryChanged ? 'Gia hạn và điều chỉnh lương' : 'Gia hạn') : 'Điều chỉnh lương',
          Number(c.salary),
          salary,
          effective,
          applyNow,
          decisionId,
        ]
      );
      await tx.run('UPDATE contracts SET end_date = $1, salary = $2 WHERE id = $3', [
        newEnd,
        applyNow ? salary : Number(c.salary),
        rid,
      ]);
      await auditLog(
        tx,
        u.id,
        extend ? 'Gia hạn hợp đồng và lập phụ lục' : 'Điều chỉnh lương và lập phụ lục',
        rid,
        { salary: { from: Number(c.salary), to: salary }, end_date: { from: c.end_date, to: newEnd }, effective_date: effective }
      );
      await syncEmployeeStatuses(tx, c.employee_id);
    });

    res.json({ ok: true });
  });
}

contractsRouter.post('/:id/extend', amendContract(true));
contractsRouter.post('/:id/salary', amendContract(false));

// 3.2 Chuyển hợp đồng thử việc thành hợp đồng chính thức
contractsRouter.post(
  '/:id/convert',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);
    const existing = await existsInTable(db, 'contracts', rid);
    const b = req.body;

    const newId = await withTransaction(async (tx) => {
      const e = await lockActiveEmployee(tx, existing.employee_id);
      const trial = (await tx.one<any>('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [rid]))!;
      if (trial.type !== 'Thử việc') fail('Chỉ chuyển chính thức từ hợp đồng thử việc.');
      if (trial.status === 'Đã chấm dứt' || trial.status === 'Đã hủy bỏ') {
        fail('Hợp đồng thử việc không còn hiệu lực.');
      }
      const next = readNewContract({ ...b, type: b.type }, e);
      if (next.type === 'Thử việc') fail('Hợp đồng chính thức không thể là hợp đồng thử việc.');
      if (next.start <= trial.start_date) fail('Hợp đồng chính thức phải bắt đầu sau ngày bắt đầu thử việc.');

      // Rút ngắn hợp đồng thử việc đến ngày trước khi hợp đồng chính thức bắt đầu.
      const trialEnd = shift(next.start, -1);
      if (!trial.end_date || trial.end_date > trialEnd) {
        await tx.run('UPDATE contracts SET end_date = $1 WHERE id = $2', [trialEnd, rid]);
      }
      const cid = await insertContract(tx, next, u.id);
      await auditLog(tx, u.id, 'Chuyển hợp đồng thử việc thành chính thức', rid, { new_contract: cid });
      return cid;
    });
    res.status(201).json({ id: newId });
  })
);

// 3.3 Chấm dứt hợp đồng (có thể hẹn ngày trong tương lai)
contractsRouter.post(
  '/:id/terminate',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);
    const existing = await existsInTable(db, 'contracts', rid);
    const b = req.body;
    const ended = date(b, 'terminated_date');
    const reason = text(b, 'reason', 1000);
    const type = choice(
      { termination_type: b.termination_type ?? 'Thỏa thuận chấm dứt' },
      'termination_type',
      TERMINATION_TYPES
    );
    const currentDay = today();

    await withTransaction(async (tx) => {
      await lockActiveEmployee(tx, existing.employee_id);
      const c = (await tx.one<any>('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [rid]))!;
      if (c.status === 'Đã chấm dứt') fail('Hợp đồng đã chấm dứt.');
      if (c.status === 'Đã hủy bỏ') fail('Hợp đồng đã bị hủy bỏ.');
      if (ended < c.start_date || (c.end_date && ended > c.end_date)) {
        fail('Ngày chấm dứt phải nằm trong thời hạn hợp đồng.');
      }
      if (ended > addMonths(currentDay, 6)) fail('Chỉ được hẹn chấm dứt trong vòng 6 tháng tới.');

      let decisionId: string | null = null;
      if (b.decision_number) {
        const decNum = text(b, 'decision_number', 60);
        const signer = text(b, 'signer', 120);
        const signedDate = b.signed_date ? date(b, 'signed_date') : currentDay;
        const did = generateId('QD');
        await tx.run(
          `INSERT INTO decisions(id, number, type, signed_date, effective_date, signer, content)
           VALUES($1, $2, 'Chấm dứt hợp đồng', $3, $4, $5, $6)
           ON CONFLICT (number) DO NOTHING`,
          [did, decNum, signedDate, ended, signer, reason]
        );
        const d = await tx.one<any>('SELECT id FROM decisions WHERE number = $1', [decNum]);
        if (d) decisionId = d.id;
      }

      await tx.run(
        `UPDATE contracts SET terminated_date = $1, termination_reason = $2, termination_type = $3, termination_decision_id = $4
         WHERE id = $5`,
        [ended, reason, type, decisionId, rid]
      );
      if (ended <= currentDay) {
        await finalizeTermination(
          tx,
          c,
          u.id,
          'Chấm dứt hợp đồng và cập nhật trạng thái nhân viên'
        );
      } else {
        await auditLog(tx, u.id, 'Hẹn chấm dứt hợp đồng', rid, { terminated_date: ended, type });
      }
    });
    res.json({ ok: true });
  })
);

// Hủy bỏ hợp đồng nhập sai (vẫn giữ lại để truy vết)
contractsRouter.post(
  '/:id/void',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const rid = paramId(req);
    const existing = await existsInTable(db, 'contracts', rid);
    const reason = text(req.body, 'reason', 1000);

    await withTransaction(async (tx) => {
      await tx.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [existing.employee_id]);
      const c = (await tx.one<any>('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [rid]))!;
      if (c.status === 'Đã chấm dứt') fail('Hợp đồng đã chấm dứt; không thể hủy bỏ.');
      if (c.status === 'Đã hủy bỏ') fail('Hợp đồng đã bị hủy bỏ.');
      await tx.run(
        `UPDATE contracts SET status = 'Đã hủy bỏ', termination_reason = $1, termination_type = 'Hủy bỏ do nhập sai',
                terminated_date = NULL
         WHERE id = $2`,
        [reason, rid]
      );
      await syncEmployeeStatuses(tx, c.employee_id);
      await auditLog(tx, u.id, 'Hủy bỏ hợp đồng', rid, { reason });
    });
    res.json({ ok: true });
  })
);
