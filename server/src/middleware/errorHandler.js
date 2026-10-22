'use strict';
/**
 * middleware/errorHandler.js  (upgraded)
 *
 * Centralized error handling. Understands AppError (operational) vs
 * unexpected programmer errors.  Never leaks stack traces in production.
 */
const AppError = require('../utils/AppError');

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Distinguish known operational errors from unexpected bugs
  const isOperational = err instanceof AppError && err.isOperational;
  const status  = err.statusCode || 500;
  const message = isOperational ? err.message : 'An unexpected error occurred.';

  // Log everything server-side (never swallow bugs silently)
  if (!isOperational || status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${status}`);
    console.error(err.stack || err);
  }

  return res.status(status).json({
    success: false,
    error:   message,
    ...(err.errorCode && { code: err.errorCode }),
    ...(err.validationErrors && { errors: err.validationErrors }),
    // Only expose stack in development
    ...(process.env.NODE_ENV === 'development' && !isOperational && { stack: err.stack }),
  });
}

module.exports = errorHandler;
