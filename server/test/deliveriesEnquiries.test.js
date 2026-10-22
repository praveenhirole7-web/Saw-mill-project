'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'sawmill_test_db';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const db = require('../src/config/db');
db.withTransaction = async callback => callback({ execute: async () => [[]] });

const deliveryRepository = require('../src/repositories/deliveryRepository');
const enquiryRepository = require('../src/repositories/enquiryRepository');
const deliveryService = require('../src/services/deliveryService');
const enquiryService = require('../src/services/enquiryService');
const authorize = require('../src/middleware/authorize');
const errorHandler = require('../src/middleware/errorHandler');
const enquiryRoutes = require('../src/routes/enquiries');

let orderStatus;
let delivery;
let deliveryHistory;
let duplicateDelivery;
let savedEnquiries;
let enquiry;
let enquiryHistory;
let matchedCustomer;
let quotation;
let nextEnquiryId;

beforeEach(() => {
  orderStatus = 'completed';
  delivery = null;
  deliveryHistory = [];
  duplicateDelivery = false;
  savedEnquiries = [];
  enquiry = null;
  enquiryHistory = [];
  matchedCustomer = { id: 27 };
  quotation = null;
  nextEnquiryId = 1;

  deliveryRepository.lockOrder = async id => ({ id, order_number: `SO-${id}`, status: orderStatus });
  deliveryRepository.create = async data => {
    if (duplicateDelivery) {
      const error = new Error("Duplicate entry '9' for key 'deliveries.sales_order_id'");
      error.code = 'ER_DUP_ENTRY';
      throw error;
    }
    delivery = { ...data, id: 1, status: 'scheduled' };
    return delivery.id;
  };
  deliveryRepository.addHistory = async entry => deliveryHistory.push({ ...entry });
  deliveryRepository.findById = async () => ({ ...delivery, history: deliveryHistory.map(entry => ({ ...entry })) });
  deliveryRepository.lockDelivery = async () => delivery && { ...delivery };
  deliveryRepository.transition = async (id, status, details) => {
    const { confirmation_name, confirmation_notes, ...fields } = details;
    Object.assign(delivery, fields, {
      status,
      ...(confirmation_name !== undefined && { delivery_confirmation_name: confirmation_name }),
      ...(confirmation_notes !== undefined && { delivery_confirmation_notes: confirmation_notes })
    });
  };
  deliveryRepository.updateSchedule = async (id, data) => Object.assign(delivery, data);

  enquiryRepository.createPublic = async data => {
    const record = { ...data, id: nextEnquiryId++, status: 'new' };
    savedEnquiries.push(record);
    return record.id;
  };
  enquiryRepository.lockById = async () => enquiry && { ...enquiry };
  enquiryRepository.userIsActive = async () => true;
  enquiryRepository.update = async (id, updates) => Object.assign(enquiry, updates);
  enquiryRepository.addHistory = async entry => enquiryHistory.push({ ...entry });
  enquiryRepository.findById = async () => enquiry && { ...enquiry, quotation_number: quotation?.quotation_number, quotation_id: quotation?.id };
  enquiryRepository.findExistingCustomer = async () => ({ ambiguous: false, customer: matchedCustomer });
  enquiryRepository.createCustomer = async () => 55;
  enquiryRepository.setConvertedCustomer = async (id, customerId) => Object.assign(enquiry, { customer_id: customerId, status: 'converted' });
  enquiryRepository.findQuotationByEnquiry = async () => quotation;
  enquiryRepository.createQuotation = async (data, customerId, quotationNumber) => {
    quotation = { id: 1, customer_id: customerId, quotation_number: quotationNumber };
    return quotation.id;
  };
});

const schedule = { sales_order_id: 9, planned_delivery_date: '2026-11-20', vehicle_info: 'Flatbed 4' };
const validEnquiry = {
  source: 'quote',
  name: 'Morgan Lee',
  phone: '+1 555 0100',
  email: 'morgan@example.com',
  requested_product: 'Oak boards',
  quantity: '12.5',
  quantity_unit: 'pieces',
  message: 'Please send a quote.'
};

describe('delivery management', () => {
  test('only schedules completed orders and returns duplicate orders as conflicts', async () => {
    orderStatus = 'processing';
    await assert.rejects(() => deliveryService.create(schedule, 3), { errorCode: 'ORDER_NOT_FULFILLED' });

    orderStatus = 'completed';
    const created = await deliveryService.create(schedule, 3);
    assert.equal(created.status, 'scheduled');
    assert.equal(created.sales_order_id, 9);
    assert.equal(deliveryHistory[0].action, 'delivery_scheduled');

    duplicateDelivery = true;
    await assert.rejects(
      () => deliveryService.create(schedule, 3),
      { statusCode: 409, errorCode: 'DELIVERY_ALREADY_EXISTS' }
    );
  });

  test('validates delivery dates and preserves dispatch, confirmation, failure and reschedule history', async () => {
    await assert.rejects(
      () => deliveryService.create({ ...schedule, planned_delivery_date: '2026-02-30' }, 3),
      { errorCode: 'VALIDATION_ERROR' }
    );
    await deliveryService.create(schedule, 3);
    await deliveryService.transition(1, 'dispatched', {}, 3);
    await assert.rejects(
      () => deliveryService.transition(1, 'delivered', {}, 3),
      { errorCode: 'CONFIRMATION_REQUIRED' }
    );
    await deliveryService.transition(1, 'failed', { failure_reason: 'Customer unavailable' }, 3);
    await deliveryService.transition(1, 'scheduled', {
      planned_delivery_date: '2026-11-25',
      reason: 'Customer requested a later date'
    }, 3);
    await deliveryService.transition(1, 'dispatched', {}, 3);
    await deliveryService.transition(1, 'delivered', { confirmation_name: 'Alex Rivera' }, 3);

    assert.deepEqual(deliveryHistory.map(entry => entry.action), [
      'delivery_scheduled',
      'delivery_dispatched',
      'delivery_failed',
      'delivery_rescheduled',
      'delivery_dispatched',
      'delivery_confirmed'
    ]);
    assert.equal(delivery.status, 'delivered');
    assert.equal(delivery.planned_delivery_date, '2026-11-25');
    assert.equal(delivery.delivery_confirmation_name, 'Alex Rivera');
  });

  test('requires a fulfillment check again when dispatching', async () => {
    await deliveryService.create(schedule, 3);
    orderStatus = 'processing';
    await assert.rejects(
      () => deliveryService.transition(1, 'dispatched', {}, 3),
      { errorCode: 'ORDER_NOT_FULFILLED' }
    );
  });
});

describe('public and staff enquiry management', () => {
  test('persists valid public enquiries and rejects malformed input without leaking staff data', async () => {
    const result = await enquiryService.submitPublic(validEnquiry, 'quote');
    assert.match(result.reference, /^ENQ-\d{4}-[A-F0-9]{8}$/);
    assert.equal(savedEnquiries[0].quantity, '12.500');
    assert.equal(Object.hasOwn(result, 'internal_notes'), false);

    await assert.rejects(
      () => enquiryService.submitPublic({ ...validEnquiry, preferred_delivery_date: '2026-99-10' }, 'quote'),
      { errorCode: 'VALIDATION_ERROR' }
    );
    await assert.rejects(
      () => enquiryService.submitPublic({ ...validEnquiry, email: '', phone: '' }, 'quote'),
      { errorCode: 'VALIDATION_ERROR' }
    );
  });

  test('public route confirms saving, blocks honeypot submissions and rate-limits repeated requests', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/enquiries', enquiryRoutes);
    app.use(errorHandler);
    const server = app.listen(0);
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/enquiries/public`;
    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validEnquiry)
      });
      const body = await response.json();
      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      assert.ok(body.data.reference);
      assert.equal(Object.hasOwn(body.data, 'internal_notes'), false);

      const spam = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validEnquiry, website: 'spam' })
      });
      assert.equal(spam.status, 400);

      const malformed = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([])
      });
      assert.equal(malformed.status, 400);

      const remaining = [];
      for (let index = 0; index < 2; index += 1) {
        remaining.push(fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validEnquiry)
        }));
      }
      const allowed = await Promise.all(remaining);
      assert.ok(allowed.every(item => item.status === 201));
      const limited = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validEnquiry)
      });
      assert.equal(limited.status, 429);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('requires login and enquiry permissions for staff operations', async () => {
    let authError;
    authorize.permission('view_enquiries')(
      { user: { permissions: [] } },
      {},
      error => { authError = error; }
    );
    assert.equal(authError.statusCode, 403);
    assert.equal(authError.errorCode, 'INSUFFICIENT_PERMISSION');

    let passed = false;
    authorize.permission('manage_enquiries')(
      { user: { permissions: ['manage_enquiries'] } },
      {},
      error => { passed = error === undefined; }
    );
    assert.equal(passed, true);

    const app = express();
    app.use('/api/v1/enquiries', enquiryRoutes);
    app.use(errorHandler);
    const server = app.listen(0);
    await once(server, 'listening');
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/enquiries`);
      assert.equal(response.status, 401);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('only qualified enquiries convert and matching customers are reused', async () => {
    enquiry = {
      id: 1,
      reference: 'ENQ-2026-ABCDEF12',
      status: 'qualified',
      name: 'Morgan Lee',
      phone: '+1 555 0100',
      email: 'morgan@example.com',
      requested_product: 'Oak boards',
      quantity: '12.500',
      quantity_unit: 'pieces',
      customer_id: null
    };
    const converted = await enquiryService.convert(1, 'customer', 4);
    assert.equal(converted.customer_id, 27);
    assert.equal(converted.status, 'converted');
    assert.equal(enquiryHistory[0].action, 'converted_to_customer');

    enquiry = { ...enquiry, id: 2, status: 'new' };
    await assert.rejects(
      () => enquiryService.convert(2, 'customer', 4),
      { errorCode: 'ENQUIRY_NOT_QUALIFIED' }
    );
    await assert.rejects(
      () => enquiryService.update(2, { status: 'converted' }, 4),
      { errorCode: 'INVALID_ENQUIRY_TRANSITION' }
    );
  });

  test('records status, assignment, and internal-note changes separately in staff history', async () => {
    enquiry = {
      id: 1,
      reference: 'ENQ-2026-ABCDEF12',
      status: 'new',
      assigned_to_id: 7,
      internal_notes: null
    };
    await enquiryService.update(1, {
      status: 'qualified',
      assigned_to_id: null,
      internal_notes: 'Call back with a quote.'
    }, 4);
    assert.deepEqual(enquiryHistory.map(entry => entry.action), [
      'status_qualified',
      'assignment_updated',
      'internal_notes_updated'
    ]);
    assert.equal(enquiryHistory[1].notes, 'Assignment cleared.');
    assert.equal(enquiryHistory[2].notes, 'Internal notes updated.');
  });

  test('creates a draft quotation for an already linked customer', async () => {
    enquiry = {
      id: 1,
      reference: 'ENQ-2026-ABCDEF12',
      status: 'qualified',
      name: 'Morgan Lee',
      phone: null,
      email: 'morgan@example.com',
      requested_product: 'Oak boards',
      quantity: '12.500',
      quantity_unit: 'pieces',
      customer_id: 27
    };
    const converted = await enquiryService.convert(1, 'quotation', 4);
    assert.equal(converted.status, 'converted');
    assert.equal(converted.quotation_id, 1);
    assert.match(converted.quotation_number, /^QUO-\d{4}-[A-F0-9]{8}$/);
    assert.equal(enquiryHistory[0].action, 'converted_to_quotation');
  });
});
