'use strict';
/**
 * routes/inventory.js
 *
 * Timber Inventory endpoints for Saw Mill Management System:
 *   GET    /api/v1/inventory              - List, search, and filter timber batches
 *   GET    /api/v1/inventory/:id          - View batch details and movement ledger
 *   POST   /api/v1/inventory              - Register a new timber batch
 *   PATCH  /api/v1/inventory/:id          - Update permitted batch metadata
 *   POST   /api/v1/inventory/:id/receipt  - Record stock receipt
 *   POST   /api/v1/inventory/:id/issue    - Record stock issue (with oversell protection)
 *   POST   /api/v1/inventory/:id/adjust   - Record authorized stock adjustment (reason required)
 *   DELETE /api/v1/inventory/:id          - Delete batch record (admin-only)
 */
const express = require('express');
const router = express.Router();

const inventoryController = require('../controllers/inventoryController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
  validateCreateBatch,
  validateStockReceipt,
  validateStockIssue,
  validateStockAdjustment,
} = require('../middleware/inventoryValidate');

// All inventory operations require authenticated access
router.use(authenticate);

// 1. List batches
router.get(
  '/',
  authorize.roles(['admin', 'manager', 'operator', 'accountant']),
  inventoryController.listBatches
);

// 2. View batch details & movement history
router.get(
  '/:id',
  authorize.roles(['admin', 'manager', 'operator', 'accountant']),
  inventoryController.getBatchDetails
);

// 3. Register a new timber batch (Authorized workflow: admin & manager)
router.post(
  '/',
  authorize.roles(['admin', 'manager']),
  validateCreateBatch,
  inventoryController.createBatch
);

// 4. Update batch metadata
router.patch(
  '/:id',
  authorize.roles(['admin', 'manager']),
  inventoryController.updateBatchMetadata
);

// 5. Record stock receipts
router.post(
  '/:id/receipt',
  authorize.roles(['admin', 'manager', 'operator']),
  validateStockReceipt,
  inventoryController.recordReceipt
);

// 6. Record stock issues
router.post(
  '/:id/issue',
  authorize.roles(['admin', 'manager', 'operator']),
  validateStockIssue,
  inventoryController.recordIssue
);

// 7. Record stock adjustments (Reason required & admin authorization for negative stock)
router.post(
  '/:id/adjust',
  authorize.roles(['admin', 'manager']),
  validateStockAdjustment,
  inventoryController.recordAdjustment
);

// 8. Delete batch (Admin only)
router.delete(
  '/:id',
  authorize.role('admin'),
  inventoryController.deleteBatch
);

module.exports = router;
