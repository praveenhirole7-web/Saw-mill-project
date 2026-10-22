'use strict';
/**
 * routes/salesOrders.js
 *
 * Sales order management endpoints:
 *   GET    /api/v1/sales-orders              - Search, filter, and paginate sales orders
 *   GET    /api/v1/sales-orders/:id          - Single sales order with line items, batches, and history
 *   POST   /api/v1/sales-orders              - Create sales order (draft or confirmed)
 *   POST   /api/v1/sales-orders/:id/confirm  - Confirm order and reserve timber inventory
 *   POST   /api/v1/sales-orders/:id/fulfill  - Fulfill order (dispatch lumber and issue inventory)
 *   POST   /api/v1/sales-orders/:id/cancel   - Cancel order and release reserved stock
 *   PATCH  /api/v1/sales-orders/:id          - Update order metadata or line items before fulfillment
 */

const express = require('express');
const router = express.Router();

const salesOrderController = require('../controllers/salesOrderController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
  validateCreateOrder,
  validateCancelOrder,
  validateUpdateOrder
} = require('../middleware/salesOrderValidate');

// All sales order routes require authentication
router.use(authenticate);

// 1. List sales orders
router.get(
  '/',
  authorize.roles(['admin', 'manager', 'accountant', 'operator']),
  salesOrderController.getOrders
);

// 2. View sales order details
router.get(
  '/:id',
  authorize.roles(['admin', 'manager', 'accountant', 'operator']),
  salesOrderController.getOrderById
);

// 3. Create sales order
router.post(
  '/',
  authorize.roles(['admin', 'manager', 'accountant']),
  validateCreateOrder,
  salesOrderController.createOrder
);

// 4. Confirm sales order (reserves inventory)
router.post(
  '/:id/confirm',
  authorize.roles(['admin', 'manager', 'accountant']),
  salesOrderController.confirmOrder
);

// 5. Fulfill sales order (dispatches lumber & issues inventory)
router.post(
  '/:id/fulfill',
  authorize.roles(['admin', 'manager']),
  salesOrderController.fulfillOrder
);

// 6. Cancel sales order (releases reserved inventory)
router.post(
  '/:id/cancel',
  authorize.roles(['admin', 'manager', 'accountant']),
  validateCancelOrder,
  salesOrderController.cancelOrder
);

// 7. Update sales order
router.patch(
  '/:id',
  authorize.roles(['admin', 'manager', 'accountant']),
  validateUpdateOrder,
  salesOrderController.updateOrder
);

module.exports = router;
