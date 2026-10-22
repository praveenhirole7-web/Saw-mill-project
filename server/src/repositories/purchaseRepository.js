'use strict';
/**
 * repositories/purchaseRepository.js
 *
 * Data access layer for timber procurement, purchase orders, purchase items,
 * and goods receipt processing.
 */
const { query } = require('../config/db');

class PurchaseRepository {
  /**
   * Generate next sequential purchase number (e.g. PO-2026-0001).
   */
  async generatePurchaseNumber(conn = null) {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;
    const sql = `SELECT purchase_number FROM purchases WHERE purchase_number LIKE ? ORDER BY id DESC LIMIT 1`;
    const [rows] = conn ? await conn.execute(sql, [`${prefix}%`]) : await query(sql, [`${prefix}%`]);

    let seq = 1;
    if (rows && rows.length > 0 && rows[0].purchase_number) {
      const match = rows[0].purchase_number.match(/(\d+)$/);
      if (match) {
        seq = parseInt(match[1], 10) + 1;
      }
    }
    return `${prefix}${seq.toString().padStart(4, '0')}`;
  }

  /**
   * Create purchase record and its line items inside a transaction.
   */
  async createPurchase(purchaseData, items, conn) {
    const purchaseSql = `
      INSERT INTO purchases (
        purchase_number, supplier_id, status, payment_status, payment_method,
        expected_delivery_date, actual_delivery_date, subtotal, discount_amount,
        tax_rate, tax_amount, total_cost, paid_amount, invoice_ref, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const purchaseParams = [
      purchaseData.purchase_number,
      purchaseData.supplier_id,
      purchaseData.status || 'draft',
      purchaseData.payment_status || 'pending',
      purchaseData.payment_method || 'Bank Wire Transfer',
      purchaseData.expected_delivery_date || null,
      purchaseData.actual_delivery_date || null,
      Number(purchaseData.subtotal || 0).toFixed(2),
      Number(purchaseData.discount_amount || 0).toFixed(2),
      Number(purchaseData.tax_rate || 0).toFixed(2),
      Number(purchaseData.tax_amount || 0).toFixed(2),
      Number(purchaseData.total_cost || 0).toFixed(2),
      Number(purchaseData.paid_amount || 0).toFixed(2),
      purchaseData.invoice_ref || null,
      purchaseData.notes || null,
    ];

    const [pResult] = await conn.execute(purchaseSql, purchaseParams);
    const purchaseId = pResult.insertId;

    // Insert purchase line items
    const itemSql = `
      INSERT INTO purchase_items (
        purchase_id, timber_type, species, wood_type_id, grade, dimensions_text,
        length_feet, width_inches, thickness_inches, girth_inches,
        pieces_count, volume_cbf, unit, unit_price, total_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const item of items) {
      await conn.execute(itemSql, [
        purchaseId,
        item.timber_type || 'raw_log',
        item.species.trim(),
        item.wood_type_id || null,
        item.grade || 'Select & Better',
        item.dimensions_text || null,
        Number(item.length_feet || 0),
        Number(item.width_inches || 0),
        Number(item.thickness_inches || 0),
        Number(item.girth_inches || 0),
        Math.max(1, parseInt(item.pieces_count, 10) || 1),
        Number(item.volume_cbf || 0),
        item.unit || 'CFT',
        Number(item.unit_price || 0).toFixed(2),
        Number(item.total_price || 0).toFixed(2),
      ]);
    }

    return purchaseId;
  }

  /**
   * List purchase orders with search, filters, and supplier details.
   */
  async listPurchases({ search = '', status = null, paymentStatus = null, page = 1, limit = 50 } = {}) {
    const conditions = ['1=1'];
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      conditions.push('(LOWER(p.purchase_number) LIKE ? OR LOWER(s.company_name) LIKE ? OR LOWER(COALESCE(p.invoice_ref, "")) LIKE ?)');
      params.push(term, term, term);
    }

    if (status && status !== 'All') {
      conditions.push('p.status = ?');
      params.push(status);
    }

    if (paymentStatus && paymentStatus !== 'All') {
      conditions.push('p.payment_status = ?');
      params.push(paymentStatus);
    }

    const whereClause = conditions.join(' AND ');

    // 1. Total count
    const [countRows] = await query(
      `SELECT COUNT(*) AS total
       FROM   purchases p
       JOIN   suppliers s ON p.supplier_id = s.id
       WHERE  ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // 2. Fetch paginated records
    const offset = Math.max(0, (page - 1) * limit);
    const queryParams = [...params, Number(limit), Number(offset)];

    const [rows] = await query(
      `SELECT p.*,
              s.company_name AS supplier_name,
              s.rep_name AS supplier_contact,
              s.phone AS supplier_phone,
              s.email AS supplier_email,
              COALESCE((SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id), 0) AS items_count,
              COALESCE((SELECT SUM(pi.volume_cbf) FROM purchase_items pi WHERE pi.purchase_id = p.id), 0) AS total_volume_cbf,
              COALESCE((SELECT SUM(pi.pieces_count) FROM purchase_items pi WHERE pi.purchase_id = p.id), 0) AS total_pieces_count
       FROM   purchases p
       JOIN   suppliers s ON p.supplier_id = s.id
       WHERE  ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      queryParams
    );

    return { items: rows, total, page: Number(page), limit: Number(limit) };
  }

  /**
   * Find single purchase by ID with supplier and items.
   */
  async findById(id, conn = null) {
    const sql = `
      SELECT p.*,
             s.company_name AS supplier_name,
             s.rep_name AS supplier_contact,
             s.phone AS supplier_phone,
             s.email AS supplier_email,
             u.username AS received_by_username
      FROM   purchases p
      JOIN   suppliers s ON p.supplier_id = s.id
      LEFT JOIN users u ON p.received_by_id = u.id
      WHERE  p.id = ?
    `;
    const [rows] = conn ? await conn.execute(sql, [id]) : await query(sql, [id]);
    if (!rows || rows.length === 0) return null;

    const purchase = rows[0];

    // Fetch items
    const [items] = conn
      ? await conn.execute('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id ASC', [id])
      : await query('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id ASC', [id]);

    return {
      ...purchase,
      items,
    };
  }

  /**
   * Find purchase row locked FOR UPDATE inside a transaction.
   */
  async findByIdForUpdate(id, conn) {
    const [rows] = await conn.execute(
      'SELECT * FROM purchases WHERE id = ? FOR UPDATE',
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Fetch purchase line items inside a transaction.
   */
  async getPurchaseItems(purchaseId, conn) {
    const [rows] = await conn.execute(
      'SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id ASC',
      [purchaseId]
    );
    return rows;
  }

  /**
   * Mark purchase as received.
   */
  async markPurchaseReceived(id, { actualDeliveryDate, receivedById }, conn) {
    const sql = `
      UPDATE purchases SET
        status = 'received',
        actual_delivery_date = COALESCE(?, CURRENT_DATE),
        received_by_id = ?
      WHERE id = ?
    `;
    const [result] = await conn.execute(sql, [
      actualDeliveryDate || null,
      receivedById || null,
      id,
    ]);
    return result.affectedRows > 0;
  }

  /**
   * Update purchase item with generated batch ID and received_at timestamp.
   */
  async updatePurchaseItemBatch(itemId, generatedBatchId, conn) {
    const sql = `
      UPDATE purchase_items SET
        generated_batch_id = ?,
        received_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    const [result] = await conn.execute(sql, [generatedBatchId, itemId]);
    return result.affectedRows > 0;
  }

  /**
   * Insert traceable timber batch into timber_batches table.
   */
  async createTimberBatch(batchData, conn) {
    const sql = `
      INSERT INTO timber_batches (
        batch_code, name, timber_type, category, species, wood_type_id, grade,
        dimensions_text, length_feet, width_inches, thickness_inches, girth_inches,
        unit, pieces_count, calculated_volume_cbf, calculated_board_feet,
        quantity_total, quantity_available, quantity_reserved, quantity_consumed,
        ownership, status, yard_location, cost_price, selling_price, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'mill', 'In Stock', ?, ?, ?, ?)
    `;

    const params = [
      batchData.batch_code,
      batchData.name,
      batchData.timber_type,
      batchData.category,
      batchData.species,
      batchData.wood_type_id || null,
      batchData.grade || 'Select & Better',
      batchData.dimensions_text || null,
      Number(batchData.length_feet || 0),
      Number(batchData.width_inches || 0),
      Number(batchData.thickness_inches || 0),
      Number(batchData.girth_inches || 0),
      batchData.unit || 'CFT',
      Number(batchData.pieces_count || 1),
      Number(batchData.calculated_volume_cbf || 0),
      Number(batchData.calculated_board_feet || 0),
      Number(batchData.quantity_total || 0),
      Number(batchData.quantity_available || 0),
      batchData.yard_location || 'Receiving Yard Bay A',
      Number(batchData.cost_price || 0),
      Number(batchData.selling_price || 0),
      batchData.notes || null,
    ];

    const [result] = await conn.execute(sql, params);
    return result.insertId;
  }

  /**
   * Record stock movement into immutable stock_movements ledger.
   */
  async recordStockMovement(movementData, conn) {
    const sql = `
      INSERT INTO stock_movements (
        batch_id, movement_type, quantity, previous_quantity, new_quantity,
        unit, source_transaction_type, source_transaction_id, reason,
        authorized_by_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      movementData.batch_id,
      movementData.movement_type || 'receipt',
      Number(movementData.quantity || 0),
      Number(movementData.previous_quantity || 0),
      Number(movementData.new_quantity || 0),
      movementData.unit || 'CFT',
      movementData.source_transaction_type || 'purchase',
      movementData.source_transaction_id || null,
      movementData.reason || 'Goods receipt for purchase order',
      movementData.authorized_by_id || null,
      movementData.notes || null,
    ];

    const [result] = await conn.execute(sql, params);
    return result.insertId;
  }
}

module.exports = new PurchaseRepository();
