import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a PostgreSQL connection with CREATE DATABASE permission. Tests create and remove their own database.');
}

test('Employee accounts, directors, contract appendices and termination', async (t) => {
  const databaseName = `peopleops_test_${randomBytes(8).toString('hex')}`;
  const adminPool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await adminPool.query(`CREATE DATABASE ${databaseName}`);
  const testUrl = new URL(process.env.TEST_DATABASE_URL);
  testUrl.pathname = `/${databaseName}`;
  process.env.DATABASE_URL = testUrl.toString();
  let pool;
  let server;
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (pool) await pool.end();
    await adminPool.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
    await adminPool.end();
  });

  const database = await import('../dist/db/pool.js');
  pool = database.pool;
  await database.initSchema();
  const { seedDatabase } = await import('../dist/db/seed.js');
  await seedDatabase();
  const { createExpressApp } = await import('../dist/app.js');
  const { today, shift, nextWorkingDay, isWorkingDay } = await import('../dist/utils/validation.js');
  const date = today();
  server = createExpressApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, body, cookie = '', method = body ? 'POST' : 'GET') {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function login(TenDangNhap, MatKhau = 'Demo@12345') {
    const result = await request('/login', { TenDangNhap, MatKhau });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.cookie;
  }
  const admin = await login('admin');
  const hr = await login('nhansu');
  const manager = await login('truongphong');
  let sequence = 0;
  function employee(overrides = {}) {
    const key = `TEST${++sequence}`;
    return { MaNV: key, HoTen: `Nhân viên kiểm thử ${key}`, NgaySinh: '2000-01-01', GioiTinh: 'Nam', SoDienThoai: `09${String(10_000_000 + sequence)}`,
      Email: `${key}@example.com`, NgayVaoLam: shift(date, -60), TrangThai: 'Đang làm việc',
      MaPB: 'PB02', MaCV: 'CV01', VaiTro: 'employee', ...overrides };
  }
  async function addEmployee(values, cookie = admin) {
    const result = await request('/employees', values, cookie);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    values.MaNV = result.body.id;
    return result.body.taikhoan;
  }
  async function addContract(e, overrides = {}) {
    const values = { MaHD: `CT${++sequence}`, MaNV: e.MaNV, LoaiHD: 'Xác định thời hạn',
      NgayBatDau: shift(date, -30), NgayKetThuc: shift(date, 90), MucLuong: 10_000_000, ...overrides };
    const result = await request('/contracts', values, admin);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    values.MaHD = result.body.id;
    return values;
  }
  async function state(cookie = admin) {
    const result = await request('/state', undefined, cookie);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  }

  await t.test('Employee and contract IDs are generated without input and remain unique under concurrent creation', async () => {
    const values = Array.from({ length: 5 }, () => employee({ MaNV: undefined }));
    await Promise.all(values.map((e) => addEmployee(e)));
    assert.equal(new Set(values.map((e) => e.MaNV)).size, 5);
    assert.ok(values.every((e) => /^NV\d{3,}$/.test(e.MaNV)));
    const contracts = await Promise.all(values.map((e) => addContract(e, { MaHD: undefined })));
    assert.equal(new Set(contracts.map((c) => c.MaHD)).size, 5);
    assert.ok(contracts.every((c) => /^HD\d{3,}$/.test(c.MaHD)));
  });

  await t.test('Department IDs are automatic, sequential and unique for concurrent requests', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => request('/departments', {
      MaPB: 'MANUAL', TenPB: `Phòng kiểm thử ${i}`, NgayThanhLap: date, MoTa: '',
    }, admin)));
    assert.ok(results.every((r) => r.status === 201));
    const ids = results.map((r) => r.body.id);
    assert.equal(new Set(ids).size, 4);
    assert.deepEqual(ids.map((id) => Number(id.slice(2))).sort((a, b) => a - b), [7, 8, 9, 10]);
    assert.ok(ids.every((id) => /^PB\d+$/.test(id)));
  });

  await t.test('A new employee can log in with their full email and generated password', async () => {
    const e = employee({ Email: `${'long-email-'.repeat(7)}@example.com` });
    const account = await addEmployee(e, hr);
    assert.equal(account.TenDangNhap, e.Email);
    assert.ok(account.MatKhau.length >= 10);
    const cookie = await login(account.TenDangNhap, account.MatKhau);
    const own = await state(cookie);
    assert.equal(own.user.MaNV, e.MaNV);
    assert.equal(own.employees.length, 1);
    assert.ok(!JSON.stringify(own).includes(account.MatKhau));
    const stored = (await pool.query('SELECT "MatKhau" FROM taikhoan WHERE "MaNV" = $1', [e.MaNV])).rows[0];
    assert.notEqual(stored.MatKhau, account.MatKhau);
  });

  await t.test('Director role or director position removes the department; ordinary employees require it', async () => {
    const directors = [];
    const directorAccounts = [];
    for (const overrides of [{ VaiTro: 'director', MaPB: undefined }, { MaCV: 'CV04', VaiTro: undefined }]) {
      const e = employee(overrides);
      directors.push(e);
      const account = await addEmployee(e);
      directorAccounts.push(account);
      assert.equal((await state()).employees.find((item) => item.MaNV === e.MaNV).MaPB, null);
      assert.equal(account.VaiTro, 'director');
      const cookie = await login(account.TenDangNhap, account.MatKhau);
      assert.equal((await state(cookie)).user.MaPB, null);
      const updated = await request(`/employees/${e.MaNV}`, { ...e, MaPB: null }, admin, 'PUT');
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
    }
    const missing = await request('/employees', employee({ MaPB: undefined }), admin);
    assert.equal(missing.status, 400);
    const duplicateAccount = await request('/users', { TenDangNhap: 'second_account', MatKhau: 'Example@12345', VaiTro: 'manager', MaNV: directors[0].MaNV }, admin);
    assert.equal(duplicateAccount.status, 409);
    const directorUser = (await pool.query('SELECT "MaTK" FROM taikhoan WHERE "MaNV" = $1', [directors[0].MaNV])).rows[0];
    assert.equal((await request(`/users/${directorUser.MaTK}/role`, { VaiTro: 'manager' }, admin, 'PUT')).status, 200);
    const noDeptManager = await login(directorAccounts[0].TenDangNhap, directorAccounts[0].MatKhau);
    assert.equal((await state(noDeptManager)).employees.length, 1);
    const MaLoai = (await state()).leaveTypes[0].MaLoai;
    const leave = await request('/leaves', { MaNV: directors[1].MaNV, MaLoai, TuNgay: nextWorkingDay(date), DenNgay: nextWorkingDay(date), LyDo: 'Kiểm tra phạm vi phòng ban' }, admin);
    assert.equal(leave.status, 201);
    assert.equal((await request(`/leaves/${leave.body.id}/review`, { TrangThai: 'Đã duyệt' }, noDeptManager)).status, 403);
  });

  await t.test('Account conflicts roll back employee creation and HR cannot create an admin', async () => {
    await pool.query(`UPDATE taikhoan SET "TenDangNhap" = 'reserved@example.com' WHERE "MaNV" = 'NV003'`);
    const e = employee({ Email: 'reserved@example.com' });
    assert.equal((await request('/employees', e, admin)).status, 409);
    assert.equal((await pool.query('SELECT "MaNV" FROM nhanvien WHERE "MaNV" = $1', [e.MaNV])).rowCount, 0);
    assert.equal((await request('/employees', employee({ VaiTro: 'admin' }), hr)).status, 403);
  });

  const e = employee();
  const account = await addEmployee(e);
  const c = await addContract(e);
  await t.test('Salary changes and extensions create appendices with old and new values', async () => {
    assert.equal((await request(`/contracts/${c.MaHD}/salary`, { MucLuong: 12_000_000, LyDo: 'Tăng lương' }, admin)).status, 200);
    assert.equal((await request(`/contracts/${c.MaHD}/extend`, { NgayKetThucMoi: shift(date, 180), LyDo: 'Gia hạn' }, admin)).status, 200);
    // Luật: hợp đồng xác định thời hạn chỉ được ký/gia hạn tối đa 2 lần.
    assert.equal((await request(`/contracts/${c.MaHD}/extend`, { NgayKetThucMoi: shift(date, 270), MucLuong: 15_000_000, LyDo: 'Gia hạn lần 3' }, admin)).status, 400);
    assert.equal((await request(`/contracts/${c.MaHD}/salary`, { MucLuong: 15_000_000, LyDo: 'Tăng lương lần 2' }, admin)).status, 200);
    const data = await state();
    const contract = data.contracts.find((item) => item.MaHD === c.MaHD);
    assert.equal(contract.MucLuong, 15_000_000);
    assert.equal(contract.NgayKetThuc, shift(date, 180));
    const appendices = data.extensions.filter((item) => item.MaHD === c.MaHD).sort((a, b) => a.LanGiaHan - b.LanGiaHan);
    assert.deepEqual(appendices.map((item) => item.LoaiPhuLuc), ['Điều chỉnh lương', 'Gia hạn', 'Điều chỉnh lương']);
    assert.deepEqual(appendices.map((item) => [item.LuongCu, item.LuongMoi]), [[10_000_000, 12_000_000], [12_000_000, 12_000_000], [12_000_000, 15_000_000]]);
    assert.equal(appendices[0].NgayKetThucCu, appendices[0].NgayKetThucMoi);
    const own = await state(await login(account.TenDangNhap, account.MatKhau));
    assert.equal(own.extensions.find((item) => item.MaHD === c.MaHD).LuongMoi, 15_000_000);
    const scoped = await state(manager);
    assert.ok(scoped.extensions.filter((item) => item.MaHD === c.MaHD).every((item) => item.LuongCu === null && item.LuongMoi === null));
    assert.equal((await request(`/contracts/${c.MaHD}/salary`, { MucLuong: 20_000_000, LyDo: 'Không có quyền' }, manager)).status, 403);
  });

  await t.test('Invalid amendments leave both contract and appendix history unchanged', async () => {
    for (const body of [{ MucLuong: 0, LyDo: 'Sai' }, { MucLuong: 15_000_000, LyDo: 'Không đổi' }, { MucLuong: 20_000_000 }]) {
      assert.equal((await request(`/contracts/${c.MaHD}/salary`, body, admin)).status, 400);
    }
    assert.equal((await request(`/contracts/${c.MaHD}/extend`, { NgayKetThucMoi: shift(date, 200), MucLuong: 20_000_000, LyDo: 'Ngày sai' }, admin)).status, 400);
    const data = await state();
    assert.equal(data.contracts.find((item) => item.MaHD === c.MaHD).MucLuong, 15_000_000);
    assert.equal(data.extensions.filter((item) => item.MaHD === c.MaHD).length, 3);
  });

  await t.test('Indefinite contracts support salary appendices without an end date', async () => {
    const indefinite = employee();
    await addEmployee(indefinite);
    const contract = await addContract(indefinite, { LoaiHD: 'Không xác định thời hạn', NgayKetThuc: null });
    assert.equal((await request(`/contracts/${contract.MaHD}/salary`, { MucLuong: 11_000_000, LyDo: 'Tăng lương' }, admin)).status, 200);
    const appendix = (await state()).extensions.find((item) => item.MaHD === contract.MaHD);
    assert.equal(appendix.NgayKetThucMoi, null);
    assert.equal((await request(`/contracts/${contract.MaHD}/extend`, { NgayKetThucMoi: shift(date, 300), LyDo: 'Không cần gia hạn' }, admin)).status, 400);
  });

  await t.test('Terminating the last current contract updates employment status and revokes login', async () => {
    const employeeCookie = await login(account.TenDangNhap, account.MatKhau);
    assert.equal((await request(`/contracts/${c.MaHD}/terminate`, { NgayChamDut: date, LyDoChamDut: 'Nghỉ việc' }, admin)).status, 200);
    const data = await state();
    assert.equal(data.employees.find((item) => item.MaNV === e.MaNV).TrangThai, 'Đã nghỉ việc');
    assert.equal(data.extensions.filter((item) => item.MaHD === c.MaHD).length, 3);
    assert.equal((await request('/state', undefined, employeeCookie)).status, 401);
    assert.equal((await request('/login', { TenDangNhap: account.TenDangNhap, MatKhau: account.MatKhau })).status, 401);
    assert.equal((await request(`/contracts/${c.MaHD}/salary`, { MucLuong: 20_000_000, LyDo: 'Đã nghỉ' }, admin)).status, 400);
    assert.equal((await request(`/employees/${e.MaNV}/archive`, {}, admin)).status, 200);
  });

  await t.test('Terminating an old contract preserves the status of an employee with a current contract', async () => {
    const working = employee();
    await addEmployee(working);
    const old = await addContract(working, { NgayBatDau: shift(date, -50), NgayKetThuc: shift(date, -10) });
    await addContract(working, { NgayBatDau: date });
    assert.equal((await request(`/contracts/${old.MaHD}/terminate`, { NgayChamDut: shift(date, -10), LyDoChamDut: 'Kết thúc hợp đồng cũ' }, admin)).status, 200);
    assert.equal((await state()).employees.find((item) => item.MaNV === working.MaNV).TrangThai, 'Đang làm việc');
  });


  await pool.query('DELETE FROM ngayle');

  await t.test('Leave days count working days only; backdated leave is limited to HR/admin', async () => {
    const w = employee();
    const account = await addEmployee(w);
    const MaLoai = 'LP01';
    let sat = shift(date, 1);
    while (new Date(`${sat}T00:00:00Z`).getUTCDay() !== 6) sat = shift(sat, 1);
    const sun = shift(sat, 1);
    const weekend = await request('/leaves', { MaNV: w.MaNV, MaLoai, TuNgay: sat, DenNgay: sun, LyDo: 'Cuối tuần' }, admin);
    assert.equal(weekend.status, 400);
    const ok = await request('/leaves', { MaNV: w.MaNV, MaLoai, TuNgay: shift(sat, -1), DenNgay: shift(sun, 1), LyDo: 'Nối cuối tuần' }, admin);
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal((await pool.query('SELECT "SoNgay" FROM donnghiphep WHERE "MaDon" = $1', [ok.body.id])).rows[0].SoNgay, 2);

    let past = shift(date, -3);
    while (!isWorkingDay(past)) past = shift(past, -1);
    const own = await login(account.TenDangNhap, account.MatKhau);
    assert.equal((await request('/leaves', { MaLoai: 'LP02', TuNgay: past, DenNgay: past, LyDo: 'Ốm' }, own)).status, 400);
    assert.equal((await request('/leaves', { MaNV: w.MaNV, MaLoai: 'LP02', TuNgay: past, DenNgay: past, LyDo: 'Ốm bù' }, hr)).status, 201);
  });

  await t.test('Leave approval routing, quota safety and cancelling an approved leave', async () => {
    const dir = await login('giamdoc');
    const noManager = employee({ MaPB: 'PB03' });
    const withManager = employee({ MaPB: 'PB02' });
    const noManagerAccount = await addEmployee(noManager);
    await addEmployee(withManager);
    const start = nextWorkingDay(shift(date, 3));
    const leave = (e) => request('/leaves', { MaNV: e.MaNV, MaLoai: 'LP01', TuNgay: start, DenNgay: start, LyDo: 'Việc gia đình' }, admin);
    const a = await leave(noManager);
    const b = await leave(withManager);
    assert.equal((await request(`/leaves/${b.body.id}/review`, { TrangThai: 'Đã duyệt' }, hr)).status, 403);
    assert.equal((await request(`/leaves/${a.body.id}/review`, { TrangThai: 'Đã duyệt' }, hr)).status, 403);
    assert.equal((await request(`/leaves/${a.body.id}/review`, { TrangThai: 'Đã duyệt' }, manager)).status, 403);
    assert.equal((await request(`/leaves/${a.body.id}/review`, { TrangThai: 'Đã duyệt' }, dir)).status, 200);
    assert.equal((await request(`/leaves/${b.body.id}/review`, { TrangThai: 'Đã duyệt' }, manager)).status, 200);
    assert.equal((await request(`/leaves/${a.body.id}/review`, { TrangThai: 'Đã duyệt' }, dir)).status, 400);
    assert.ok((await state(manager)).leaves.every((item) => typeof item.coquyenduyet === 'boolean'));

    const owner = await login(noManagerAccount.TenDangNhap, noManagerAccount.MatKhau);
    const used = async () => (await state()).balances.find((item) => item.MaNV === noManager.MaNV && item.Nam === Number(date.slice(0, 4))).SoNgayDaNghi;
    assert.equal(await used(), 1);
    assert.equal((await request(`/leaves/${a.body.id}/cancel`, {}, owner)).status, 200);
    assert.equal(await used(), 0);
  });

  await t.test('Labor rules, converting a trial contract and voiding a contract', async () => {
    const x = employee();
    await addEmployee(x);
    const tooLong = await request('/contracts', { MaNV: x.MaNV, LoaiHD: 'Thử việc', NgayBatDau: shift(date, -30), NgayKetThuc: shift(date, 60), MucLuong: 5_000_000 }, admin);
    assert.equal(tooLong.status, 400);
    const trial = await addContract(x, { LoaiHD: 'Thử việc', NgayBatDau: shift(date, -10), NgayKetThuc: shift(date, 40) });
    assert.equal((await state()).employees.find((item) => item.MaNV === x.MaNV).TrangThai, 'Thử việc');
    const second = await request('/contracts', { MaNV: x.MaNV, LoaiHD: 'Thử việc', NgayBatDau: shift(date, 41), NgayKetThuc: shift(date, 60), MucLuong: 5_000_000 }, admin);
    assert.equal(second.status, 400);

    const converted = await request(`/contracts/${trial.MaHD}/convert`, { LoaiHD: 'Xác định thời hạn', NgayBatDau: date, NgayKetThuc: shift(date, 365), MucLuong: 9_000_000 }, admin);
    assert.equal(converted.status, 201, JSON.stringify(converted.body));
    let data = await state();
    assert.equal(data.employees.find((item) => item.MaNV === x.MaNV).TrangThai, 'Đang làm việc');
    assert.equal(data.contracts.find((item) => item.MaHD === trial.MaHD).NgayKetThuc, shift(date, -1));
    assert.equal((await request(`/contracts/${converted.body.id}/void`, { LyDo: 'Nhập nhầm' }, admin)).status, 200);
    data = await state();
    assert.equal(data.contracts.find((item) => item.MaHD === converted.body.id).TrangThai, 'Đã hủy bỏ');

    const y = employee();
    await addEmployee(y);
    await addContract(y, { NgayBatDau: shift(date, -60), NgayKetThuc: shift(date, -31) });
    await addContract(y, { NgayBatDau: shift(date, -30), NgayKetThuc: shift(date, -1) });
    const third = await request('/contracts', { MaNV: y.MaNV, LoaiHD: 'Xác định thời hạn', NgayBatDau: date, NgayKetThuc: shift(date, 30), MucLuong: 5_000_000 }, admin);
    assert.equal(third.status, 400);
    const indefinite = await request('/contracts', { MaNV: y.MaNV, LoaiHD: 'Không xác định thời hạn', NgayBatDau: date, MucLuong: 5_000_000 }, admin);
    assert.equal(indefinite.status, 201);
  });

  await t.test('Employee resignation is finalised on its effective date even with a future contract', async () => {
    const z = employee();
    const account = await addEmployee(z);
    const zc = await addContract(z);
    const futureContractStart = shift(date, 30);
    await pool.query(
      `INSERT INTO hopdong("MaHD", "MaNV", "LoaiHD", "NgayBatDau", "NgayKetThuc", "NgayKetThucGoc", "MucLuong", "TrangThai")
       VALUES($1, $2, 'Xác định thời hạn', $3, $4, $4, 10_000_000, 'Hiệu lực')`,
      [`FUTURE-${z.MaNV}`, z.MaNV, futureContractStart, shift(futureContractStart, 90)]
    );
    const scheduled = await request(`/contracts/${zc.MaHD}/terminate`, { NgayChamDut: shift(date, 5), LyDoChamDut: 'Người lao động xin nghỉ', LoaiChamDut: 'Người lao động xin nghỉ' }, admin);
    assert.equal(scheduled.status, 200, JSON.stringify(scheduled.body));
    let data = await state();
    assert.equal(data.contracts.find((item) => item.MaHD === zc.MaHD).TrangThai, 'Hiệu lực');
    assert.equal(data.employees.find((item) => item.MaNV === z.MaNV).TrangThai, 'Đang làm việc');
    await pool.query('UPDATE hopdong SET "NgayChamDut" = $1 WHERE "MaHD" = $2', [shift(date, -1), zc.MaHD]);
    await (await import('../dist/services/jobs.js')).runScheduledJobs(true);
    data = await state();
    assert.equal(data.contracts.find((item) => item.MaHD === zc.MaHD).TrangThai, 'Đã chấm dứt');
    assert.equal(data.employees.find((item) => item.MaNV === z.MaNV).TrangThai, 'Đã nghỉ việc');
    assert.equal((await request('/login', { TenDangNhap: account.TenDangNhap, MatKhau: account.MatKhau })).status, 401);
  });

  await t.test('Assignments can be scheduled, applied and cancelled', async () => {
    const q = employee({ MaPB: 'PB02' });
    await addEmployee(q);
    const body = (suffix, effective) => ({ MaNV: q.MaNV, MaPBMoi: 'PB03', MaCVMoi: 'CV01', LoaiBienDong: 'Điều chuyển',
      NgayHieuLuc: effective, NgayKy: date, SoQD: `QD-${q.MaNV}-${suffix}`, NguoiKy: 'Giám đốc', LyDo: 'Điều chuyển' });
    const future = await request('/assignments', body('A', shift(date, 10)), admin);
    assert.equal(future.status, 201, JSON.stringify(future.body));
    let data = await state();
    assert.equal(data.employees.find((item) => item.MaNV === q.MaNV).MaPB, 'PB02');
    assert.equal(data.assignments.find((item) => item.MaQT === future.body.id).TrangThai, 'Chờ hiệu lực');
    assert.equal((await request('/assignments', body('B', shift(date, 11)), admin)).status, 400);
    assert.equal((await request(`/assignments/${future.body.id}/cancel`, { LyDoHuy: 'Không điều chuyển nữa' }, admin)).status, 200);

    const now = await request('/assignments', body('C', date), admin);
    assert.equal(now.status, 201, JSON.stringify(now.body));
    assert.equal((await state()).employees.find((item) => item.MaNV === q.MaNV).MaPB, 'PB03');
    assert.equal((await request(`/assignments/${now.body.id}/cancel`, { LyDoHuy: 'Nhập nhầm' }, admin)).status, 200);
    data = await state();
    assert.equal(data.employees.find((item) => item.MaNV === q.MaNV).MaPB, 'PB02');
    assert.equal(data.assignments.find((item) => item.MaQT === now.body.id).TrangThai, 'Đã hủy');
  });

  await t.test('Accounts: password reset, role change, username sync, optimistic lock, duplicates and lockout', async () => {
    const v = employee();
    const account = await addEmployee(v);
    const MaTK = (await pool.query('SELECT "MaTK" FROM taikhoan WHERE "MaNV" = $1', [v.MaNV])).rows[0].MaTK;

    const reset = await request(`/users/${MaTK}/reset-password`, {}, admin);
    assert.equal(reset.status, 200);
    assert.equal((await request('/login', { TenDangNhap: account.TenDangNhap, MatKhau: account.MatKhau })).status, 401);
    await login(account.TenDangNhap, reset.body.MatKhau);
    assert.equal((await request(`/users/${MaTK}/reset-password`, {}, hr)).status, 403);

    const current = (await state()).employees.find((item) => item.MaNV === v.MaNV);
    assert.equal((await request(`/employees/${v.MaNV}`, { ...v, PhienBan: current.PhienBan - 1 }, admin, 'PUT')).status, 409);
    const newEmail = `moi-${v.Email}`;
    assert.equal((await request(`/employees/${v.MaNV}`, { ...v, Email: newEmail, PhienBan: current.PhienBan }, admin, 'PUT')).status, 200);
    await login(newEmail, reset.body.MatKhau);

    const clash = employee({ SoDienThoai: v.SoDienThoai });
    assert.equal((await request('/employees', clash, admin)).status, 409);
    assert.equal((await request('/employees', { ...clash, confirm_duplicate: true }, admin)).status, 201);

    for (let i = 0; i < 8; i++) {
      assert.equal((await request('/login', { TenDangNhap: 'khoa-thu', MatKhau: 'sai-mat-khau-dai' })).status, 401);
    }
    assert.equal((await request('/login', { TenDangNhap: 'khoa-thu', MatKhau: 'sai-mat-khau-dai' })).status, 429);
  });

  await t.test('Schema upgrades can be applied again while retaining records and appendices', async () => {
    await database.initSchema();
    const data = await state();
    assert.equal(data.extensions.filter((item) => item.MaHD === c.MaHD).length, 3);
    assert.equal(data.employees.find((item) => item.MaNV === e.MaNV).TrangThai, 'Đã lưu trữ');
    const view = await pool.query('SELECT "MaNV", "Nam", "TongSoNgayPhep", "SoNgayDaNghi", "SoNgayConLai" FROM v_songayphep LIMIT 1');
    assert.equal(view.rowCount, 1);
  });

  await t.test('Positions auto-ID, department "MaTruongPhong" validation, and usage summary on delete (03)', async () => {
    const posRes = await request('/positions', {
      MaCV: 'IGNORED',
      TenCV: 'Trưởng nhóm kiểm thử',
      CapBac: 4,
      MoTa: 'Nhóm trưởng',
      LaDieuHanh: false,
      VaiTroMacDinh: 'manager',
      HoatDong: true,
    }, admin);
    assert.equal(posRes.status, 201, JSON.stringify(posRes.body));
    assert.match(posRes.body.id, /^CV\d{2,}$/);

    // Không xóa được phòng ban hoặc chức vụ đang sử dụng, trả 409 kèm thông tin số lượng
    const delDept = await request('/departments/PB02', undefined, admin, 'DELETE');
    assert.equal(delDept.status, 409);
    assert.match(delDept.body.error, /nhân viên/);

    const delPos = await request('/positions/CV01', undefined, admin, 'DELETE');
    assert.equal(delPos.status, 409);

    // Xóa được chức vụ chưa sử dụng
    assert.equal((await request(`/positions/${posRes.body.id}`, undefined, admin, 'DELETE')).status, 200);

    // Gán trưởng phòng khác phòng ban bị từ chối (400)
    const wrongHead = await request('/departments/PB02', {
      TenPB: 'Công nghệ',
      MoTa: 'Phát triển sản phẩm và hạ tầng',
      NgayThanhLap: '2022-01-01',
      MaTruongPhong: 'NV001', // NV001 thuộc PB01
    }, admin, 'PUT');
    assert.equal(wrongHead.status, 400);
  });

  await t.test('Contract "NgayKetThucGoc" preservation and decision links on extend/terminate (04)', async () => {
    const emp4 = employee();
    await addEmployee(emp4);
    const initialEnd = shift(date, 90);
    const c4 = await addContract(emp4, { NgayBatDau: shift(date, -20), NgayKetThuc: initialEnd });

    const extRes = await request(`/contracts/${c4.MaHD}/extend`, {
      NgayKetThucMoi: shift(date, 180),
      LyDo: 'Gia hạn theo quyết định',
      SoQD: `QD-GH-${c4.MaHD}`,
      NguoiKy: 'Trần Hải Đăng',
      NgayKy: date,
    }, admin);
    assert.equal(extRes.status, 200, JSON.stringify(extRes.body));

    let data = await state();
    const updatedC4 = data.contracts.find((item) => item.MaHD === c4.MaHD);
    assert.equal(updatedC4.NgayKetThucGoc, initialEnd);
    assert.equal(updatedC4.NgayKetThuc, shift(date, 180));
    const extRecord = data.extensions.find((item) => item.MaHD === c4.MaHD);
    assert.ok(extRecord.MaQD);

    const termRes = await request(`/contracts/${c4.MaHD}/terminate`, {
      NgayChamDut: date,
      LoaiChamDut: 'Thỏa thuận chấm dứt',
      LyDoChamDut: 'Chấm dứt theo thỏa thuận',
      SoQD: `QD-CD-${c4.MaHD}`,
      NguoiKy: 'Trần Hải Đăng',
      NgayKy: date,
    }, admin);
    assert.equal(termRes.status, 200, JSON.stringify(termRes.body));
    data = await state();
    assert.ok(data.contracts.find((item) => item.MaHD === c4.MaHD).MaQDChamDut);
  });

  await t.test('Shared 1-N decisions, Mien nhiem assignment, Holidays API and Leave Balances (05)', async () => {
    const empA = employee({ MaPB: 'PB02', MaCV: 'CV02' });
    const empB = employee({ MaPB: 'PB03', MaCV: 'CV02' });
    await addEmployee(empA);
    await addEmployee(empB);

    const sharedDecision = {
      LoaiBienDong: 'Miễn nhiệm',
      MaCVMoi: 'CV01',
      NgayHieuLuc: date,
      NgayKy: date,
      SoQD: 'QD-MIEN-NHIEM-CHUNG-01',
      NguoiKy: 'Trần Hải Đăng',
      LyDo: 'Miễn nhiệm chức vụ Trưởng phòng chuyển về Chuyên viên',
    };

    const r1 = await request('/assignments', { ...sharedDecision, MaNV: empA.MaNV, MaPBMoi: 'PB02' }, admin);
    assert.equal(r1.status, 201, JSON.stringify(r1.body));

    const r2 = await request('/assignments', { ...sharedDecision, MaNV: empB.MaNV, MaPBMoi: 'PB03' }, admin);
    assert.equal(r2.status, 201, JSON.stringify(r2.body));

    const data = await state();
    const a1 = data.assignments.find((x) => x.MaQT === r1.body.id);
    const a2 = data.assignments.find((x) => x.MaQT === r2.body.id);
    assert.equal(a1.MaQD, a2.MaQD);
    assert.equal(a1.LoaiBienDong, 'Miễn nhiệm');

    // Holidays API
    const holDay = `${Number(date.slice(0, 4)) + 1}-12-25`;
    assert.equal((await request('/holidays', { Ngay: holDay, TenNgayLe: 'Lễ kiểm thử' }, hr)).status, 201);
    const holList = await request('/holidays', undefined, hr, 'GET');
    assert.equal(holList.status, 200);
    assert.ok(holList.body.some((h) => h.Ngay === holDay));
    assert.equal((await request(`/holidays/${holDay}`, undefined, hr, 'DELETE')).status, 200);

    // Balances adjustment API
    const balRes = await request('/balances', {
      MaNV: empA.MaNV,
      Nam: Number(date.slice(0, 4)),
      TongSoNgayPhep: 18,
    }, hr);
    assert.equal(balRes.status, 200);
    assert.equal((await state()).balances.find((b) => b.MaNV === empA.MaNV && b.Nam === Number(date.slice(0, 4))).TongSoNgayPhep, 18);
  });

  await t.test('Paginated and searchable audit log API for admin (01)', async () => {
    assert.equal((await request('/audit?limit=10&offset=0', undefined, hr, 'GET')).status, 403);
    const auditRes = await request('/audit?limit=10&offset=0&q=công', undefined, admin, 'GET');
    assert.equal(auditRes.status, 200);
    assert.ok(auditRes.body.total >= 1);
    assert.ok(Array.isArray(auditRes.body.rows));
    assert.ok(auditRes.body.rows.every((r) => 'HanhDong' in r && 'DoiTuong' in r));
  });
});
