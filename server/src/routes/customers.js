'use strict';
/**
 * routes/customers.js
 *
 * Customer endpoints:
 *   GET    /api/v1/customers       - Search, filter, and paginate customers with balances
 *   GET    /api/v1/customers/:id   - Detailed customer record with order and invoice history
 *   POST   /api/v1/customers       - Register new customer record
 *   PATCH  /api/v1/customers/:id   - Update customer details
 *   DELETE /api/v1/customers/:id   - Remove customer record (admin only)
 */
const express = require('express');
const router = express.Router();

const customerController = require('../controllers/customerController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { validateCreateCustomer, validateUpdateCustomer } = require('../middleware/customerValidate');

// All customer routes require authentication
router.use(authenticate);

// 1. List customers
router.get(
  '/',
  authorize.roles(['admin', 'manager', 'accountant', 'operator']),
  customerController.listCustomers
);

// 2. View customer details with order and invoice history
router.get(
  '/:id',
  authorize.roles(['admin', 'manager', 'accountant', 'operator']),
  customerController.getCustomerDetails
);

// 3. Register customer
router.post(
  '/',
  authorize.roles(['admin', 'manager', 'accountant']),
  validateCreateCustomer,
  customerController.createCustomer
);

// 4. Update customer
router.patch(
  '/:id',
  authorize.roles(['admin', 'manager', 'accountant']),
  validateUpdateCustomer,
  customerController.updateCustomer
);

// 5. Delete customer (admin only)
router.delete(
  '/:id',
  authorize.role('admin'),
  customerController.deleteCustomer
);

module.exports = router;
