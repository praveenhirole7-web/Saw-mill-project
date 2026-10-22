'use strict';
/**
 * services/salesOrderService.js
 *
 * Business logic layer for Sawmill Sales Order Management:
 *   - Concurrency-safe inventory validation & reservation
 *   - Backend price, discount, tax, and charge calculation
 *   - Workflow transitions: draft -> confirmed -> processing -> completed / cancelled
 *   - Stock reservation on confirmation and release on cancellation
 *   - Stock consumption and immutable movement ledger on fulfillment
 *   - Protection against duplicate confirmation and completion
 *   - Protection against selling customer-owned or unavailable stock
 *   - Audit history preservation
 */

const { withTransaction } = require('../config/db');
const salesOrderRepo = require('../repositories/salesOrderRepository');

class SalesOrderService {
  /**
   * Calculate line item totals and order summary totals purely on backend.
   */
  calculateTotals(items = [], orderHeader = {}) {
    let subtotal = 0;
    let totalLineDiscounts = 0;
    let totalLineTaxes = 0;

    const processedItems = items.map((item) => {
      const qty = Number(item.quantity || 1);
      const unitPrice = Number(item.unit_price || 0);
      const lineSub = Number((qty * unitPrice).toFixed(2));

      // Calculate line discount
      let discountAmount = 0;
      if (item.discount_percent && Number(item.discount_percent) > 0) {
        discountAmount = Number(((lineSub * Number(item.discount_percent)) / 100).toFixed(2));
      } else if (item.discount_amount && Number(item.discount_amount) > 0) {
        discountAmount = Math.min(Number(item.discount_amount), lineSub);
      }

      const taxable = Math.max(0, lineSub - discountAmount);

      // Calculate line tax
      let taxAmount = 0;
      if (item.tax_percent && Number(item.tax_percent) > 0) {
        taxAmount = Number(((taxable * Number(item.tax_percent)) / 100).toFixed(2));
      } else if (item.tax_amount && Number(item.tax_amount) > 0) {
        taxAmount = Number(item.tax_amount);
      }

      const lineTotal = Number((taxable + taxAmount).toFixed(2));

      subtotal += lineSub;
      totalLineDiscounts += discountAmount;
      totalLineTaxes += taxAmount;

      return {
        ...item,
        quantity: qty,
        unit_price: unitPrice,
        discount_percent: Number(item.discount_percent || 0),
        discount_amount: discountAmount,
        tax_percent: Number(item.tax_percent || 0),
        tax_amount: taxAmount,
        line_total: lineTotal
      };
    });

    const orderDiscount = Number(orderHeader.discount_amount || 0);
    const orderTaxRate = Number(orderHeader.tax_rate || 0);
    let orderTax = 0;
    if (orderTaxRate > 0 && totalLineTaxes === 0) {
      const taxableOrder = Math.max(0, subtotal - totalLineDiscounts - orderDiscount);
      orderTax = Number(((taxableOrder * orderTaxRate) / 100).toFixed(2));
    } else {
      orderTax = totalLineTaxes;
    }

    const shippingCharges = Number(orderHeader.shipping_charges || 0);
    const totalDiscount = totalLineDiscounts + orderDiscount;
    const grandTotal = Number((subtotal - totalDiscount + orderTax + shippingCharges).toFixed(2));

    return {
      subtotal: Number(subtotal.toFixed(2)),
      discount_amount: Number(totalDiscount.toFixed(2)),
      tax_rate: orderTaxRate,
      tax_amount: Number(orderTax.toFixed(2)),
      shipping_charges: Number(shippingCharges.toFixed(2)),
      total_amount: Math.max(0, grandTotal),
      items: processedItems
    };
  }

  /**
   * Helper to determine new batch status based on remaining stock.
   */
  _computeBatchStatus(quantityTotal, minThreshold = 50) {
    if (quantityTotal <= 0) return 'Consumed';
    if (quantityTotal <= minThreshold) return 'Low Stock';
    return 'In Stock';
  }

  _assertFifoBatch(batch, layers) {
    if (batch.status === 'Quarantine') {
      const err = new Error(`Batch ${batch.batch_code} is quarantined and cannot be sold.`);
      err.statusCode = 400;
      err.code = 'BATCH_QUARANTINED';
      throw err;
    }
    const oldestAvailable = layers.find(layer =>
      Number(layer.quantity_available) > 0 &&
      layer.status !== 'Quarantine' &&
      layer.status !== 'Consumed'
    );
    if (oldestAvailable && Number(oldestAvailable.id) !== Number(batch.id)) {
      const err = new Error(
        `FIFO requires batch ${oldestAvailable.batch_code} to be issued before ${batch.batch_code}. Split the order across batches when needed.`
      );
      err.statusCode = 400;
      err.code = 'FIFO_BATCH_REQUIRED';
      throw err;
    }
  }

  /**
   * Create a new Sales Order.
   * Business Rules:
   *   - Registered customer check
   *   - Customer-owned timber cannot be sold as mill inventory
   *   - If created with status 'confirmed', validate and reserve inventory immediately
   *   - If status 'draft', do NOT touch inventory
   */
  async createSalesOrder(orderData, actorId = null) {
    return await withTransaction(async (conn) => {
      // 1. Verify customer exists and is active
      const customer = await salesOrderRepo.getCustomerById(orderData.customer_id, conn);
      if (!customer) {
        const err = new Error(`Customer with ID ${orderData.customer_id} does not exist`);
        err.statusCode = 400;
        err.code = 'INVALID_CUSTOMER';
        throw err;
      }
      if (customer.status && customer.status.toLowerCase() === 'suspended') {
        const err = new Error(`Customer '${customer.name}' account is currently suspended`);
        err.statusCode = 400;
        err.code = 'CUSTOMER_SUSPENDED';
        throw err;
      }

      // 2. Calculate totals on backend
      const calculated = this.calculateTotals(orderData.items, orderData);

      // 3. Generate sequential order number
      const orderNumber = await salesOrderRepo.generateOrderNumber(conn);

      const status = orderData.status === 'confirmed' ? 'confirmed' : 'draft';

      // 4. If creating as confirmed, reserve stock
      if (status === 'confirmed') {
        for (const item of calculated.items) {
          if (item.batch_id) {
            const { batch, layers } = await salesOrderRepo.lockFifoBatchLayersForUpdate(item.batch_id, conn);
            if (!batch) {
              const err = new Error(`Timber batch with ID ${item.batch_id} not found`);
              err.statusCode = 404;
              err.code = 'BATCH_NOT_FOUND';
              throw err;
            }

            if (item.unit && item.unit !== batch.unit) {
              const err = new Error(`Order unit must match batch ${batch.batch_code} (${batch.unit}). Convert the quantity before saving.`);
              err.statusCode = 422;
              err.code = 'UNIT_MISMATCH';
              throw err;
            }

            // Rule 7: Support customer-owned timber without adding it to mill-owned saleable stock
            if (batch.ownership === 'customer') {
              const err = new Error(`Batch ${batch.batch_code} is customer-owned timber and cannot be sold as mill inventory`);
              err.statusCode = 400;
              err.code = 'CUSTOMER_TIMBER_NOT_SALEABLE';
              throw err;
            }
            this._assertFifoBatch(batch, layers);

            // Rule 2 & 6: Concurrency-safe inventory check
            const avail = Number(batch.quantity_available || 0);
            const reqQty = Number(item.quantity);
            if (avail < reqQty) {
              const err = new Error(`Insufficient stock for batch ${batch.batch_code}. Available: ${avail} ${batch.unit}, Requested: ${reqQty} ${batch.unit}`);
              err.statusCode = 400;
              err.code = 'INSUFFICIENT_STOCK';
              throw err;
            }

            // Atomically reserve
            const newAvail = Number((avail - reqQty).toFixed(3));
            const newReserved = Number((Number(batch.quantity_reserved || 0) + reqQty).toFixed(3));
            const newStatus = this._computeBatchStatus(Number(batch.quantity_total), Number(batch.min_stock_threshold || 50));

            await salesOrderRepo.updateBatchStock(batch.id, {
              available: newAvail,
              reserved: newReserved,
              consumed: Number(batch.quantity_consumed || 0),
              total: Number(batch.quantity_total || 0),
              status: newStatus
            }, conn);

            // Record reservation ledger
            await salesOrderRepo.recordStockMovement({
              batch_id: batch.id,
              movement_type: 'reservation',
              quantity: reqQty,
              previous_quantity: avail,
              new_quantity: newAvail,
              unit: batch.unit,
              source_transaction_type: 'sales_order',
              source_transaction_id: orderNumber,
              reason: `Stock reserved for confirmed order ${orderNumber}`,
              authorized_by_id: actorId
            }, conn);
          }
        }
      }

      // 5. Create order header and line items
      const newOrderPayload = {
        order_number: orderNumber,
        customer_id: orderData.customer_id,
        status: status,
        payment_status: 'unpaid', // Business Rule: Do not automatically mark paid
        order_date: orderData.order_date || new Date().toISOString().split('T')[0],
        delivery_date: orderData.delivery_date || null,
        subtotal: calculated.subtotal,
        discount_amount: calculated.discount_amount,
        tax_rate: calculated.tax_rate,
        tax_amount: calculated.tax_amount,
        shipping_charges: calculated.shipping_charges,
        total_amount: calculated.total_amount,
        notes: orderData.notes || null,
        created_by_id: actorId
      };

      const orderId = await salesOrderRepo.createSalesOrder(
        newOrderPayload,
        calculated.items,
        {
          action: status === 'confirmed' ? 'order_created_and_confirmed' : 'order_created',
          reason: `Sales order ${orderNumber} created in ${status} status`
        },
        conn
      );

      return await salesOrderRepo.getSalesOrderById(orderId, conn);
    });
  }

  /**
   * Confirm an existing draft sales order.
   * Business Rules:
   *   - Must be in 'draft' status
   *   - Prevent duplicate confirmation
   *   - Atomically check & reserve stock for all line items with batch_id
   *   - Write 'reservation' movement into stock_movements ledger
   */
  async confirmSalesOrder(orderId, actorId = null) {
    return await withTransaction(async (conn) => {
      const order = await salesOrderRepo.lockSalesOrderForUpdate(orderId, conn);
      if (!order) {
        const err = new Error(`Sales order with ID ${orderId} not found`);
        err.statusCode = 404;
        err.code = 'ORDER_NOT_FOUND';
        throw err;
      }

      // Rule: Prevent duplicate confirmation / invalid transition
      if (order.status === 'confirmed') {
        const err = new Error(`Order ${order.order_number} is already confirmed`);
        err.statusCode = 400;
        err.code = 'ALREADY_CONFIRMED';
        throw err;
      }

      if (order.status !== 'draft') {
        const err = new Error(`Cannot confirm order in '${order.status}' status`);
        err.statusCode = 400;
        err.code = 'INVALID_STATUS_TRANSITION';
        throw err;
      }

      const fullOrder = await salesOrderRepo.getSalesOrderById(order.id, conn);

      // Reserve stock for each item
      for (const item of fullOrder.items) {
        if (item.batch_id) {
          const { batch, layers } = await salesOrderRepo.lockFifoBatchLayersForUpdate(item.batch_id, conn);
          if (!batch) {
            const err = new Error(`Batch ID ${item.batch_id} for item '${item.product_name}' not found`);
            err.statusCode = 404;
            err.code = 'BATCH_NOT_FOUND';
            throw err;
          }
          this._assertFifoBatch(batch, layers);

          if (batch.ownership === 'customer') {
            const err = new Error(`Batch ${batch.batch_code} is customer-owned timber and cannot be reserved for mill sale`);
            err.statusCode = 400;
            err.code = 'CUSTOMER_TIMBER_NOT_SALEABLE';
            throw err;
          }

          const avail = Number(batch.quantity_available || 0);
          const reqQty = Number(item.quantity);
          if (avail < reqQty) {
            const err = new Error(`Insufficient stock for batch ${batch.batch_code}. Available: ${avail} ${batch.unit}, Required: ${reqQty} ${batch.unit}`);
            err.statusCode = 400;
            err.code = 'INSUFFICIENT_STOCK';
            throw err;
          }

          const newAvail = Number((avail - reqQty).toFixed(3));
          const newReserved = Number((Number(batch.quantity_reserved || 0) + reqQty).toFixed(3));
          const newStatus = this._computeBatchStatus(Number(batch.quantity_total), Number(batch.min_stock_threshold || 50));

          await salesOrderRepo.updateBatchStock(batch.id, {
            available: newAvail,
            reserved: newReserved,
            consumed: Number(batch.quantity_consumed || 0),
            total: Number(batch.quantity_total || 0),
            status: newStatus
          }, conn);

          await salesOrderRepo.recordStockMovement({
            batch_id: batch.id,
            movement_type: 'reservation',
            quantity: reqQty,
            previous_quantity: avail,
            new_quantity: newAvail,
            unit: batch.unit,
            source_transaction_type: 'sales_order',
            source_transaction_id: order.order_number,
            reason: `Stock reserved on order confirmation for ${order.order_number}`,
            authorized_by_id: actorId
          }, conn);
        }
      }

      await salesOrderRepo.updateOrderStatus(order.id, 'confirmed', {}, conn);

      await salesOrderRepo.recordHistory({
        sales_order_id: order.id,
        from_status: 'draft',
        to_status: 'confirmed',
        action: 'order_confirmed',
        changed_by_id: actorId,
        reason: 'Order confirmed and inventory reserved',
        notes: null
      }, conn);

      return await salesOrderRepo.getSalesOrderById(order.id, conn);
    });
  }

  /**
   * Fulfill / Complete a sales order (timber dispatched to client).
   * Business Rules:
   *   - Consumes stock from reserved pool or directly from available pool
   *   - Writes 'issue' entry into stock_movements ledger
   *   - Status transitions to 'completed'
   *   - Prevent duplicate completion
   *   - Do not automatically mark paid (payment recorded separately)
   */
  async fulfillSalesOrder(orderId, actorId = null) {
    return await withTransaction(async (conn) => {
      const order = await salesOrderRepo.lockSalesOrderForUpdate(orderId, conn);
      if (!order) {
        const err = new Error(`Sales order with ID ${orderId} not found`);
        err.statusCode = 404;
        err.code = 'ORDER_NOT_FOUND';
        throw err;
      }

      // Rule: Prevent completing the same job twice
      if (order.status === 'completed') {
        const err = new Error(`Order ${order.order_number} is already fulfilled and completed`);
        err.statusCode = 400;
        err.code = 'DUPLICATE_COMPLETION';
        throw err;
      }

      if (order.status === 'cancelled') {
        const err = new Error(`Cannot fulfill cancelled order ${order.order_number}`);
        err.statusCode = 400;
        err.code = 'ORDER_CANCELLED';
        throw err;
      }

      const fullOrder = await salesOrderRepo.getSalesOrderById(order.id, conn);
      const wasReserved = order.status === 'confirmed' || order.status === 'processing';

      for (const item of fullOrder.items) {
        if (item.batch_id) {
          const { batch, layers } = await salesOrderRepo.lockFifoBatchLayersForUpdate(item.batch_id, conn);
          if (!batch) {
            const err = new Error(`Timber batch with ID ${item.batch_id} not found`);
            err.statusCode = 404;
            err.code = 'BATCH_NOT_FOUND';
            throw err;
          }
          if (batch.ownership === 'customer') {
            const err = new Error(`Batch ${batch.batch_code} is customer-owned timber and cannot be sold as mill inventory`);
            err.statusCode = 400;
            err.code = 'CUSTOMER_TIMBER_NOT_SALEABLE';
            throw err;
          }
          this._assertFifoBatch(batch, layers);

          const reqQty = Number(item.quantity);
          const unitCost = Number(batch.cost_price) > 0
            ? Number(batch.cost_price).toFixed(2)
            : null;
          const totalCost = unitCost === null
            ? null
            : (Math.round(reqQty * Number(unitCost) * 100) / 100).toFixed(2);
          await salesOrderRepo.setFulfillmentCost(item.id, unitCost, totalCost, conn);
          let newAvail = Number(batch.quantity_available);
          let newReserved = Number(batch.quantity_reserved);
          let newConsumed = Number(batch.quantity_consumed) + reqQty;
          let newTotal = Number(batch.quantity_total) - reqQty;

          if (wasReserved) {
            newReserved = Math.max(0, newReserved - reqQty);
          } else {
            // Direct fulfillment from draft
            if (newAvail < reqQty) {
              const err = new Error(`Insufficient stock to fulfill batch ${batch.batch_code}. Available: ${newAvail}, Required: ${reqQty}`);
              err.statusCode = 400;
              err.code = 'INSUFFICIENT_STOCK';
              throw err;
            }
            newAvail = newAvail - reqQty;
          }

          const newStatus = this._computeBatchStatus(newTotal, Number(batch.min_stock_threshold || 50));

          await salesOrderRepo.updateBatchStock(batch.id, {
            available: newAvail,
            reserved: newReserved,
            consumed: newConsumed,
            total: Math.max(0, newTotal),
            status: newStatus
          }, conn);

          // Record immutable issue ledger
          await salesOrderRepo.recordStockMovement({
            batch_id: batch.id,
            movement_type: 'issue',
            quantity: reqQty,
            previous_quantity: Number(batch.quantity_total),
            new_quantity: Math.max(0, newTotal),
            unit: batch.unit,
            source_transaction_type: 'sales_order',
            source_transaction_id: order.order_number,
            reason: `Sales order fulfillment dispatch for ${order.order_number}`,
            authorized_by_id: actorId
          }, conn);
        }
      }

      await salesOrderRepo.updateOrderStatus(order.id, 'completed', {}, conn);

      await salesOrderRepo.recordHistory({
        sales_order_id: order.id,
        from_status: order.status,
        to_status: 'completed',
        action: 'order_fulfilled',
        changed_by_id: actorId,
        reason: 'Order fulfilled and lumber dispatched',
        notes: null
      }, conn);

      return await salesOrderRepo.getSalesOrderById(order.id, conn);
    });
  }

  /**
   * Cancel an order.
   * Business Rules:
   *   - Must provide a cancellation reason
   *   - If order was 'confirmed' or 'processing', release reserved stock back to available stock
   *   - Write 'release' into stock_movements ledger
   *   - Cannot cancel already completed order (requires authorized returns)
   */
  async cancelSalesOrder(orderId, cancellationReason, actorId = null) {
    if (!cancellationReason || !cancellationReason.trim()) {
      const err = new Error('A cancellation reason is required to cancel an order');
      err.statusCode = 400;
      err.code = 'REASON_REQUIRED';
      throw err;
    }

    return await withTransaction(async (conn) => {
      const order = await salesOrderRepo.lockSalesOrderForUpdate(orderId, conn);
      if (!order) {
        const err = new Error(`Sales order with ID ${orderId} not found`);
        err.statusCode = 404;
        err.code = 'ORDER_NOT_FOUND';
        throw err;
      }

      if (order.status === 'completed') {
        const err = new Error(`Cannot cancel completed order ${order.order_number}. Use authorized return workflow.`);
        err.statusCode = 400;
        err.code = 'CANNOT_CANCEL_COMPLETED';
        throw err;
      }

      if (order.status === 'cancelled') {
        const err = new Error(`Order ${order.order_number} is already cancelled`);
        err.statusCode = 400;
        err.code = 'ALREADY_CANCELLED';
        throw err;
      }

      const wasReserved = order.status === 'confirmed' || order.status === 'processing';

      if (wasReserved) {
        const fullOrder = await salesOrderRepo.getSalesOrderById(order.id, conn);
        for (const item of fullOrder.items) {
          if (item.batch_id) {
            const batch = await salesOrderRepo.lockTimberBatchForUpdate(item.batch_id, conn);
            if (!batch) continue;

            const reqQty = Number(item.quantity);
            const newReserved = Math.max(0, Number(batch.quantity_reserved || 0) - reqQty);
            const newAvail = Number((Number(batch.quantity_available || 0) + reqQty).toFixed(3));
            const newStatus = this._computeBatchStatus(Number(batch.quantity_total), Number(batch.min_stock_threshold || 50));

            await salesOrderRepo.updateBatchStock(batch.id, {
              available: newAvail,
              reserved: newReserved,
              consumed: Number(batch.quantity_consumed || 0),
              total: Number(batch.quantity_total || 0),
              status: newStatus
            }, conn);

            // Record release in stock_movements
            await salesOrderRepo.recordStockMovement({
              batch_id: batch.id,
              movement_type: 'release',
              quantity: reqQty,
              previous_quantity: Number(batch.quantity_available),
              new_quantity: newAvail,
              unit: batch.unit,
              source_transaction_type: 'sales_order',
              source_transaction_id: order.order_number,
              reason: `Released reserved stock on order cancellation: ${cancellationReason}`,
              authorized_by_id: actorId
            }, conn);
          }
        }
      }

      await salesOrderRepo.updateOrderStatus(order.id, 'cancelled', {
        cancellation_reason: cancellationReason
      }, conn);

      await salesOrderRepo.recordHistory({
        sales_order_id: order.id,
        from_status: order.status,
        to_status: 'cancelled',
        action: 'order_cancelled',
        changed_by_id: actorId,
        reason: cancellationReason,
        notes: null
      }, conn);

      return await salesOrderRepo.getSalesOrderById(order.id, conn);
    });
  }

  /**
   * Update an authorized order before fulfillment.
   * Business Rules:
   *   - Cannot edit completed or cancelled orders
   *   - Recalculates totals securely on backend
   */
  async updateSalesOrder(orderId, updateData, actorId = null) {
    return await withTransaction(async (conn) => {
      const order = await salesOrderRepo.lockSalesOrderForUpdate(orderId, conn);
      if (!order) {
        const err = new Error(`Sales order with ID ${orderId} not found`);
        err.statusCode = 404;
        err.code = 'ORDER_NOT_FOUND';
        throw err;
      }

      if (order.status === 'completed' || order.status === 'cancelled') {
        const err = new Error(`Cannot modify order in '${order.status}' status`);
        err.statusCode = 400;
        err.code = 'ORDER_LOCKED';
        throw err;
      }

      // If items are provided, calculate new totals
      let calculated = null;
      if (updateData.items && Array.isArray(updateData.items)) {
        if (order.status === 'confirmed') {
          const err = new Error('To change line items of a confirmed order, cancel or adjust status first');
          err.statusCode = 400;
          err.code = 'CONFIRMED_ITEMS_LOCKED';
          throw err;
        }

        calculated = this.calculateTotals(updateData.items, {
          discount_amount: updateData.discount_amount !== undefined ? updateData.discount_amount : order.discount_amount,
          tax_rate: updateData.tax_rate !== undefined ? updateData.tax_rate : order.tax_rate,
          shipping_charges: updateData.shipping_charges !== undefined ? updateData.shipping_charges : order.shipping_charges
        });
      }

      const payload = {
        delivery_date: updateData.delivery_date !== undefined ? updateData.delivery_date : order.delivery_date,
        notes: updateData.notes !== undefined ? updateData.notes : order.notes
      };

      if (calculated) {
        payload.subtotal = calculated.subtotal;
        payload.discount_amount = calculated.discount_amount;
        payload.tax_rate = calculated.tax_rate;
        payload.tax_amount = calculated.tax_amount;
        payload.shipping_charges = calculated.shipping_charges;
        payload.total_amount = calculated.total_amount;
      }

      await salesOrderRepo.updateSalesOrder(order.id, payload, calculated?.items || null, conn);

      await salesOrderRepo.recordHistory({
        sales_order_id: order.id,
        from_status: order.status,
        to_status: order.status,
        action: 'order_updated',
        changed_by_id: actorId,
        reason: updateData.reason || 'Authorized sales order update',
        notes: null
      }, conn);

      return await salesOrderRepo.getSalesOrderById(order.id, conn);
    });
  }

  /**
   * List sales orders with filters.
   */
  async getSalesOrders(params) {
    return await salesOrderRepo.getSalesOrders(params);
  }

  /**
   * Get single order by ID.
   */
  async getSalesOrderById(id) {
    return await salesOrderRepo.getSalesOrderById(id);
  }
}

module.exports = new SalesOrderService();
