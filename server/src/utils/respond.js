'use strict';
/**
 * utils/respond.js
 *
 * Unified response helpers so every route returns the same JSON envelope:
 *
 *   success:  { success: true,  data: {...},    message?: "..." }
 *   failure:  { success: false, error: "...",   code?: "MACHINE_CODE" }
 */

/**
 * Send a successful JSON response.
 * @param {Response} res
 * @param {*}        data        - payload (object, array, null)
 * @param {string}   [message]   - optional human-readable message
 * @param {number}   [status]    - HTTP status (default 200)
 */
function ok(res, data, message, status = 200) {
  return res.status(status).json({
    success: true,
    ...(message && { message }),
    data,
  });
}

/**
 * Send an error JSON response.
 * @param {Response} res
 * @param {string}   message     - human-readable error message
 * @param {number}   [status]    - HTTP status (default 400)
 * @param {string}   [code]      - machine-readable error code
 */
function fail(res, message, status = 400, code = null) {
  return res.status(status).json({
    success: false,
    error: message,
    ...(code && { code }),
  });
}

module.exports = { ok, fail };
