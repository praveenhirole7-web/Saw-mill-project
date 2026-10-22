'use strict';
/**
 * repositories/inventoryRepository.js
 *
 * Direct database access layer for timber inventory batches and stock movement records.
 * Supports connection pass-through for transaction management and SELECT ... FOR UPDATE locking.
 */
const { query } = require('../config/db');

class InventoryRepository {
  /**
   * List timber batches with flexible filtering, searching, and pagination.
   */
  async listBatches({
    search = '',
    timberType = null,
    category = null,
    species = null,
    status = null,
    ownership = null,
    customerId = null,
    page = 1,
    limit = 50,
  } = {}) {
    const conditions = ['1=1'];
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      conditions.push(`(LOWER(tb.batch_code) LIKE ? OR LOWER(tb.name) LIKE ? OR LOWER(tb.species) LIKE ?
        OR LOWER(tb.yard_location) LIKE ?
        OR EXISTS (SELECT 1 FROM wood_names wn
                   WHERE wn.wood_type_id = tb.wood_type_id AND LOWER(wn.name) LIKE ?)
        OR EXISTS (SELECT 1 FROM wood_types wt
                   WHERE wt.id = tb.wood_type_id AND LOWER(wt.scientific_name) LIKE ?))`);
      params.push(term, term, term, term, term, term);
    }

    if (timberType) {
      conditions.push('tb.timber_type = ?');
      params.push(timberType);
    }

    if (category && category !== 'All') {
      conditions.push('tb.category = ?');
      params.push(category);
    }

    if (species && species !== 'All') {
      conditions.push(`(LOWER(tb.species) = LOWER(?) OR EXISTS (
        SELECT 1 FROM wood_names wn
         WHERE wn.wood_type_id = tb.wood_type_id
           AND LOWER(wn.name) = LOWER(?)
      ) OR EXISTS (
        SELECT 1 FROM wood_types wt
         WHERE wt.id = tb.wood_type_id
           AND LOWER(wt.scientific_name) = LOWER(?)
      ))`);
      params.push(species, species, species);
    }

    if (status && status !== 'All') {
      conditions.push('tb.status = ?');
      params.push(status);
    }

    if (ownership && ownership !== 'All') {
      conditions.push('tb.ownership = ?');
      params.push(ownership);
    }

    if (customerId) {
      conditions.push('tb.customer_id = ?');
      params.push(customerId);
    }

    const whereClause = conditions.join(' AND ');

    // Count total matches
    const [countRows] = await query(
      `SELECT COUNT(*) AS total FROM timber_batches tb WHERE ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // Fetch paginated records with customer company name if customer-owned
    const offset = Math.max(0, (page - 1) * limit);
    const queryParams = [...params, Number(limit), Number(offset)];

    const [rows] = await query(
      `SELECT tb.*,
              COALESCE(tb.image_url, wt.image_url) AS display_image_url,
              c.name AS customer_name,
              c.company_name AS customer_company
       FROM   timber_batches tb
       LEFT JOIN wood_types wt ON wt.id = tb.wood_type_id
       LEFT JOIN customers c ON c.id = tb.customer_id
       WHERE  ${whereClause}
       ORDER BY tb.created_at DESC
       LIMIT ? OFFSET ?`,
      queryParams
    );

    return { items: rows, total, page: Number(page), limit: Number(limit) };
  }

  /**
   * Find single batch by ID.
   */
  async findById(id, conn = null) {
    const sql = `
      SELECT tb.*,
             COALESCE(tb.image_url, wt.image_url) AS display_image_url,
             c.name AS customer_name,
             c.company_name AS customer_company
      FROM   timber_batches tb
      LEFT JOIN wood_types wt ON wt.id = tb.wood_type_id
      LEFT JOIN customers c ON c.id = tb.customer_id
      WHERE  tb.id = ?
    `;
    const [rows] = conn ? await conn.execute(sql, [id]) : await query(sql, [id]);
    return rows[0] || null;
  }

  /**
   * Find single batch by Batch Code / SKU.
   */
  async findByBatchCode(batchCode, conn = null) {
    const sql = 'SELECT * FROM timber_batches WHERE LOWER(batch_code) = LOWER(?)';
    const [rows] = conn ? await conn.execute(sql, [batchCode]) : await query(sql, [batchCode]);
    return rows[0] || null;
  }

  /**
   * Lock row for update inside an active transaction.
   * Prevents concurrent overselling.
   */
  async findByIdForUpdate(id, conn) {
    if (!conn) {
      throw new Error('Transaction connection is required for findByIdForUpdate.');
    }
    const [rows] = await conn.execute(
      'SELECT * FROM timber_batches WHERE id = ? FOR UPDATE',
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Create new timber batch.
   */
  async create(data, conn = null) {
    const sql = `
      INSERT INTO timber_batches (
        batch_code, name, timber_type, category, species, wood_type_id, grade,
        dimensions_text, length_feet, width_inches, thickness_inches, girth_inches,
        unit, pieces_count, calculated_volume_cbf, calculated_board_feet,
        quantity_total, quantity_available, quantity_reserved, quantity_consumed,
        ownership, customer_id, status, yard_location, moisture_percent,
        min_stock_threshold, cost_price, selling_price, image_url, notes
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, 
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `;

    const params = [
      data.batch_code,
      data.name,
      data.timber_type || 'sawn_timber',
      data.category || 'Dimensional Lumber',
      data.species,
      data.wood_type_id || null,
      data.grade || 'Select & Better',
      data.dimensions_text || null,
      data.length_feet || 0,
      data.width_inches || 0,
      data.thickness_inches || 0,
      data.girth_inches || 0,
      data.unit || 'CFT',
      data.pieces_count || 1,
      data.calculated_volume_cbf || 0,
      data.calculated_board_feet || 0,
      data.quantity_total || 0,
      data.quantity_available || 0,
      data.quantity_reserved || 0,
      data.quantity_consumed || 0,
      data.ownership || 'mill',
      data.customer_id || null,
      data.status || 'In Stock',
      data.yard_location || 'Yard Bay A-1',
      data.moisture_percent || 12,
      data.min_stock_threshold || 50,
      data.cost_price || 0,
      data.selling_price || 0,
      data.image_url || null,
      data.notes || null,
    ];

    const [result] = conn ? await conn.execute(sql, params) : await query(sql, params);
    return result.insertId;
  }

  /**
   * Update permitted batch metadata (non-quantity fields).
   */
  async updateMetadata(id, data, conn = null) {
    const sql = `
      UPDATE timber_batches SET
        name = COALESCE(?, name),
        species = COALESCE(?, species),
        wood_type_id = CASE WHEN ? = 1 THEN ? ELSE wood_type_id END,
        category = COALESCE(?, category),
        grade = COALESCE(?, grade),
        dimensions_text = COALESCE(?, dimensions_text),
        length_feet = COALESCE(?, length_feet),
        width_inches = COALESCE(?, width_inches),
        thickness_inches = COALESCE(?, thickness_inches),
        girth_inches = COALESCE(?, girth_inches),
        calculated_volume_cbf = COALESCE(?, calculated_volume_cbf),
        calculated_board_feet = COALESCE(?, calculated_board_feet),
        unit = COALESCE(?, unit),
        yard_location = COALESCE(?, yard_location),
        moisture_percent = COALESCE(?, moisture_percent),
        min_stock_threshold = COALESCE(?, min_stock_threshold),
        cost_price = COALESCE(?, cost_price),
        selling_price = COALESCE(?, selling_price),
        image_url = COALESCE(?, image_url),
        notes = COALESCE(?, notes)
      WHERE id = ?
    `;

    const params = [
      data.name !== undefined ? data.name : null,
      data.species !== undefined ? data.species : null,
      data.wood_type_id !== undefined ? 1 : 0,
      data.wood_type_id !== undefined ? data.wood_type_id : null,
      data.category !== undefined ? data.category : null,
      data.grade !== undefined ? data.grade : null,
      data.dimensions_text !== undefined ? data.dimensions_text : null,
      data.length_feet !== undefined ? data.length_feet : null,
      data.width_inches !== undefined ? data.width_inches : null,
      data.thickness_inches !== undefined ? data.thickness_inches : null,
      data.girth_inches !== undefined ? data.girth_inches : null,
      data.calculated_volume_cbf !== undefined ? data.calculated_volume_cbf : null,
      data.calculated_board_feet !== undefined ? data.calculated_board_feet : null,
      data.unit !== undefined ? data.unit : null,
      data.yard_location !== undefined ? data.yard_location : null,
      data.moisture_percent !== undefined ? data.moisture_percent : null,
      data.min_stock_threshold !== undefined ? data.min_stock_threshold : null,
      data.cost_price !== undefined ? data.cost_price : null,
      data.selling_price !== undefined ? data.selling_price : null,
      data.image_url !== undefined ? data.image_url : null,
      data.notes !== undefined ? data.notes : null,
      id,
    ];

    const [result] = conn ? await conn.execute(sql, params) : await query(sql, params);
    return result.affectedRows > 0;
  }

  /**
   * Update stock quantities and status inside a transaction.
   */
  async updateStock(id, { total, available, reserved, consumed, status }, conn) {
    if (!conn) {
      throw new Error('Transaction connection is required to update stock quantities.');
    }
    const [result] = await conn.execute(
      `UPDATE timber_batches SET
        quantity_total = ?,
        quantity_available = ?,
        quantity_reserved = ?,
        quantity_consumed = ?,
        status = ?
       WHERE id = ?`,
      [total, available, reserved, consumed, status, id]
    );
    return result.affectedRows > 0;
  }

  /**
   * Record a stock movement in the immutable ledger.
   */
  async recordMovement(movement, conn) {
    if (!conn) {
      throw new Error('Transaction connection is required for stock movements.');
    }
    const sql = `
      INSERT INTO stock_movements (
        batch_id, movement_type, quantity, previous_quantity, new_quantity,
        unit, source_transaction_type, source_transaction_id, reason,
        authorized_by_id, allow_negative, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      movement.batch_id,
      movement.movement_type,
      movement.quantity,
      movement.previous_quantity,
      movement.new_quantity,
      movement.unit || 'CFT',
      movement.source_transaction_type,
      movement.source_transaction_id || null,
      movement.reason,
      movement.authorized_by_id || null,
      Boolean(movement.allow_negative),
      movement.notes || null,
    ];

    const [result] = await conn.execute(sql, params);
    return result.insertId;
  }

  /**
   * List historical stock movements for a specific batch.
   */
  async listMovements(batchId) {
    const [rows] = await query(
      `SELECT sm.*,
              u.username AS authorized_by_username
       FROM   stock_movements sm
       LEFT JOIN users u ON u.id = sm.authorized_by_id
       WHERE  sm.batch_id = ?
       ORDER BY sm.created_at DESC`,
      [batchId]
    );
    return rows;
  }

  /**
   * Delete batch record (safe delete).
   */
  async delete(id, conn = null) {
    const sql = 'DELETE FROM timber_batches WHERE id = ?';
    const [result] = conn ? await conn.execute(sql, [id]) : await query(sql, [id]);
    return result.affectedRows > 0;
  }
}

module.exports = new InventoryRepository();
