'use strict';
/**
 * controllers/inventoryController.js
 *
 * Request handler for timber inventory endpoints.
 */
const inventoryService = require('../services/inventoryService');
const { ok } = require('../utils/respond');

class InventoryController {
  async listBatches(req, res, next) {
    try {
      const {
        search,
        timberType,
        category,
        species,
        status,
        ownership,
        customerId,
        page,
        limit,
      } = req.query;

      const result = await inventoryService.listBatches({
        search,
        timberType,
        category,
        species,
        status,
        ownership,
        customerId,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 50,
      });

      return ok(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getBatchDetails(req, res, next) {
    try {
      const { id } = req.params;
      const result = await inventoryService.getBatchDetails(id);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  }

  async createBatch(req, res, next) {
    try {
      const result = await inventoryService.createBatch(req.body, req.user.id);
      return ok(res, result, 'Timber batch registered successfully.', 201);
    } catch (err) {
      next(err);
    }
  }

  async updateBatchMetadata(req, res, next) {
    try {
      const { id } = req.params;
      const result = await inventoryService.updateBatchMetadata(id, req.body, req.user.id);
      return ok(res, result, 'Batch metadata updated successfully.');
    } catch (err) {
      next(err);
    }
  }

  async recordReceipt(req, res, next) {
    try {
      const { id } = req.params;
      const result = await inventoryService.recordReceipt(id, req.body, req.user.id);
      return ok(res, result, 'Stock receipt recorded successfully.');
    } catch (err) {
      next(err);
    }
  }

  async recordIssue(req, res, next) {
    try {
      const { id } = req.params;
      const result = await inventoryService.recordIssue(id, req.body, req.user.id);
      return ok(res, result, 'Stock issued successfully.');
    } catch (err) {
      next(err);
    }
  }

  async recordAdjustment(req, res, next) {
    try {
      const { id } = req.params;
      const result = await inventoryService.recordAdjustment(
        id,
        req.body,
        req.user.id,
        req.user.role
      );
      return ok(res, result, 'Stock adjustment recorded successfully.');
    } catch (err) {
      next(err);
    }
  }

  async deleteBatch(req, res, next) {
    try {
      const { id } = req.params;
      const result = await inventoryService.deleteBatch(id, req.user.id);
      return ok(res, result, 'Batch record deleted successfully.');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new InventoryController();
