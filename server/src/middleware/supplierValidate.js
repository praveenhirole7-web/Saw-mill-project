'use strict';
/**
 * middleware/supplierValidate.js
 *
 * Request validation schemas for supplier creation and updates.
 */
const AppError = require('../utils/AppError');

function validateCreateSupplier(req, res, next) {
  const { company_name, companyName, phone } = req.body;
  const name = company_name || companyName;
  const errors = [];

  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push({ field: 'company_name', message: 'Supplier company or concession name is required.' });
  }

  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    errors.push({ field: 'phone', message: 'Valid contact phone number is required.' });
  }

  if (errors.length > 0) {
    return next(new AppError('Supplier validation failed.', 400, 'VALIDATION_ERROR', errors));
  }

  next();
}

function validateUpdateSupplier(req, res, next) {
  const { company_name, companyName, phone } = req.body;
  const name = company_name !== undefined ? company_name : companyName;
  const errors = [];

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    errors.push({ field: 'company_name', message: 'Company name cannot be empty.' });
  }

  if (phone !== undefined && (typeof phone !== 'string' || !phone.trim())) {
    errors.push({ field: 'phone', message: 'Phone cannot be empty.' });
  }

  if (errors.length > 0) {
    return next(new AppError('Supplier validation failed.', 400, 'VALIDATION_ERROR', errors));
  }

  next();
}

module.exports = {
  validateCreateSupplier,
  validateUpdateSupplier,
};
