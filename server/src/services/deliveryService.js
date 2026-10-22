'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../config/db');
const deliveryRepository = require('../repositories/deliveryRepository');
const AppError = require('../utils/AppError');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseId(value, field = 'ID') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError(`Valid ${field} is required.`, 400, 'VALIDATION_ERROR');
  return id;
}

function validateDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new AppError('planned_delivery_date must use YYYY-MM-DD format.', 400, 'VALIDATION_ERROR');
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError('planned_delivery_date must be a valid date.', 400, 'VALIDATION_ERROR');
  }
}

function validateSchedule(data) {
  if (!data || typeof data !== 'object') throw new AppError('Delivery information is required.', 400, 'VALIDATION_ERROR');
  validateDate(data.planned_delivery_date);
  for (const [field, max] of [['vehicle_info', 160], ['driver_name', 120]]) {
    if (data[field] !== undefined && data[field] !== null &&
        (typeof data[field] !== 'string' || data[field].trim().length > max)) {
      throw new AppError(`${field} must be at most ${max} characters.`, 400, 'VALIDATION_ERROR');
    }
  }
  if (data.transport_notes !== undefined && data.transport_notes !== null &&
      (typeof data.transport_notes !== 'string' || data.transport_notes.length > 2000)) {
    throw new AppError('transport_notes must be at most 2000 characters.', 400, 'VALIDATION_ERROR');
  }
}

class DeliveryService {
  async list(filters = {}) {
    const statuses = new Set(['scheduled', 'dispatched', 'delivered', 'failed']);
    const status = filters.status && filters.status !== 'All' ? String(filters.status) : '';
    if (status && !statuses.has(status)) throw new AppError('Invalid delivery status filter.', 400, 'VALIDATION_ERROR');
    return deliveryRepository.list({
      status,
      search: String(filters.search || '').trim().slice(0, 120),
    });
  }

  async eligibleOrders() {
    return deliveryRepository.eligibleOrders();
  }

  async create(data, actorId) {
    validateSchedule(data);
    const orderId = parseId(data.sales_order_id, 'sales_order_id');
    let id;
    try {
      id = await withTransaction(async conn => {
        const order = await deliveryRepository.lockOrder(orderId, conn);
        if (!order) throw new AppError('Sales order not found.', 404, 'ORDER_NOT_FOUND');
        if (order.status !== 'completed') {
          throw new AppError('Only fully fulfilled sales orders can be scheduled for delivery.', 409, 'ORDER_NOT_FULFILLED');
        }
        const deliveryId = await deliveryRepository.create({
          delivery_number: `DLV-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          sales_order_id: order.id,
          planned_delivery_date: data.planned_delivery_date,
          vehicle_info: data.vehicle_info?.trim(),
          driver_name: data.driver_name?.trim(),
          transport_notes: data.transport_notes?.trim(),
          actor_id: actorId,
        }, conn);
        await deliveryRepository.addHistory({
          deliveryId,
          fromStatus: null,
          toStatus: 'scheduled',
          action: 'delivery_scheduled',
          actorId,
          notes: `Scheduled from completed sales order ${order.order_number}.`,
        }, conn);
        return deliveryId;
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' && String(err.message).includes('sales_order_id')) {
        throw new AppError('This sales order already has a delivery record.', 409, 'DELIVERY_ALREADY_EXISTS');
      }
      throw err;
    }
    return deliveryRepository.findById(id);
  }

  async updateSchedule(id, data, actorId) {
    const deliveryId = parseId(id, 'delivery ID');
    validateSchedule(data);
    await withTransaction(async conn => {
      const delivery = await deliveryRepository.lockDelivery(deliveryId, conn);
      if (!delivery) throw new AppError('Delivery not found.', 404, 'DELIVERY_NOT_FOUND');
      if (!['scheduled', 'failed'].includes(delivery.status)) {
        throw new AppError('Only scheduled or failed deliveries can be rescheduled or edited.', 409, 'DELIVERY_NOT_EDITABLE');
      }
      await deliveryRepository.updateSchedule(deliveryId, data, actorId, conn);
      await deliveryRepository.addHistory({
        deliveryId,
        fromStatus: delivery.status,
        toStatus: delivery.status,
        action: 'delivery_schedule_updated',
        actorId,
        notes: `Planned date changed to ${data.planned_delivery_date}.`,
      }, conn);
    });
    return deliveryRepository.findById(deliveryId);
  }

  async transition(id, nextStatus, data, actorId) {
    const deliveryId = parseId(id, 'delivery ID');
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new AppError('Delivery status details are required.', 400, 'VALIDATION_ERROR');
    }
    const allowedStatuses = new Set(['dispatched', 'delivered', 'failed', 'scheduled']);
    if (!allowedStatuses.has(nextStatus)) throw new AppError('Invalid delivery status.', 400, 'VALIDATION_ERROR');

    await withTransaction(async conn => {
      const delivery = await deliveryRepository.lockDelivery(deliveryId, conn);
      if (!delivery) throw new AppError('Delivery not found.', 404, 'DELIVERY_NOT_FOUND');

      let action;
      const details = {};
      if (delivery.status === 'scheduled' && nextStatus === 'dispatched') {
        const order = await deliveryRepository.lockOrder(delivery.sales_order_id, conn);
        if (!order || order.status !== 'completed') {
          throw new AppError('Only fully fulfilled sales orders can be dispatched.', 409, 'ORDER_NOT_FULFILLED');
        }
        action = 'delivery_dispatched';
      } else if (delivery.status === 'dispatched' && nextStatus === 'delivered') {
        if (typeof data.confirmation_name !== 'string' || !data.confirmation_name.trim() || data.confirmation_name.trim().length > 120) {
          throw new AppError('A delivery confirmation name is required to mark this delivery delivered.', 400, 'CONFIRMATION_REQUIRED');
        }
        if (data.confirmation_notes !== undefined && (typeof data.confirmation_notes !== 'string' || data.confirmation_notes.length > 2000)) {
          throw new AppError('confirmation_notes must be at most 2000 characters.', 400, 'VALIDATION_ERROR');
        }
        details.confirmation_name = data.confirmation_name.trim();
        details.confirmation_notes = data.confirmation_notes?.trim();
        action = 'delivery_confirmed';
      } else if (delivery.status === 'dispatched' && nextStatus === 'failed') {
        if (typeof data.failure_reason !== 'string' || data.failure_reason.trim().length < 3 || data.failure_reason.trim().length > 500) {
          throw new AppError('A failure reason between 3 and 500 characters is required.', 400, 'FAILURE_REASON_REQUIRED');
        }
        details.failure_reason = data.failure_reason.trim();
        action = 'delivery_failed';
      } else if (delivery.status === 'failed' && nextStatus === 'scheduled') {
        validateDate(data.planned_delivery_date);
        if (typeof data.reason !== 'string' || data.reason.trim().length < 3 || data.reason.trim().length > 500) {
          throw new AppError('A rescheduling reason between 3 and 500 characters is required.', 400, 'RESCHEDULE_REASON_REQUIRED');
        }
        details.planned_delivery_date = data.planned_delivery_date;
        action = 'delivery_rescheduled';
      } else {
        throw new AppError(`Delivery cannot transition from '${delivery.status}' to '${nextStatus}'.`, 409, 'INVALID_DELIVERY_TRANSITION');
      }

      await deliveryRepository.transition(deliveryId, nextStatus, details, actorId, conn);
      await deliveryRepository.addHistory({
        deliveryId,
        fromStatus: delivery.status,
        toStatus: nextStatus,
        action,
        actorId,
        notes: details.failure_reason || details.confirmation_notes || data.reason || details.confirmation_name || null,
      }, conn);
    });
    return deliveryRepository.findById(deliveryId);
  }
}

module.exports = new DeliveryService();
