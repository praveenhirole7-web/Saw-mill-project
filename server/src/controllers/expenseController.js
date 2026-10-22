'use strict';

const expenseService = require('../services/expenseService');
const { ok } = require('../utils/respond');

class ExpenseController {
  async list(req, res, next) {
    try {
      return ok(res, await expenseService.list(req.query));
    } catch (err) {
      return next(err);
    }
  }

  async categories(req, res, next) {
    try {
      return ok(res, await expenseService.listCategories());
    } catch (err) {
      return next(err);
    }
  }

  async createCategory(req, res, next) {
    try {
      return ok(res, await expenseService.createCategory(req.body.name, req.user.id), 'Expense category created.', 201);
    } catch (err) {
      return next(err);
    }
  }

  async create(req, res, next) {
    try {
      return ok(res, await expenseService.create(req.body, req.user.id), 'Expense recorded.', 201);
    } catch (err) {
      return next(err);
    }
  }

  async update(req, res, next) {
    try {
      return ok(res, await expenseService.update(req.params.id, req.body, req.user.id), 'Expense updated.');
    } catch (err) {
      return next(err);
    }
  }

  async reverse(req, res, next) {
    try {
      return ok(res, await expenseService.reverse(req.params.id, req.body.reason, req.user.id), 'Expense reversed.');
    } catch (err) {
      return next(err);
    }
  }

  async report(req, res, next) {
    try {
      return ok(res, await expenseService.report(req.query));
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new ExpenseController();
