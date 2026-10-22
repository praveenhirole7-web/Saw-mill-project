'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../config/db');
const enquiryRepository = require('../repositories/enquiryRepository');
const AppError = require('../utils/AppError');

const STATUSES = new Set(['new', 'qualified', 'in_progress', 'converted', 'closed']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\s\-().]{7,30}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function optionalText(value, field, max) {
  if (value !== undefined && value !== null &&
      (typeof value !== 'string' || value.length > max)) {
    throw new AppError(`${field} must be at most ${max} characters.`, 400, 'VALIDATION_ERROR');
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function validatePublic(data, source) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AppError('Enquiry details are required.', 400, 'VALIDATION_ERROR');
  }
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 120) {
    throw new AppError('name is required and must be at most 120 characters.', 400, 'VALIDATION_ERROR');
  }
  const phone = optionalText(data.phone, 'phone', 30);
  const email = optionalText(data.email, 'email', 150)?.toLowerCase() || null;
  if (!phone && !email) throw new AppError('Provide a phone number or email address.', 400, 'VALIDATION_ERROR');
  if (phone && !PHONE_RE.test(phone)) throw new AppError('phone must be a valid contact number.', 400, 'VALIDATION_ERROR');
  if (email && !EMAIL_RE.test(email)) throw new AppError('email must be a valid email address.', 400, 'VALIDATION_ERROR');

  const product = source === 'contact' ? data.requested_product : data.requested_product;
  if (typeof product !== 'string' || !product.trim() || product.trim().length > 150) {
    throw new AppError('requested_product is required and must be at most 150 characters.', 400, 'VALIDATION_ERROR');
  }
  if (!/^\d+(\.\d{1,3})?$/.test(String(data.quantity)) ||
      !Number.isFinite(Number(data.quantity)) || Number(data.quantity) <= 0 || Number(data.quantity) > 999999999.999) {
    throw new AppError('quantity must be a positive number with at most three decimal places.', 400, 'VALIDATION_ERROR');
  }
  const quantityUnit = typeof data.quantity_unit === 'string' ? data.quantity_unit.trim() : '';
  if (!quantityUnit || quantityUnit.length > 40) {
    throw new AppError('quantity_unit is required and must be at most 40 characters.', 400, 'VALIDATION_ERROR');
  }
  if (typeof data.message !== 'string' || !data.message.trim() || data.message.trim().length > 4000) {
    throw new AppError('message is required and must be at most 4000 characters.', 400, 'VALIDATION_ERROR');
  }
  const deliveryDate = optionalText(data.preferred_delivery_date, 'preferred_delivery_date', 10);
  if (deliveryDate) {
    const parsedDate = DATE_RE.test(deliveryDate) ? new Date(`${deliveryDate}T00:00:00Z`) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== deliveryDate) {
      throw new AppError('preferred_delivery_date must be a valid YYYY-MM-DD date.', 400, 'VALIDATION_ERROR');
    }
  }

  return {
    reference: `ENQ-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    source,
    name: data.name.trim(),
    phone,
    email,
    requested_product: product.trim(),
    quantity: Number(data.quantity).toFixed(3),
    quantity_unit: quantityUnit,
    service_required: optionalText(data.service_required, 'service_required', 120),
    dimensions: optionalText(data.dimensions, 'dimensions', 255),
    preferred_delivery_date: deliveryDate,
    message: data.message.trim(),
  };
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('Valid enquiry ID is required.', 400, 'INVALID_ENQUIRY_ID');
  return id;
}

class EnquiryService {
  async submitPublic(data, source) {
    if (!['quote', 'contact'].includes(source)) throw new AppError('Invalid enquiry source.', 400, 'VALIDATION_ERROR');
    const normalized = validatePublic(data, source);
    const id = await enquiryRepository.createPublic(normalized);
    return { id, reference: normalized.reference };
  }

  async list(filters = {}) {
    const status = filters.status && filters.status !== 'All' ? String(filters.status) : '';
    if (status && !STATUSES.has(status)) throw new AppError('Invalid enquiry status.', 400, 'VALIDATION_ERROR');
    const assignedTo = filters.assigned_to_id ? parseId(filters.assigned_to_id) : '';
    return enquiryRepository.list({
      search: String(filters.search || '').trim().slice(0, 120),
      status,
      assigned_to_id: assignedTo,
    });
  }

  async listAssignees() {
    return enquiryRepository.listAssignees();
  }

  async update(id, data, actorId) {
    const enquiryId = parseId(id);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new AppError('Enquiry updates are required.', 400, 'VALIDATION_ERROR');
    }
    const updates = {};
    if (Object.prototype.hasOwnProperty.call(data, 'status')) {
      if (!STATUSES.has(data.status)) throw new AppError('Invalid enquiry status.', 400, 'VALIDATION_ERROR');
      if (data.status === 'converted') {
        throw new AppError('Use the conversion action to mark an enquiry converted.', 400, 'INVALID_ENQUIRY_TRANSITION');
      }
      updates.status = data.status;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'assigned_to_id')) {
      if (data.assigned_to_id === null || data.assigned_to_id === '') {
        updates.assigned_to_id = null;
      } else {
        updates.assigned_to_id = parseId(data.assigned_to_id);
      }
    }
    if (Object.prototype.hasOwnProperty.call(data, 'internal_notes')) {
      updates.internal_notes = optionalText(data.internal_notes, 'internal_notes', 10000);
    }
    if (!Object.keys(updates).length) throw new AppError('Provide a status, assignment, or internal_notes update.', 400, 'VALIDATION_ERROR');

    await withTransaction(async conn => {
      const existing = await enquiryRepository.lockById(enquiryId, conn);
      if (!existing) throw new AppError('Enquiry not found.', 404, 'ENQUIRY_NOT_FOUND');
      if (existing.status === 'converted' && updates.status && updates.status !== 'converted' && updates.status !== 'closed') {
        throw new AppError('Converted enquiries cannot return to an active qualification status.', 409, 'INVALID_ENQUIRY_TRANSITION');
      }
      if (existing.status === 'closed' && updates.status && updates.status !== 'closed') {
        throw new AppError('Closed enquiries cannot be reopened.', 409, 'INVALID_ENQUIRY_TRANSITION');
      }
      if (updates.assigned_to_id && !(await enquiryRepository.userIsActive(updates.assigned_to_id, conn))) {
        throw new AppError('Assignee must be an active user.', 400, 'INVALID_ASSIGNEE');
      }
      await enquiryRepository.update(enquiryId, updates, conn);
      const nextStatus = updates.status || existing.status;
      const historyEntries = [];
      if (updates.status) {
        historyEntries.push({ action: `status_${updates.status}`, notes: null });
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'assigned_to_id')) {
        historyEntries.push({
          action: 'assignment_updated',
          notes: updates.assigned_to_id === null ? 'Assignment cleared.' : `Assigned to user #${updates.assigned_to_id}.`,
        });
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'internal_notes')) {
        historyEntries.push({ action: 'internal_notes_updated', notes: 'Internal notes updated.' });
      }
      for (const entry of historyEntries) {
        await enquiryRepository.addHistory({
          enquiryId,
          fromStatus: existing.status,
          toStatus: nextStatus,
          ...entry,
          actorId,
        }, conn);
      }
    });
    return enquiryRepository.findById(enquiryId);
  }

  async convert(id, target, actorId) {
    const enquiryId = parseId(id);
    if (!['customer', 'quotation'].includes(target)) {
      throw new AppError('target must be customer or quotation.', 400, 'VALIDATION_ERROR');
    }
    await withTransaction(async conn => {
      const enquiry = await enquiryRepository.lockById(enquiryId, conn);
      if (!enquiry) throw new AppError('Enquiry not found.', 404, 'ENQUIRY_NOT_FOUND');
      if (enquiry.status === 'closed') throw new AppError('Closed enquiries cannot be converted.', 409, 'ENQUIRY_CLOSED');
      if (!['qualified', 'converted'].includes(enquiry.status)) {
        throw new AppError('Mark the enquiry qualified before converting it.', 409, 'ENQUIRY_NOT_QUALIFIED');
      }

      let customerId = enquiry.customer_id;
      if (!customerId) {
        const match = await enquiryRepository.findExistingCustomer(enquiry, conn);
        if (match.ambiguous) {
          throw new AppError('Contact details match multiple customers; resolve the duplicate records before conversion.', 409, 'AMBIGUOUS_CUSTOMER_MATCH');
        }
        if (match.customer) {
          customerId = match.customer.id;
        } else {
          if (!enquiry.phone) {
            throw new AppError('A phone number is required before this enquiry can become a customer.', 409, 'CUSTOMER_PHONE_REQUIRED');
          }
          customerId = await enquiryRepository.createCustomer(enquiry, conn);
        }
      }

      await enquiryRepository.setConvertedCustomer(enquiryId, customerId, conn);
      if (target === 'quotation' && !(await enquiryRepository.findQuotationByEnquiry(enquiryId, conn))) {
        const quotationNumber = `QUO-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        await enquiryRepository.createQuotation(enquiry, customerId, quotationNumber, actorId, conn);
      }

      const quotation = await enquiryRepository.findQuotationByEnquiry(enquiryId, conn);
      await enquiryRepository.addHistory({
        enquiryId,
        fromStatus: enquiry.status,
        toStatus: 'converted',
        action: target === 'quotation' ? 'converted_to_quotation' : 'converted_to_customer',
        actorId,
        notes: target === 'quotation' ? `Linked quotation ${quotation?.quotation_number || 'draft'}.` : `Linked customer #${customerId}.`,
      }, conn);
    });
    return enquiryRepository.findById(enquiryId);
  }
}

module.exports = new EnquiryService();
