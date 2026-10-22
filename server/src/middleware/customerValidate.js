'use strict';
/**
 * middleware/customerValidate.js
 *
 * Request validation schemas for customer creation and update.
 */
const AppError = require('../utils/AppError');

function validateCreateCustomer(req, res, next) {
  const { name, phone } = req.body;
  const errors = [];

  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push({ field: 'name', message: 'Customer or company name is required.' });
  }

  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    errors.push({ field: 'phone', message: 'Valid contact phone number is required.' });
  }

  if (errors.length > 0) {
    return next(new AppError('Customer validation failed.', 400, 'VALIDATION_ERROR', errors));
  }

  next();
}

function validateUpdateCustomer(req, res, next) {
  const { name, phone } = req.body;
  const errors = [];

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    errors.push({ field: 'name', message: 'Name cannot be empty.' });
  }

  if (phone !== undefined && (typeof phone !== 'string' || !phone.trim())) {
    errors.push({ field: 'phone', message: 'Phone cannot be empty.' });
  }

  if (errors.length > 0) {
    return next(new AppError('Customer validation failed.', 400, 'VALIDATION_ERROR', errors));
  }

  next();
}

module.exports = {
  validateCreateCustomer,
  validateUpdateCustomer,
};
