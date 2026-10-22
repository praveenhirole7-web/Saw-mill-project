'use strict';
/**
 * middleware/salesOrderValidate.js
 *
 * Request payload validation schemas and middleware for Sales Order endpoints.
 */

function validateCreateOrder(req, res, next) {
  const { customer_id, items, status } = req.body;

  const errors = [];

  if (!customer_id || isNaN(Number(customer_id)) || Number(customer_id) <= 0) {
    errors.push('A valid customer_id is required.');
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    errors.push('At least one sales order line item is required.');
  } else {
    items.forEach((item, idx) => {
      if (!item.product_name || typeof item.product_name !== 'string' || !item.product_name.trim()) {
        errors.push(`Item #${idx + 1}: product_name is required.`);
      }
      if (!item.species || typeof item.species !== 'string' || !item.species.trim()) {
        errors.push(`Item #${idx + 1}: species is required.`);
      }
      if (item.quantity === undefined || isNaN(Number(item.quantity)) || Number(item.quantity) <= 0) {
        errors.push(`Item #${idx + 1}: quantity must be a positive number.`);
      }
      if (item.unit_price !== undefined && (isNaN(Number(item.unit_price)) || Number(item.unit_price) < 0)) {
        errors.push(`Item #${idx + 1}: unit_price cannot be negative.`);
      }
      if (item.batch_id !== undefined && item.batch_id !== null && (isNaN(Number(item.batch_id)) || Number(item.batch_id) <= 0)) {
        errors.push(`Item #${idx + 1}: batch_id must be a valid ID if provided.`);
      }
    });
  }

  if (status && !['draft', 'confirmed'].includes(status)) {
    errors.push("Initial status must be either 'draft' or 'confirmed'.");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
}

function validateCancelOrder(req, res, next) {
  const { cancellation_reason } = req.body;
  if (!cancellation_reason || typeof cancellation_reason !== 'string' || !cancellation_reason.trim()) {
    return res.status(400).json({
      success: false,
      error: 'A cancellation_reason is required to cancel an order.'
    });
  }
  next();
}

function validateUpdateOrder(req, res, next) {
  const { items } = req.body;
  if (items !== undefined) {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items must be a non-empty array if provided.'
      });
    }
  }
  next();
}

module.exports = {
  validateCreateOrder,
  validateCancelOrder,
  validateUpdateOrder
};
