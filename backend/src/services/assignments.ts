import { DbExecutor, auditLog } from '../db/pool.js';
import { today } from '../utils/validation.js';

interface PositionRow {
  id: string;
  default_role: string | null;
}

/**
 * Đồng bộ phân quyền và trưởng phòng sau khi nhân viên đổi phòng ban/chức vụ.
 * - Chức vụ có default_role -> role tài khoản theo đó (không đụng admin/hr).
 * - Không còn là trưởng phòng của phòng cũ; chức vụ "manager" tự thành trưởng phòng mới nếu phòng chưa có.
 */
export async function syncRoleAndHead(
  tx: DbExecutor,
  employeeId: string,
  newDepartmentId: string | null,
  position: PositionRow,
  actorId: string | null
): Promise<void> {
  const user = await tx.one<{ id: string; role: string }>(
    'SELECT id, role FROM users WHERE employee_id = $1',
    [employeeId]
  );
  let role = user?.role ?? null;
  if (
    user &&
    position.default_role &&
    ['employee', 'manager', 'director'].includes(user.role) &&
    user.role !== position.default_role
  ) {
    await tx.run('UPDATE users SET role = $1 WHERE id = $2', [position.default_role, user.id]);
    await auditLog(tx, actorId, 'Đồng bộ vai trò theo chức vụ', user.id, {
      role: { from: user.role, to: position.default_role },
    });
    role = position.default_role;
  }

  // Bỏ vai trò trưởng phòng ở mọi phòng không còn phù hợp.
  await tx.run(
    `UPDATE departments SET head_id = NULL
     WHERE head_id = $1 AND (id IS DISTINCT FROM $2 OR $3::text IS DISTINCT FROM 'manager')`,
    [employeeId, newDepartmentId, role]
  );
  if (role === 'manager' && newDepartmentId) {
    await tx.run('UPDATE departments SET head_id = $1 WHERE id = $2 AND head_id IS NULL', [
      employeeId,
      newDepartmentId,
    ]);
  }
}

/** Áp dụng một bản ghi công tác cho hồ sơ nhân viên (cho cả ghi nhận ngay lẫn quyết định đến hạn). */
export async function applyAssignment(
  tx: DbExecutor,
  assignmentId: string,
  actorId: string | null
): Promise<boolean> {
  const a = await tx.one<any>('SELECT * FROM assignments WHERE id = $1 FOR UPDATE', [assignmentId]);
  if (!a || a.status !== 'Chờ hiệu lực') return false;
  const e = await tx.one<any>('SELECT * FROM employees WHERE id = $1 FOR UPDATE', [a.employee_id]);
  if (!e || ['Đã lưu trữ', 'Đã nghỉ việc'].includes(e.status)) {
    await tx.run(
      `UPDATE assignments SET status = 'Đã hủy', cancelled_date = $1, cancel_reason = $2 WHERE id = $3`,
      [today(), 'Nhân viên không còn làm việc tại thời điểm quyết định có hiệu lực', a.id]
    );
    return false;
  }
  const position = await tx.one<PositionRow>('SELECT id, default_role FROM positions WHERE id = $1', [
    a.new_position_id,
  ]);
  await tx.run(
    `UPDATE assignments SET status = 'Hiệu lực', old_department_id = $1, old_position_id = $2 WHERE id = $3`,
    [e.department_id, e.position_id, a.id]
  );
  await tx.run(
    'UPDATE employees SET department_id = $1, position_id = $2, version = version + 1 WHERE id = $3',
    [a.new_department_id, a.new_position_id, e.id]
  );
  await syncRoleAndHead(tx, e.id, a.new_department_id, position!, actorId);
  await auditLog(tx, actorId, 'Áp dụng quyết định công tác', a.id);
  return true;
}
