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
  async function login(username, password = 'Demo@12345') {
    const result = await request('/login', { username, password });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.cookie;
  }
  const admin = await login('admin');
  const hr = await login('nhansu');
  const manager = await login('truongphong');
  let sequence = 0;
  function employee(overrides = {}) {
    const id = `TEST${++sequence}`;
    return { id, name: `Nhân viên kiểm thử ${id}`, birth_date: '2000-01-01', gender: 'Nam', phone: `09${String(10_000_000 + sequence)}`,
      email: `${id}@example.com`, join_date: shift(date, -60), status: 'Đang làm việc',
      department_id: 'PB02', position_id: 'CV01', role: 'employee', ...overrides };
  }
  async function addEmployee(values, cookie = admin) {
    const result = await request('/employees', values, cookie);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    values.id = result.body.id;
    return result.body.account;
  }
  async function addContract(e, overrides = {}) {
    const values = { id: `CT${++sequence}`, employee_id: e.id, type: 'Xác định thời hạn',
      start_date: shift(date, -30), end_date: shift(date, 90), salary: 10_000_000, ...overrides };
    const result = await request('/contracts', values, admin);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    values.id = result.body.id;
    return values;
  }
  async function state(cookie = admin) {
    const result = await request('/state', undefined, cookie);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  }

  await t.test('Employee and contract IDs are generated without input and remain unique under concurrent creation', async () => {
    const values = Array.from({ length: 5 }, () => employee({ id: undefined }));
    await Promise.all(values.map((e) => addEmployee(e)));
    assert.equal(new Set(values.map((e) => e.id)).size, 5);
    assert.ok(values.every((e) => /^NV\d{3,}$/.test(e.id)));
    const contracts = await Promise.all(values.map((e) => addContract(e, { id: undefined })));
    assert.equal(new Set(contracts.map((c) => c.id)).size, 5);
    assert.ok(contracts.every((c) => /^HD\d{3,}$/.test(c.id)));
  });

  await t.test('Department IDs are automatic, sequential and unique for concurrent requests', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => request('/departments', {
      id: 'MANUAL', name: `Phòng kiểm thử ${i}`, founded_date: date, description: '',
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
    assert.equal(account.username, e.email);
    assert.ok(account.password.length >= 10);
    const cookie = await login(account.username, account.password);
    const own = await state(cookie);
    assert.equal(own.user.employee_id, e.id);
    assert.equal(own.employees.length, 1);
    assert.ok(!JSON.stringify(own).includes(account.password));
    const stored = (await pool.query('SELECT password_hash FROM users WHERE employee_id = $1', [e.id])).rows[0];
    assert.notEqual(stored.password_hash, account.password);
  });

  await t.test('Director role or director position removes the department; ordinary employees require it', async () => {
    const directors = [];
    const directorAccounts = [];
    for (const overrides of [{ role: 'director', department_id: undefined }, { position_id: 'CV04', role: undefined }]) {
      const e = employee(overrides);
      directors.push(e);
      const account = await addEmployee(e);
      directorAccounts.push(account);
      assert.equal((await state()).employees.find((item) => item.id === e.id).department_id, null);
      assert.equal(account.role, 'director');
      const cookie = await login(account.username, account.password);
      assert.equal((await state(cookie)).user.department_id, null);
      const updated = await request(`/employees/${e.id}`, { ...e, department_id: null }, admin, 'PUT');
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
    }
    const missing = await request('/employees', employee({ department_id: undefined }), admin);
    assert.equal(missing.status, 400);
    const duplicateAccount = await request('/users', { username: 'second_account', password: 'Example@12345', role: 'manager', employee_id: directors[0].id }, admin);
    assert.equal(duplicateAccount.status, 409);
    const directorUser = (await pool.query('SELECT id FROM users WHERE employee_id = $1', [directors[0].id])).rows[0];
    assert.equal((await request(`/users/${directorUser.id}/role`, { role: 'manager' }, admin, 'PUT')).status, 200);
    const noDeptManager = await login(directorAccounts[0].username, directorAccounts[0].password);
    assert.equal((await state(noDeptManager)).employees.length, 1);
    const typeId = (await state()).leaveTypes[0].id;
    const leave = await request('/leaves', { employee_id: directors[1].id, type_id: typeId, start_date: nextWorkingDay(date), end_date: nextWorkingDay(date), reason: 'Kiểm tra phạm vi phòng ban' }, admin);
    assert.equal(leave.status, 201);
    assert.equal((await request(`/leaves/${leave.body.id}/review`, { status: 'Đã duyệt' }, noDeptManager)).status, 403);
  });

  await t.test('Account conflicts roll back employee creation and HR cannot create an admin', async () => {
    await pool.query(`UPDATE users SET username = 'reserved@example.com' WHERE employee_id = 'NV003'`);
    const e = employee({ email: 'reserved@example.com' });
    assert.equal((await request('/employees', e, admin)).status, 409);
    assert.equal((await pool.query('SELECT id FROM employees WHERE id = $1', [e.id])).rowCount, 0);
    assert.equal((await request('/employees', employee({ role: 'admin' }), hr)).status, 403);
  });

  const e = employee();
  const account = await addEmployee(e);
  const c = await addContract(e);
  await t.test('Salary changes and extensions create appendices with old and new values', async () => {
    assert.equal((await request(`/contracts/${c.id}/salary`, { salary: 12_000_000, reason: 'Tăng lương' }, admin)).status, 200);
    assert.equal((await request(`/contracts/${c.id}/extend`, { new_end_date: shift(date, 180), reason: 'Gia hạn' }, admin)).status, 200);
    // Luật: hợp đồng xác định thời hạn chỉ được ký/gia hạn tối đa 2 lần.
    assert.equal((await request(`/contracts/${c.id}/extend`, { new_end_date: shift(date, 270), salary: 15_000_000, reason: 'Gia hạn lần 3' }, admin)).status, 400);
    assert.equal((await request(`/contracts/${c.id}/salary`, { salary: 15_000_000, reason: 'Tăng lương lần 2' }, admin)).status, 200);
    const data = await state();
    const contract = data.contracts.find((item) => item.id === c.id);
    assert.equal(contract.salary, 15_000_000);
    assert.equal(contract.end_date, shift(date, 180));
    const appendices = data.extensions.filter((item) => item.contract_id === c.id).sort((a, b) => a.sequence - b.sequence);
    assert.deepEqual(appendices.map((item) => item.amendment_type), ['Điều chỉnh lương', 'Gia hạn', 'Điều chỉnh lương']);
    assert.deepEqual(appendices.map((item) => [item.old_salary, item.new_salary]), [[10_000_000, 12_000_000], [12_000_000, 12_000_000], [12_000_000, 15_000_000]]);
    assert.equal(appendices[0].old_end_date, appendices[0].new_end_date);
    const own = await state(await login(account.username, account.password));
    assert.equal(own.extensions.find((item) => item.contract_id === c.id).new_salary, 15_000_000);
    const scoped = await state(manager);
    assert.ok(scoped.extensions.filter((item) => item.contract_id === c.id).every((item) => item.old_salary === null && item.new_salary === null));
    assert.equal((await request(`/contracts/${c.id}/salary`, { salary: 20_000_000, reason: 'Không có quyền' }, manager)).status, 403);
  });

  await t.test('Invalid amendments leave both contract and appendix history unchanged', async () => {
    for (const body of [{ salary: 0, reason: 'Sai' }, { salary: 15_000_000, reason: 'Không đổi' }, { salary: 20_000_000 }]) {
      assert.equal((await request(`/contracts/${c.id}/salary`, body, admin)).status, 400);
    }
    assert.equal((await request(`/contracts/${c.id}/extend`, { new_end_date: shift(date, 200), salary: 20_000_000, reason: 'Ngày sai' }, admin)).status, 400);
    const data = await state();
    assert.equal(data.contracts.find((item) => item.id === c.id).salary, 15_000_000);
    assert.equal(data.extensions.filter((item) => item.contract_id === c.id).length, 3);
  });

  await t.test('Indefinite contracts support salary appendices without an end date', async () => {
    const indefinite = employee();
    await addEmployee(indefinite);
    const contract = await addContract(indefinite, { type: 'Không xác định thời hạn', end_date: null });
    assert.equal((await request(`/contracts/${contract.id}/salary`, { salary: 11_000_000, reason: 'Tăng lương' }, admin)).status, 200);
    const appendix = (await state()).extensions.find((item) => item.contract_id === contract.id);
    assert.equal(appendix.new_end_date, null);
    assert.equal((await request(`/contracts/${contract.id}/extend`, { new_end_date: shift(date, 300), reason: 'Không cần gia hạn' }, admin)).status, 400);
  });

  await t.test('Terminating the last current contract updates employment status and revokes login', async () => {
    const employeeCookie = await login(account.username, account.password);
    assert.equal((await request(`/contracts/${c.id}/terminate`, { terminated_date: date, reason: 'Nghỉ việc' }, admin)).status, 200);
    const data = await state();
    assert.equal(data.employees.find((item) => item.id === e.id).status, 'Đã nghỉ việc');
    assert.equal(data.extensions.filter((item) => item.contract_id === c.id).length, 3);
    assert.equal((await request('/state', undefined, employeeCookie)).status, 401);
    assert.equal((await request('/login', { username: account.username, password: account.password })).status, 401);
    assert.equal((await request(`/contracts/${c.id}/salary`, { salary: 20_000_000, reason: 'Đã nghỉ' }, admin)).status, 400);
    assert.equal((await request(`/employees/${e.id}/archive`, {}, admin)).status, 200);
  });

  await t.test('Terminating an old contract preserves the status of an employee with a current contract', async () => {
    const working = employee();
    await addEmployee(working);
    const old = await addContract(working, { start_date: shift(date, -50), end_date: shift(date, -10) });
    await addContract(working, { start_date: date });
    assert.equal((await request(`/contracts/${old.id}/terminate`, { terminated_date: shift(date, -10), reason: 'Kết thúc hợp đồng cũ' }, admin)).status, 200);
    assert.equal((await state()).employees.find((item) => item.id === working.id).status, 'Đang làm việc');
  });


  await pool.query('DELETE FROM holidays');

  await t.test('Leave days count working days only; backdated leave is limited to HR/admin', async () => {
    const w = employee();
    const account = await addEmployee(w);
    const typeId = 'LP01';
    let sat = shift(date, 1);
    while (new Date(`${sat}T00:00:00Z`).getUTCDay() !== 6) sat = shift(sat, 1);
    const sun = shift(sat, 1);
    const weekend = await request('/leaves', { employee_id: w.id, type_id: typeId, start_date: sat, end_date: sun, reason: 'Cuối tuần' }, admin);
    assert.equal(weekend.status, 400);
    const ok = await request('/leaves', { employee_id: w.id, type_id: typeId, start_date: shift(sat, -1), end_date: shift(sun, 1), reason: 'Nối cuối tuần' }, admin);
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal((await pool.query('SELECT days FROM leave_requests WHERE id = $1', [ok.body.id])).rows[0].days, 2);

    let past = shift(date, -3);
    while (!isWorkingDay(past)) past = shift(past, -1);
    const own = await login(account.username, account.password);
    assert.equal((await request('/leaves', { type_id: 'LP02', start_date: past, end_date: past, reason: 'Ốm' }, own)).status, 400);
    assert.equal((await request('/leaves', { employee_id: w.id, type_id: 'LP02', start_date: past, end_date: past, reason: 'Ốm bù' }, hr)).status, 201);
  });

  await t.test('Leave approval routing, quota safety and cancelling an approved leave', async () => {
    const dir = await login('giamdoc');
    const noManager = employee({ department_id: 'PB03' });
    const withManager = employee({ department_id: 'PB02' });
    const noManagerAccount = await addEmployee(noManager);
    await addEmployee(withManager);
    const start = nextWorkingDay(shift(date, 3));
    const leave = (e) => request('/leaves', { employee_id: e.id, type_id: 'LP01', start_date: start, end_date: start, reason: 'Việc gia đình' }, admin);
    const a = await leave(noManager);
    const b = await leave(withManager);
    assert.equal((await request(`/leaves/${b.body.id}/review`, { status: 'Đã duyệt' }, hr)).status, 403);
    assert.equal((await request(`/leaves/${b.body.id}/review`, { status: 'Đã duyệt' }, dir)).status, 403);
    assert.equal((await request(`/leaves/${a.body.id}/review`, { status: 'Đã duyệt' }, manager)).status, 403);
    assert.equal((await request(`/leaves/${b.body.id}/review`, { status: 'Đã duyệt' }, manager)).status, 200);
    assert.equal((await request(`/leaves/${a.body.id}/review`, { status: 'Đã duyệt' }, hr)).status, 200);
    assert.ok((await state(manager)).leaves.every((item) => typeof item.can_review === 'boolean'));

    const owner = await login(noManagerAccount.username, noManagerAccount.password);
    const used = async () => (await state()).balances.find((item) => item.employee_id === noManager.id && item.year === Number(date.slice(0, 4))).used;
    assert.equal(await used(), 1);
    assert.equal((await request(`/leaves/${a.body.id}/cancel`, {}, owner)).status, 200);
    assert.equal(await used(), 0);
  });

  await t.test('Labor rules, converting a trial contract and voiding a contract', async () => {
    const x = employee();
    await addEmployee(x);
    const tooLong = await request('/contracts', { employee_id: x.id, type: 'Thử việc', start_date: shift(date, -30), end_date: shift(date, 60), salary: 5_000_000 }, admin);
    assert.equal(tooLong.status, 400);
    const trial = await addContract(x, { type: 'Thử việc', start_date: shift(date, -10), end_date: shift(date, 40) });
    assert.equal((await state()).employees.find((item) => item.id === x.id).status, 'Thử việc');
    const second = await request('/contracts', { employee_id: x.id, type: 'Thử việc', start_date: shift(date, 41), end_date: shift(date, 60), salary: 5_000_000 }, admin);
    assert.equal(second.status, 400);

    const converted = await request(`/contracts/${trial.id}/convert`, { type: 'Xác định thời hạn', start_date: date, end_date: shift(date, 365), salary: 9_000_000 }, admin);
    assert.equal(converted.status, 201, JSON.stringify(converted.body));
    let data = await state();
    assert.equal(data.employees.find((item) => item.id === x.id).status, 'Đang làm việc');
    assert.equal(data.contracts.find((item) => item.id === trial.id).end_date, shift(date, -1));
    assert.equal((await request(`/contracts/${converted.body.id}/void`, { reason: 'Nhập nhầm' }, admin)).status, 200);
    data = await state();
    assert.equal(data.contracts.find((item) => item.id === converted.body.id).status, 'Đã hủy bỏ');

    const y = employee();
    await addEmployee(y);
    await addContract(y, { start_date: shift(date, -60), end_date: shift(date, -31) });
    await addContract(y, { start_date: shift(date, -30), end_date: shift(date, -1) });
    const third = await request('/contracts', { employee_id: y.id, type: 'Xác định thời hạn', start_date: date, end_date: shift(date, 30), salary: 5_000_000 }, admin);
    assert.equal(third.status, 400);
    const indefinite = await request('/contracts', { employee_id: y.id, type: 'Không xác định thời hạn', start_date: date, salary: 5_000_000 }, admin);
    assert.equal(indefinite.status, 201);
  });

  await t.test('Scheduled contract termination is finalised by the daily job', async () => {
    const z = employee();
    const account = await addEmployee(z);
    const zc = await addContract(z);
    const scheduled = await request(`/contracts/${zc.id}/terminate`, { terminated_date: shift(date, 5), reason: 'Hẹn nghỉ', termination_type: 'Thỏa thuận chấm dứt' }, admin);
    assert.equal(scheduled.status, 200, JSON.stringify(scheduled.body));
    let data = await state();
    assert.equal(data.contracts.find((item) => item.id === zc.id).status, 'Hiệu lực');
    assert.equal(data.employees.find((item) => item.id === z.id).status, 'Đang làm việc');
    await pool.query('UPDATE contracts SET terminated_date = $1 WHERE id = $2', [shift(date, -1), zc.id]);
    await (await import('../dist/services/jobs.js')).runScheduledJobs(true);
    data = await state();
    assert.equal(data.contracts.find((item) => item.id === zc.id).status, 'Đã chấm dứt');
    assert.equal(data.employees.find((item) => item.id === z.id).status, 'Đã nghỉ việc');
    assert.equal((await request('/login', { username: account.username, password: account.password })).status, 401);
  });

  await t.test('Assignments can be scheduled, applied and cancelled', async () => {
    const q = employee({ department_id: 'PB02' });
    await addEmployee(q);
    const body = (suffix, effective) => ({ employee_id: q.id, new_department_id: 'PB03', new_position_id: 'CV01', type: 'Điều chuyển',
      effective_date: effective, signed_date: date, number: `QD-${q.id}-${suffix}`, signer: 'Giám đốc', reason: 'Điều chuyển' });
    const future = await request('/assignments', body('A', shift(date, 10)), admin);
    assert.equal(future.status, 201, JSON.stringify(future.body));
    let data = await state();
    assert.equal(data.employees.find((item) => item.id === q.id).department_id, 'PB02');
    assert.equal(data.assignments.find((item) => item.id === future.body.id).status, 'Chờ hiệu lực');
    assert.equal((await request('/assignments', body('B', shift(date, 11)), admin)).status, 400);
    assert.equal((await request(`/assignments/${future.body.id}/cancel`, { reason: 'Không điều chuyển nữa' }, admin)).status, 200);

    const now = await request('/assignments', body('C', date), admin);
    assert.equal(now.status, 201, JSON.stringify(now.body));
    assert.equal((await state()).employees.find((item) => item.id === q.id).department_id, 'PB03');
    assert.equal((await request(`/assignments/${now.body.id}/cancel`, { reason: 'Nhập nhầm' }, admin)).status, 200);
    data = await state();
    assert.equal(data.employees.find((item) => item.id === q.id).department_id, 'PB02');
    assert.equal(data.assignments.find((item) => item.id === now.body.id).status, 'Đã hủy');
  });

  await t.test('Accounts: password reset, role change, username sync, optimistic lock, duplicates and lockout', async () => {
    const v = employee();
    const account = await addEmployee(v);
    const userId = (await pool.query('SELECT id FROM users WHERE employee_id = $1', [v.id])).rows[0].id;

    const reset = await request(`/users/${userId}/reset-password`, {}, admin);
    assert.equal(reset.status, 200);
    assert.equal((await request('/login', { username: account.username, password: account.password })).status, 401);
    await login(account.username, reset.body.password);
    assert.equal((await request(`/users/${userId}/reset-password`, {}, hr)).status, 403);

    const current = (await state()).employees.find((item) => item.id === v.id);
    assert.equal((await request(`/employees/${v.id}`, { ...v, version: current.version - 1 }, admin, 'PUT')).status, 409);
    const newEmail = `moi-${v.email}`;
    assert.equal((await request(`/employees/${v.id}`, { ...v, email: newEmail, version: current.version }, admin, 'PUT')).status, 200);
    await login(newEmail, reset.body.password);

    const clash = employee({ phone: v.phone });
    assert.equal((await request('/employees', clash, admin)).status, 409);
    assert.equal((await request('/employees', { ...clash, confirm_duplicate: true }, admin)).status, 201);

    for (let i = 0; i < 8; i++) {
      assert.equal((await request('/login', { username: 'khoa-thu', password: 'sai-mat-khau-dai' })).status, 401);
    }
    assert.equal((await request('/login', { username: 'khoa-thu', password: 'sai-mat-khau-dai' })).status, 429);
  });

  await t.test('Schema upgrades can be applied again while retaining records and appendices', async () => {
    await database.initSchema();
    const data = await state();
    assert.equal(data.extensions.filter((item) => item.contract_id === c.id).length, 3);
    assert.equal(data.employees.find((item) => item.id === e.id).status, 'Đã lưu trữ');
  });
});
