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
  async function login(tendangnhap, matkhau = 'Demo@12345') {
    const result = await request('/login', { tendangnhap, matkhau });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.cookie;
  }
  const admin = await login('admin');
  const hr = await login('nhansu');
  const manager = await login('truongphong');
  let sequence = 0;
  function employee(overrides = {}) {
    const key = `TEST${++sequence}`;
    return { manv: key, hoten: `Nhân viên kiểm thử ${key}`, ngaysinh: '2000-01-01', gioitinh: 'Nam', sodienthoai: `09${String(10_000_000 + sequence)}`,
      email: `${key}@example.com`, ngayvaolam: shift(date, -60), trangthai: 'Đang làm việc',
      mapb: 'PB02', macv: 'CV01', vaitro: 'employee', ...overrides };
  }
  async function addEmployee(values, cookie = admin) {
    const result = await request('/employees', values, cookie);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    values.manv = result.body.id;
    return result.body.taikhoan;
  }
  async function addContract(e, overrides = {}) {
    const values = { mahd: `CT${++sequence}`, manv: e.manv, loaihd: 'Xác định thời hạn',
      ngaybatdau: shift(date, -30), ngayketthuc: shift(date, 90), mucluong: 10_000_000, ...overrides };
    const result = await request('/contracts', values, admin);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    values.mahd = result.body.id;
    return values;
  }
  async function state(cookie = admin) {
    const result = await request('/state', undefined, cookie);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  }

  await t.test('Employee and contract IDs are generated without input and remain unique under concurrent creation', async () => {
    const values = Array.from({ length: 5 }, () => employee({ manv: undefined }));
    await Promise.all(values.map((e) => addEmployee(e)));
    assert.equal(new Set(values.map((e) => e.manv)).size, 5);
    assert.ok(values.every((e) => /^NV\d{3,}$/.test(e.manv)));
    const contracts = await Promise.all(values.map((e) => addContract(e, { mahd: undefined })));
    assert.equal(new Set(contracts.map((c) => c.mahd)).size, 5);
    assert.ok(contracts.every((c) => /^HD\d{3,}$/.test(c.mahd)));
  });

  await t.test('Department IDs are automatic, sequential and unique for concurrent requests', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => request('/departments', {
      mapb: 'MANUAL', tenpb: `Phòng kiểm thử ${i}`, ngaythanhlap: date, mota: '',
    }, admin)));
    assert.ok(results.every((r) => r.status === 201));
    const ids = results.map((r) => r.body.id);
    assert.equal(new Set(ids).size, 4);
    assert.deepEqual(ids.map((id) => Number(id.slice(2))).sort((a, b) => a - b), [7, 8, 9, 10]);
    assert.ok(ids.every((id) => /^PB\d+$/.test(id)));
  });

  await t.test('A new employee can log in with their full email and generated password', async () => {
    const e = employee({ email: `${'long-email-'.repeat(7)}@example.com` });
    const account = await addEmployee(e, hr);
    assert.equal(account.tendangnhap, e.email);
    assert.ok(account.matkhau.length >= 10);
    const cookie = await login(account.tendangnhap, account.matkhau);
    const own = await state(cookie);
    assert.equal(own.user.manv, e.manv);
    assert.equal(own.employees.length, 1);
    assert.ok(!JSON.stringify(own).includes(account.matkhau));
    const stored = (await pool.query('SELECT matkhau FROM taikhoan WHERE manv = $1', [e.manv])).rows[0];
    assert.notEqual(stored.matkhau, account.matkhau);
  });

  await t.test('Director role or director position removes the department; ordinary employees require it', async () => {
    const directors = [];
    const directorAccounts = [];
    for (const overrides of [{ vaitro: 'director', mapb: undefined }, { macv: 'CV04', vaitro: undefined }]) {
      const e = employee(overrides);
      directors.push(e);
      const account = await addEmployee(e);
      directorAccounts.push(account);
      assert.equal((await state()).employees.find((item) => item.manv === e.manv).mapb, null);
      assert.equal(account.vaitro, 'director');
      const cookie = await login(account.tendangnhap, account.matkhau);
      assert.equal((await state(cookie)).user.mapb, null);
      const updated = await request(`/employees/${e.manv}`, { ...e, mapb: null }, admin, 'PUT');
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
    }
    const missing = await request('/employees', employee({ mapb: undefined }), admin);
    assert.equal(missing.status, 400);
    const duplicateAccount = await request('/users', { tendangnhap: 'second_account', matkhau: 'Example@12345', vaitro: 'manager', manv: directors[0].manv }, admin);
    assert.equal(duplicateAccount.status, 409);
    const directorUser = (await pool.query('SELECT matk FROM taikhoan WHERE manv = $1', [directors[0].manv])).rows[0];
    assert.equal((await request(`/users/${directorUser.matk}/role`, { vaitro: 'manager' }, admin, 'PUT')).status, 200);
    const noDeptManager = await login(directorAccounts[0].tendangnhap, directorAccounts[0].matkhau);
    assert.equal((await state(noDeptManager)).employees.length, 1);
    const maloai = (await state()).leaveTypes[0].maloai;
    const leave = await request('/leaves', { manv: directors[1].manv, maloai, tungay: nextWorkingDay(date), denngay: nextWorkingDay(date), lydo: 'Kiểm tra phạm vi phòng ban' }, admin);
    assert.equal(leave.status, 201);
    assert.equal((await request(`/leaves/${leave.body.id}/review`, { trangthai: 'Đã duyệt' }, noDeptManager)).status, 403);
  });

  await t.test('Account conflicts roll back employee creation and HR cannot create an admin', async () => {
    await pool.query(`UPDATE taikhoan SET tendangnhap = 'reserved@example.com' WHERE manv = 'NV003'`);
    const e = employee({ email: 'reserved@example.com' });
    assert.equal((await request('/employees', e, admin)).status, 409);
    assert.equal((await pool.query('SELECT manv FROM nhanvien WHERE manv = $1', [e.manv])).rowCount, 0);
    assert.equal((await request('/employees', employee({ vaitro: 'admin' }), hr)).status, 403);
  });

  const e = employee();
  const account = await addEmployee(e);
  const c = await addContract(e);
  await t.test('Salary changes and extensions create appendices with old and new values', async () => {
    assert.equal((await request(`/contracts/${c.mahd}/salary`, { mucluong: 12_000_000, lydo: 'Tăng lương' }, admin)).status, 200);
    assert.equal((await request(`/contracts/${c.mahd}/extend`, { ngayketthucmoi: shift(date, 180), lydo: 'Gia hạn' }, admin)).status, 200);
    // Luật: hợp đồng xác định thời hạn chỉ được ký/gia hạn tối đa 2 lần.
    assert.equal((await request(`/contracts/${c.mahd}/extend`, { ngayketthucmoi: shift(date, 270), mucluong: 15_000_000, lydo: 'Gia hạn lần 3' }, admin)).status, 400);
    assert.equal((await request(`/contracts/${c.mahd}/salary`, { mucluong: 15_000_000, lydo: 'Tăng lương lần 2' }, admin)).status, 200);
    const data = await state();
    const contract = data.contracts.find((item) => item.mahd === c.mahd);
    assert.equal(contract.mucluong, 15_000_000);
    assert.equal(contract.ngayketthuc, shift(date, 180));
    const appendices = data.extensions.filter((item) => item.mahd === c.mahd).sort((a, b) => a.langiahan - b.langiahan);
    assert.deepEqual(appendices.map((item) => item.loaiphuluc), ['Điều chỉnh lương', 'Gia hạn', 'Điều chỉnh lương']);
    assert.deepEqual(appendices.map((item) => [item.luongcu, item.luongmoi]), [[10_000_000, 12_000_000], [12_000_000, 12_000_000], [12_000_000, 15_000_000]]);
    assert.equal(appendices[0].ngayketthuccu, appendices[0].ngayketthucmoi);
    const own = await state(await login(account.tendangnhap, account.matkhau));
    assert.equal(own.extensions.find((item) => item.mahd === c.mahd).luongmoi, 15_000_000);
    const scoped = await state(manager);
    assert.ok(scoped.extensions.filter((item) => item.mahd === c.mahd).every((item) => item.luongcu === null && item.luongmoi === null));
    assert.equal((await request(`/contracts/${c.mahd}/salary`, { mucluong: 20_000_000, lydo: 'Không có quyền' }, manager)).status, 403);
  });

  await t.test('Invalid amendments leave both contract and appendix history unchanged', async () => {
    for (const body of [{ mucluong: 0, lydo: 'Sai' }, { mucluong: 15_000_000, lydo: 'Không đổi' }, { mucluong: 20_000_000 }]) {
      assert.equal((await request(`/contracts/${c.mahd}/salary`, body, admin)).status, 400);
    }
    assert.equal((await request(`/contracts/${c.mahd}/extend`, { ngayketthucmoi: shift(date, 200), mucluong: 20_000_000, lydo: 'Ngày sai' }, admin)).status, 400);
    const data = await state();
    assert.equal(data.contracts.find((item) => item.mahd === c.mahd).mucluong, 15_000_000);
    assert.equal(data.extensions.filter((item) => item.mahd === c.mahd).length, 3);
  });

  await t.test('Indefinite contracts support salary appendices without an end date', async () => {
    const indefinite = employee();
    await addEmployee(indefinite);
    const contract = await addContract(indefinite, { loaihd: 'Không xác định thời hạn', ngayketthuc: null });
    assert.equal((await request(`/contracts/${contract.mahd}/salary`, { mucluong: 11_000_000, lydo: 'Tăng lương' }, admin)).status, 200);
    const appendix = (await state()).extensions.find((item) => item.mahd === contract.mahd);
    assert.equal(appendix.ngayketthucmoi, null);
    assert.equal((await request(`/contracts/${contract.mahd}/extend`, { ngayketthucmoi: shift(date, 300), lydo: 'Không cần gia hạn' }, admin)).status, 400);
  });

  await t.test('Terminating the last current contract updates employment status and revokes login', async () => {
    const employeeCookie = await login(account.tendangnhap, account.matkhau);
    assert.equal((await request(`/contracts/${c.mahd}/terminate`, { ngaychamdut: date, lydochamdut: 'Nghỉ việc' }, admin)).status, 200);
    const data = await state();
    assert.equal(data.employees.find((item) => item.manv === e.manv).trangthai, 'Đã nghỉ việc');
    assert.equal(data.extensions.filter((item) => item.mahd === c.mahd).length, 3);
    assert.equal((await request('/state', undefined, employeeCookie)).status, 401);
    assert.equal((await request('/login', { tendangnhap: account.tendangnhap, matkhau: account.matkhau })).status, 401);
    assert.equal((await request(`/contracts/${c.mahd}/salary`, { mucluong: 20_000_000, lydo: 'Đã nghỉ' }, admin)).status, 400);
    assert.equal((await request(`/employees/${e.manv}/archive`, {}, admin)).status, 200);
  });

  await t.test('Terminating an old contract preserves the status of an employee with a current contract', async () => {
    const working = employee();
    await addEmployee(working);
    const old = await addContract(working, { ngaybatdau: shift(date, -50), ngayketthuc: shift(date, -10) });
    await addContract(working, { ngaybatdau: date });
    assert.equal((await request(`/contracts/${old.mahd}/terminate`, { ngaychamdut: shift(date, -10), lydochamdut: 'Kết thúc hợp đồng cũ' }, admin)).status, 200);
    assert.equal((await state()).employees.find((item) => item.manv === working.manv).trangthai, 'Đang làm việc');
  });


  await pool.query('DELETE FROM ngayle');

  await t.test('Leave days count working days only; backdated leave is limited to HR/admin', async () => {
    const w = employee();
    const account = await addEmployee(w);
    const maloai = 'LP01';
    let sat = shift(date, 1);
    while (new Date(`${sat}T00:00:00Z`).getUTCDay() !== 6) sat = shift(sat, 1);
    const sun = shift(sat, 1);
    const weekend = await request('/leaves', { manv: w.manv, maloai, tungay: sat, denngay: sun, lydo: 'Cuối tuần' }, admin);
    assert.equal(weekend.status, 400);
    const ok = await request('/leaves', { manv: w.manv, maloai, tungay: shift(sat, -1), denngay: shift(sun, 1), lydo: 'Nối cuối tuần' }, admin);
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal((await pool.query('SELECT songay FROM donnghiphep WHERE madon = $1', [ok.body.id])).rows[0].songay, 2);

    let past = shift(date, -3);
    while (!isWorkingDay(past)) past = shift(past, -1);
    const own = await login(account.tendangnhap, account.matkhau);
    assert.equal((await request('/leaves', { maloai: 'LP02', tungay: past, denngay: past, lydo: 'Ốm' }, own)).status, 400);
    assert.equal((await request('/leaves', { manv: w.manv, maloai: 'LP02', tungay: past, denngay: past, lydo: 'Ốm bù' }, hr)).status, 201);
  });

  await t.test('Leave approval routing, quota safety and cancelling an approved leave', async () => {
    const dir = await login('giamdoc');
    const noManager = employee({ mapb: 'PB03' });
    const withManager = employee({ mapb: 'PB02' });
    const noManagerAccount = await addEmployee(noManager);
    await addEmployee(withManager);
    const start = nextWorkingDay(shift(date, 3));
    const leave = (e) => request('/leaves', { manv: e.manv, maloai: 'LP01', tungay: start, denngay: start, lydo: 'Việc gia đình' }, admin);
    const a = await leave(noManager);
    const b = await leave(withManager);
    assert.equal((await request(`/leaves/${b.body.id}/review`, { trangthai: 'Đã duyệt' }, hr)).status, 403);
    assert.equal((await request(`/leaves/${a.body.id}/review`, { trangthai: 'Đã duyệt' }, hr)).status, 403);
    assert.equal((await request(`/leaves/${a.body.id}/review`, { trangthai: 'Đã duyệt' }, manager)).status, 403);
    assert.equal((await request(`/leaves/${a.body.id}/review`, { trangthai: 'Đã duyệt' }, dir)).status, 200);
    assert.equal((await request(`/leaves/${b.body.id}/review`, { trangthai: 'Đã duyệt' }, manager)).status, 200);
    assert.equal((await request(`/leaves/${a.body.id}/review`, { trangthai: 'Đã duyệt' }, dir)).status, 400);
    assert.ok((await state(manager)).leaves.every((item) => typeof item.coquyenduyet === 'boolean'));

    const owner = await login(noManagerAccount.tendangnhap, noManagerAccount.matkhau);
    const used = async () => (await state()).balances.find((item) => item.manv === noManager.manv && item.nam === Number(date.slice(0, 4))).songaydanghi;
    assert.equal(await used(), 1);
    assert.equal((await request(`/leaves/${a.body.id}/cancel`, {}, owner)).status, 200);
    assert.equal(await used(), 0);
  });

  await t.test('Labor rules, converting a trial contract and voiding a contract', async () => {
    const x = employee();
    await addEmployee(x);
    const tooLong = await request('/contracts', { manv: x.manv, loaihd: 'Thử việc', ngaybatdau: shift(date, -30), ngayketthuc: shift(date, 60), mucluong: 5_000_000 }, admin);
    assert.equal(tooLong.status, 400);
    const trial = await addContract(x, { loaihd: 'Thử việc', ngaybatdau: shift(date, -10), ngayketthuc: shift(date, 40) });
    assert.equal((await state()).employees.find((item) => item.manv === x.manv).trangthai, 'Thử việc');
    const second = await request('/contracts', { manv: x.manv, loaihd: 'Thử việc', ngaybatdau: shift(date, 41), ngayketthuc: shift(date, 60), mucluong: 5_000_000 }, admin);
    assert.equal(second.status, 400);

    const converted = await request(`/contracts/${trial.mahd}/convert`, { loaihd: 'Xác định thời hạn', ngaybatdau: date, ngayketthuc: shift(date, 365), mucluong: 9_000_000 }, admin);
    assert.equal(converted.status, 201, JSON.stringify(converted.body));
    let data = await state();
    assert.equal(data.employees.find((item) => item.manv === x.manv).trangthai, 'Đang làm việc');
    assert.equal(data.contracts.find((item) => item.mahd === trial.mahd).ngayketthuc, shift(date, -1));
    assert.equal((await request(`/contracts/${converted.body.id}/void`, { lydo: 'Nhập nhầm' }, admin)).status, 200);
    data = await state();
    assert.equal(data.contracts.find((item) => item.mahd === converted.body.id).trangthai, 'Đã hủy bỏ');

    const y = employee();
    await addEmployee(y);
    await addContract(y, { ngaybatdau: shift(date, -60), ngayketthuc: shift(date, -31) });
    await addContract(y, { ngaybatdau: shift(date, -30), ngayketthuc: shift(date, -1) });
    const third = await request('/contracts', { manv: y.manv, loaihd: 'Xác định thời hạn', ngaybatdau: date, ngayketthuc: shift(date, 30), mucluong: 5_000_000 }, admin);
    assert.equal(third.status, 400);
    const indefinite = await request('/contracts', { manv: y.manv, loaihd: 'Không xác định thời hạn', ngaybatdau: date, mucluong: 5_000_000 }, admin);
    assert.equal(indefinite.status, 201);
  });

  await t.test('Employee resignation is finalised on its effective date even with a future contract', async () => {
    const z = employee();
    const account = await addEmployee(z);
    const zc = await addContract(z);
    const futureContractStart = shift(date, 30);
    await pool.query(
      `INSERT INTO hopdong(mahd, manv, loaihd, ngaybatdau, ngayketthuc, ngayketthucgoc, mucluong, trangthai)
       VALUES($1, $2, 'Xác định thời hạn', $3, $4, $4, 10_000_000, 'Hiệu lực')`,
      [`FUTURE-${z.manv}`, z.manv, futureContractStart, shift(futureContractStart, 90)]
    );
    const scheduled = await request(`/contracts/${zc.mahd}/terminate`, { ngaychamdut: shift(date, 5), lydochamdut: 'Người lao động xin nghỉ', loaichamdut: 'Người lao động xin nghỉ' }, admin);
    assert.equal(scheduled.status, 200, JSON.stringify(scheduled.body));
    let data = await state();
    assert.equal(data.contracts.find((item) => item.mahd === zc.mahd).trangthai, 'Hiệu lực');
    assert.equal(data.employees.find((item) => item.manv === z.manv).trangthai, 'Đang làm việc');
    await pool.query('UPDATE hopdong SET ngaychamdut = $1 WHERE mahd = $2', [shift(date, -1), zc.mahd]);
    await (await import('../dist/services/jobs.js')).runScheduledJobs(true);
    data = await state();
    assert.equal(data.contracts.find((item) => item.mahd === zc.mahd).trangthai, 'Đã chấm dứt');
    assert.equal(data.employees.find((item) => item.manv === z.manv).trangthai, 'Đã nghỉ việc');
    assert.equal((await request('/login', { tendangnhap: account.tendangnhap, matkhau: account.matkhau })).status, 401);
  });

  await t.test('Assignments can be scheduled, applied and cancelled', async () => {
    const q = employee({ mapb: 'PB02' });
    await addEmployee(q);
    const body = (suffix, effective) => ({ manv: q.manv, mapbmoi: 'PB03', macvmoi: 'CV01', loaibiendong: 'Điều chuyển',
      ngayhieuluc: effective, ngayky: date, soqd: `QD-${q.manv}-${suffix}`, nguoiky: 'Giám đốc', lydo: 'Điều chuyển' });
    const future = await request('/assignments', body('A', shift(date, 10)), admin);
    assert.equal(future.status, 201, JSON.stringify(future.body));
    let data = await state();
    assert.equal(data.employees.find((item) => item.manv === q.manv).mapb, 'PB02');
    assert.equal(data.assignments.find((item) => item.maqt === future.body.id).trangthai, 'Chờ hiệu lực');
    assert.equal((await request('/assignments', body('B', shift(date, 11)), admin)).status, 400);
    assert.equal((await request(`/assignments/${future.body.id}/cancel`, { lydohuy: 'Không điều chuyển nữa' }, admin)).status, 200);

    const now = await request('/assignments', body('C', date), admin);
    assert.equal(now.status, 201, JSON.stringify(now.body));
    assert.equal((await state()).employees.find((item) => item.manv === q.manv).mapb, 'PB03');
    assert.equal((await request(`/assignments/${now.body.id}/cancel`, { lydohuy: 'Nhập nhầm' }, admin)).status, 200);
    data = await state();
    assert.equal(data.employees.find((item) => item.manv === q.manv).mapb, 'PB02');
    assert.equal(data.assignments.find((item) => item.maqt === now.body.id).trangthai, 'Đã hủy');
  });

  await t.test('Accounts: password reset, role change, username sync, optimistic lock, duplicates and lockout', async () => {
    const v = employee();
    const account = await addEmployee(v);
    const matk = (await pool.query('SELECT matk FROM taikhoan WHERE manv = $1', [v.manv])).rows[0].matk;

    const reset = await request(`/users/${matk}/reset-password`, {}, admin);
    assert.equal(reset.status, 200);
    assert.equal((await request('/login', { tendangnhap: account.tendangnhap, matkhau: account.matkhau })).status, 401);
    await login(account.tendangnhap, reset.body.matkhau);
    assert.equal((await request(`/users/${matk}/reset-password`, {}, hr)).status, 403);

    const current = (await state()).employees.find((item) => item.manv === v.manv);
    assert.equal((await request(`/employees/${v.manv}`, { ...v, phienban: current.phienban - 1 }, admin, 'PUT')).status, 409);
    const newEmail = `moi-${v.email}`;
    assert.equal((await request(`/employees/${v.manv}`, { ...v, email: newEmail, phienban: current.phienban }, admin, 'PUT')).status, 200);
    await login(newEmail, reset.body.matkhau);

    const clash = employee({ sodienthoai: v.sodienthoai });
    assert.equal((await request('/employees', clash, admin)).status, 409);
    assert.equal((await request('/employees', { ...clash, confirm_duplicate: true }, admin)).status, 201);

    for (let i = 0; i < 8; i++) {
      assert.equal((await request('/login', { tendangnhap: 'khoa-thu', matkhau: 'sai-mat-khau-dai' })).status, 401);
    }
    assert.equal((await request('/login', { tendangnhap: 'khoa-thu', matkhau: 'sai-mat-khau-dai' })).status, 429);
  });

  await t.test('Schema upgrades can be applied again while retaining records and appendices', async () => {
    await database.initSchema();
    const data = await state();
    assert.equal(data.extensions.filter((item) => item.mahd === c.mahd).length, 3);
    assert.equal(data.employees.find((item) => item.manv === e.manv).trangthai, 'Đã lưu trữ');
    const view = await pool.query('SELECT manv, nam, tongsongayphep, songaydanghi, songayconlai FROM v_songayphep LIMIT 1');
    assert.equal(view.rowCount, 1);
  });

  await t.test('Positions auto-ID, department matruongphong validation, and usage summary on delete (03)', async () => {
    const posRes = await request('/positions', {
      macv: 'IGNORED',
      tencv: 'Trưởng nhóm kiểm thử',
      capbac: 4,
      mota: 'Nhóm trưởng',
      ladieuhanh: false,
      vaitromacdinh: 'manager',
      hoatdong: true,
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
      tenpb: 'Công nghệ',
      mota: 'Phát triển sản phẩm và hạ tầng',
      ngaythanhlap: '2022-01-01',
      matruongphong: 'NV001', // NV001 thuộc PB01
    }, admin, 'PUT');
    assert.equal(wrongHead.status, 400);
  });

  await t.test('Contract ngayketthucgoc preservation and decision links on extend/terminate (04)', async () => {
    const emp4 = employee();
    await addEmployee(emp4);
    const initialEnd = shift(date, 90);
    const c4 = await addContract(emp4, { ngaybatdau: shift(date, -20), ngayketthuc: initialEnd });

    const extRes = await request(`/contracts/${c4.mahd}/extend`, {
      ngayketthucmoi: shift(date, 180),
      lydo: 'Gia hạn theo quyết định',
      soqd: `QD-GH-${c4.mahd}`,
      nguoiky: 'Trần Hải Đăng',
      ngayky: date,
    }, admin);
    assert.equal(extRes.status, 200, JSON.stringify(extRes.body));

    let data = await state();
    const updatedC4 = data.contracts.find((item) => item.mahd === c4.mahd);
    assert.equal(updatedC4.ngayketthucgoc, initialEnd);
    assert.equal(updatedC4.ngayketthuc, shift(date, 180));
    const extRecord = data.extensions.find((item) => item.mahd === c4.mahd);
    assert.ok(extRecord.maqd);

    const termRes = await request(`/contracts/${c4.mahd}/terminate`, {
      ngaychamdut: date,
      loaichamdut: 'Thỏa thuận chấm dứt',
      lydochamdut: 'Chấm dứt theo thỏa thuận',
      soqd: `QD-CD-${c4.mahd}`,
      nguoiky: 'Trần Hải Đăng',
      ngayky: date,
    }, admin);
    assert.equal(termRes.status, 200, JSON.stringify(termRes.body));
    data = await state();
    assert.ok(data.contracts.find((item) => item.mahd === c4.mahd).maqdchamdut);
  });

  await t.test('Shared 1-N decisions, Mien nhiem assignment, Holidays API and Leave Balances (05)', async () => {
    const empA = employee({ mapb: 'PB02', macv: 'CV02' });
    const empB = employee({ mapb: 'PB03', macv: 'CV02' });
    await addEmployee(empA);
    await addEmployee(empB);

    const sharedDecision = {
      loaibiendong: 'Miễn nhiệm',
      macvmoi: 'CV01',
      ngayhieuluc: date,
      ngayky: date,
      soqd: 'QD-MIEN-NHIEM-CHUNG-01',
      nguoiky: 'Trần Hải Đăng',
      lydo: 'Miễn nhiệm chức vụ Trưởng phòng chuyển về Chuyên viên',
    };

    const r1 = await request('/assignments', { ...sharedDecision, manv: empA.manv, mapbmoi: 'PB02' }, admin);
    assert.equal(r1.status, 201, JSON.stringify(r1.body));

    const r2 = await request('/assignments', { ...sharedDecision, manv: empB.manv, mapbmoi: 'PB03' }, admin);
    assert.equal(r2.status, 201, JSON.stringify(r2.body));

    const data = await state();
    const a1 = data.assignments.find((x) => x.maqt === r1.body.id);
    const a2 = data.assignments.find((x) => x.maqt === r2.body.id);
    assert.equal(a1.maqd, a2.maqd);
    assert.equal(a1.loaibiendong, 'Miễn nhiệm');

    // Holidays API
    const holDay = `${Number(date.slice(0, 4)) + 1}-12-25`;
    assert.equal((await request('/holidays', { ngay: holDay, tenngayle: 'Lễ kiểm thử' }, hr)).status, 201);
    const holList = await request('/holidays', undefined, hr, 'GET');
    assert.equal(holList.status, 200);
    assert.ok(holList.body.some((h) => h.ngay === holDay));
    assert.equal((await request(`/holidays/${holDay}`, undefined, hr, 'DELETE')).status, 200);

    // Balances adjustment API
    const balRes = await request('/balances', {
      manv: empA.manv,
      nam: Number(date.slice(0, 4)),
      tongsongayphep: 18,
    }, hr);
    assert.equal(balRes.status, 200);
    assert.equal((await state()).balances.find((b) => b.manv === empA.manv && b.nam === Number(date.slice(0, 4))).tongsongayphep, 18);
  });

  await t.test('Paginated and searchable audit log API for admin (01)', async () => {
    assert.equal((await request('/audit?limit=10&offset=0', undefined, hr, 'GET')).status, 403);
    const auditRes = await request('/audit?limit=10&offset=0&q=công', undefined, admin, 'GET');
    assert.equal(auditRes.status, 200);
    assert.ok(auditRes.body.total >= 1);
    assert.ok(Array.isArray(auditRes.body.rows));
    assert.ok(auditRes.body.rows.every((r) => 'hanhdong' in r && 'doituong' in r));
  });
});
