'use strict';
/**
 * controllers/salesOrderController.js
 *
 * HTTP handler for Wholesale Timber Sales Orders.
 */

const salesOrderService = require('../services/salesOrderService');

class SalesOrderController {
  /**
   * POST /api/v1/sales-orders
   * Create a new sales order (draft or confirmed).
   */
  async createOrder(req, res, next) {
    try {
      const actorId = req.user?.id || null;
      const order = await salesOrderService.createSalesOrder(req.body, actorId);
      return res.status(201).json({
        success: true,
        message: `Sales order ${order.order_number} created successfully.`,
        data: order
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/sales-orders
   * List sales orders with filters and pagination.
   */
  async getOrders(req, res, next) {
    try {
      const { search, status, payment_status, customer_id, limit, offset } = req.query;
      const result = await salesOrderService.getSalesOrders({
        search,
        status,
        payment_status,
        customer_id: customer_id ? Number(customer_id) : null,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0
      });
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/sales-orders/:id
   * Get single order by ID or order_number with line items, batches, and history.
   */
  async getOrderById(req, res, next) {
    try {
      const { id } = req.params;
      const order = await salesOrderService.getSalesOrderById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: `Sales order with ID '${id}' not found.`
        });
      }
      return res.status(200).json({
        success: true,
        data: order
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/sales-orders/:id/confirm
   * Confirm order and reserve timber inventory.
   */
  async confirmOrder(req, res, next) {
    try {
      const { id } = req.params;
      const actorId = req.user?.id || null;
      const order = await salesOrderService.confirmSalesOrder(id, actorId);
      return res.status(200).json({
        success: true,
        message: `Order ${order.order_number} confirmed and inventory reserved.`,
        data: order
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/sales-orders/:id/fulfill
   * Fulfill order (dispatch lumber and issue inventory).
   */
  async fulfillOrder(req, res, next) {
    try {
      const { id } = req.params;
      const actorId = req.user?.id || null;
      const order = await salesOrderService.fulfillSalesOrder(id, actorId);
      return res.status(200).json({
        success: true,
        message: `Order ${order.order_number} fulfilled and lumber dispatched.`,
        data: order
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/sales-orders/:id/cancel
   * Cancel order and release reserved stock.
   */
  async cancelOrder(req, res, next) {
    try {
      const { id } = req.params;
      const { cancellation_reason } = req.body;
      const actorId = req.user?.id || null;
      const order = await salesOrderService.cancelSalesOrder(id, cancellation_reason, actorId);
      return res.status(200).json({
        success: true,
        message: `Order ${order.order_number} cancelled and reservations released.`,
        data: order
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/sales-orders/:id
   * Update order notes, delivery date, or draft line items.
   */
  async updateOrder(req, res, next) {
    try {
      const { id } = req.params;
      const actorId = req.user?.id || null;
      const order = await salesOrderService.updateSalesOrder(id, req.body, actorId);
      return res.status(200).json({
        success: true,
        message: `Order ${order.order_number} updated successfully.`,
        data: order
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new SalesOrderController();
