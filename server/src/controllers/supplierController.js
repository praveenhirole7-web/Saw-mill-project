'use strict';
/**
 * controllers/supplierController.js
 *
 * HTTP Request Handler for Supplier endpoints.
 */
const supplierService = require('../services/supplierService');
const { ok } = require('../utils/respond');

class SupplierController {
  async listSuppliers(req, res, next) {
    try {
      const { search, status, page, limit } = req.query;
      const result = await supplierService.listSuppliers({ search, status, page, limit });
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getSupplierDetails(req, res, next) {
    try {
      const { id } = req.params;
      const result = await supplierService.getSupplierDetails(id);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  }

  async createSupplier(req, res, next) {
    try {
      const result = await supplierService.createSupplier(req.body, req.user?.id);
      return ok(res, result, 'Forestry supplier registered successfully.', 201);
    } catch (err) {
      next(err);
    }
  }

  async updateSupplier(req, res, next) {
    try {
      const { id } = req.params;
      const result = await supplierService.updateSupplier(id, req.body, req.user?.id);
      return ok(res, result, 'Supplier updated successfully.');
    } catch (err) {
      next(err);
    }
  }

  async deleteSupplier(req, res, next) {
    try {
      const { id } = req.params;
      const result = await supplierService.deleteSupplier(id, req.user?.id);
      return ok(res, result, 'Supplier deleted successfully.');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new SupplierController();
