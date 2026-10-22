'use strict';
/**
 * middleware/cuttingJobValidate.js
 *
 * Request validation schemas for cutting job creation and operations.
 */
const AppError = require('../utils/AppError');

function validateCreateCuttingJob(req, res, next) {
  const { job_title, jobTitle, requested_dimensions, requestedDimensions, cuttingSpec, inputs, batch_id, batchId, logTag } = req.body;
  const title = job_title || jobTitle;
  const spec = requested_dimensions || requestedDimensions || cuttingSpec;
  const errors = [];

  if (!title || typeof title !== 'string' || !title.trim()) {
    errors.push({ field: 'job_title', message: 'Job title is required.' });
  }

  if (!spec || typeof spec !== 'string' || !spec.trim()) {
    errors.push({ field: 'requested_dimensions', message: 'Requested cutting specification/dimensions are required.' });
  }

  const hasInputs = (Array.isArray(inputs) && inputs.length > 0) || batch_id || batchId || logTag;
  if (!hasInputs) {
    errors.push({ field: 'inputs', message: 'Source timber batch inputs are required.' });
  }

  if (Array.isArray(inputs)) {
    inputs.forEach((inp, idx) => {
      const bId = inp.batch_id || inp.batchId;
      if (!bId || isNaN(parseInt(bId, 10)) || parseInt(bId, 10) <= 0) {
        errors.push({ field: `inputs[${idx}].batch_id`, message: 'Valid source timber batch ID is required.' });
      }
      const qty = Number(inp.quantity_used || inp.quantity || 0);
      if (isNaN(qty) || qty <= 0) {
        errors.push({ field: `inputs[${idx}].quantity_used`, message: 'Quantity used must be greater than zero.' });
      }
    });
  }

  if (errors.length > 0) {
    return next(new AppError('Cutting job validation failed.', 400, 'VALIDATION_ERROR', errors));
  }

  next();
}

function validateJobIdParam(req, res, next) {
  const { id } = req.params;
  if (!id || isNaN(parseInt(id, 10)) || parseInt(id, 10) <= 0) {
    return next(new AppError('Valid cutting job ID is required.', 400, 'INVALID_JOB_ID'));
  }
  next();
}

module.exports = {
  validateCreateCuttingJob,
  validateJobIdParam,
};
