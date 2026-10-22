'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'sawmill_test_db';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/db');
const expenseRepository = require('../src/repositories/expenseRepository');
const employeeRepository = require('../src/repositories/employeeRepository');

let expenses;
let employees;
let auditEntries;
let nextId;

db.withTransaction = async callback => callback({
  execute: async (sql, params = []) => {
    if (sql.includes('SELECT id FROM employees WHERE id = ? FOR UPDATE')) {
      return [employees.some(employee => employee.id === Number(params[0])) ? [{ id: Number(params[0]) }] : []];
    }
    return [{ insertId: nextId++ }];
  }
});

const expenseService = require('../src/services/expenseService');
const employeeService = require('../src/services/employeeService');
const authorize = require('../src/middleware/authorize');

beforeEach(() => {
  expenses = [];
  employees = [];
  auditEntries = [];
  nextId = 1;

  expenseRepository.findCategoryId = async name => name ? 1 : null;
  expenseRepository.createCategory = async () => nextId++;
  expenseRepository.listCategories = async () => [{ id: 1, name: 'Electricity' }];
  expenseRepository.insert = async (data, actorId) => {
    const record = { ...data, id: nextId++, category: 'Electricity', status: 'posted', created_by_id: actorId };
    expenses.push(record);
    return record.id;
  };
  expenseRepository.findById = async id => expenses.find(expense => expense.id === Number(id)) || null;
  expenseRepository.update = async (id, data) => Object.assign(expenses.find(expense => expense.id === Number(id)), data);
  expenseRepository.reverse = async (id, reason, actorId) => Object.assign(
    expenses.find(expense => expense.id === Number(id)),
    { status: 'reversed', reversal_reason: reason, reversed_by_id: actorId }
  );
  expenseRepository.writeAudit = async entry => auditEntries.push(entry);
  expenseRepository.list = async () => expenses;
  expenseRepository.report = async () => ({ total_expenses: 42.5, expense_count: 1, byCategory: [] });

  employeeRepository.create = async data => {
    const record = { ...data, id: nextId++ };
    employees.push(record);
    return record.id;
  };
  employeeRepository.findById = async (id, includeSalary) => {
    const { salary, salary_period, ...profile } = employees.find(employee => employee.id === Number(id)) || {};
    return includeSalary ? { ...profile, salary, salary_period } : profile;
  };
  employeeRepository.update = async (id, data, actorId, canManageSalary) => {
    const employee = employees.find(item => item.id === Number(id));
    Object.assign(employee, data);
    if (!canManageSalary) {
      employee.salary = 45;
      employee.salary_period = 'hourly';
    }
  };
  employeeRepository.writeAudit = async entry => auditEntries.push(entry);
  employeeRepository.list = async ({ includeSalary }) => employees.map(employee => {
    const { salary, salary_period, ...profile } = employee;
    return includeSalary ? { ...profile, salary, salary_period } : profile;
  });
});

describe('expense management', () => {
  const validExpense = {
    category: 'Electricity',
    description: 'Mill electricity',
    vendor: 'Utility provider',
    expense_date: '2026-10-02',
    amount: '125.50'
  };

  test('creates DECIMAL-style expenses and records audit events', async () => {
    const created = await expenseService.create(validExpense, 7);
    assert.equal(created.amount, '125.50');
    assert.equal(created.status, 'posted');
    assert.equal(auditEntries[0].action, 'EXPENSE_CREATED');
    assert.equal(auditEntries[0].actorId, 7);
  });

  test('edits and reverses posted expenses without deleting ledger history', async () => {
    const created = await expenseService.create(validExpense, 7);
    const updated = await expenseService.update(created.id, { ...validExpense, amount: '140.00' }, 8);
    assert.equal(updated.amount, '140.00');
    assert.match(auditEntries[1].description, /Before:/);
    const reversed = await expenseService.reverse(created.id, 'Duplicate entry', 9);
    assert.equal(reversed.status, 'reversed');
    assert.equal(reversed.reversal_reason, 'Duplicate entry');
    assert.equal(auditEntries[2].action, 'EXPENSE_REVERSED');
    await assert.rejects(() => expenseService.reverse(created.id, 'Again', 9), { errorCode: 'EXPENSE_REVERSED' });
  });

  test('validates monetary amounts, dates and reversal reasons', async () => {
    await assert.rejects(
      () => expenseService.create({ ...validExpense, amount: '1.234' }, 7),
      { errorCode: 'VALIDATION_ERROR' }
    );
    await assert.rejects(
      () => expenseService.create({ ...validExpense, expense_date: '2026-02-30' }, 7),
      { errorCode: 'VALIDATION_ERROR' }
    );
    await assert.rejects(() => expenseService.reverse(1, ' ', 7), { errorCode: 'VALIDATION_ERROR' });
  });

  test('reports only through the report API contract', async () => {
    assert.deepEqual(await expenseService.report({ from: '2026-01-01', to: '2026-12-31' }), {
      total_expenses: 42.5,
      expense_count: 1,
      byCategory: []
    });
  });
});

describe('employee management', () => {
  const profile = {
    name: 'Avery Jones',
    phone: '555-0100',
    email: 'avery@example.com',
    job_title: 'Saw Operator',
    joining_date: '2024-05-06'
  };

  test('creates and updates employee profiles', async () => {
    const created = await employeeService.create(profile, 2);
    assert.equal(created.name, profile.name);
    assert.equal(created.salary, undefined);
    await employeeService.update(created.id, { ...profile, job_title: 'Senior Saw Operator' }, 3);
    assert.equal(employees[0].job_title, 'Senior Saw Operator');
    assert.deepEqual(auditEntries.map(entry => entry.action), ['EMPLOYEE_CREATED', 'EMPLOYEE_UPDATED']);
  });

  test('only authorized salary managers can set salary and salary is omitted from unauthorized lists', async () => {
    await assert.rejects(
      () => employeeService.create({ ...profile, salary: '45.00', salary_period: 'hourly' }, 2, false),
      { errorCode: 'INSUFFICIENT_PERMISSION' }
    );
    const created = await employeeService.create({
      ...profile,
      salary: '45.00',
      salary_period: 'hourly'
    }, 1, true);
    assert.equal(created.salary, '45.00');
    assert.equal((await employeeService.list({}, false))[0].salary, undefined);
    assert.equal((await employeeService.list({}, true))[0].salary, '45.00');
  });

  test('profile edits without salary permission preserve the existing salary', async () => {
    employees.push({ ...profile, id: 1, salary: 45, salary_period: 'hourly' });
    await employeeService.update(1, { ...profile, job_title: 'Lead Sawyer' }, 2, false, false);
    assert.equal(employees[0].salary, 45);
  });

  test('validates joining dates and salary units', async () => {
    await assert.rejects(
      () => employeeService.create({ ...profile, joining_date: '2024-02-31' }, 1),
      { errorCode: 'VALIDATION_ERROR' }
    );
    await assert.rejects(
      () => employeeService.create({ ...profile, salary: '10.00', salary_period: 'weekly' }, 1, true),
      { errorCode: 'VALIDATION_ERROR' }
    );
  });

  test('salary routes require explicit salary permissions', () => {
    let denied;
    authorize.permission('view_employee_salary')(
      { user: { permissions: ['view_employees'] } },
      {},
      error => { denied = error; }
    );
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.errorCode, 'INSUFFICIENT_PERMISSION');

    let allowed;
    authorize.permission('view_employee_salary')(
      { user: { permissions: ['view_employee_salary'] } },
      {},
      error => { allowed = error; }
    );
    assert.equal(allowed, undefined);
  });
});
