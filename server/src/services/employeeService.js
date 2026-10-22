'use strict';

const { withTransaction } = require('../config/db');
const employeeRepository = require('../repositories/employeeRepository');
const AppError = require('../utils/AppError');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SALARY_PERIODS = new Set(['hourly', 'monthly', 'annual']);

function validDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validate(data, canManageSalary) {
  if (!data || typeof data !== 'object') throw new AppError('Employee details are required.', 400, 'VALIDATION_ERROR');
  const fields = [
    ['name', 120],
    ['job_title', 120],
  ];
  for (const [field, max] of fields) {
    if (typeof data[field] !== 'string' || !data[field].trim() || data[field].trim().length > max) {
      throw new AppError(`${field} is required and must be at most ${max} characters.`, 400, 'VALIDATION_ERROR');
    }
  }
  if (data.phone !== undefined && data.phone !== null &&
      (typeof data.phone !== 'string' || data.phone.length > 30)) {
    throw new AppError('phone must be at most 30 characters.', 400, 'VALIDATION_ERROR');
  }
  if (data.email !== undefined && data.email !== null && data.email !== '') {
    if (typeof data.email !== 'string' || data.email.length > 150 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new AppError('email must be a valid email address.', 400, 'VALIDATION_ERROR');
    }
  }
  if (!validDate(data.joining_date)) {
    throw new AppError('joining_date must be a valid YYYY-MM-DD date.', 400, 'VALIDATION_ERROR');
  }
  const includesSalary = Object.prototype.hasOwnProperty.call(data, 'salary') ||
    Object.prototype.hasOwnProperty.call(data, 'salary_period');
  if (includesSalary && !canManageSalary) {
    throw new AppError('You are not authorized to view or update salary information.', 403, 'INSUFFICIENT_PERMISSION');
  }
  if (includesSalary) {
    const hasSalary = data.salary !== null && data.salary !== undefined && data.salary !== '';
    if (hasSalary && (!/^\d+(\.\d{1,2})?$/.test(String(data.salary)) ||
        !Number.isFinite(Number(data.salary)) || Number(data.salary) < 0 || Number(data.salary) > 9999999999.99)) {
      throw new AppError('salary must be a non-negative monetary value with at most two decimal places.', 400, 'VALIDATION_ERROR');
    }
    if (hasSalary && !SALARY_PERIODS.has(data.salary_period)) {
      throw new AppError('salary_period must be hourly, monthly, or annual.', 400, 'VALIDATION_ERROR');
    }
    if (!hasSalary && data.salary_period !== null && data.salary_period !== undefined && data.salary_period !== '') {
      throw new AppError('salary_period must be empty when salary is not set.', 400, 'VALIDATION_ERROR');
    }
  }
}

function normalize(data, canManageSalary) {
  const result = {
    name: data.name.trim(),
    phone: data.phone?.trim() || null,
    email: data.email?.trim() || null,
    job_title: data.job_title.trim(),
    joining_date: data.joining_date,
  };
  if (canManageSalary) {
    result.salary = data.salary === '' || data.salary === undefined ? null : data.salary;
    result.salary_period = result.salary === null ? null : data.salary_period;
  } else {
    result.salary = null;
    result.salary_period = null;
  }
  return result;
}

class EmployeeService {
  async list({ search = '' } = {}, canViewSalary = false) {
    return employeeRepository.list({
      search: String(search).trim().slice(0, 120),
      includeSalary: canViewSalary,
    });
  }

  async create(data, actorId, canManageSalary = false) {
    validate(data, canManageSalary);
    const employee = normalize(data, canManageSalary);
    const id = await withTransaction(async conn => {
      const employeeId = await employeeRepository.create(employee, actorId, conn);
      await employeeRepository.writeAudit({
        actorId,
        action: 'EMPLOYEE_CREATED',
        employeeId,
        description: `Created employee record for ${employee.name}${canManageSalary && employee.salary !== null ? ' with salary information' : ''}.`,
      }, conn);
      return employeeId;
    });
    return employeeRepository.findById(id, canManageSalary);
  }

  async update(id, data, actorId, canManageSalary = false, canViewSalary = false) {
    const employeeId = parseId(id);
    validate(data, canManageSalary);
    const employee = normalize(data, canManageSalary);
    const changeSalary = canManageSalary && (
      Object.prototype.hasOwnProperty.call(data, 'salary') ||
      Object.prototype.hasOwnProperty.call(data, 'salary_period')
    );
    await withTransaction(async conn => {
      const [rows] = await conn.execute('SELECT id FROM employees WHERE id = ? FOR UPDATE', [employeeId]);
      if (!rows.length) throw new AppError('Employee not found.', 404, 'EMPLOYEE_NOT_FOUND');
      await employeeRepository.update(employeeId, employee, actorId, changeSalary, conn);
      await employeeRepository.writeAudit({
        actorId,
        action: 'EMPLOYEE_UPDATED',
        employeeId,
        description: `Updated employee record for ${employee.name}${changeSalary ? '; salary fields updated' : ''}.`,
      }, conn);
    });
    return employeeRepository.findById(employeeId, canViewSalary || canManageSalary);
  }
}

function parseId(id) {
  const parsed = Number(id);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new AppError('Valid employee ID is required.', 400, 'INVALID_EMPLOYEE_ID');
  return parsed;
}

module.exports = new EmployeeService();
