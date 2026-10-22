'use strict';

const { query } = require('../config/db');

class EmployeeRepository {
  async list({ search = '', includeSalary = false }) {
    const params = [];
    let where = '';
    if (search) {
      where = 'WHERE e.name LIKE ? OR e.job_title LIKE ? OR e.email LIKE ? OR e.phone LIKE ?';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const salaryColumns = includeSalary ? ', e.salary, e.salary_period' : '';
    const [rows] = await query(
      `SELECT e.id, e.name, e.phone, e.email, e.job_title, e.joining_date
              ${salaryColumns}, e.created_at, e.updated_at
         FROM employees e
         ${where}
        ORDER BY e.name, e.id`,
      params
    );
    return rows;
  }

  async findById(id, includeSalary = false) {
    const salaryColumns = includeSalary ? ', salary, salary_period' : '';
    const [rows] = await query(
      `SELECT id, name, phone, email, job_title, joining_date${salaryColumns}, created_at, updated_at
         FROM employees WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async create(data, actorId, conn) {
    const [result] = await conn.execute(
      `INSERT INTO employees
        (name, phone, email, job_title, joining_date, salary, salary_period, created_by_id, updated_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name, data.phone, data.email, data.job_title, data.joining_date,
        data.salary, data.salary_period, actorId, actorId,
      ]
    );
    return result.insertId;
  }

  async update(id, data, actorId, canManageSalary, conn) {
    const salaryUpdate = canManageSalary ? ', salary = ?, salary_period = ?' : '';
    const params = [data.name, data.phone, data.email, data.job_title, data.joining_date];
    if (canManageSalary) params.push(data.salary, data.salary_period);
    params.push(actorId, id);
    await conn.execute(
      `UPDATE employees
          SET name = ?, phone = ?, email = ?, job_title = ?, joining_date = ?${salaryUpdate},
              updated_by_id = ?
        WHERE id = ?`,
      params
    );
  }

  async writeAudit({ actorId, action, employeeId, description }, conn) {
    await conn.execute(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, description)
       VALUES (?, ?, 'employees', ?, ?)`,
      [actorId, action, employeeId, description]
    );
  }
}

module.exports = new EmployeeRepository();
