'use strict';

const { query } = require('../config/db');

class DeliveryRepository {
  async list({ status = '', search = '' } = {}) {
    const conditions = [];
    const params = [];
    if (status) {
      conditions.push('d.status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(d.delivery_number LIKE ? OR so.order_number LIKE ? OR c.name LIKE ? OR d.vehicle_info LIKE ? OR d.driver_name LIKE ?)');
      params.push(...Array(5).fill(`%${search}%`));
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await query(
      `SELECT d.*, so.order_number, so.status AS order_status, so.customer_id,
              c.name AS customer_name, c.company_name, c.address AS destination,
              (SELECT GROUP_CONCAT(DISTINCT soi.product_name ORDER BY soi.id SEPARATOR ', ')
                 FROM sales_order_items soi WHERE soi.sales_order_id = so.id) AS cargo_description
         FROM deliveries d
         JOIN sales_orders so ON so.id = d.sales_order_id
         JOIN customers c ON c.id = so.customer_id
         ${where}
        ORDER BY d.planned_delivery_date DESC, d.id DESC`,
      params
    );
    for (const delivery of rows) delivery.history = await this.history(delivery.id);
    return rows;
  }

  async eligibleOrders() {
    const [rows] = await query(
      `SELECT so.id, so.order_number, so.delivery_date, c.name AS customer_name,
              c.address AS destination,
              (SELECT GROUP_CONCAT(DISTINCT soi.product_name ORDER BY soi.id SEPARATOR ', ')
                 FROM sales_order_items soi WHERE soi.sales_order_id = so.id) AS cargo_description
         FROM sales_orders so
         JOIN customers c ON c.id = so.customer_id
         LEFT JOIN deliveries d ON d.sales_order_id = so.id
        WHERE so.status = 'completed' AND d.id IS NULL
        ORDER BY so.delivery_date, so.id`
    );
    return rows;
  }

  async lockOrder(id, conn) {
    const [rows] = await conn.execute(
      `SELECT so.id, so.order_number, so.status, so.delivery_date,
              c.name AS customer_name, c.address AS destination
         FROM sales_orders so
         JOIN customers c ON c.id = so.customer_id
        WHERE so.id = ?
        FOR UPDATE`,
      [id]
    );
    return rows[0] || null;
  }

  async lockDelivery(id, conn) {
    const [rows] = await conn.execute('SELECT * FROM deliveries WHERE id = ? FOR UPDATE', [id]);
    return rows[0] || null;
  }

  async create(data, conn) {
    const [result] = await conn.execute(
      `INSERT INTO deliveries
        (delivery_number, sales_order_id, planned_delivery_date, vehicle_info,
         driver_name, transport_notes, created_by_id, updated_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.delivery_number, data.sales_order_id, data.planned_delivery_date,
        data.vehicle_info || null, data.driver_name || null, data.transport_notes || null,
        data.actor_id, data.actor_id,
      ]
    );
    return result.insertId;
  }

  async updateSchedule(id, data, actorId, conn) {
    await conn.execute(
      `UPDATE deliveries
          SET planned_delivery_date = ?, vehicle_info = ?, driver_name = ?,
              transport_notes = ?, updated_by_id = ?
        WHERE id = ?`,
      [data.planned_delivery_date, data.vehicle_info || null, data.driver_name || null, data.transport_notes || null, actorId, id]
    );
  }

  async transition(id, status, details, actorId, conn) {
    const fields = ['status = ?', 'updated_by_id = ?'];
    const params = [status, actorId];
    if (details.planned_delivery_date !== undefined) {
      fields.push('planned_delivery_date = ?');
      params.push(details.planned_delivery_date);
    }
    if (details.confirmation_name !== undefined) {
      fields.push('delivery_confirmation_name = ?', 'delivery_confirmation_notes = ?', 'delivered_at = UTC_TIMESTAMP()');
      params.push(details.confirmation_name, details.confirmation_notes || null);
    }
    if (details.failure_reason !== undefined) {
      fields.push('failure_reason = ?');
      params.push(details.failure_reason);
    } else if (status === 'dispatched' || status === 'scheduled') {
      fields.push('failure_reason = NULL');
    }
    params.push(id);
    await conn.execute(`UPDATE deliveries SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  async addHistory({ deliveryId, fromStatus, toStatus, action, actorId, notes }, conn) {
    await conn.execute(
      `INSERT INTO delivery_history
        (delivery_id, from_status, to_status, action, changed_by_id, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [deliveryId, fromStatus || null, toStatus, action, actorId, notes || null]
    );
  }

  async history(id, conn = null) {
    const executor = conn || { execute: query };
    const [rows] = await executor.execute(
      `SELECT h.*, u.username AS changed_by_username
         FROM delivery_history h
         LEFT JOIN users u ON u.id = h.changed_by_id
        WHERE h.delivery_id = ?
        ORDER BY h.id`,
      [id]
    );
    return rows;
  }

  async findById(id, conn = null) {
    const executor = conn || { execute: query };
    const [rows] = await executor.execute(
      `SELECT d.*, so.order_number, so.status AS order_status, so.customer_id,
              c.name AS customer_name, c.company_name, c.address AS destination,
              (SELECT GROUP_CONCAT(DISTINCT soi.product_name ORDER BY soi.id SEPARATOR ', ')
                 FROM sales_order_items soi WHERE soi.sales_order_id = so.id) AS cargo_description
         FROM deliveries d
         JOIN sales_orders so ON so.id = d.sales_order_id
         JOIN customers c ON c.id = so.customer_id
        WHERE d.id = ?`,
      [id]
    );
    if (!rows[0]) return null;
    rows[0].history = await this.history(id, conn);
    return rows[0];
  }
}

module.exports = new DeliveryRepository();
