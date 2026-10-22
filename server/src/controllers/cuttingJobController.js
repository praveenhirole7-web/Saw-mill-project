'use strict';
/**
 * controllers/cuttingJobController.js
 *
 * HTTP Request Handler for Sawmill Cutting Job endpoints.
 */
const cuttingJobService = require('../services/cuttingJobService');
const { ok } = require('../utils/respond');

class CuttingJobController {
  async listCuttingJobs(req, res, next) {
    try {
      const { search, status, sawLine, customerId, page, limit } = req.query;
      const result = await cuttingJobService.listCuttingJobs({ search, status, sawLine, customerId, page, limit });
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  }

  async getCuttingJobDetails(req, res, next) {
    try {
      const { id } = req.params;
      const result = await cuttingJobService.getCuttingJobDetails(id);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  }

  async createCuttingJob(req, res, next) {
    try {
      const result = await cuttingJobService.createCuttingJob(req.body, req.user?.id);
      return ok(res, result, 'Cutting job created successfully.', 201);
    } catch (err) {
      next(err);
    }
  }

  async startCuttingJob(req, res, next) {
    try {
      const { id } = req.params;
      const result = await cuttingJobService.startCuttingJob(id, req.user?.id);
      return ok(res, result, 'Cutting job started and input timber reserved successfully.');
    } catch (err) {
      next(err);
    }
  }

  async completeCuttingJob(req, res, next) {
    try {
      const { id } = req.params;
      const result = await cuttingJobService.completeCuttingJob(id, req.body, req.user?.id);
      return ok(res, result, 'Cutting job completed, input stock consumed, and finished lumber posted to inventory.');
    } catch (err) {
      next(err);
    }
  }

  async getCuttingJobReport(req, res, next) {
    try {
      const { id } = req.params;
      const result = await cuttingJobService.getCuttingJobReport(id);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  }

  async correctCompletedJob(req, res, next) {
    try {
      const { id } = req.params;
      const result = await cuttingJobService.correctCompletedJob(id, req.body, req.user?.id, req.user?.role);
      return ok(res, result, 'Authorized correction recorded successfully.');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CuttingJobController();
