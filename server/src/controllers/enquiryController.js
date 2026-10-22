'use strict';

const enquiryService = require('../services/enquiryService');
const { ok } = require('../utils/respond');
const AppError = require('../utils/AppError');

class EnquiryController {
  async submitPublic(req, res, next) {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        throw new AppError('Enquiry details are required.', 400, 'VALIDATION_ERROR');
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'website') &&
          (typeof req.body.website !== 'string' || req.body.website.trim())) {
        throw new AppError('Submission could not be accepted.', 400, 'SPAM_DETECTED');
      }
      const result = await enquiryService.submitPublic(req.body, req.body.source);
      return ok(res, { reference: result.reference }, 'Enquiry received.', 201);
    } catch (err) {
      return next(err);
    }
  }

  async list(req, res, next) {
    try {
      return ok(res, await enquiryService.list(req.query));
    } catch (err) {
      return next(err);
    }
  }

  async assignees(req, res, next) {
    try {
      return ok(res, await enquiryService.listAssignees());
    } catch (err) {
      return next(err);
    }
  }

  async update(req, res, next) {
    try {
      return ok(res, await enquiryService.update(req.params.id, req.body, req.user.id), 'Enquiry updated.');
    } catch (err) {
      return next(err);
    }
  }

  async convert(req, res, next) {
    try {
      return ok(res, await enquiryService.convert(req.params.id, req.body?.target, req.user.id), 'Enquiry converted.');
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new EnquiryController();
