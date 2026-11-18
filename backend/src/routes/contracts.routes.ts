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
  employee: { manv: string; ngayvaolam: string };
  loaihd: (typeof CONTRACT_TYPES)[number];
  start: string;
  end: string | null;
  mucluong: number;
  sohd: string | null;
}

/** Số lần đã ký hoặc gia hạn hợp đồng xác định thời hạn (không tính hợp đồng đã hủy bỏ). */
async function fixedTermTimes(tx: DbExecutor, manv: string): Promise<number> {
  const row = await tx.one<{ n: string }>(
    `SELECT
       (SELECT COUNT(*) FROM hopdong
         WHERE manv = $1 AND loaihd = 'Xác định thời hạn' AND trangthai <> 'Đã hủy bỏ')
     + (SELECT COUNT(*) FROM giahanhopdong g JOIN hopdong h ON h.mahd = g.mahd
         WHERE h.manv = $1 AND h.loaihd = 'Xác định thời hạn' AND h.trangthai <> 'Đã hủy bỏ'
           AND g.ngayketthucmoi IS DISTINCT FROM g.ngayketthuccu) AS n`,
    [manv]
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
  if (c.start < c.employee.ngayvaolam) fail('Hợp đồng không được bắt đầu trước ngày vào làm.');
  if (c.end && c.end < c.start) fail('Ngày kết thúc phải từ ngày bắt đầu trở đi.');

  if (c.loaihd === 'Thử việc') {
    if (calendarDays(c.start, c.end!) > LABOR_RULES.maxTrialDays) {
      fail(`Thời gian thử việc tối đa ${LABOR_RULES.maxTrialDays} ngày.`);
    }
    const trial = await tx.one(
      `SELECT mahd FROM hopdong WHERE manv = $1 AND loaihd = 'Thử việc' AND trangthai <> 'Đã hủy bỏ'`,
      [c.employee.manv]
    );
    if (trial) fail('Nhân viên đã có hợp đồng thử việc; chỉ được thử việc một lần.');
  }
  if (c.loaihd === 'Xác định thời hạn') {
    assertFixedTermLength(c.start, c.end!);
    if ((await fixedTermTimes(tx, c.employee.manv)) >= LABOR_RULES.maxFixedTermTimes) {
      fail(
        `Đã ký/gia hạn hợp đồng xác định thời hạn ${LABOR_RULES.maxFixedTermTimes} lần; hợp đồng tiếp theo phải là không xác định thời hạn.`
      );
    }
  }

  const overlap = await tx.one(
    `SELECT mahd FROM hopdong
     WHERE manv = $1 AND ${LIVE_CONTRACT}
       AND ngaybatdau <= $2 AND (ngayketthuc IS NULL OR ngayketthuc >= $3)`,
    [c.employee.manv, c.end || '9999-12-31', c.start]
  );
  if (overlap) fail('Khoảng thời gian bị trùng với hợp đồng hiện có.');

  const mahd = await nextBusinessId(tx, 'hopdong');
  await tx.run(
    `INSERT INTO hopdong(mahd, manv, loaihd, ngaybatdau, ngayketthuc, ngayketthucgoc, mucluong, trangthai, sohd)
     VALUES($1, $2, $3, $4, $5, $5, $6, 'Hiệu lực', $7)`,
    [mahd, c.employee.manv, c.loaihd, c.start, c.end, c.mucluong, c.sohd]
  );
  await auditLog(tx, actorId, 'Lập hợp đồng', mahd);
  await syncEmployeeStatuses(tx, c.employee.manv);
  return mahd;
}

function readNewContract(b: Record<string, any>, employee: { manv: string; ngayvaolam: string }): NewContract {
  const loaihd = choice(b, 'loaihd', CONTRACT_TYPES);
  return {
    employee,
    loaihd,
    start: date(b, 'ngaybatdau'),
    end: loaihd === 'Không xác định thời hạn' ? null : date(b, 'ngayketthuc'),
    mucluong: numeric(b, 'mucluong', 1, 100_000_000_000),
    sohd: optional(b, 'sohd', 60) || null,
  };
}

async function lockActiveEmployee(tx: DbExecutor, manv: string) {
  await tx.query('SELECT manv FROM nhanvien WHERE manv = $1 FOR UPDATE', [manv]);
  return requireActiveEmployee(tx, manv);
}

/** Tạo (hoặc dùng lại theo số) quyết định kèm theo phụ lục / chấm dứt hợp đồng. */
async function optionalDecision(
  tx: DbExecutor,
  b: Record<string, any>,
  loaiqd: string,
  ngayhieuluc: string,
  noidung: string
): Promise<string | null> {
  if (!b.soqd) return null;
  const soqd = text(b, 'soqd', 60);
  const nguoiky = text(b, 'nguoiky', 120);
  const ngayky = b.ngayky ? date(b, 'ngayky') : today();
  await tx.run(
    `INSERT INTO quyetdinh(maqd, soqd, loaiqd, ngayky, ngayhieuluc, nguoiky, noidung)
     VALUES($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (soqd) DO NOTHING`,
    [generateId('QD'), soqd, loaiqd, ngayky, ngayhieuluc, nguoiky, noidung]
  );
  const d = await tx.one<{ maqd: string }>('SELECT maqd FROM quyetdinh WHERE soqd = $1', [soqd]);
  return d?.maqd ?? null;
}

// 3.1 Lập hợp đồng
contractsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const b = req.body;
    const manv = text(b, 'manv');

    const mahd = await withTransaction(async (tx) => {
      const e = await lockActiveEmployee(tx, manv);
      return insertContract(tx, readNewContract(b, e), u.matk);
    });
    res.status(201).json({ id: mahd });
  })
);

// Gia hạn và điều chỉnh lương đều phải lập phụ lục trong cùng transaction.
function amendContract(extend: boolean) {
  return asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const rid = paramId(req);
    const existing = await existsInTable(db, 'hopdong', rid);
    const b = req.body;
    const lydo = text(b, 'lydo', 1000);
    const currentDay = today();

    await withTransaction(async (tx) => {
      await lockActiveEmployee(tx, existing.manv);
      const c = (await tx.one<any>('SELECT * FROM hopdong WHERE mahd = $1 FOR UPDATE', [rid]))!;
      if (c.trangthai === 'Đã chấm dứt') fail('Hợp đồng đã chấm dứt.');
      if (c.trangthai === 'Đã hủy bỏ') fail('Hợp đồng đã bị hủy bỏ.');
      if (extend && !c.ngayketthuc) fail('Hợp đồng không xác định thời hạn không cần gia hạn.');

      const newEnd = extend ? date(b, 'ngayketthucmoi') : c.ngayketthuc;
      const mucluong =
        !extend || (b.mucluong != null && b.mucluong !== '')
          ? numeric(b, 'mucluong', 1, 100_000_000_000)
          : Number(c.mucluong);
      const salaryChanged = mucluong !== Number(c.mucluong);
      if (!extend && !salaryChanged) fail('Mức lương mới phải khác mức lương hiện tại.');

      if (extend) {
        if (newEnd <= c.ngayketthuc || newEnd < currentDay) {
          fail('Ngày gia hạn phải sau ngày kết thúc cũ và không trước hôm nay.');
        }
        if (c.loaihd === 'Thử việc') fail('Hợp đồng thử việc không gia hạn; hãy ký hợp đồng chính thức.');
        assertFixedTermLength(c.ngaybatdau, newEnd);
        if ((await fixedTermTimes(tx, c.manv)) >= LABOR_RULES.maxFixedTermTimes) {
          fail(
            `Đã ký/gia hạn hợp đồng xác định thời hạn ${LABOR_RULES.maxFixedTermTimes} lần; hãy ký hợp đồng không xác định thời hạn.`
          );
        }
        const overlap = await tx.one(
          `SELECT mahd FROM hopdong
           WHERE manv = $1 AND mahd != $2 AND ${LIVE_CONTRACT}
             AND ngaybatdau <= $3 AND (ngayketthuc IS NULL OR ngayketthuc >= $4)`,
          [c.manv, rid, newEnd, c.ngaybatdau]
        );
        if (overlap) fail('Thời hạn mới trùng với hợp đồng khác.');
      }

      // Ngày hiệu lực của mức lương mới: mặc định hôm nay, có thể lùi (ghi bù) hoặc hẹn tương lai.
      const ngayhieuluc = extend ? currentDay : optionalDate(b, 'ngayhieuluc') ?? currentDay;
      if (ngayhieuluc < c.ngaybatdau) fail('Ngày hiệu lực không được trước ngày bắt đầu hợp đồng.');
      if (ngayhieuluc > addMonths(currentDay, 12)) fail('Ngày hiệu lực không được quá 12 tháng sau hôm nay.');
      const applyNow = ngayhieuluc <= currentDay;
      if (!extend) {
        const pending = await tx.one(
          'SELECT magh FROM giahanhopdong WHERE mahd = $1 AND daapdung = FALSE',
          [rid]
        );
        if (pending) fail('Hợp đồng đang có phụ lục lương chờ hiệu lực.');
      }

      const seqRow = await tx.one<{ n: number }>(
        'SELECT COALESCE(MAX(langiahan), 0) + 1 AS n FROM giahanhopdong WHERE mahd = $1',
        [rid]
      );
      const langiahan = Number(seqRow?.n ?? 1);
      const maqd = await optionalDecision(tx, b, 'Gia hạn hợp đồng', ngayhieuluc, lydo);

      await tx.run(
        `INSERT INTO giahanhopdong(magh, mahd, langiahan, ngaylap, ngayketthuccu, ngayketthucmoi, lydo,
          loaiphuluc, luongcu, luongmoi, ngayhieuluc, daapdung, maqd)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          generateId('PL'),
          rid,
          langiahan,
          currentDay,
          c.ngayketthuc,
          newEnd,
          lydo,
          extend ? (salaryChanged ? 'Gia hạn và điều chỉnh lương' : 'Gia hạn') : 'Điều chỉnh lương',
          Number(c.mucluong),
          mucluong,
          ngayhieuluc,
          applyNow,
          maqd,
        ]
      );
      await tx.run('UPDATE hopdong SET ngayketthuc = $1, mucluong = $2 WHERE mahd = $3', [
        newEnd,
        applyNow ? mucluong : Number(c.mucluong),
        rid,
      ]);
      await auditLog(
        tx,
        u.matk,
        extend ? 'Gia hạn hợp đồng và lập phụ lục' : 'Điều chỉnh lương và lập phụ lục',
        rid,
        {
          mucluong: { from: Number(c.mucluong), to: mucluong },
          ngayketthuc: { from: c.ngayketthuc, to: newEnd },
          ngayhieuluc,
        }
      );
      await syncEmployeeStatuses(tx, c.manv);
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
    const existing = await existsInTable(db, 'hopdong', rid);
    const b = req.body;

    const newId = await withTransaction(async (tx) => {
      const e = await lockActiveEmployee(tx, existing.manv);
      const trial = (await tx.one<any>('SELECT * FROM hopdong WHERE mahd = $1 FOR UPDATE', [rid]))!;
      if (trial.loaihd !== 'Thử việc') fail('Chỉ chuyển chính thức từ hợp đồng thử việc.');
      if (trial.trangthai === 'Đã chấm dứt' || trial.trangthai === 'Đã hủy bỏ') {
        fail('Hợp đồng thử việc không còn hiệu lực.');
      }
      const next = readNewContract(b, e);
      if (next.loaihd === 'Thử việc') fail('Hợp đồng chính thức không thể là hợp đồng thử việc.');
      if (next.start <= trial.ngaybatdau) fail('Hợp đồng chính thức phải bắt đầu sau ngày bắt đầu thử việc.');

      // Rút ngắn hợp đồng thử việc đến ngày trước khi hợp đồng chính thức bắt đầu.
      const trialEnd = shift(next.start, -1);
      if (!trial.ngayketthuc || trial.ngayketthuc > trialEnd) {
        await tx.run('UPDATE hopdong SET ngayketthuc = $1 WHERE mahd = $2', [trialEnd, rid]);
      }
      const mahd = await insertContract(tx, next, u.matk);
      await auditLog(tx, u.matk, 'Chuyển hợp đồng thử việc thành chính thức', rid, { hopdongmoi: mahd });
      return mahd;
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
    const existing = await existsInTable(db, 'hopdong', rid);
    const b = req.body;
    const ngaychamdut = date(b, 'ngaychamdut');
    const lydochamdut = text(b, 'lydochamdut', 1000);
    const loaichamdut = choice(
      { loaichamdut: b.loaichamdut ?? 'Thỏa thuận chấm dứt' },
      'loaichamdut',
      TERMINATION_TYPES
    );
    const currentDay = today();

    await withTransaction(async (tx) => {
      await lockActiveEmployee(tx, existing.manv);
      const c = (await tx.one<any>('SELECT * FROM hopdong WHERE mahd = $1 FOR UPDATE', [rid]))!;
      if (c.trangthai === 'Đã chấm dứt') fail('Hợp đồng đã chấm dứt.');
      if (c.trangthai === 'Đã hủy bỏ') fail('Hợp đồng đã bị hủy bỏ.');
      if (ngaychamdut < c.ngaybatdau || (c.ngayketthuc && ngaychamdut > c.ngayketthuc)) {
        fail('Ngày chấm dứt phải nằm trong thời hạn hợp đồng.');
      }
      if (ngaychamdut > addMonths(currentDay, 6)) fail('Chỉ được hẹn chấm dứt trong vòng 6 tháng tới.');

      const maqd = await optionalDecision(tx, b, 'Chấm dứt hợp đồng', ngaychamdut, lydochamdut);

      await tx.run(
        `UPDATE hopdong SET ngaychamdut = $1, lydochamdut = $2, loaichamdut = $3, maqdchamdut = $4
         WHERE mahd = $5`,
        [ngaychamdut, lydochamdut, loaichamdut, maqd, rid]
      );
      if (ngaychamdut <= currentDay) {
        await finalizeTermination(
          tx,
          c,
          u.matk,
          'Chấm dứt hợp đồng và cập nhật trạng thái nhân viên',
          loaichamdut
        );
      } else {
        await auditLog(tx, u.matk, 'Hẹn chấm dứt hợp đồng', rid, { ngaychamdut, loaichamdut });
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
    const existing = await existsInTable(db, 'hopdong', rid);
    const lydo = text(req.body, 'lydo', 1000);

    await withTransaction(async (tx) => {
      await tx.query('SELECT manv FROM nhanvien WHERE manv = $1 FOR UPDATE', [existing.manv]);
      const c = (await tx.one<any>('SELECT * FROM hopdong WHERE mahd = $1 FOR UPDATE', [rid]))!;
      if (c.trangthai === 'Đã chấm dứt') fail('Hợp đồng đã chấm dứt; không thể hủy bỏ.');
      if (c.trangthai === 'Đã hủy bỏ') fail('Hợp đồng đã bị hủy bỏ.');
      await tx.run(
        `UPDATE hopdong SET trangthai = 'Đã hủy bỏ', lydochamdut = $1, loaichamdut = 'Hủy bỏ do nhập sai',
                ngaychamdut = NULL
         WHERE mahd = $2`,
        [lydo, rid]
      );
      await syncEmployeeStatuses(tx, c.manv);
      await auditLog(tx, u.matk, 'Hủy bỏ hợp đồng', rid, { lydo });
    });
    res.json({ ok: true });
  })
);
