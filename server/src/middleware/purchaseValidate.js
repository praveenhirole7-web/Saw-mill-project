'use strict';
/**
 * middleware/purchaseValidate.js
 *
 * Request validation schemas for purchase creation and receipt.
 */
const AppError = require('../utils/AppError');

function validateCreatePurchase(req, res, next) {
  const { supplier_id, supplierId, items, species } = req.body;
  const sId = supplier_id || supplierId;
  const errors = [];

  if (!sId || isNaN(parseInt(sId, 10)) || parseInt(sId, 10) <= 0) {
    errors.push({ field: 'supplier_id', message: 'A valid positive Supplier ID is required.' });
  }

  if (!species && (!Array.isArray(items) || items.length === 0)) {
    errors.push({ field: 'items', message: 'At least one purchase line item or species must be provided.' });
  }

  if (Array.isArray(items)) {
    items.forEach((item, idx) => {
      if (!item.species || typeof item.species !== 'string' || !item.species.trim()) {
        errors.push({ field: `items[${idx}].species`, message: 'Species is required for every line item.' });
      }
      if (item.pieces_count !== undefined && (isNaN(Number(item.pieces_count)) || Number(item.pieces_count) < 0)) {
        errors.push({ field: `items[${idx}].pieces_count`, message: 'Pieces count must be a non-negative number.' });
      }
      if (item.unit_price !== undefined && (isNaN(Number(item.unit_price)) || Number(item.unit_price) < 0)) {
        errors.push({ field: `items[${idx}].unit_price`, message: 'Unit price must be a non-negative number.' });
      }
    });
  }

  if (errors.length > 0) {
    return next(new AppError('Purchase order validation failed.', 400, 'VALIDATION_ERROR', errors));
  }

  next();
}

function validateReceiveGoods(req, res, next) {
  const { id } = req.params;
  const errors = [];

  if (!id || isNaN(parseInt(id, 10)) || parseInt(id, 10) <= 0) {
    errors.push({ field: 'id', message: 'Valid positive purchase order ID is required.' });
  }

  if (errors.length > 0) {
    return next(new AppError('Goods receipt validation failed.', 400, 'VALIDATION_ERROR', errors));
  }

  next();
}

module.exports = {
  validateCreatePurchase,
  validateReceiveGoods,
};
