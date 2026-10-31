'use strict';
/**
 * middleware/validate.js
 *
 * Lightweight request body validation middleware.
 * Returns 422 Unprocessable Entity with structured field-level errors if validation fails.
 */
const AppError = require('../utils/AppError');

function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      const isEmpty = value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

      if (rules.required && isEmpty) {
        errors.push({ field, message: `${field} is required.` });
        continue;
      }

      if (!isEmpty) {
        const strVal = String(value).trim();

        if (rules.type === 'email') {
          const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRe.test(strVal)) {
            errors.push({ field, message: `${field} must be a valid email address.` });
          }
        }

        if (rules.type === 'number') {
          if (isNaN(Number(value))) {
            errors.push({ field, message: `${field} must be a valid number.` });
          }
        }

        if (rules.type === 'string' || rules.type === 'email') {
          if (rules.minLength && strVal.length < rules.minLength) {
            errors.push({ field, message: `${field} must be at least ${rules.minLength} characters.` });
          }
          if (rules.maxLength && strVal.length > rules.maxLength) {
            errors.push({ field, message: `${field} must be at most ${rules.maxLength} characters.` });
          }
        }

        if (rules.enum && !rules.enum.includes(value)) {
          errors.push({ field, message: `${field} must be one of: ${rules.enum.join(', ')}.` });
        }
      }
    }

    if (errors.length > 0) {
      const err = new AppError(errors[0].message, 422, 'VALIDATION_ERROR');
      err.validationErrors = errors;
      return next(err);
    }

    next();
  };
}

// ── Pre-defined schemas ───────────────────────────────────────────────────────

const loginSchema = {
  email:    { type: 'email', maxLength: 150 },
  identifier: { type: 'string', maxLength: 150 },
  expectedRole: { type: 'string', enum: ['admin', 'staff'] },
  password: { required: true, type: 'string', minLength: 1, maxLength: 128 },
};

const createUserSchema = {
  username: { required: true, type: 'string', minLength: 3, maxLength: 100 },
  email:    { required: true, type: 'email',  maxLength: 150 },
  password: { required: true, type: 'string', minLength: 12, maxLength: 128 },
};

module.exports = { validateBody, loginSchema, createUserSchema };
