'use strict';
/**
 * utils/tokens.js
 *
 * JWT token utilities for Saw Mill Management System.
 *
 * Strategy: dual-token with HttpOnly cookies + optional Bearer fallback
 *   • access_token  — short-lived (15 min), signed JWT, sent in HttpOnly cookie
 *   • refresh_token — longer-lived (7 days), sent in a separate HttpOnly cookie
 *     The refresh token SHA-256 hash is stored in the `refresh_tokens` DB table (revocable).
 *
 * CSRF protection:
 *   - SameSite=Strict / Lax cookie attribute
 *   - Custom X-Requested-With / X-CSRF-Token header check
 *   - Origin verification against CLIENT_URL
 */
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

function getAccessSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured.');
  }
  return secret;
}

function getRefreshSecret() {
  const secret = process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET ? process.env.JWT_SECRET + '_refresh' : null);
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET or JWT_SECRET environment variable is not configured.');
  }
  return secret;
}

const ACCESS_EXPIRY  = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function getSameSiteSetting() {
  if (isProduction()) {
    return process.env.COOKIE_SAME_SITE || 'Strict';
  }
  return 'Lax';
}

/**
 * Create a signed access token for a user.
 * @param {{ id: number, role: string, email: string }} user
 * @param {string} [expiresIn]
 * @returns {string} signed JWT
 */
function createAccessToken(user, expiresIn = ACCESS_EXPIRY) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    getAccessSecret(),
    { expiresIn, issuer: 'sawmill-api' }
  );
}

/**
 * Create a signed refresh token.
 * Payload includes subject user ID and random UUID (jti) for per-token identification.
 * @param {number|string} userId
 * @param {string} [expiresIn]
 * @returns {string} signed JWT
 */
function createRefreshToken(userId, expiresIn = REFRESH_EXPIRY) {
  return jwt.sign(
    { sub: userId, jti: crypto.randomUUID() },
    getRefreshSecret(),
    { expiresIn, issuer: 'sawmill-api' }
  );
}

/**
 * Verify an access token.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, getAccessSecret(), { issuer: 'sawmill-api' });
}

/**
 * Verify a refresh token. Returns payload or throws.
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, getRefreshSecret(), { issuer: 'sawmill-api' });
}

/**
 * Set the access_token HttpOnly cookie on the response.
 * 15-minute expiry matches default access token lifespan.
 */
function setAccessCookie(res, token) {
  res.cookie('access_token', token, {
    httpOnly: true,
    secure:   isProduction(),
    sameSite: getSameSiteSetting(),
    maxAge:   15 * 60 * 1000, // 15 minutes in ms
    path:     '/',
  });
}

/**
 * Set the refresh_token HttpOnly cookie on the response.
 * 7-day expiry matches default refresh token lifespan.
 */
function setRefreshCookie(res, token) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure:   isProduction(),
    sameSite: getSameSiteSetting(),
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path:     '/api/v1/auth',          // scoped strictly to auth routes
  });
}

/**
 * Clear both auth cookies on logout.
 */
function clearAuthCookies(res) {
  const sameSite = getSameSiteSetting();
  const secure = isProduction();
  res.clearCookie('access_token',  { httpOnly: true, path: '/',            sameSite, secure });
  res.clearCookie('refresh_token', { httpOnly: true, path: '/api/v1/auth', sameSite, secure });
}

module.exports = {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setAccessCookie,
  setRefreshCookie,
  clearAuthCookies,
};
