'use strict';
/**
 * middleware/csrf.js
 *
 * Cross-Site Request Forgery (CSRF) protection for cookie-based authentication.
 *
 * Strategy:
 *  1. Safe HTTP methods (GET, HEAD, OPTIONS) are exempt.
 *  2. Header-based authentication (Authorization: Bearer <token>) is immune to browser
 *     ambient credential CSRF and is exempt.
 *  3. When authentication cookies (access_token or refresh_token) are present on mutating
 *     requests (POST, PUT, PATCH, DELETE):
 *     - Custom Request Header Check: Browsers cannot send custom headers (e.g. X-Requested-With)
 *       in simple cross-origin requests (<form>, <img>, <iframe>) without CORS preflight.
 *       Requests must provide `X-Requested-With: XMLHttpRequest` (or `X-CSRF-Token`).
 *     - Origin / Referer Validation: In production, the request Origin or Referer header
 *       must match the configured CLIENT_URL.
 */
const AppError = require('../utils/AppError');

function csrfProtection(req, res, next) {
  // 1. Safe read-only HTTP methods are exempt
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // 2. If Authorization: Bearer header is present, browser ambient credentials are not used
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return next();
  }

  // 3. Check if cookie-based authentication is being utilized
  const hasAuthCookies = Boolean(req.cookies?.access_token || req.cookies?.refresh_token);
  if (!hasAuthCookies) {
    // No auth cookies present; let the subsequent authentication middleware reject if auth is required
    return next();
  }

  // 4. Custom header check
  const customHeader = req.headers['x-requested-with'] || req.headers['x-csrf-token'];
  if (!customHeader) {
    return next(
      new AppError(
        'CSRF validation failed: Missing custom X-Requested-With or X-CSRF-Token header.',
        403,
        'CSRF_MISSING_HEADER'
      )
    );
  }

  // 5. Origin / Referer validation if present
  const origin = req.headers['origin'];
  if (origin) {
    const allowedClientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    try {
      const originUrl = new URL(origin);
      const allowedUrl = new URL(allowedClientUrl);

      // In production, strictly match origin
      if (process.env.NODE_ENV === 'production') {
        if (originUrl.origin !== allowedUrl.origin) {
          return next(new AppError('CSRF validation failed: Request origin is not allowed.', 403, 'CSRF_INVALID_ORIGIN'));
        }
      } else {
        // In development, allow localhost origins on common frontend ports
        const isLocal = originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';
        if (!isLocal && originUrl.origin !== allowedUrl.origin) {
          return next(new AppError('CSRF validation failed: Request origin is not allowed.', 403, 'CSRF_INVALID_ORIGIN'));
        }
      }
    } catch {
      return next(new AppError('CSRF validation failed: Malformed origin header.', 403, 'CSRF_INVALID_ORIGIN'));
    }
  }

  next();
}

module.exports = csrfProtection;
