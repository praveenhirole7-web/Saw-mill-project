'use strict';
/**
 * middleware/invoiceValidate.js
 * Request-body validation for invoice and payment endpoints.
 */

function validateCreateInvoice(req, res, next) {
  const { customer_id, issue_date, due_date, tax_rate_percent, items } = req.body;

  if (!Number.isSafeInteger(Number(customer_id)) || Number(customer_id) <= 0)
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'customer_id must be a valid integer' });

  if (issue_date && !isDate(issue_date))
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'issue_date must be a valid date in YYYY-MM-DD format' });

  if (!isDate(due_date))
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'due_date is required in YYYY-MM-DD format' });
  if (issue_date && due_date < issue_date)
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'due_date cannot be before issue_date' });

  if (tax_rate_percent === undefined || tax_rate_percent === null || String(tax_rate_percent).trim() === '' || !Number.isFinite(Number(tax_rate_percent)))
    return res.status(400).json({ success: false, code: 'TAX_RATE_REQUIRED', message: 'tax_rate_percent is required (e.g. 18 for 18 %). Never omit or hard-code tax rates.' });

  const taxPct = Number(tax_rate_percent);
  if (taxPct < 0 || taxPct > 100)
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'tax_rate_percent must be between 0 and 100' });
  if (String(tax_rate_percent).split('.')[1]?.length > 2)
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'tax_rate_percent supports at most two decimal places' });

  if (req.body.currency !== undefined && !/^[A-Z]{3}$/.test(req.body.currency))
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'currency must be a three-letter uppercase ISO currency code' });
  if (req.body.payment_terms !== undefined && (typeof req.body.payment_terms !== 'string' || req.body.payment_terms.length > 100))
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'payment_terms must be a string no longer than 100 characters' });
  if (req.body.notes !== undefined && req.body.notes !== null && typeof req.body.notes !== 'string')
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'notes must be a string' });

  if (!items || !Array.isArray(items) || items.length === 0)
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'At least one line item is required' });

  if (req.body.sales_order_id && req.body.cutting_job_id)
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Select a sales order or a cutting job, not both' });
  for (const field of ['sales_order_id', 'cutting_job_id']) {
    if (req.body[field] !== undefined && (!Number.isSafeInteger(Number(req.body[field])) || Number(req.body[field]) <= 0))
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `${field} must be a valid positive integer` });
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.description || String(it.description).trim().length === 0)
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `items[${i}].description is required` });
    if (typeof it.description !== 'string' || it.description.length > 255)
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `items[${i}].description must be a string no longer than 255 characters` });
    if (it.unit !== undefined && (typeof it.unit !== 'string' || it.unit.length > 30))
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `items[${i}].unit must be a string no longer than 30 characters` });
    if (!Number.isFinite(Number(it.quantity)) || Number(it.quantity) <= 0)
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `items[${i}].quantity must be > 0` });
    if (it.unit_price === undefined || !Number.isFinite(Number(it.unit_price)) || Number(it.unit_price) < 0)
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `items[${i}].unit_price must be >= 0` });
    if (String(it.unit_price).split('.')[1]?.length > 2)
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `items[${i}].unit_price supports at most two decimal places` });
    if (it.discount_percent !== undefined && (!Number.isFinite(Number(it.discount_percent)) || Number(it.discount_percent) < 0 || Number(it.discount_percent) > 100))
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `items[${i}].discount_percent must be 0–100` });
    if (it.discount_percent !== undefined && String(it.discount_percent).split('.')[1]?.length > 2)
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `items[${i}].discount_percent supports at most two decimal places` });
    if (it.quantity !== undefined && String(it.quantity).split('.')[1]?.length > 3)
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `items[${i}].quantity supports at most three decimal places` });
  }

  const discount = Number(req.body.discount_amount || 0);
  const charges = Number(req.body.additional_charges || 0);
  const cuttingCharge = Number(req.body.cutting_charge || 0);
  if (!Number.isFinite(discount) || discount < 0 || !Number.isFinite(charges) || charges < 0 || !Number.isFinite(cuttingCharge) || cuttingCharge < 0)
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'discount, additional charges, and cutting charge must be non-negative finite amounts' });
  if ([req.body.discount_amount, req.body.additional_charges, req.body.cutting_charge].some(value => value !== undefined && String(value).split('.')[1]?.length > 2))
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'discount, additional charges, and cutting charge support at most two decimal places' });

  next();
}

function validateRecordPayment(req, res, next) {
  const { amount, payment_method, payment_date, idempotency_key } = req.body;

  if (amount === undefined || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !/^\d+(\.\d{1,2})?$/.test(String(amount)))
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'amount must be a positive number' });

  const VALID_METHODS = ['cash', 'bank_transfer', 'upi', 'cheque', 'credit_card', 'other'];
  if (!VALID_METHODS.includes(payment_method))
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `payment_method must be one of: ${VALID_METHODS.join(', ')}` });

  if (payment_date && !isDate(payment_date))
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'payment_date must be in YYYY-MM-DD format' });

  if (!idempotency_key || String(idempotency_key).trim().length < 8 || String(idempotency_key).length > 100)
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'idempotency_key must contain between 8 and 100 characters' });
  if (req.body.transaction_reference !== undefined && req.body.transaction_reference !== null
    && (typeof req.body.transaction_reference !== 'string' || req.body.transaction_reference.length > 150)) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'transaction_reference must be a string no longer than 150 characters' });
  }
  if (req.body.notes !== undefined && req.body.notes !== null && typeof req.body.notes !== 'string')
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'notes must be a string' });

  next();
}

function validateReversePayment(req, res, next) {
  const { reversal_reason } = req.body;
  if (!reversal_reason || String(reversal_reason).trim().length < 5)
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'reversal_reason must be at least 5 characters' });
  next();
}

function validateVoidInvoice(req, res, next) {
  const { void_reason } = req.body;
  if (!void_reason || String(void_reason).trim().length < 5)
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'void_reason must be at least 5 characters' });
  next();
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

module.exports = { validateCreateInvoice, validateRecordPayment, validateReversePayment, validateVoidInvoice };
