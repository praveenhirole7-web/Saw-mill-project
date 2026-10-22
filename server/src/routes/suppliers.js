'use strict';
/**
 * routes/suppliers.js
 *
 * Supplier endpoints:
 *   GET    /api/v1/suppliers       - Search, filter, and paginate suppliers with purchase stats
 *   GET    /api/v1/suppliers/:id   - Single supplier details with purchase history
 *   POST   /api/v1/suppliers       - Register new supplier
 *   PATCH  /api/v1/suppliers/:id   - Update supplier details
 *   DELETE /api/v1/suppliers/:id   - Remove supplier record (admin only)
 */
const express = require('express');
const router = express.Router();

const supplierController = require('../controllers/supplierController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { validateCreateSupplier, validateUpdateSupplier } = require('../middleware/supplierValidate');

// All supplier routes require authentication
router.use(authenticate);

// 1. List suppliers
router.get(
  '/',
  authorize.roles(['admin', 'manager', 'accountant', 'operator']),
  supplierController.listSuppliers
);

// 2. View supplier details with purchase history
router.get(
  '/:id',
  authorize.roles(['admin', 'manager', 'accountant', 'operator']),
  supplierController.getSupplierDetails
);

// 3. Register supplier
router.post(
  '/',
  authorize.roles(['admin', 'manager', 'accountant']),
  validateCreateSupplier,
  supplierController.createSupplier
);

// 4. Update supplier
router.patch(
  '/:id',
  authorize.roles(['admin', 'manager', 'accountant']),
  validateUpdateSupplier,
  supplierController.updateSupplier
);

// 5. Delete supplier (admin only)
router.delete(
  '/:id',
  authorize.role('admin'),
  supplierController.deleteSupplier
);

module.exports = router;
