'use strict';
/**
 * repositories/customerRepository.js
 *
 * Data access layer for customer records, balances, orders, and invoice history.
 */
const { query } = require('../config/db');

class CustomerRepository {
  /**
   * List customers with search, pagination, and dynamic outstanding balance calculation.
   */
  async listCustomers({ search = '', status = null, page = 1, limit = 50 } = {}) {
    const conditions = ['1=1'];
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      conditions.push('(LOWER(c.name) LIKE ? OR LOWER(COALESCE(c.company_name, "")) LIKE ? OR LOWER(COALESCE(c.contact_person, "")) LIKE ? OR LOWER(c.phone) LIKE ? OR LOWER(COALESCE(c.email, "")) LIKE ?)');
      params.push(term, term, term, term, term);
    }

    if (status && status !== 'All') {
      conditions.push('c.status = ?');
      params.push(status);
    }

    const whereClause = conditions.join(' AND ');

    // 1. Total matching count
    const [countRows] = await query(
      `SELECT COUNT(*) AS total FROM customers c WHERE ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // 2. Fetch paginated customer records with correlated subqueries for accurate balance calculation
    const offset = Math.max(0, (page - 1) * limit);
    const queryParams = [...params, Number(limit), Number(offset)];

    const [rows] = await query(
      `SELECT c.*,
              COALESCE((SELECT COUNT(*) FROM sawing_jobs sj WHERE sj.customer_id = c.id), 0) AS orders_count,
              COALESCE((SELECT SUM(i.grand_total) FROM invoices i WHERE i.customer_id = c.id), 0) AS total_invoiced,
              COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id = c.id AND p.type = 'customer_payment'), 0) AS total_paid,
              (
                COALESCE((SELECT SUM(i.grand_total) FROM invoices i WHERE i.customer_id = c.id), 0) -
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id = c.id AND p.type = 'customer_payment'), 0)
              ) AS outstanding_balance
       FROM   customers c
       WHERE  ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      queryParams
    );

    return { items: rows, total, page: Number(page), limit: Number(limit) };
  }

  /**
   * Find single customer by ID with live financial balance.
   */
  async findById(id) {
    const [rows] = await query(
      `SELECT c.*,
              COALESCE((SELECT COUNT(*) FROM sawing_jobs sj WHERE sj.customer_id = c.id), 0) AS orders_count,
              COALESCE((SELECT SUM(i.grand_total) FROM invoices i WHERE i.customer_id = c.id), 0) AS total_invoiced,
              COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id = c.id AND p.type = 'customer_payment'), 0) AS total_paid,
              (
                COALESCE((SELECT SUM(i.grand_total) FROM invoices i WHERE i.customer_id = c.id), 0) -
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id = c.id AND p.type = 'customer_payment'), 0)
              ) AS outstanding_balance
       FROM   customers c
       WHERE  c.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Get customer order history.
   */
  async getOrderHistory(customerId) {
    const [rows] = await query(
      `SELECT sj.id,
              sj.job_number,
              sj.service_type,
              sj.target_specifications,
              sj.status,
              sj.estimated_volume_cbf,
              sj.rate_per_cbf,
              sj.total_amount,
              sj.start_date,
              sj.completion_date,
              sj.created_at
       FROM   sawing_jobs sj
       WHERE  sj.customer_id = ?
       ORDER BY sj.created_at DESC`,
      [customerId]
    );
    return rows;
  }

  /**
   * Get customer invoice history.
   */
  async getInvoiceHistory(customerId) {
    const [rows] = await query(
      `SELECT i.id,
              i.invoice_number,
              i.subtotal,
              i.tax_amount,
              i.discount_amount,
              i.grand_total,
              i.payment_status,
              i.payment_method,
              i.issue_date,
              i.due_date,
              i.created_at
       FROM   invoices i
       WHERE  i.customer_id = ?
       ORDER BY i.issue_date DESC`,
      [customerId]
    );
    return rows;
  }

  /**
   * Create a new customer record.
   */
  async create(data, conn = null) {
    const sql = `
      INSERT INTO customers (
        name, contact_person, company_name, email, phone, type,
        address, city, tax_gst_number, credit_limit, payment_terms,
        status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.name.trim(),
      data.contact_person || data.contactPerson || null,
      data.company_name || data.companyName || null,
      data.email ? data.email.trim().toLowerCase() : null,
      data.phone.trim(),
      data.type || 'Commercial Contractor',
      data.address || null,
      data.city || null,
      data.tax_gst_number || data.taxId || null,
      Number(data.credit_limit ?? data.creditLimit ?? 50000),
      data.payment_terms || data.paymentTerms || 'Net 30',
      data.status || 'Active',
      data.notes || null,
    ];

    const [result] = conn ? await conn.execute(sql, params) : await query(sql, params);
    return result.insertId;
  }

  /**
   * Update an existing customer record.
   */
  async update(id, data, conn = null) {
    const sql = `
      UPDATE customers SET
        name = COALESCE(?, name),
        contact_person = COALESCE(?, contact_person),
        company_name = COALESCE(?, company_name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        type = COALESCE(?, type),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        tax_gst_number = COALESCE(?, tax_gst_number),
        credit_limit = COALESCE(?, credit_limit),
        payment_terms = COALESCE(?, payment_terms),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes)
      WHERE id = ?
    `;
    const params = [
      data.name ? data.name.trim() : null,
      data.contact_person !== undefined ? data.contact_person : data.contactPerson !== undefined ? data.contactPerson : null,
      data.company_name !== undefined ? data.company_name : data.companyName !== undefined ? data.companyName : null,
      data.email ? data.email.trim().toLowerCase() : null,
      data.phone ? data.phone.trim() : null,
      data.type !== undefined ? data.type : null,
      data.address !== undefined ? data.address : null,
      data.city !== undefined ? data.city : null,
      data.tax_gst_number !== undefined ? data.tax_gst_number : data.taxId !== undefined ? data.taxId : null,
      data.credit_limit !== undefined ? Number(data.credit_limit) : data.creditLimit !== undefined ? Number(data.creditLimit) : null,
      data.payment_terms !== undefined ? data.payment_terms : data.paymentTerms !== undefined ? data.paymentTerms : null,
      data.status !== undefined ? data.status : null,
      data.notes !== undefined ? data.notes : null,
      id,
    ];

    const [result] = conn ? await conn.execute(sql, params) : await query(sql, params);
    return result.affectedRows > 0;
  }

  /**
   * Delete customer.
   */
  async delete(id, conn = null) {
    const sql = 'DELETE FROM customers WHERE id = ?';
    const [result] = conn ? await conn.execute(sql, [id]) : await query(sql, [id]);
    return result.affectedRows > 0;
  }
}

module.exports = new CustomerRepository();
