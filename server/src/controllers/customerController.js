'use strict';
/**
 * controllers/customerController.js
 *
 * HTTP Request Handler for Customer endpoints.
 */
const customerService = require('../services/customerService');
const { ok } = require('../utils/respond');

class CustomerController {
  async listCustomers(req, res, next) {
    try {
      const { search, status, page, limit } = req.query;
      const result = await customerService.listCustomers({ search, status, page, limit });
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getCustomerDetails(req, res, next) {
    try {
      const { id } = req.params;
      const result = await customerService.getCustomerDetails(id);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  }

  async createCustomer(req, res, next) {
    try {
      const result = await customerService.createCustomer(req.body, req.user?.id);
      return ok(res, result, 'Customer registered successfully.', 201);
    } catch (err) {
      next(err);
    }
  }

  async updateCustomer(req, res, next) {
    try {
      const { id } = req.params;
      const result = await customerService.updateCustomer(id, req.body, req.user?.id);
      return ok(res, result, 'Customer updated successfully.');
    } catch (err) {
      next(err);
    }
  }

  async deleteCustomer(req, res, next) {
    try {
      const { id } = req.params;
      const result = await customerService.deleteCustomer(id, req.user?.id);
      return ok(res, result, 'Customer deleted successfully.');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CustomerController();
