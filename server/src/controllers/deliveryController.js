'use strict';

const deliveryService = require('../services/deliveryService');
const { ok } = require('../utils/respond');

class DeliveryController {
  async list(req, res, next) {
    try {
      return ok(res, await deliveryService.list(req.query));
    } catch (err) {
      return next(err);
    }
  }

  async eligibleOrders(req, res, next) {
    try {
      return ok(res, await deliveryService.eligibleOrders());
    } catch (err) {
      return next(err);
    }
  }

  async create(req, res, next) {
    try {
      return ok(res, await deliveryService.create(req.body, req.user.id), 'Delivery scheduled.', 201);
    } catch (err) {
      return next(err);
    }
  }

  async updateSchedule(req, res, next) {
    try {
      return ok(res, await deliveryService.updateSchedule(req.params.id, req.body, req.user.id), 'Delivery schedule updated.');
    } catch (err) {
      return next(err);
    }
  }

  async transition(req, res, next) {
    try {
      return ok(
        res,
        await deliveryService.transition(req.params.id, req.body?.status, req.body, req.user.id),
        'Delivery status updated.'
      );
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new DeliveryController();
