'use strict';
/**
 * routes/purchases.js
 *
 * Purchase order and timber procurement endpoints:
 *   GET    /api/v1/purchases              - Search, filter, and paginate purchase orders
 *   GET    /api/v1/purchases/:id          - Single purchase order with items and supplier info
 *   POST   /api/v1/purchases              - Create purchase draft with line items
 *   POST   /api/v1/purchases/:id/receive  - Record receipt of purchased timber & create batches
 */
const express = require('express');
const router = express.Router();

const purchaseController = require('../controllers/purchaseController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { validateCreatePurchase, validateReceiveGoods } = require('../middleware/purchaseValidate');

// All purchase routes require authentication
router.use(authenticate);

// 1. List purchase orders
router.get(
  '/',
  authorize.roles(['admin', 'manager', 'accountant', 'operator']),
  purchaseController.listPurchases
);

// 2. View purchase order details
router.get(
  '/:id',
  authorize.roles(['admin', 'manager', 'accountant', 'operator']),
  purchaseController.getPurchaseDetails
);

// 3. Create purchase draft
router.post(
  '/',
  authorize.roles(['admin', 'manager', 'accountant']),
  validateCreatePurchase,
  purchaseController.createPurchase
);

// 4. Record goods receipt (transitions status to 'received' and generates traceable timber batches)
router.post(
  '/:id/receive',
  authorize.roles(['admin', 'manager', 'operator']),
  validateReceiveGoods,
  purchaseController.receiveGoods
);

module.exports = router;
