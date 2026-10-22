'use strict';
/**
 * middleware/inventoryValidate.js
 *
 * Validation middleware for timber inventory batches and stock movements.
 */
const AppError = require('../utils/AppError');
const { parseDimensionString } = require('../utils/timberVolume');

const VALID_STOCK_UNITS = new Set([
  'CFT', 'Cubic metres (m³)', 'Board Feet', 'Pieces', 'Slabs', 'Sq Ft',
  'Feet', 'Inches', 'Meters', 'Kilograms (kg)',
]);

function addPositiveDimensionError(errors, field, label, value) {
  const number = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isFinite(number) || number <= 0) {
    errors.push({ field, message: `Enter a valid ${label.toLowerCase()} greater than zero.` });
  }
}

function validateCreateBatch(req, res, next) {
  const { name, species, quantity } = req.body;
  const errors = [];

  if (!name || String(name).trim().length < 2) {
    errors.push({ field: 'name', message: 'Item name is required and must be at least 2 characters.' });
  }

  if (!species || String(species).trim().length < 2) {
    errors.push({ field: 'species', message: 'Timber species is required.' });
  }

  const numQty = Number(quantity);
  if (quantity === undefined || quantity === null || !Number.isFinite(numQty) || numQty < 0) {
    errors.push({ field: 'quantity', message: 'Quantity must be a valid non-negative number.' });
  }

  if (req.body.unit && !VALID_STOCK_UNITS.has(req.body.unit)) {
    errors.push({ field: 'unit', message: `Unit must be one of: ${[...VALID_STOCK_UNITS].join(', ')}.` });
  }

  if (req.body.ownership && !['mill', 'customer'].includes(req.body.ownership)) {
    errors.push({ field: 'ownership', message: 'Ownership must be either "mill" or "customer".' });
  }

  if (req.body.ownership === 'customer' && !req.body.customer_id && !req.body.customerId) {
    errors.push({ field: 'customer_id', message: 'Customer ID is required for customer-owned timber.' });
  }

  if (req.body.timber_type && !['raw_log', 'sawn_timber'].includes(req.body.timber_type)) {
    errors.push({ field: 'timber_type', message: 'timber_type must be either "raw_log" or "sawn_timber".' });
  }

  const timberType = req.body.timber_type || (req.body.category === 'Round Logs' ? 'raw_log' : (req.body.category ? 'sawn_timber' : null));
  const parsedDimensions = parseDimensionString(req.body.dimensions || '');
  const dimensionValue = (field, camelField) => {
    const values = [req.body[field], req.body[camelField], parsedDimensions[field]];
    return values.find(value => value !== undefined && value !== null && String(value).trim() !== '');
  };
  if (timberType === 'raw_log') {
    addPositiveDimensionError(errors, 'length_feet', 'Length in feet', dimensionValue('length_feet', 'lengthFeet'));
    addPositiveDimensionError(errors, 'girth_inches', 'Girth in inches', dimensionValue('girth_inches', 'girthInches'));
  } else if (timberType === 'sawn_timber') {
    addPositiveDimensionError(errors, 'length_feet', 'Length in feet', dimensionValue('length_feet', 'lengthFeet'));
    addPositiveDimensionError(errors, 'width_inches', 'Width in inches', dimensionValue('width_inches', 'widthInches'));
    addPositiveDimensionError(errors, 'thickness_inches', 'Thickness in inches', dimensionValue('thickness_inches', 'thicknessInches'));
  } else {
    for (const [field, label, camelField] of [
      ['length_feet', 'Length in feet', 'lengthFeet'],
      ['width_inches', 'Width in inches', 'widthInches'],
      ['thickness_inches', 'Thickness in inches', 'thicknessInches'],
      ['girth_inches', 'Girth in inches', 'girthInches'],
    ]) {
      const value = dimensionValue(field, camelField);
      if (value !== undefined) addPositiveDimensionError(errors, field, label, value);
    }
  }

  if (errors.length > 0) {
    const err = new AppError(errors[0].message, 422, 'VALIDATION_ERROR');
    err.validationErrors = errors;
    return next(err);
  }

  next();
}

function validateStockReceipt(req, res, next) {
  const { quantity } = req.body;
  const numQty = Number(quantity);

  if (quantity === undefined || quantity === null || !Number.isFinite(numQty) || numQty <= 0) {
    return next(new AppError('Receipt quantity must be a positive number greater than zero.', 422, 'VALIDATION_ERROR'));
  }

  next();
}

function validateStockIssue(req, res, next) {
  const { quantity } = req.body;
  const numQty = Number(quantity);

  if (quantity === undefined || quantity === null || !Number.isFinite(numQty) || numQty <= 0) {
    return next(new AppError('Issue quantity must be a positive number greater than zero.', 422, 'VALIDATION_ERROR'));
  }

  next();
}

function validateStockAdjustment(req, res, next) {
  const { adjustment_type, quantity, reason } = req.body;
  const errors = [];

  const VALID_ADJUSTMENT_TYPES = ['add', 'deduct', 'set_exact'];
  if (!VALID_ADJUSTMENT_TYPES.includes(adjustment_type)) {
    errors.push({ field: 'adjustment_type', message: `adjustment_type must be one of: ${VALID_ADJUSTMENT_TYPES.join(', ')}` });
  }

  const numQty = Number(quantity);
  if (quantity === undefined || quantity === null || !Number.isFinite(numQty) || numQty < 0) {
    errors.push({ field: 'quantity', message: 'Adjustment quantity must be a non-negative number.' });
  }

  if (!reason || String(reason).trim().length < 5) {
    errors.push({ field: 'reason', message: 'A specific explanation/reason (minimum 5 characters) is required for stock adjustments.' });
  }

  if (errors.length > 0) {
    const err = new AppError(errors[0].message, 422, 'VALIDATION_ERROR');
    err.validationErrors = errors;
    return next(err);
  }

  next();
}

module.exports = {
  validateCreateBatch,
  validateStockReceipt,
  validateStockIssue,
  validateStockAdjustment,
};
