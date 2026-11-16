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
  const { today, shift } = await import('../dist/utils/validation.js');
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
    return { id, name: 'Nhân viên kiểm thử', birth_date: '2000-01-01', gender: 'Nam', phone: '0901234567',
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
    for (const overrides of [{ role: 'director', department_id: undefined }, { position_id: 'CV04', role: undefined }]) {
      const e = employee(overrides);
      directors.push(e);
      const account = await addEmployee(e);
      assert.equal((await state()).employees.find((item) => item.id === e.id).department_id, null);
      assert.equal(account.role, 'director');
      const cookie = await login(account.username, account.password);
      assert.equal((await state(cookie)).user.department_id, null);
      const updated = await request(`/employees/${e.id}`, { ...e, department_id: null }, admin, 'PUT');
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
    }
    const missing = await request('/employees', employee({ department_id: undefined }), admin);
    assert.equal(missing.status, 400);
    const managerAccount = await request('/users', { username: 'manager_without_department', password: 'Example@12345', role: 'manager', employee_id: directors[0].id }, admin);
    assert.equal(managerAccount.status, 201);
    const noDeptManager = await login('manager_without_department', 'Example@12345');
    assert.equal((await state(noDeptManager)).employees.length, 1);
    const typeId = (await state()).leaveTypes[0].id;
    const leave = await request('/leaves', { employee_id: directors[1].id, type_id: typeId, start_date: date, end_date: date, reason: 'Kiểm tra phạm vi phòng ban' }, admin);
    assert.equal(leave.status, 201);
    assert.equal((await request(`/leaves/${leave.body.id}/review`, { status: 'Đã duyệt' }, noDeptManager)).status, 403);
  });

  await t.test('Account conflicts roll back employee creation and HR cannot create an admin', async () => {
    await request('/users', { username: 'reserved@example.com', password: 'Example@12345', role: 'employee', employee_id: 'NV003' }, admin);
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
    assert.equal((await request(`/contracts/${c.id}/extend`, { new_end_date: shift(date, 270), salary: 15_000_000, reason: 'Gia hạn và tăng lương' }, admin)).status, 200);
    const data = await state();
    const contract = data.contracts.find((item) => item.id === c.id);
    assert.equal(contract.salary, 15_000_000);
    assert.equal(contract.end_date, shift(date, 270));
    const appendices = data.extensions.filter((item) => item.contract_id === c.id).sort((a, b) => a.sequence - b.sequence);
    assert.deepEqual(appendices.map((item) => item.amendment_type), ['Điều chỉnh lương', 'Gia hạn', 'Gia hạn và điều chỉnh lương']);
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

  await t.test('Schema upgrades can be applied again while retaining records and appendices', async () => {
    await database.initSchema();
    const data = await state();
    assert.equal(data.extensions.filter((item) => item.contract_id === c.id).length, 3);
    assert.equal(data.employees.find((item) => item.id === e.id).status, 'Đã lưu trữ');
  });
});
