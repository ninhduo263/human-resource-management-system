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
  employee: { MaNV: string; NgayVaoLam: string };
  LoaiHD: (typeof CONTRACT_TYPES)[number];
  start: string;
  end: string | null;
  MucLuong: number;
  SoHD: string | null;
}

/** Số lần đã ký hoặc gia hạn hợp đồng xác định thời hạn (không tính hợp đồng đã hủy bỏ). */
async function fixedTermTimes(tx: DbExecutor, MaNV: string): Promise<number> {
  const row = await tx.one<{ n: string }>(
    `SELECT
       (SELECT COUNT(*) FROM "HOPDONG"
         WHERE "MaNV" = $1 AND "LoaiHD" = 'Xác định thời hạn' AND "TrangThai" <> 'Đã hủy bỏ')
     + (SELECT COUNT(*) FROM "GIAHANHOPDONG" g JOIN "HOPDONG" h ON h."MaHD" = g."MaHD"
         WHERE h."MaNV" = $1 AND h."LoaiHD" = 'Xác định thời hạn' AND h."TrangThai" <> 'Đã hủy bỏ'
           AND g."NgayKetThucMoi" IS DISTINCT FROM g."NgayKetThucCu") AS n`,
    [MaNV]
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
  if (c.start < c.employee.NgayVaoLam) fail('Hợp đồng không được bắt đầu trước ngày vào làm.');
  if (c.end && c.end < c.start) fail('Ngày kết thúc phải từ ngày bắt đầu trở đi.');

  if (c.LoaiHD === 'Thử việc') {
    if (calendarDays(c.start, c.end!) > LABOR_RULES.maxTrialDays) {
      fail(`Thời gian thử việc tối đa ${LABOR_RULES.maxTrialDays} ngày.`);
    }
    const trial = await tx.one(
      `SELECT "MaHD" FROM "HOPDONG" WHERE "MaNV" = $1 AND "LoaiHD" = 'Thử việc' AND "TrangThai" <> 'Đã hủy bỏ'`,
      [c.employee.MaNV]
    );
    if (trial) fail('Nhân viên đã có hợp đồng thử việc; chỉ được thử việc một lần.');
  }
  if (c.LoaiHD === 'Xác định thời hạn') {
    assertFixedTermLength(c.start, c.end!);
    if ((await fixedTermTimes(tx, c.employee.MaNV)) >= LABOR_RULES.maxFixedTermTimes) {
      fail(
        `Đã ký/gia hạn hợp đồng xác định thời hạn ${LABOR_RULES.maxFixedTermTimes} lần; hợp đồng tiếp theo phải là không xác định thời hạn.`
      );
    }
  }

  const overlap = await tx.one(
    `SELECT "MaHD" FROM "HOPDONG"
     WHERE "MaNV" = $1 AND ${LIVE_CONTRACT}
       AND "NgayBatDau" <= $2 AND ("NgayKetThuc" IS NULL OR "NgayKetThuc" >= $3)`,
    [c.employee.MaNV, c.end || '9999-12-31', c.start]
  );
  if (overlap) fail('Khoảng thời gian bị trùng với hợp đồng hiện có.');

  const MaHD = await nextBusinessId(tx, 'HOPDONG');
  await tx.run(
    `INSERT INTO "HOPDONG"("MaHD", "MaNV", "LoaiHD", "NgayBatDau", "NgayKetThuc", "NgayKetThucGoc", "MucLuong", "TrangThai", "SoHD")
     VALUES($1, $2, $3, $4, $5, $5, $6, 'Hiệu lực', $7)`,
    [MaHD, c.employee.MaNV, c.LoaiHD, c.start, c.end, c.MucLuong, c.SoHD]
  );
  await auditLog(tx, actorId, 'Lập hợp đồng', MaHD);
  await syncEmployeeStatuses(tx, c.employee.MaNV);
  return MaHD;
}

function readNewContract(b: Record<string, any>, employee: { MaNV: string; NgayVaoLam: string }): NewContract {
  const LoaiHD = choice(b, 'LoaiHD', CONTRACT_TYPES);
  return {
    employee,
    LoaiHD,
    start: date(b, 'NgayBatDau'),
    end: LoaiHD === 'Không xác định thời hạn' ? null : date(b, 'NgayKetThuc'),
    MucLuong: numeric(b, 'MucLuong', 1, 100_000_000_000),
    SoHD: optional(b, 'SoHD', 60) || null,
  };
}

async function lockActiveEmployee(tx: DbExecutor, MaNV: string) {
  await tx.query('SELECT "MaNV" FROM "NHANVIEN" WHERE "MaNV" = $1 FOR UPDATE', [MaNV]);
  return requireActiveEmployee(tx, MaNV);
}

/** Tạo (hoặc dùng lại theo số) quyết định kèm theo phụ lục / chấm dứt hợp đồng. */
async function optionalDecision(
  tx: DbExecutor,
  b: Record<string, any>,
  LoaiQD: string,
  NgayHieuLuc: string,
  NoiDung: string
): Promise<string | null> {
  if (!b.SoQD) return null;
  const SoQD = text(b, 'SoQD', 60);
  const NguoiKy = text(b, 'NguoiKy', 120);
  const NgayKy = b.NgayKy ? date(b, 'NgayKy') : today();
  await tx.run(
    `INSERT INTO "QUYETDINH"("MaQD", "SoQD", "LoaiQD", "NgayKy", "NgayHieuLuc", "NguoiKy", "NoiDung")
     VALUES($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT ("SoQD") DO NOTHING`,
    [generateId('QD'), SoQD, LoaiQD, NgayKy, NgayHieuLuc, NguoiKy, NoiDung]
  );
  const d = await tx.one<{ MaQD: string }>('SELECT "MaQD" FROM "QUYETDINH" WHERE "SoQD" = $1', [SoQD]);
  return d?.MaQD ?? null;
}

// 3.1 Lập hợp đồng
contractsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);
    const b = req.body;
    const MaNV = text(b, 'MaNV');

    const MaHD = await withTransaction(async (tx) => {
      const e = await lockActiveEmployee(tx, MaNV);
      return insertContract(tx, readNewContract(b, e), u.MaTK);
    });
    res.status(201).json({ id: MaHD });
  })
);

// Gia hạn và điều chỉnh lương đều phải lập phụ lục trong cùng transaction.
function amendContract(extend: boolean) {
  return asyncHandler(async (req, res) => {
    const u = req.user!;
    requireRole(u, ['admin', 'hr']);

    const rid = paramId(req);
    const existing = await existsInTable(db, 'HOPDONG', rid);
    const b = req.body;
    const LyDo = text(b, 'LyDo', 1000);
    const currentDay = today();

    await withTransaction(async (tx) => {
      await lockActiveEmployee(tx, existing.MaNV);
      const c = (await tx.one<any>('SELECT * FROM "HOPDONG" WHERE "MaHD" = $1 FOR UPDATE', [rid]))!;
      if (c.TrangThai === 'Đã chấm dứt') fail('Hợp đồng đã chấm dứt.');
      if (c.TrangThai === 'Đã hủy bỏ') fail('Hợp đồng đã bị hủy bỏ.');
      if (extend && !c.NgayKetThuc) fail('Hợp đồng không xác định thời hạn không cần gia hạn.');

      const newEnd = extend ? date(b, 'NgayKetThucMoi') : c.NgayKetThuc;
      const MucLuong =
        !extend || (b.MucLuong != null && b.MucLuong !== '')
          ? numeric(b, 'MucLuong', 1, 100_000_000_000)
          : Number(c.MucLuong);
      const salaryChanged = MucLuong !== Number(c.MucLuong);
      if (!extend && !salaryChanged) fail('Mức lương mới phải khác mức lương hiện tại.');

      if (extend) {
        if (newEnd <= c.NgayKetThuc || newEnd < currentDay) {
          fail('Ngày gia hạn phải sau ngày kết thúc cũ và không trước hôm nay.');
        }
        if (c.LoaiHD === 'Thử việc') fail('Hợp đồng thử việc không gia hạn; hãy ký hợp đồng chính thức.');
        assertFixedTermLength(c.NgayBatDau, newEnd);
        if ((await fixedTermTimes(tx, c.MaNV)) >= LABOR_RULES.maxFixedTermTimes) {
          fail(
            `Đã ký/gia hạn hợp đồng xác định thời hạn ${LABOR_RULES.maxFixedTermTimes} lần; hãy ký hợp đồng không xác định thời hạn.`
          );
        }
        const overlap = await tx.one(
          `SELECT "MaHD" FROM "HOPDONG"
           WHERE "MaNV" = $1 AND "MaHD" != $2 AND ${LIVE_CONTRACT}
             AND "NgayBatDau" <= $3 AND ("NgayKetThuc" IS NULL OR "NgayKetThuc" >= $4)`,
          [c.MaNV, rid, newEnd, c.NgayBatDau]
        );
        if (overlap) fail('Thời hạn mới trùng với hợp đồng khác.');
      }

      // Ngày hiệu lực của mức lương mới: mặc định hôm nay, có thể lùi (ghi bù) hoặc hẹn tương lai.
      const NgayHieuLuc = extend ? currentDay : optionalDate(b, 'NgayHieuLuc') ?? currentDay;
      if (NgayHieuLuc < c.NgayBatDau) fail('Ngày hiệu lực không được trước ngày bắt đầu hợp đồng.');
      if (NgayHieuLuc > addMonths(currentDay, 12)) fail('Ngày hiệu lực không được quá 12 tháng sau hôm nay.');
      const applyNow = NgayHieuLuc <= currentDay;
      if (!extend) {
        const pending = await tx.one(
          'SELECT "MaGH" FROM "GIAHANHOPDONG" WHERE "MaHD" = $1 AND "DaApDung" = FALSE',
          [rid]
        );
        if (pending) fail('Hợp đồng đang có phụ lục lương chờ hiệu lực.');
      }

      const seqRow = await tx.one<{ n: number }>(
        'SELECT COALESCE(MAX("LanGiaHan"), 0) + 1 AS n FROM "GIAHANHOPDONG" WHERE "MaHD" = $1',
        [rid]
      );
      const LanGiaHan = Number(seqRow?.n ?? 1);
      const MaQD = await optionalDecision(tx, b, 'Gia hạn hợp đồng', NgayHieuLuc, LyDo);

      await tx.run(
        `INSERT INTO "GIAHANHOPDONG"("MaGH", "MaHD", "LanGiaHan", "NgayLap", "NgayKetThucCu", "NgayKetThucMoi", "LyDo",
          "LoaiPhuLuc", "LuongCu", "LuongMoi", "NgayHieuLuc", "DaApDung", "MaQD")
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          generateId('PL'),
          rid,
          LanGiaHan,
          currentDay,
          c.NgayKetThuc,
          newEnd,
          LyDo,
          extend ? (salaryChanged ? 'Gia hạn và điều chỉnh lương' : 'Gia hạn') : 'Điều chỉnh lương',
          Number(c.MucLuong),
          MucLuong,
          NgayHieuLuc,
          applyNow,
          MaQD,
        ]
      );
      await tx.run('UPDATE "HOPDONG" SET "NgayKetThuc" = $1, "MucLuong" = $2 WHERE "MaHD" = $3', [
        newEnd,
        applyNow ? MucLuong : Number(c.MucLuong),
        rid,
      ]);
      await auditLog(
        tx,
        u.MaTK,
        extend ? 'Gia hạn hợp đồng và lập phụ lục' : 'Điều chỉnh lương và lập phụ lục',
        rid,
        {
          MucLuong: { from: Number(c.MucLuong), to: MucLuong },
          NgayKetThuc: { from: c.NgayKetThuc, to: newEnd },
          NgayHieuLuc,
        }
      );
      await syncEmployeeStatuses(tx, c.MaNV);
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
    const existing = await existsInTable(db, 'HOPDONG', rid);
    const b = req.body;

    const newId = await withTransaction(async (tx) => {
      const e = await lockActiveEmployee(tx, existing.MaNV);
      const trial = (await tx.one<any>('SELECT * FROM "HOPDONG" WHERE "MaHD" = $1 FOR UPDATE', [rid]))!;
      if (trial.LoaiHD !== 'Thử việc') fail('Chỉ chuyển chính thức từ hợp đồng thử việc.');
      if (trial.TrangThai === 'Đã chấm dứt' || trial.TrangThai === 'Đã hủy bỏ') {
        fail('Hợp đồng thử việc không còn hiệu lực.');
      }
      const next = readNewContract(b, e);
      if (next.LoaiHD === 'Thử việc') fail('Hợp đồng chính thức không thể là hợp đồng thử việc.');
      if (next.start <= trial.NgayBatDau) fail('Hợp đồng chính thức phải bắt đầu sau ngày bắt đầu thử việc.');

      // Rút ngắn hợp đồng thử việc đến ngày trước khi hợp đồng chính thức bắt đầu.
      const trialEnd = shift(next.start, -1);
      if (!trial.NgayKetThuc || trial.NgayKetThuc > trialEnd) {
        await tx.run('UPDATE "HOPDONG" SET "NgayKetThuc" = $1 WHERE "MaHD" = $2', [trialEnd, rid]);
      }
      const MaHD = await insertContract(tx, next, u.MaTK);
      await auditLog(tx, u.MaTK, 'Chuyển hợp đồng thử việc thành chính thức', rid, { hopdongmoi: MaHD });
      return MaHD;
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
    const existing = await existsInTable(db, 'HOPDONG', rid);
    const b = req.body;
    const NgayChamDut = date(b, 'NgayChamDut');
    const LyDoChamDut = text(b, 'LyDoChamDut', 1000);
    const LoaiChamDut = choice(
      { LoaiChamDut: b.LoaiChamDut ?? 'Thỏa thuận chấm dứt' },
      'LoaiChamDut',
      TERMINATION_TYPES
    );
    const currentDay = today();

    await withTransaction(async (tx) => {
      await lockActiveEmployee(tx, existing.MaNV);
      const c = (await tx.one<any>('SELECT * FROM "HOPDONG" WHERE "MaHD" = $1 FOR UPDATE', [rid]))!;
      if (c.TrangThai === 'Đã chấm dứt') fail('Hợp đồng đã chấm dứt.');
      if (c.TrangThai === 'Đã hủy bỏ') fail('Hợp đồng đã bị hủy bỏ.');
      if (NgayChamDut < c.NgayBatDau || (c.NgayKetThuc && NgayChamDut > c.NgayKetThuc)) {
        fail('Ngày chấm dứt phải nằm trong thời hạn hợp đồng.');
      }
      if (NgayChamDut > addMonths(currentDay, 6)) fail('Chỉ được hẹn chấm dứt trong vòng 6 tháng tới.');

      const MaQD = await optionalDecision(tx, b, 'Chấm dứt hợp đồng', NgayChamDut, LyDoChamDut);

      await tx.run(
        `UPDATE "HOPDONG" SET "NgayChamDut" = $1, "LyDoChamDut" = $2, "LoaiChamDut" = $3, "MaQDChamDut" = $4
         WHERE "MaHD" = $5`,
        [NgayChamDut, LyDoChamDut, LoaiChamDut, MaQD, rid]
      );
      if (NgayChamDut <= currentDay) {
        await finalizeTermination(
          tx,
          c,
          u.MaTK,
          'Chấm dứt hợp đồng và cập nhật trạng thái nhân viên',
          LoaiChamDut
        );
      } else {
        await auditLog(tx, u.MaTK, 'Hẹn chấm dứt hợp đồng', rid, { NgayChamDut, LoaiChamDut });
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
    const existing = await existsInTable(db, 'HOPDONG', rid);
    const LyDo = text(req.body, 'LyDo', 1000);

    await withTransaction(async (tx) => {
      await tx.query('SELECT "MaNV" FROM "NHANVIEN" WHERE "MaNV" = $1 FOR UPDATE', [existing.MaNV]);
      const c = (await tx.one<any>('SELECT * FROM "HOPDONG" WHERE "MaHD" = $1 FOR UPDATE', [rid]))!;
      if (c.TrangThai === 'Đã chấm dứt') fail('Hợp đồng đã chấm dứt; không thể hủy bỏ.');
      if (c.TrangThai === 'Đã hủy bỏ') fail('Hợp đồng đã bị hủy bỏ.');
      await tx.run(
        `UPDATE "HOPDONG" SET "TrangThai" = 'Đã hủy bỏ', "LyDoChamDut" = $1, "LoaiChamDut" = 'Hủy bỏ do nhập sai',
                "NgayChamDut" = NULL
         WHERE "MaHD" = $2`,
        [LyDo, rid]
      );
      await syncEmployeeStatuses(tx, c.MaNV);
      await auditLog(tx, u.MaTK, 'Hủy bỏ hợp đồng', rid, { LyDo });
    });
    res.json({ ok: true });
  })
);
