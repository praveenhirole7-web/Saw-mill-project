'use strict';

const { withTransaction } = require('../config/db');
const expenseRepository = require('../repositories/expenseRepository');
const AppError = require('../utils/AppError');

const VALID_CATEGORIES = new Set(['Electricity', 'Labour', 'Transport', 'Maintenance', 'Other']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDate(value, field) {
  const parsed = typeof value === 'string' && DATE_RE.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AppError(`${field} must be a valid YYYY-MM-DD date.`, 400, 'VALIDATION_ERROR');
  }
}

function validateExpense(data) {
  if (!data || typeof data !== 'object') throw new AppError('Expense details are required.', 400, 'VALIDATION_ERROR');
  if (typeof data.category !== 'string' || !data.category.trim() || data.category.trim().length > 80) {
    throw new AppError('A valid expense category is required.', 400, 'VALIDATION_ERROR');
  }
  if (typeof data.description !== 'string' || !data.description.trim() || data.description.trim().length > 255) {
    throw new AppError('Description is required and must be at most 255 characters.', 400, 'VALIDATION_ERROR');
  }
  if (data.vendor !== undefined && data.vendor !== null &&
      (typeof data.vendor !== 'string' || data.vendor.length > 160)) {
    throw new AppError('Vendor must be at most 160 characters.', 400, 'VALIDATION_ERROR');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(String(data.amount)) ||
      !Number.isFinite(Number(data.amount)) || Number(data.amount) <= 0 || Number(data.amount) > 9999999999.99) {
    throw new AppError('Amount must be a positive monetary value with at most two decimal places.', 400, 'VALIDATION_ERROR');
  }
  validateDate(data.expense_date, 'expense_date');
}

function validateFilters({ from = '', to = '' }) {
  if (from) validateDate(from, 'from');
  if (to) validateDate(to, 'to');
  if (from && to && from > to) throw new AppError('from cannot be after to.', 400, 'VALIDATION_ERROR');
}

function normalizeData(data, categoryId) {
  return {
    category_id: categoryId,
    description: data.description.trim(),
    vendor: data.vendor?.trim() || null,
    expense_date: data.expense_date,
    amount: Number(data.amount).toFixed(2),
  };
}

class ExpenseService {
  async list(filters = {}) {
    validateFilters(filters);
    const limit = Math.min(500, Math.max(1, parseInt(filters.limit, 10) || 100));
    const offset = Math.max(0, parseInt(filters.offset, 10) || 0);
    return expenseRepository.list({
      search: String(filters.search || '').trim().slice(0, 120),
      category: String(filters.category || '').trim(),
      from: filters.from || '',
      to: filters.to || '',
      limit,
      offset,
    });
  }

  async listCategories() {
    return expenseRepository.listCategories();
  }

  async createCategory(name, actorId) {
    const normalized = typeof name === 'string' ? name.trim() : '';
    if (!normalized || normalized.length > 80) {
      throw new AppError('Category name must be between 1 and 80 characters.', 400, 'VALIDATION_ERROR');
    }
    let id;
    try {
      id = await withTransaction(async conn => {
        const categoryId = await expenseRepository.createCategory(normalized, conn);
        await conn.execute(
          `INSERT INTO audit_logs (user_id, action, table_name, record_id, description)
           VALUES (?, 'EXPENSE_CATEGORY_CREATED', 'expense_categories', ?, ?)`,
          [actorId, categoryId, `Created expense category "${normalized}".`]
        );
        return categoryId;
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        throw new AppError('An expense category with that name already exists.', 409, 'DUPLICATE_CATEGORY');
      }
      throw err;
    }
    return (await expenseRepository.listCategories()).find(category => Number(category.id) === Number(id));
  }

  async create(data, actorId) {
    validateExpense(data);
    const id = await withTransaction(async conn => {
      const categoryId = await expenseRepository.findCategoryId(data.category.trim(), conn);
      if (!categoryId) throw new AppError('Expense category does not exist or is inactive.', 400, 'INVALID_CATEGORY');
      const expenseId = await expenseRepository.insert(normalizeData(data, categoryId), actorId, conn);
      await expenseRepository.writeAudit({
        actorId,
        action: 'EXPENSE_CREATED',
        expenseId,
        description: `Created ${data.category.trim()} expense for ${Number(data.amount).toFixed(2)}.`,
      }, conn);
      return expenseId;
    });
    return expenseRepository.findById(id);
  }

  async update(id, data, actorId) {
    const expenseId = parseId(id);
    validateExpense(data);
    await withTransaction(async conn => {
      const existing = await expenseRepository.findById(expenseId, conn, true);
      if (!existing) throw new AppError('Expense not found.', 404, 'EXPENSE_NOT_FOUND');
      if (existing.status !== 'posted') throw new AppError('Reversed expenses cannot be edited.', 409, 'EXPENSE_REVERSED');
      const categoryId = await expenseRepository.findCategoryId(data.category.trim(), conn);
      if (!categoryId) throw new AppError('Expense category does not exist or is inactive.', 400, 'INVALID_CATEGORY');
      const next = normalizeData(data, categoryId);
      await expenseRepository.update(expenseId, next, actorId, conn);
      await expenseRepository.writeAudit({
        actorId,
        action: 'EXPENSE_UPDATED',
        expenseId,
        description: `Updated expense #${expenseId}. Before: ${JSON.stringify({
          category: existing.category,
          description: existing.description,
          vendor: existing.vendor,
          expense_date: existing.expense_date,
          amount: existing.amount,
        })}. After: ${JSON.stringify({
          category: data.category.trim(),
          description: next.description,
          vendor: next.vendor,
          expense_date: next.expense_date,
          amount: next.amount,
        })}.`,
      }, conn);
    });
    return expenseRepository.findById(expenseId);
  }

  async reverse(id, reason, actorId) {
    const expenseId = parseId(id);
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) {
      throw new AppError('A reversal reason between 3 and 500 characters is required.', 400, 'VALIDATION_ERROR');
    }
    await withTransaction(async conn => {
      const existing = await expenseRepository.findById(expenseId, conn, true);
      if (!existing) throw new AppError('Expense not found.', 404, 'EXPENSE_NOT_FOUND');
      if (existing.status !== 'posted') throw new AppError('Expense has already been reversed.', 409, 'EXPENSE_REVERSED');
      await expenseRepository.reverse(expenseId, reason.trim(), actorId, conn);
      await expenseRepository.writeAudit({
        actorId,
        action: 'EXPENSE_REVERSED',
        expenseId,
        description: `Reversed ${Number(existing.amount).toFixed(2)} expense #${expenseId}. Reason: ${reason.trim()}`,
      }, conn);
    });
    return expenseRepository.findById(expenseId);
  }

  async report(filters = {}) {
    validateFilters(filters);
    return expenseRepository.report(filters);
  }
}

function parseId(id) {
  const parsed = Number(id);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new AppError('Valid expense ID is required.', 400, 'INVALID_EXPENSE_ID');
  return parsed;
}

module.exports = new ExpenseService();
