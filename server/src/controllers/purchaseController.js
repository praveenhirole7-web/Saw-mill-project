'use strict';
/**
 * controllers/purchaseController.js
 *
 * HTTP Request Handler for Purchase endpoints.
 */
const purchaseService = require('../services/purchaseService');
const { ok } = require('../utils/respond');

class PurchaseController {
  async listPurchases(req, res, next) {
    try {
      const { search, status, paymentStatus, page, limit } = req.query;
      const result = await purchaseService.listPurchases({ search, status, paymentStatus, page, limit });
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getPurchaseDetails(req, res, next) {
    try {
      const { id } = req.params;
      const result = await purchaseService.getPurchaseDetails(id);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  }

  async createPurchase(req, res, next) {
    try {
      const result = await purchaseService.createPurchase(req.body, req.user?.id);
      return ok(res, result, 'Purchase order draft created successfully.', 201);
    } catch (err) {
      next(err);
    }
  }

  async receiveGoods(req, res, next) {
    try {
      const { id } = req.params;
      const result = await purchaseService.receivePurchaseGoods(id, req.body, req.user?.id);
      return ok(res, result, 'Purchased timber received and inventory batches generated successfully.');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new PurchaseController();
