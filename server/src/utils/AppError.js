'use strict';
/**
 * utils/AppError.js
 *
 * Structured error class so every thrown error carries an HTTP status code
 * and an optional error code string for machine-readable responses.
 */
class AppError extends Error {
  /**
   * @param {string} message       - Human-readable message (safe to send to client)
   * @param {number} statusCode    - HTTP status (400, 401, 403, 404, 429, 500…)
   * @param {string} [errorCode]   - Machine-readable code e.g. 'INVALID_CREDENTIALS'
   */
  constructor(message, statusCode = 500, errorCode = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode  = errorCode;
    this.isOperational = true;           // mark as known/safe error
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
