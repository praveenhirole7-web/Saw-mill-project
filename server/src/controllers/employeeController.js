'use strict';

const employeeService = require('../services/employeeService');
const { ok } = require('../utils/respond');

class EmployeeController {
  async list(req, res, next) {
    try {
      return ok(res, await employeeService.list(
        req.query,
        req.user.permissions.includes('view_employee_salary') || req.user.permissions.includes('manage_employee_salary')
      ));
    } catch (err) {
      return next(err);
    }
  }

  async create(req, res, next) {
    try {
      const canManageSalary = req.user.permissions.includes('manage_employee_salary');
      return ok(res, await employeeService.create(req.body, req.user.id, canManageSalary), 'Employee created.', 201);
    } catch (err) {
      return next(err);
    }
  }

  async update(req, res, next) {
    try {
      const canManageSalary = req.user.permissions.includes('manage_employee_salary');
      const canViewSalary = req.user.permissions.includes('view_employee_salary');
      return ok(
        res,
        await employeeService.update(req.params.id, req.body, req.user.id, canManageSalary, canViewSalary),
        'Employee updated.'
      );
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new EmployeeController();
