'use strict';

const { query } = require('../config/db');

class EnquiryRepository {
  async listAssignees() {
    const [rows] = await query(
      `SELECT u.id, u.username, r.name AS role
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.status = 'active'
        ORDER BY u.username`
    );
    return rows;
  }

  async createPublic(data) {
    const [result] = await query(
      `INSERT INTO customer_enquiries
        (reference, source, name, phone, email, requested_product, quantity,
         quantity_unit, service_required, dimensions, preferred_delivery_date, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.reference, data.source, data.name, data.phone, data.email,
        data.requested_product, data.quantity, data.quantity_unit, data.service_required,
        data.dimensions, data.preferred_delivery_date, data.message,
      ]
    );
    return result.insertId;
  }

  async list({ search = '', status = '', assigned_to_id = '' } = {}) {
    const conditions = [];
    const params = [];
    if (search) {
      conditions.push('(e.reference LIKE ? OR e.name LIKE ? OR e.phone LIKE ? OR e.email LIKE ? OR e.requested_product LIKE ?)');
      params.push(...Array(5).fill(`%${search}%`));
    }
    if (status) {
      conditions.push('e.status = ?');
      params.push(status);
    }
    if (assigned_to_id) {
      conditions.push('e.assigned_to_id = ?');
      params.push(assigned_to_id);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await query(
      `SELECT e.id, e.reference, e.source, e.name, e.phone, e.email,
              e.requested_product, e.quantity, e.quantity_unit, e.service_required,
              e.dimensions, e.preferred_delivery_date, e.message, e.status,
              e.assigned_to_id, assigned.username AS assigned_to_username,
              e.internal_notes, e.customer_id, e.created_at, e.updated_at,
              q.id AS quotation_id, q.quotation_number
         FROM customer_enquiries e
         LEFT JOIN users assigned ON assigned.id = e.assigned_to_id
         LEFT JOIN enquiry_quotations q ON q.enquiry_id = e.id
         ${where}
        ORDER BY e.created_at DESC, e.id DESC`,
      params
    );
    return rows;
  }

  async lockById(id, conn) {
    const [rows] = await conn.execute('SELECT * FROM customer_enquiries WHERE id = ? FOR UPDATE', [id]);
    return rows[0] || null;
  }

  async findById(id) {
    const [rows] = await query(
      `SELECT e.*, assigned.username AS assigned_to_username,
              c.name AS customer_name, q.id AS quotation_id, q.quotation_number
         FROM customer_enquiries e
         LEFT JOIN users assigned ON assigned.id = e.assigned_to_id
         LEFT JOIN customers c ON c.id = e.customer_id
         LEFT JOIN enquiry_quotations q ON q.enquiry_id = e.id
        WHERE e.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async userIsActive(id, conn) {
    const [rows] = await conn.execute(
      "SELECT id FROM users WHERE id = ? AND status = 'active' LIMIT 1",
      [id]
    );
    return rows.length > 0;
  }

  async update(id, updates, conn) {
    const fields = [];
    const params = [];
    for (const [key, column] of [
      ['status', 'status'],
      ['assigned_to_id', 'assigned_to_id'],
      ['internal_notes', 'internal_notes'],
    ]) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        fields.push(`${column} = ?`);
        params.push(updates[key]);
      }
    }
    if (fields.length) {
      params.push(id);
      await conn.execute(`UPDATE customer_enquiries SET ${fields.join(', ')} WHERE id = ?`, params);
    }
  }

  async findExistingCustomer(enquiry, conn) {
    const conditions = [];
    const params = [];
    if (enquiry.email) {
      conditions.push('LOWER(email) = ?');
      params.push(enquiry.email.toLowerCase());
    }
    if (enquiry.phone) {
      conditions.push('phone = ?');
      params.push(enquiry.phone);
    }
    const [rows] = await conn.execute(
      `SELECT id, name, email, phone FROM customers WHERE ${conditions.join(' OR ')} FOR UPDATE`,
      params
    );
    const matches = new Set(rows.map(row => Number(row.id)));
    if (matches.size > 1) return { ambiguous: true, customer: null };
    return { ambiguous: false, customer: rows[0] || null };
  }

  async createCustomer(enquiry, conn) {
    const [result] = await conn.execute(
      `INSERT INTO customers (name, contact_person, email, phone, type, status, notes)
       VALUES (?, ?, ?, ?, 'Commercial Contractor', 'Active', ?)`,
      [enquiry.name, enquiry.name, enquiry.email, enquiry.phone, `Created from enquiry ${enquiry.reference}`]
    );
    return result.insertId;
  }

  async setConvertedCustomer(enquiryId, customerId, conn) {
    await conn.execute(
      `UPDATE customer_enquiries SET customer_id = ?, status = 'converted' WHERE id = ?`,
      [customerId, enquiryId]
    );
  }

  async createQuotation(enquiry, customerId, quotationNumber, actorId, conn) {
    const [result] = await conn.execute(
      `INSERT INTO enquiry_quotations
        (quotation_number, enquiry_id, customer_id, requested_product,
         quantity, quantity_unit, service_required, dimensions, created_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quotationNumber, enquiry.id, customerId, enquiry.requested_product,
        enquiry.quantity, enquiry.quantity_unit, enquiry.service_required,
        enquiry.dimensions, actorId,
      ]
    );
    return result.insertId;
  }

  async findQuotationByEnquiry(id, conn) {
    const [rows] = await conn.execute('SELECT * FROM enquiry_quotations WHERE enquiry_id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  async addHistory({ enquiryId, fromStatus, toStatus, action, actorId, notes }, conn) {
    await conn.execute(
      `INSERT INTO enquiry_history
        (enquiry_id, from_status, to_status, action, changed_by_id, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [enquiryId, fromStatus || null, toStatus, action, actorId, notes || null]
    );
    await conn.execute(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, description)
       VALUES (?, ?, 'customer_enquiries', ?, ?)`,
      [actorId, action.toUpperCase(), enquiryId, notes || action]
    );
  }
}

module.exports = new EnquiryRepository();
