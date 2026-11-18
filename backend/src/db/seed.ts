import { db, withTransaction } from './pool.js';
import { passwordHash } from '../utils/crypto.js';
import { today, shift, countWorkingDays, nextWorkingDay } from '../utils/validation.js';

async function seedHolidays(): Promise<void> {
  const any = await db.one<{ n: string }>('SELECT COUNT(*) AS n FROM holidays');
  if (any && Number(any.n) > 0) return;
  const year = Number(today().slice(0, 4));
  for (const y of [year - 1, year, year + 1]) {
    for (const [md, name] of [
      ['01-01', 'Tết Dương lịch'],
      ['04-30', 'Ngày Giải phóng miền Nam'],
      ['05-01', 'Ngày Quốc tế Lao động'],
      ['09-02', 'Quốc khánh'],
    ]) {
      await db.run('INSERT INTO holidays(day, name) VALUES($1, $2) ON CONFLICT DO NOTHING', [`${y}-${md}`, name]);
    }
  }
}

export async function seedDatabase(): Promise<void> {
  await seedHolidays();
  const existing = await db.one<{ n: string }>('SELECT COUNT(*) AS n FROM departments');
  if (existing && Number(existing.n) > 0) {
    return;
  }

  await withTransaction(async (tx) => {
    const date = today();
    const year = Number(date.slice(0, 4));

    const departments: [string, string, string][] = [
      ['PB01', 'Nhân sự', 'Tuyển dụng và phát triển con người'],
      ['PB02', 'Công nghệ', 'Phát triển sản phẩm và hạ tầng'],
      ['PB03', 'Kinh doanh', 'Phát triển khách hàng và thị trường'],
      ['PB04', 'Tài chính', 'Tài chính và kế toán'],
      ['PB05', 'Marketing', 'Thương hiệu và truyền thông'],
      ['PB06', 'Ban giám đốc', 'Điều hành doanh nghiệp'],
    ];

    for (const [id, name, desc] of departments) {
      await tx.run(
        'INSERT INTO departments(id, name, description, founded_date) VALUES($1, $2, $3, $4)',
        [id, name, desc, `${year - 4}-01-01`]
      );
    }

    // [mã, tên, cấp bậc, là chức vụ điều hành, vai trò mặc định]
    const positions: [string, string, number, boolean, string | null][] = [
      ['CV01', 'Chuyên viên', 2, false, 'employee'],
      ['CV02', 'Trưởng phòng', 5, false, 'manager'],
      ['CV03', 'Thực tập sinh', 1, false, 'employee'],
      ['CV04', 'Giám đốc', 8, true, 'director'],
      ['CV05', 'Phó phòng', 4, false, null],
    ];

    for (const [id, name, level, executive, defaultRole] of positions) {
      await tx.run(
        'INSERT INTO positions(id, name, description, level, is_executive, default_role) VALUES($1, $2, $3, $4, $5, $6)',
        [id, name, '', level, executive, defaultRole]
      );
    }

    const people: [string, string, string, string][] = [
      ['Nguyễn Minh Anh', 'Nữ', 'PB01', 'CV02'],
      ['Trần Quốc Bảo', 'Nam', 'PB02', 'CV02'],
      ['Lê Hoàng Nam', 'Nam', 'PB02', 'CV01'],
      ['Phạm Thu Hà', 'Nữ', 'PB03', 'CV01'],
      ['Võ Ngọc Linh', 'Nữ', 'PB04', 'CV02'],
      ['Đặng Đức Huy', 'Nam', 'PB02', 'CV01'],
      ['Bùi Phương Thảo', 'Nữ', 'PB05', 'CV02'],
      ['Đỗ Thành Đạt', 'Nam', 'PB03', 'CV02'],
      ['Nguyễn Khánh Vy', 'Nữ', 'PB01', 'CV01'],
      ['Trần Hải Đăng', 'Nam', 'PB06', 'CV04'],
      ['Lý Tú Anh', 'Nữ', 'PB05', 'CV03'],
      ['Hoàng Minh Quân', 'Nam', 'PB04', 'CV01'],
    ];

    for (let i = 0; i < people.length; i++) {
      const [name, gender, deptId, posId] = people[i];
      const id = `NV${String(i + 1).padStart(3, '0')}`;
      const join =
        i === 10
          ? date
          : `${year - (i % 3)}-${String((i % 9) + 1).padStart(2, '0')}-05`;

      await tx.run(
        `INSERT INTO employees(id, name, birth_date, gender, address, phone, email, join_date, status, archived_date, department_id, position_id)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          name,
          `${1990 + i}-0${(i % 8) + 1}-15`,
          gender,
          'Hà Nội',
          `090123${String(i + 1).padStart(4, '0')}`,
          `nhanvien${i + 1}@example.com`,
          join,
          i === 10 ? 'Thử việc' : 'Đang làm việc',
          null,
          deptId,
          posId,
        ]
      );

      await tx.run(
        'INSERT INTO leave_balances(employee_id, year, total) VALUES($1, $2, $3)',
        [id, year, 12]
      );

      const end =
        i === 2
          ? shift(date, 14)
          : i === 6
          ? shift(date, 27)
          : `${year + 1}-12-31`;

      await tx.run(
        `INSERT INTO contracts(id, employee_id, type, start_date, end_date, salary, status)
         VALUES($1, $2, $3, $4, $5, $6, 'Hiệu lực')`,
        [
          `HD${String(i + 1).padStart(3, '0')}`,
          id,
          i === 10 ? 'Thử việc' : 'Xác định thời hạn',
          join,
          end,
          8000000 + i * 1500000,
        ]
      );
    }

    const leaveTypes: [string, string, number, number][] = [
      ['LP01', 'Phép năm', 12, 1],
      ['LP02', 'Nghỉ ốm', 30, 0],
      ['LP03', 'Việc riêng', 5, 0],
      ['LP04', 'Không hưởng lương', 30, 0],
    ];

    for (const [id, name, maxDays, deductAnnual] of leaveTypes) {
      await tx.run(
        'INSERT INTO leave_types(id, name, max_days, deduct_annual) VALUES($1, $2, $3, $4)',
        [id, name, maxDays, deductAnnual]
      );
    }

    const workDay = (offset: number) => nextWorkingDay(shift(date, offset));
    const secondDay = (first: string) => nextWorkingDay(shift(first, 1));
    const first = workDay(2);
    const leaves: [string, string, string, string, string, string, string][] = [
      ['NP001', 'NV003', 'LP01', first, secondDay(first), 'Giải quyết việc gia đình', 'Chờ duyệt'],
      ['NP002', 'NV004', 'LP01', workDay(9), workDay(9), 'Việc cá nhân', 'Chờ duyệt'],
      ['NP003', 'NV009', 'LP02', workDay(1), workDay(1), 'Khám sức khỏe', 'Chờ duyệt'],
      ['NP004', 'NV006', 'LP01', workDay(-12), workDay(-12), 'Nghỉ phép theo kế hoạch', 'Đã duyệt'],
    ];

    for (const [id, empId, typeId, start, end, reason, status] of leaves) {
      await tx.run(
        `INSERT INTO leave_requests(id, employee_id, type_id, submitted_date, start_date, end_date, days, reason, status, approver_id, approved_date)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          empId,
          typeId,
          status === 'Đã duyệt' ? shift(start, -1) : date,
          start,
          end,
          countWorkingDays(start, end),
          reason,
          status,
          status === 'Đã duyệt' ? 'NV002' : null,
          status === 'Đã duyệt' ? date : null,
        ]
      );
    }

    const roles: [string, string, string][] = [
      ['admin', 'admin', 'NV001'],
      ['nhansu', 'hr', 'NV009'],
      ['truongphong', 'manager', 'NV002'],
      ['nhanvien', 'employee', 'NV003'],
      ['giamdoc', 'director', 'NV010'],
    ];

    for (let i = 0; i < roles.length; i++) {
      const [username, role, empId] = roles[i];
      await tx.run(
        'INSERT INTO users(id, username, password_hash, role, employee_id, active) VALUES($1, $2, $3, $4, $5, 1)',
        [`U${i + 1}`, username, passwordHash(role === 'admin' ? process.env.ADMIN_PASSWORD || 'Demo@12345' : 'Demo@12345'), role, empId]
      );
    }

    await tx.run(
      `UPDATE departments d SET head_id = e.id
       FROM employees e WHERE e.department_id = d.id AND e.position_id = 'CV02'`
    );
    await tx.run(
      `UPDATE departments SET head_id = 'NV010' WHERE id = 'PB06' AND head_id IS NULL`
    );

    const sampleDecisions: [string, string, string, string, string][] = [
      ['QD001', `01/${year}/QD-NS`, 'Bổ nhiệm', 'Trần Hải Đăng', 'Bổ nhiệm Trưởng phòng Marketing'],
      ['QD002', `02/${year}/QD-DC`, 'Điều chuyển', 'Trần Hải Đăng', 'Điều chuyển chuyên viên Lê Hoàng Nam sang phòng Marketing hỗ trợ dự án'],
      ['QD003', `03/${year}/QD-MN`, 'Miễn nhiệm', 'Trần Hải Đăng', 'Miễn nhiệm chức vụ phó phòng đối với nhân sự để nhận công tác mới'],
      ['QD006', `06/${year}/QD-CD`, 'Chấm dứt hợp đồng', 'Trần Hải Đăng', 'Quyết định chấm dứt hợp đồng lao động theo thỏa thuận đôi bên'],
    ];

    for (const [id, num, type, signer, content] of sampleDecisions) {
      await tx.run(
        `INSERT INTO decisions(id, number, type, signed_date, effective_date, signer, content)
         VALUES($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET number = EXCLUDED.number, content = EXCLUDED.content`,
        [id, num, type, date, date, signer, content]
      );
    }

    const sampleAssignments: [string, string, string, string, string, string, string, string, string][] = [
      ['QT001', 'NV007', 'QD001', 'Bổ nhiệm', 'PB05', 'PB05', 'CV01', 'CV02', 'Ghi nhận quyết định bổ nhiệm trưởng phòng'],
      ['QT002', 'NV003', 'QD002', 'Điều chuyển', 'PB02', 'PB05', 'CV01', 'CV01', 'Điều chuyển nhân sự hỗ trợ dự án'],
      ['QT003', 'NV006', 'QD003', 'Miễn nhiệm', 'PB02', 'PB02', 'CV05', 'CV01', 'Miễn nhiệm chức vụ phó phòng kỹ thuật theo nguyện vọng'],
    ];

    for (const [id, empId, decId, type, oldDept, newDept, oldPos, newPos, reason] of sampleAssignments) {
      await tx.run(
        `INSERT INTO assignments(id, employee_id, decision_id, type, old_department_id, new_department_id, old_position_id, new_position_id, effective_date, reason)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [id, empId, decId, type, oldDept, newDept, oldPos, newPos, date, reason]
      );
    }
  });
}
