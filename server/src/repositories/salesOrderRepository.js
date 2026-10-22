'use strict';
/**
 * repositories/salesOrderRepository.js
 *
 * Data access layer for Wholesale Timber Sales Orders, Line Items, and Status History.
 */
const { query } = require('../config/db');

class SalesOrderRepository {
  /**
   * Generate next sequential order number (e.g. SO-2026-0001).
   */
  async generateOrderNumber(conn = null) {
    const year = new Date().getFullYear();
    const prefix = `SO-${year}-`;
    const sql = `SELECT order_number FROM sales_orders WHERE order_number LIKE ? ORDER BY id DESC LIMIT 1`;
    const [rows] = conn ? await conn.execute(sql, [`${prefix}%`]) : await query(sql, [`${prefix}%`]);

    let seq = 1;
    if (rows && rows.length > 0 && rows[0].order_number) {
      const match = rows[0].order_number.match(/(\d+)$/);
      if (match) {
        seq = parseInt(match[1], 10) + 1;
      }
    }
    return `${prefix}${seq.toString().padStart(4, '0')}`;
  }

  /**
   * Create sales order, items, and initial history record within a transaction.
   */
  async createSalesOrder(orderData, items = [], historyEntry = null, conn) {
    const orderSql = `
      INSERT INTO sales_orders (
        order_number, customer_id, status, payment_status, order_date,
        delivery_date, subtotal, discount_amount, tax_rate, tax_amount,
        shipping_charges, total_amount, cancellation_reason, notes, created_by_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const orderParams = [
      orderData.order_number,
      orderData.customer_id,
      orderData.status || 'draft',
      orderData.payment_status || 'unpaid',
      orderData.order_date,
      orderData.delivery_date || null,
      Number(orderData.subtotal || 0).toFixed(2),
      Number(orderData.discount_amount || 0).toFixed(2),
      Number(orderData.tax_rate || 0).toFixed(2),
      Number(orderData.tax_amount || 0).toFixed(2),
      Number(orderData.shipping_charges || 0).toFixed(2),
      Number(orderData.total_amount || 0).toFixed(2),
      orderData.cancellation_reason || null,
      orderData.notes || null,
      orderData.created_by_id || null
    ];

    const [orderResult] = await conn.execute(orderSql, orderParams);
    const orderId = orderResult.insertId;

    // Insert items
    if (items.length > 0) {
      const itemSql = `
        INSERT INTO sales_order_items (
          sales_order_id, batch_id, product_name, species, dimensions_text,
          quantity, unit, unit_price, discount_percent, discount_amount,
          tax_percent, tax_amount, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const item of items) {
        await conn.execute(itemSql, [
          orderId,
          item.batch_id || null,
          item.product_name,
          item.species,
          item.dimensions_text || null,
          Number(item.quantity || 1).toFixed(3),
          item.unit || 'CFT',
          Number(item.unit_price || 0).toFixed(2),
          Number(item.discount_percent || 0).toFixed(2),
          Number(item.discount_amount || 0).toFixed(2),
          Number(item.tax_percent || 0).toFixed(2),
          Number(item.tax_amount || 0).toFixed(2),
          Number(item.line_total || 0).toFixed(2)
        ]);
      }
    }

    // Insert initial status history
    if (historyEntry) {
      await this.recordHistory({
        sales_order_id: orderId,
        from_status: null,
        to_status: orderData.status || 'draft',
        action: historyEntry.action || 'order_created',
        changed_by_id: orderData.created_by_id || null,
        reason: historyEntry.reason || 'Initial order creation',
        notes: historyEntry.notes || null
      }, conn);
    }

    return orderId;
  }

  /**
   * Record a status or update event in sales_order_history.
   */
  async recordHistory(historyData, conn) {
    const sql = `
      INSERT INTO sales_order_history (
        sales_order_id, from_status, to_status, action, changed_by_id, reason, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      historyData.sales_order_id,
      historyData.from_status || null,
      historyData.to_status,
      historyData.action,
      historyData.changed_by_id || null,
      historyData.reason || null,
      historyData.notes || null
    ];
    return await conn.execute(sql, params);
  }

  /**
   * List sales orders with search, filtering, and pagination.
   */
  async getSalesOrders({
    search = '',
    status = '',
    payment_status = '',
    customer_id = null,
    limit = 50,
    offset = 0
  } = {}) {
    let whereClauses = [];
    let params = [];

    if (search) {
      whereClauses.push('(so.order_number LIKE ? OR c.name LIKE ? OR c.company_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status && status !== 'All') {
      whereClauses.push('so.status = ?');
      params.push(status);
    }

    if (payment_status && payment_status !== 'All') {
      whereClauses.push('so.payment_status = ?');
      params.push(payment_status);
    }

    if (customer_id) {
      whereClauses.push('so.customer_id = ?');
      params.push(customer_id);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*) AS total
      FROM sales_orders so
      JOIN customers c ON so.customer_id = c.id
      ${whereStr}
    `;
    const [countRows] = await query(countSql, params);
    const total = countRows[0]?.total || 0;

    const listSql = `
      SELECT
        so.*,
        c.name AS customer_name,
        c.company_name,
        c.phone AS customer_phone,
        c.email AS customer_email,
        u.username AS created_by_username,
        (SELECT COUNT(*) FROM sales_order_items soi WHERE soi.sales_order_id = so.id) AS items_count,
        (SELECT GROUP_CONCAT(DISTINCT soi.species SEPARATOR ', ') FROM sales_order_items soi WHERE soi.sales_order_id = so.id) AS species_summary
      FROM sales_orders so
      JOIN customers c ON so.customer_id = c.id
      LEFT JOIN users u ON so.created_by_id = u.id
      ${whereStr}
      ORDER BY so.id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await query(listSql, [...params, Number(limit), Number(offset)]);
    return { items: rows, total, limit: Number(limit), offset: Number(offset) };
  }

  /**
   * Fetch single sales order with customer, line items, and audit history.
   */
  async getSalesOrderById(id, conn = null) {
    const orderSql = `
      SELECT
        so.*,
        c.name AS customer_name,
        c.company_name,
        c.phone AS customer_phone,
        c.email AS customer_email,
        c.tax_gst_number AS customer_tax_id,
        c.address AS customer_address,
        u.username AS created_by_username
      FROM sales_orders so
      JOIN customers c ON so.customer_id = c.id
      LEFT JOIN users u ON so.created_by_id = u.id
      WHERE so.id = ? OR so.order_number = ?
      LIMIT 1
    `;
    const [orderRows] = conn ? await conn.execute(orderSql, [id, id]) : await query(orderSql, [id, id]);
    if (!orderRows || orderRows.length === 0) return null;

    const order = orderRows[0];

    // Fetch items with timber batch info
    const itemsSql = `
      SELECT
        soi.*,
        tb.batch_code,
        tb.category AS batch_category,
        tb.quantity_available AS batch_current_available,
        tb.quantity_reserved AS batch_current_reserved,
        tb.ownership AS batch_ownership,
        tb.status AS batch_status
      FROM sales_order_items soi
      LEFT JOIN timber_batches tb ON soi.batch_id = tb.id
      WHERE soi.sales_order_id = ?
      ORDER BY soi.id ASC
    `;
    const [items] = conn ? await conn.execute(itemsSql, [order.id]) : await query(itemsSql, [order.id]);

    // Fetch status history
    const historySql = `
      SELECT
        soh.*,
        u.username AS changed_by_username
      FROM sales_order_history soh
      LEFT JOIN users u ON soh.changed_by_id = u.id
      WHERE soh.sales_order_id = ?
      ORDER BY soh.created_at ASC
    `;
    const [history] = conn ? await conn.execute(historySql, [order.id]) : await query(historySql, [order.id]);

    return {
      ...order,
      items: items || [],
      history: history || []
    };
  }

  /**
   * Row lock sales order FOR UPDATE within transaction.
   */
  async lockSalesOrderForUpdate(id, conn) {
    const sql = `SELECT * FROM sales_orders WHERE id = ? FOR UPDATE`;
    const [rows] = await conn.execute(sql, [id]);
    return rows[0] || null;
  }

  /**
   * Row lock a timber batch FOR UPDATE within transaction.
   */
  async lockTimberBatchForUpdate(batchId, conn) {
    const sql = `SELECT * FROM timber_batches WHERE id = ? FOR UPDATE`;
    const [rows] = await conn.execute(sql, [batchId]);
    return rows[0] || null;
  }

  async lockFifoBatchLayersForUpdate(batchId, conn) {
    const [layers] = await conn.execute(
      `SELECT layer.*
         FROM timber_batches layer
         JOIN timber_batches selected ON selected.id = ?
        WHERE selected.ownership = 'mill'
          AND layer.ownership = 'mill'
          AND layer.timber_type = selected.timber_type
          AND layer.category = selected.category
          AND layer.species = selected.species
          AND layer.grade <=> selected.grade
          AND layer.dimensions_text <=> selected.dimensions_text
          AND layer.unit = selected.unit
          AND layer.name = selected.name
        ORDER BY layer.created_at, layer.id
        FOR UPDATE`,
      [batchId]
    );
    const selectedBatch = layers.find(layer => Number(layer.id) === Number(batchId));
    if (selectedBatch) return { batch: selectedBatch, layers };
    return { batch: await this.lockTimberBatchForUpdate(batchId, conn), layers: [] };
  }

  /**
   * Update timber batch inventory quantities & status.
   */
  async updateBatchStock(batchId, { available, reserved, consumed, total, status }, conn) {
    const sql = `
      UPDATE timber_batches
      SET quantity_available = ?,
          quantity_reserved = ?,
          quantity_consumed = ?,
          quantity_total = ?,
          status = ?
      WHERE id = ?
    `;
    return await conn.execute(sql, [
      Number(available).toFixed(3),
      Number(reserved).toFixed(3),
      Number(consumed).toFixed(3),
      Number(total).toFixed(3),
      status,
      batchId
    ]);
  }

  /**
   * Insert immutable stock movement ledger entry.
   */
  async recordStockMovement(movement, conn) {
    const sql = `
      INSERT INTO stock_movements (
        batch_id, movement_type, quantity, previous_quantity, new_quantity,
        unit, source_transaction_type, source_transaction_id, reason,
        authorized_by_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    return await conn.execute(sql, [
      movement.batch_id,
      movement.movement_type,
      Number(movement.quantity).toFixed(3),
      Number(movement.previous_quantity).toFixed(3),
      Number(movement.new_quantity).toFixed(3),
      movement.unit || 'CFT',
      movement.source_transaction_type || 'sales_order',
      movement.source_transaction_id || null,
      movement.reason,
      movement.authorized_by_id || null,
      movement.notes || null
    ]);
  }

  async setFulfillmentCost(itemId, unitCost, totalCost, conn) {
    await conn.execute(
      `UPDATE sales_order_items
          SET unit_cost_at_fulfillment = ?, total_cost_at_fulfillment = ?
        WHERE id = ?`,
      [unitCost, totalCost, itemId]
    );
  }

  /**
   * Update order status and optional fields.
   */
  async updateOrderStatus(id, status, updates = {}, conn) {
    const fields = ['status = ?'];
    const params = [status];

    if (updates.cancellation_reason !== undefined) {
      fields.push('cancellation_reason = ?');
      params.push(updates.cancellation_reason);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      params.push(updates.notes);
    }
    if (updates.delivery_date !== undefined) {
      fields.push('delivery_date = ?');
      params.push(updates.delivery_date);
    }
    if (updates.payment_status !== undefined) {
      fields.push('payment_status = ?');
      params.push(updates.payment_status);
    }

    params.push(id);
    const sql = `UPDATE sales_orders SET ${fields.join(', ')} WHERE id = ?`;
    return await conn.execute(sql, params);
  }

  /**
   * Update sales order header and line items.
   */
  async updateSalesOrder(id, orderData, items = null, conn) {
    const fields = [];
    const params = [];

    const allowed = [
      'customer_id', 'order_date', 'delivery_date', 'subtotal', 'discount_amount',
      'tax_rate', 'tax_amount', 'shipping_charges', 'total_amount', 'notes'
    ];

    for (const key of allowed) {
      if (orderData[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(orderData[key]);
      }
    }

    if (fields.length > 0) {
      params.push(id);
      const sql = `UPDATE sales_orders SET ${fields.join(', ')} WHERE id = ?`;
      await conn.execute(sql, params);
    }

    if (items && Array.isArray(items)) {
      // Remove existing items and replace with updated ones
      await conn.execute('DELETE FROM sales_order_items WHERE sales_order_id = ?', [id]);

      const itemSql = `
        INSERT INTO sales_order_items (
          sales_order_id, batch_id, product_name, species, dimensions_text,
          quantity, unit, unit_price, discount_percent, discount_amount,
          tax_percent, tax_amount, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const item of items) {
        await conn.execute(itemSql, [
          id,
          item.batch_id || null,
          item.product_name,
          item.species,
          item.dimensions_text || null,
          Number(item.quantity || 1).toFixed(3),
          item.unit || 'CFT',
          Number(item.unit_price || 0).toFixed(2),
          Number(item.discount_percent || 0).toFixed(2),
          Number(item.discount_amount || 0).toFixed(2),
          Number(item.tax_percent || 0).toFixed(2),
          Number(item.tax_amount || 0).toFixed(2),
          Number(item.line_total || 0).toFixed(2)
        ]);
      }
    }
  }

  /**
   * Check if a customer exists and return status.
   */
  async getCustomerById(customerId, conn = null) {
    const sql = `SELECT id, name, company_name, status, credit_limit FROM customers WHERE id = ? LIMIT 1`;
    const [rows] = conn ? await conn.execute(sql, [customerId]) : await query(sql, [customerId]);
    return rows[0] || null;
  }
}

module.exports = new SalesOrderRepository();
