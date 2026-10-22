'use strict';
/**
 * repositories/invoiceRepository.js
 *
 * Data-access layer for Invoices, Invoice Items, and Customer Payments.
 *
 * FINANCIAL RULES:
 *  - Monetary values are persisted in DECIMAL columns and rounded to the
 *    database's two-decimal currency precision before writes.
 *  - tax_rate is stored as a fraction (0.18 = 18 %). Expose as percentage in the API.
 *  - amount_due is a maintained field = grand_total - SUM(payment ledger entries).
 *  - payment_status transitions: unpaid → partially_paid → paid (or voided).
 *  - Reversal entries offset the original amount while both records remain auditable.
 */

const { query } = require('../config/db');

class InvoiceRepository {
  // ── Number generation ────────────────────────────────────────────────────────

  async generateInvoiceNumber(conn = null) {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    return this._nextDocumentNumber('invoice', prefix, 'invoices', 'invoice_number', conn);
  }

  async generatePaymentNumber(conn = null) {
    const year = new Date().getFullYear();
    const prefix = `PAY-${year}-`;
    return this._nextDocumentNumber('payment', prefix, 'customer_payments', 'payment_number', conn);
  }

  async _nextDocumentNumber(kind, prefix, table, numberColumn, conn) {
    if (!conn) {
      throw new Error('Document numbers must be allocated inside a database transaction.');
    }
    const sequenceName = `${kind}:${new Date().getFullYear()}`;
    await conn.execute(
      `INSERT INTO billing_sequences (sequence_name, last_value)
       SELECT ?, COALESCE(MAX(CAST(SUBSTRING_INDEX(${numberColumn}, '-', -1) AS UNSIGNED)), 0) + 1
         FROM ${table}
        WHERE ${numberColumn} LIKE ?
       ON DUPLICATE KEY UPDATE last_value = last_value + 1`,
      [sequenceName, `${prefix}%`]
    );
    const [[sequence]] = await conn.execute(
      `SELECT last_value FROM billing_sequences WHERE sequence_name = ?`,
      [sequenceName]
    );
    return `${prefix}${String(sequence.last_value).padStart(4, '0')}`;
  }

  // ── Invoice CRUD ─────────────────────────────────────────────────────────────

  async createInvoice(inv, items, conn) {
    const sql = `
      INSERT INTO invoices (
        invoice_number, sales_order_id, cutting_job_id, customer_id,
        subtotal, discount_amount, taxable_value, tax_rate, tax_amount,
        additional_charges, cutting_charge, grand_total, amount_paid, amount_due,
        payment_status, issue_date, due_date, currency, language_code, payment_terms,
        notes, created_by_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?)
    `;
    const params = [
      inv.invoice_number,
      inv.sales_order_id || null,
      inv.cutting_job_id || null,
      inv.customer_id,
      d2(inv.subtotal),
      d2(inv.discount_amount),
      d2(inv.taxable_value),
      d4(inv.tax_rate),          // fractional, e.g. 0.1800
      d2(inv.tax_amount),
      d2(inv.additional_charges),
      d2(inv.cutting_charge),
      d2(inv.grand_total),
      d2(inv.grand_total),       // amount_due starts = grand_total
      inv.payment_status || 'unpaid',
      inv.issue_date,
      inv.due_date,
      inv.currency || 'INR',
      inv.language_code || 'en',
      inv.payment_terms || 'Net 30',
      inv.notes || null,
      inv.created_by_id || null
    ];
    const [result] = await conn.execute(sql, params);
    const invoiceId = result.insertId;

    if (items && items.length > 0) {
      await this._insertItems(invoiceId, items, conn);
    }
    return invoiceId;
  }

  async findPaymentByIdempotencyKey(key, conn) {
    const [[payment]] = await conn.execute(
      `SELECT * FROM customer_payments WHERE idempotency_key = ? LIMIT 1`,
      [key]
    );
    return payment || null;
  }

  async findPaymentByReference(invoiceId, reference, conn) {
    const [[payment]] = await conn.execute(
      `SELECT id, payment_number FROM customer_payments
        WHERE invoice_id = ? AND transaction_reference = ?
        LIMIT 1`,
      [invoiceId, reference]
    );
    return payment || null;
  }

  async _insertItems(invoiceId, items, conn) {
    const sql = `
      INSERT INTO invoice_items (
        invoice_id, wood_type_id, description, localized_description, dimensions_text, quantity, unit,
        unit_price, discount_percent, discount_amount,
        tax_percent, tax_amount, line_total, sort_order
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await conn.execute(sql, [
        invoiceId,
        it.wood_type_id || null,
        it.description,
        it.localized_description || null,
        it.dimensions_text || null,
        d3(it.quantity),
        it.unit || 'CFT',
        d2(it.unit_price),
        d4(it.discount_percent || 0),
        d2(it.discount_amount || 0),
        d4(it.tax_percent || 0),
        d2(it.tax_amount || 0),
        d2(it.line_total),
        i
      ]);
    }
  }

  // ── List & fetch ─────────────────────────────────────────────────────────────

  async listInvoices({ search = '', status = '', customer_id = null, limit = 50, offset = 0 } = {}) {
    const where = [];
    const params = [];

    if (search) {
      where.push('(inv.invoice_number LIKE ? OR c.name LIKE ? OR c.company_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status && status !== 'All') {
      where.push('inv.payment_status = ?');
      params.push(status);
    }
    if (customer_id) {
      where.push('inv.customer_id = ?');
      params.push(customer_id);
    }

    const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await query(
      `SELECT COUNT(*) AS total FROM invoices inv JOIN customers c ON inv.customer_id = c.id ${whereStr}`,
      params
    );

    const [rows] = await query(
      `SELECT inv.*, c.name AS customer_name, c.company_name, c.phone AS customer_phone,
              c.email AS customer_email, c.address AS customer_address,
              c.tax_gst_number AS customer_tax_id,
              u.username AS created_by_username,
              so.order_number AS sales_order_number,
              cj.job_number AS cutting_job_number
         FROM invoices inv
         JOIN customers c ON inv.customer_id = c.id
         LEFT JOIN users u ON inv.created_by_id = u.id
         LEFT JOIN sales_orders so ON inv.sales_order_id = so.id
         LEFT JOIN cutting_jobs cj ON inv.cutting_job_id = cj.id
       ${whereStr}
       ORDER BY inv.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    return { items: rows, total: Number(total), limit: Number(limit), offset: Number(offset) };
  }

  async getInvoiceById(id, conn = null) {
    const exec = (sql, p) => conn ? conn.execute(sql, p) : query(sql, p);

    const [[inv]] = await exec(
      `SELECT inv.*, c.name AS customer_name, c.company_name,
              c.phone AS customer_phone, c.email AS customer_email,
              c.address AS customer_address, c.city AS customer_city,
              c.tax_gst_number AS customer_tax_id,
              u.username AS created_by_username,
              so.order_number AS sales_order_number,
              cj.job_number AS cutting_job_number
         FROM invoices inv
         JOIN customers c ON inv.customer_id = c.id
         LEFT JOIN users u ON inv.created_by_id = u.id
         LEFT JOIN sales_orders so ON inv.sales_order_id = so.id
         LEFT JOIN cutting_jobs cj ON inv.cutting_job_id = cj.id
        WHERE inv.id = ? OR inv.invoice_number = ?
        LIMIT 1`,
      [id, id]
    );
    if (!inv) return null;

    const [items] = await exec(
      `SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC`,
      [inv.id]
    );

    const [payments] = await exec(
      `SELECT cp.*, u.username AS recorded_by_username
         FROM customer_payments cp
         LEFT JOIN users u ON cp.recorded_by_id = u.id
        WHERE cp.invoice_id = ?
        ORDER BY cp.created_at ASC`,
      [inv.id]
    );

    return { ...inv, items: items || [], payments: payments || [] };
  }

  async lockInvoiceForUpdate(id, conn) {
    const [[row]] = await conn.execute(
      `SELECT * FROM invoices WHERE id = ? FOR UPDATE`, [id]
    );
    return row || null;
  }

  // ── Balance maintenance ──────────────────────────────────────────────────────

  /**
   * Recalculate amount_paid from the payments ledger and update amount_due
   * and payment_status atomically inside the caller's transaction.
   */
  async refreshInvoiceBalance(invoiceId, grandTotal, conn) {
    const [[{ paid }]] = await conn.execute(
      `SELECT COALESCE(SUM(amount), 0) AS paid
         FROM customer_payments
        WHERE invoice_id = ?`,
      [invoiceId]
    );
    const amountPaid = Number(paid);
    if (amountPaid < 0 || amountPaid > Number(grandTotal)) {
      throw new Error(`Payment ledger for invoice ${invoiceId} is outside its valid balance range.`);
    }
    const amountDue = Number(grandTotal) - amountPaid;

    let paymentStatus = 'unpaid';
    if (amountPaid <= 0) paymentStatus = 'unpaid';
    else if (amountDue <= 0) paymentStatus = 'paid';
    else paymentStatus = 'partially_paid';

    await conn.execute(
      `UPDATE invoices
          SET amount_paid = ?, amount_due = ?, payment_status = ?
        WHERE id = ?`,
      [d2(amountPaid), d2(amountDue), paymentStatus, invoiceId]
    );
    return { amountPaid, amountDue, paymentStatus };
  }

  // ── Payments ─────────────────────────────────────────────────────────────────

  async createPayment(pay, conn) {
    const sql = `
      INSERT INTO customer_payments (
        payment_number, invoice_id, customer_id,
        amount, payment_method, payment_date,
        transaction_reference, idempotency_key, notes, status, recorded_by_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `;
    const [result] = await conn.execute(sql, [
      pay.payment_number,
      pay.invoice_id,
      pay.customer_id,
      d2(pay.amount),
      pay.payment_method,
      pay.payment_date,
      pay.transaction_reference || null,
      pay.idempotency_key || null,
      pay.notes || null,
      'posted',
      pay.recorded_by_id || null
    ]);
    return result.insertId;
  }

  async setPaymentBalanceAfter(paymentId, amountDue, conn) {
    await conn.execute(
      `UPDATE customer_payments SET balance_after = ? WHERE id = ?`,
      [d2(amountDue), paymentId]
    );
  }

  async lockPaymentForUpdate(id, conn) {
    const [[row]] = await conn.execute(
      `SELECT * FROM customer_payments WHERE id = ? FOR UPDATE`, [id]
    );
    return row || null;
  }

  async reversePayment(paymentId, { reversalReason, reversedByPaymentId, reversedByUserId }, conn) {
    await conn.execute(
      `UPDATE customer_payments
          SET status = 'reversed',
              reversal_reason = ?,
              reversed_by_payment_id = ?,
              reversed_at = NOW()
        WHERE id = ?`,
      [reversalReason, reversedByPaymentId || null, paymentId]
    );
  }

  async listPayments({ search = '', invoice_id = null, customer_id = null, limit = 50, offset = 0 } = {}) {
    const where = [];
    const params = [];

    if (search) {
      where.push('(cp.payment_number LIKE ? OR cp.transaction_reference LIKE ? OR c.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (invoice_id) { where.push('cp.invoice_id = ?'); params.push(invoice_id); }
    if (customer_id) { where.push('cp.customer_id = ?'); params.push(customer_id); }

    const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await query(
      `SELECT COUNT(*) AS total FROM customer_payments cp
         JOIN customers c ON cp.customer_id = c.id ${whereStr}`, params
    );

    const [rows] = await query(
      `SELECT cp.*, c.name AS customer_name, inv.invoice_number, inv.currency,
              u.username AS recorded_by_username
         FROM customer_payments cp
         JOIN customers c ON cp.customer_id = c.id
         JOIN invoices inv ON cp.invoice_id = inv.id
         LEFT JOIN users u ON cp.recorded_by_id = u.id
       ${whereStr}
       ORDER BY cp.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    return { items: rows, total: Number(total), limit: Number(limit), offset: Number(offset) };
  }
}

// ── Precision helpers ─────────────────────────────────────────────────────────
function d2(v) { return Number(Number(v || 0).toFixed(2)); }
function d3(v) { return Number(Number(v || 0).toFixed(3)); }
function d4(v) { return Number(Number(v || 0).toFixed(4)); }

module.exports = new InvoiceRepository();
