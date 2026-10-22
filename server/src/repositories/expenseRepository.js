'use strict';

const { query } = require('../config/db');

class ExpenseRepository {
  async list({ search = '', category = '', from = '', to = '', limit = 100, offset = 0 }) {
    const conditions = [];
    const params = [];
    if (search) {
      conditions.push('(e.description LIKE ? OR e.vendor LIKE ? OR c.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) {
      conditions.push('c.name = ?');
      params.push(category);
    }
    if (from) {
      conditions.push('e.expense_date >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('e.expense_date <= ?');
      params.push(to);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await query(
      `SELECT e.id, e.category_id, c.name AS category, e.description, e.vendor,
              e.expense_date, e.amount, e.status, e.reversal_reason,
              e.created_by_id, e.updated_by_id, e.reversed_by_id,
              e.created_at, e.updated_at, e.reversed_at
         FROM expenses e
         JOIN expense_categories c ON c.id = e.category_id
         ${where}
        ORDER BY e.expense_date DESC, e.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return rows;
  }

  async listCategories() {
    const [rows] = await query(
      'SELECT id, name FROM expense_categories WHERE is_active = TRUE ORDER BY name'
    );
    return rows;
  }

  async createCategory(name, conn) {
    const [result] = await conn.execute(
      'INSERT INTO expense_categories (name) VALUES (?)',
      [name]
    );
    return result.insertId;
  }

  async findCategoryId(name, conn) {
    const [rows] = await (conn || { execute: query }).execute(
      'SELECT id FROM expense_categories WHERE name = ? AND is_active = TRUE LIMIT 1',
      [name]
    );
    return rows[0]?.id || null;
  }

  async insert(data, actorId, conn) {
    const [result] = await conn.execute(
      `INSERT INTO expenses
        (category_id, description, vendor, expense_date, amount, created_by_id, updated_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.category_id, data.description, data.vendor || null, data.expense_date, data.amount, actorId, actorId]
    );
    return result.insertId;
  }

  async findById(id, conn = null, forUpdate = false) {
    const executor = conn || { execute: query };
    const [rows] = await executor.execute(
      `SELECT e.id, e.category_id, c.name AS category, e.description, e.vendor,
              e.expense_date, e.amount, e.status, e.reversal_reason,
              e.created_by_id, e.updated_by_id, e.reversed_by_id,
              e.created_at, e.updated_at, e.reversed_at
         FROM expenses e
         JOIN expense_categories c ON c.id = e.category_id
        WHERE e.id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
      [id]
    );
    return rows[0] || null;
  }

  async update(id, data, actorId, conn) {
    await conn.execute(
      `UPDATE expenses
          SET category_id = ?, description = ?, vendor = ?, expense_date = ?,
              amount = ?, updated_by_id = ?
        WHERE id = ? AND status = 'posted'`,
      [data.category_id, data.description, data.vendor || null, data.expense_date, data.amount, actorId, id]
    );
  }

  async reverse(id, reason, actorId, conn) {
    await conn.execute(
      `UPDATE expenses
          SET status = 'reversed', reversal_reason = ?, reversed_by_id = ?, reversed_at = UTC_TIMESTAMP()
        WHERE id = ? AND status = 'posted'`,
      [reason, actorId, id]
    );
  }

  async writeAudit({ actorId, action, expenseId, description }, conn) {
    await conn.execute(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, description)
       VALUES (?, ?, 'expenses', ?, ?)`,
      [actorId, action, expenseId, description]
    );
  }

  async report({ from = '', to = '' }) {
    const conditions = ["e.status = 'posted'"];
    const params = [];
    if (from) {
      conditions.push('e.expense_date >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('e.expense_date <= ?');
      params.push(to);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [totals] = await query(
      `SELECT COALESCE(SUM(e.amount), 0) AS total_expenses, COUNT(*) AS expense_count
         FROM expenses e ${where}`,
      params
    );
    const [byCategory] = await query(
      `SELECT c.name AS category, COALESCE(SUM(e.amount), 0) AS total, COUNT(*) AS count
         FROM expenses e
         JOIN expense_categories c ON c.id = e.category_id
         ${where}
        GROUP BY c.id, c.name
        ORDER BY total DESC`,
      params
    );
    return { ...totals[0], byCategory };
  }
}

module.exports = new ExpenseRepository();
