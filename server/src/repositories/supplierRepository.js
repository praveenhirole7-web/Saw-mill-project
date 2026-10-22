'use strict';
/**
 * repositories/supplierRepository.js
 *
 * Data access layer for forestry concessions and log suppliers.
 */
const { query } = require('../config/db');

class SupplierRepository {
  /**
   * List suppliers with search, status filtering, and pagination.
   */
  async listSuppliers({ search = '', status = null, page = 1, limit = 50 } = {}) {
    const conditions = ['1=1'];
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      conditions.push('(LOWER(s.company_name) LIKE ? OR LOWER(COALESCE(s.rep_name, "")) LIKE ? OR LOWER(COALESCE(s.specialty, "")) LIKE ? OR LOWER(s.phone) LIKE ? OR LOWER(COALESCE(s.email, "")) LIKE ?)');
      params.push(term, term, term, term, term);
    }

    if (status && status !== 'All') {
      conditions.push('s.status = ?');
      params.push(status);
    }

    const whereClause = conditions.join(' AND ');

    // 1. Total count
    const [countRows] = await query(
      `SELECT COUNT(*) AS total FROM suppliers s WHERE ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // 2. Fetch paginated records with aggregated purchase history metrics
    const offset = Math.max(0, (page - 1) * limit);
    const queryParams = [...params, Number(limit), Number(offset)];

    const [rows] = await query(
      `SELECT s.*,
              COALESCE((SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id), 0) AS purchases_count,
              COALESCE((SELECT SUM(p.total_cost) FROM purchases p WHERE p.supplier_id = s.id), 0) AS total_purchased,
              COALESCE((SELECT SUM(p.paid_amount) FROM purchases p WHERE p.supplier_id = s.id), 0) AS total_paid,
              (
                COALESCE((SELECT SUM(p.total_cost) FROM purchases p WHERE p.supplier_id = s.id), 0) -
                COALESCE((SELECT SUM(p.paid_amount) FROM purchases p WHERE p.supplier_id = s.id), 0)
              ) AS balance_due
       FROM   suppliers s
       WHERE  ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
      queryParams
    );

    return { items: rows, total, page: Number(page), limit: Number(limit) };
  }

  /**
   * Find single supplier by ID with aggregated financial and purchase statistics.
   */
  async findById(id) {
    const [rows] = await query(
      `SELECT s.*,
              COALESCE((SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id), 0) AS purchases_count,
              COALESCE((SELECT SUM(p.total_cost) FROM purchases p WHERE p.supplier_id = s.id), 0) AS total_purchased,
              COALESCE((SELECT SUM(p.paid_amount) FROM purchases p WHERE p.supplier_id = s.id), 0) AS total_paid,
              (
                COALESCE((SELECT SUM(p.total_cost) FROM purchases p WHERE p.supplier_id = s.id), 0) -
                COALESCE((SELECT SUM(p.paid_amount) FROM purchases p WHERE p.supplier_id = s.id), 0)
              ) AS balance_due
       FROM   suppliers s
       WHERE  s.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * View purchase history for a specific supplier.
   */
  async getPurchaseHistory(supplierId) {
    const [rows] = await query(
      `SELECT p.id,
              p.purchase_number,
              p.status,
              p.payment_status,
              p.payment_method,
              p.expected_delivery_date,
              p.actual_delivery_date,
              p.subtotal,
              p.discount_amount,
              p.tax_amount,
              p.total_cost,
              p.paid_amount,
              p.invoice_ref,
              p.created_at,
              COALESCE((SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id), 0) AS items_count,
              COALESCE((SELECT SUM(pi.volume_cbf) FROM purchase_items pi WHERE pi.purchase_id = p.id), 0) AS total_volume_cbf
       FROM   purchases p
       WHERE  p.supplier_id = ?
       ORDER BY p.created_at DESC`,
      [supplierId]
    );
    return rows;
  }

  /**
   * Create new supplier.
   */
  async create(data, conn = null) {
    const sql = `
      INSERT INTO suppliers (
        company_name, rep_name, phone, email, region, specialty,
        payment_terms, status, rating, address, tax_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.company_name || data.companyName,
      data.rep_name || data.repName || null,
      (data.phone || '').trim(),
      data.email ? data.email.trim().toLowerCase() : null,
      data.region || 'Pacific Northwest',
      data.specialty || 'Douglas Fir, Western Red Cedar',
      data.payment_terms || data.paymentTerms || 'Net 30 Days',
      data.status || 'Active',
      Number(data.rating ?? 4.5),
      data.address || null,
      data.tax_id || data.taxId || null,
      data.notes || null,
    ];

    const [result] = conn ? await conn.execute(sql, params) : await query(sql, params);
    return result.insertId;
  }

  /**
   * Update existing supplier.
   */
  async update(id, data, conn = null) {
    const sql = `
      UPDATE suppliers SET
        company_name = COALESCE(?, company_name),
        rep_name = COALESCE(?, rep_name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        region = COALESCE(?, region),
        specialty = COALESCE(?, specialty),
        payment_terms = COALESCE(?, payment_terms),
        status = COALESCE(?, status),
        rating = COALESCE(?, rating),
        address = COALESCE(?, address),
        tax_id = COALESCE(?, tax_id),
        notes = COALESCE(?, notes)
      WHERE id = ?
    `;
    const params = [
      data.company_name !== undefined ? data.company_name : data.companyName !== undefined ? data.companyName : null,
      data.rep_name !== undefined ? data.rep_name : data.repName !== undefined ? data.repName : null,
      data.phone ? data.phone.trim() : null,
      data.email ? data.email.trim().toLowerCase() : null,
      data.region !== undefined ? data.region : null,
      data.specialty !== undefined ? data.specialty : null,
      data.payment_terms !== undefined ? data.payment_terms : data.paymentTerms !== undefined ? data.paymentTerms : null,
      data.status !== undefined ? data.status : null,
      data.rating !== undefined ? Number(data.rating) : null,
      data.address !== undefined ? data.address : null,
      data.tax_id !== undefined ? data.tax_id : data.taxId !== undefined ? data.taxId : null,
      data.notes !== undefined ? data.notes : null,
      id,
    ];

    const [result] = conn ? await conn.execute(sql, params) : await query(sql, params);
    return result.affectedRows > 0;
  }

  /**
   * Delete supplier.
   */
  async delete(id, conn = null) {
    const sql = 'DELETE FROM suppliers WHERE id = ?';
    const [result] = conn ? await conn.execute(sql, [id]) : await query(sql, [id]);
    return result.affectedRows > 0;
  }
}

module.exports = new SupplierRepository();
