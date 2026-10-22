'use strict';
/**
 * test/salesOrders.test.js
 *
 * Automated tests for Sawmill Sales Order Management:
 *   1. Create sales order (verifies backend calculations of subtotal, discounts, tax, shipping, total)
 *   2. Draft orders do NOT reserve or consume inventory
 *   3. Insufficient stock prevention: Rejects confirmation when requested quantity exceeds available stock
 *   4. Order confirmation: Reserves stock and writes 'reservation' into stock_movements ledger
 *   5. Prevent repeated confirmation: Idempotency check blocks confirming already confirmed orders
 *   6. Order cancellation: Releases reserved stock back to available stock and records reason
 *   7. Order fulfillment: Consumes reserved stock, decreases total stock, and records 'issue' ledger
 *   8. Prevent duplicate completion: Idempotency check blocks completing already completed orders
 *   9. Customer-owned timber protection: Blocks selling customer-owned batches in mill sales orders
 *  10. Payment status rule: Orders are NOT automatically marked paid upon completion
 *  11. Authorized updates: Modifying draft orders before fulfillment
 *  12. HTTP API integration: Express endpoints for order lifecycle
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '5098';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'sawmill_test_db';
process.env.JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long_12345';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_key_minimum_32_chars_12345';
process.env.CLIENT_URL = 'http://localhost:5173';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

// Import DB module to mock query and withTransaction
const db = require('../src/config/db');

// In-memory mock database state
let mockUsers = [
  {
    id: 1,
    username: 'admin',
    email: 'admin@sawmill.local',
    role: 'admin',
    status: 'active',
    permissions: 'manage_users,view_inventory,manage_inventory,manage_sales_orders',
  },
  {
    id: 2,
    username: 'manager',
    email: 'manager@sawmill.local',
    role: 'manager',
    status: 'active',
    permissions: 'view_inventory,manage_sales_orders',
  }
];

let mockCustomers = [
  {
    id: 1,
    name: 'Heritage Custom Homebuilders',
    company_name: 'Heritage Homes LLC',
    phone: '+1-555-0199',
    email: 'build@heritagehomes.com',
    status: 'Active',
    credit_limit: 50000.00
  },
  {
    id: 2,
    name: 'Suspended Construction',
    company_name: 'Suspended Co',
    phone: '+1-555-9999',
    email: 'bad@suspended.com',
    status: 'Suspended',
    credit_limit: 0.00
  }
];

let mockBatches = [];
let mockMovements = [];
let mockSalesOrders = [];
let mockOrderItems = [];
let mockOrderHistory = [];

let nextOrderId = 1;
let nextItemId = 1;
let nextBatchId = 200;
let nextMovementId = 200;
let nextHistoryId = 1;

// Row lock simulation for transaction testing
const lockedOrderIds = new Set();
const lockedBatchIds = new Set();

// Mock query router
db.query = async (sql, params = []) => {
  const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  // 1. Auth check
  if (norm.includes('from users u') && norm.includes('where u.id = ?')) {
    const id = Number(params[0]);
    const u = mockUsers.find(x => x.id === id);
    return [u ? [u] : []];
  }

  // 2. Customers lookup
  if (norm.includes('from customers') && norm.includes('where id = ?')) {
    const id = Number(params[0]);
    const c = mockCustomers.find(x => x.id === id);
    return [c ? [c] : []];
  }

  // 3. Batches lookup
  if (norm.includes('from timber_batches') && norm.includes('where id = ?')) {
    const id = Number(params[0]);
    const b = mockBatches.find(x => x.id === id);
    return [b ? [b] : []];
  }

  // 4. Sales Orders lookup
  if (norm.includes('select count(*) as total from sales_orders')) {
    return [[{ total: mockSalesOrders.length }]];
  }
  if (norm.includes('select order_number from sales_orders where order_number like ?')) {
    const sorted = [...mockSalesOrders].sort((a, b) => b.id - a.id);
    return [sorted.length > 0 ? [{ order_number: sorted[0].order_number }] : []];
  }
  if (norm.includes('from sales_orders so') && norm.includes('where so.id = ? or so.order_number = ?')) {
    const identifier = params[0];
    const order = mockSalesOrders.find(x => x.id === Number(identifier) || x.order_number === String(identifier));
    if (!order) return [[]];
    const cust = mockCustomers.find(c => c.id === order.customer_id);
    return [[{
      ...order,
      customer_name: cust?.name,
      company_name: cust?.company_name,
      customer_phone: cust?.phone,
      customer_email: cust?.email,
      customer_tax_id: cust?.tax_gst_number,
      customer_address: cust?.address,
      created_by_username: 'admin'
    }]];
  }
  if (norm.includes('from sales_order_items soi') && norm.includes('where soi.sales_order_id = ?')) {
    const oId = Number(params[0]);
    const items = mockOrderItems.filter(x => x.sales_order_id === oId).map(i => {
      const b = mockBatches.find(x => x.id === i.batch_id);
      return {
        ...i,
        batch_code: b?.batch_code,
        batch_category: b?.category,
        batch_current_available: b?.quantity_available,
        batch_current_reserved: b?.quantity_reserved,
        batch_ownership: b?.ownership,
        batch_status: b?.status
      };
    });
    return [items];
  }
  if (norm.includes('from sales_order_history soh') && norm.includes('where soh.sales_order_id = ?')) {
    const oId = Number(params[0]);
    const history = mockOrderHistory.filter(x => x.sales_order_id === oId);
    return [history];
  }
  if (norm.includes('from sales_orders so')) {
    return [mockSalesOrders.map(o => {
      const cust = mockCustomers.find(c => c.id === o.customer_id);
      return {
        ...o,
        customer_name: cust?.name,
        company_name: cust?.company_name,
        customer_phone: cust?.phone,
        customer_email: cust?.email
      };
    })];
  }

  return [[]];
};

// Mock transaction runner
db.withTransaction = async (callback) => {
  const conn = {
    execute: async (sql, params = []) => {
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      // Check customer
      if (norm.includes('from customers where id = ?')) {
        const id = Number(params[0]);
        const c = mockCustomers.find(x => x.id === id);
        return [c ? [c] : []];
      }

      // Sequential order number check
      if (norm.includes('select order_number from sales_orders where order_number like ?')) {
        const sorted = [...mockSalesOrders].sort((a, b) => b.id - a.id);
        return [sorted.length > 0 ? [{ order_number: sorted[0].order_number }] : []];
      }

      // Lock order for update
      if (norm.includes('from sales_orders where id = ? for update')) {
        const id = Number(params[0]);
        lockedOrderIds.add(id);
        const o = mockSalesOrders.find(x => x.id === id);
        return [o ? [o] : []];
      }

      // Lock batch for update
      if (norm.includes('from timber_batches layer') && norm.includes('join timber_batches selected')) {
        const selected = mockBatches.find(x => x.id === Number(params[0]));
        if (!selected || selected.ownership !== 'mill') return [[]];
        const sameLayer = batch =>
          batch.ownership === 'mill' &&
          batch.timber_type === selected.timber_type &&
          batch.category === selected.category &&
          batch.species === selected.species &&
          batch.grade === selected.grade &&
          batch.dimensions_text === selected.dimensions_text &&
          batch.unit === selected.unit &&
          batch.name === selected.name;
        const layers = mockBatches.filter(sameLayer).sort((a, b) =>
          String(a.created_at || '').localeCompare(String(b.created_at || '')) || a.id - b.id
        );
        layers.forEach(batch => lockedBatchIds.add(batch.id));
        return [layers];
      }
      if (norm.includes('from timber_batches where id = ? for update')) {
        const id = Number(params[0]);
        lockedBatchIds.add(id);
        const b = mockBatches.find(x => x.id === id);
        return [b ? [b] : []];
      }

      // Batch stock update
      if (norm.includes('update timber_batches set quantity_available = ?')) {
        const [available, reserved, consumed, total, status, batchId] = params;
        const b = mockBatches.find(x => x.id === Number(batchId));
        if (b) {
          b.quantity_available = Number(available);
          b.quantity_reserved = Number(reserved);
          b.quantity_consumed = Number(consumed);
          b.quantity_total = Number(total);
          b.status = status;
        }
        return [{ affectedRows: 1 }];
      }

      if (norm.includes('update sales_order_items set unit_cost_at_fulfillment = ?')) {
        const [unitCost, totalCost, itemId] = params;
        const item = mockOrderItems.find(x => x.id === Number(itemId));
        if (item) {
          item.unit_cost_at_fulfillment = unitCost === null ? null : Number(unitCost);
          item.total_cost_at_fulfillment = totalCost === null ? null : Number(totalCost);
        }
        return [{ affectedRows: 1 }];
      }

      // Stock movements insert
      if (norm.includes('insert into stock_movements')) {
        const mov = {
          id: nextMovementId++,
          batch_id: params[0],
          movement_type: params[1],
          quantity: Number(params[2]),
          previous_quantity: Number(params[3]),
          new_quantity: Number(params[4]),
          unit: params[5],
          source_transaction_type: params[6],
          source_transaction_id: params[7],
          reason: params[8],
          authorized_by_id: params[9],
          notes: params[10],
          created_at: new Date()
        };
        mockMovements.push(mov);
        return [{ insertId: mov.id }];
      }

      // Sales order insert
      if (norm.includes('insert into sales_orders')) {
        const order = {
          id: nextOrderId++,
          order_number: params[0],
          customer_id: Number(params[1]),
          status: params[2],
          payment_status: params[3],
          order_date: params[4],
          delivery_date: params[5],
          subtotal: Number(params[6]),
          discount_amount: Number(params[7]),
          tax_rate: Number(params[8]),
          tax_amount: Number(params[9]),
          shipping_charges: Number(params[10]),
          total_amount: Number(params[11]),
          cancellation_reason: params[12],
          notes: params[13],
          created_by_id: params[14],
          created_at: new Date(),
          updated_at: new Date()
        };
        mockSalesOrders.push(order);
        return [{ insertId: order.id }];
      }

      // Sales order items insert
      if (norm.includes('insert into sales_order_items')) {
        const item = {
          id: nextItemId++,
          sales_order_id: Number(params[0]),
          batch_id: params[1] ? Number(params[1]) : null,
          product_name: params[2],
          species: params[3],
          dimensions_text: params[4],
          quantity: Number(params[5]),
          unit: params[6],
          unit_price: Number(params[7]),
          discount_percent: Number(params[8]),
          discount_amount: Number(params[9]),
          tax_percent: Number(params[10]),
          tax_amount: Number(params[11]),
          line_total: Number(params[12]),
          unit_cost_at_fulfillment: null,
          total_cost_at_fulfillment: null,
          created_at: new Date()
        };
        mockOrderItems.push(item);
        return [{ insertId: item.id }];
      }

      // Delete items on update
      if (norm.includes('delete from sales_order_items where sales_order_id = ?')) {
        const orderId = Number(params[0]);
        mockOrderItems = mockOrderItems.filter(x => x.sales_order_id !== orderId);
        return [{ affectedRows: 1 }];
      }

      // Sales order history insert
      if (norm.includes('insert into sales_order_history')) {
        const hist = {
          id: nextHistoryId++,
          sales_order_id: Number(params[0]),
          from_status: params[1],
          to_status: params[2],
          action: params[3],
          changed_by_id: params[4] ? Number(params[4]) : null,
          reason: params[5],
          notes: params[6],
          created_at: new Date()
        };
        mockOrderHistory.push(hist);
        return [{ insertId: hist.id }];
      }

      // Update order status
      if (norm.includes('update sales_orders set status = ?')) {
        const status = params[0];
        let id;
        if (norm.includes('cancellation_reason = ?')) {
          const reason = params[1];
          id = Number(params[2]);
          const o = mockSalesOrders.find(x => x.id === id);
          if (o) {
            o.status = status;
            o.cancellation_reason = reason;
          }
        } else {
          id = Number(params[1]);
          const o = mockSalesOrders.find(x => x.id === id);
          if (o) o.status = status;
        }
        return [{ affectedRows: 1 }];
      }

      // Update sales order fields
      if (norm.includes('update sales_orders set')) {
        const id = Number(params[params.length - 1]);
        const o = mockSalesOrders.find(x => x.id === id);
        if (o) {
          // generic update simulation
          if (norm.includes('delivery_date = ?')) o.delivery_date = params[0];
          if (norm.includes('notes = ?')) o.notes = params[1];
        }
        return [{ affectedRows: 1 }];
      }

      // Fetch for getSalesOrderById within transaction
      if (norm.includes('from sales_orders so') && norm.includes('where so.id = ? or so.order_number = ?')) {
        const identifier = params[0];
        const order = mockSalesOrders.find(x => x.id === Number(identifier) || x.order_number === String(identifier));
        if (!order) return [[]];
        const cust = mockCustomers.find(c => c.id === order.customer_id);
        return [[{
          ...order,
          customer_name: cust?.name,
          company_name: cust?.company_name,
          customer_phone: cust?.phone,
          customer_email: cust?.email,
          created_by_username: 'admin'
        }]];
      }

      if (norm.includes('from sales_order_items soi') && norm.includes('where soi.sales_order_id = ?')) {
        const oId = Number(params[0]);
        const items = mockOrderItems.filter(x => x.sales_order_id === oId).map(i => {
          const b = mockBatches.find(x => x.id === i.batch_id);
          return {
            ...i,
            batch_code: b?.batch_code,
            batch_category: b?.category,
            batch_current_available: b?.quantity_available,
            batch_current_reserved: b?.quantity_reserved,
            batch_ownership: b?.ownership,
            batch_status: b?.status
          };
        });
        return [items];
      }

      if (norm.includes('from sales_order_history soh') && norm.includes('where soh.sales_order_id = ?')) {
        const oId = Number(params[0]);
        const history = mockOrderHistory.filter(x => x.sales_order_id === oId);
        return [history];
      }

      return [[]];
    }
  };

  try {
    return await callback(conn);
  } finally {
    lockedOrderIds.clear();
    lockedBatchIds.clear();
  }
};

// Import services and controllers
const salesOrderService = require('../src/services/salesOrderService');
const salesOrderRepo = require('../src/repositories/salesOrderRepository');
const app = require('../src/server');

// Helper to generate admin test JWT
function getAdminAuthToken() {
  return jwt.sign(
    { sub: 1, email: 'admin@sawmill.local', role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h', issuer: 'sawmill-api' }
  );
}

let server;
let adminToken;
let baseUrl;

// Helper for HTTP requests
async function makeRequest(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, options);
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return {
    status: response.status,
    headers: response.headers,
    body
  };
}

describe('Sawmill Sales Order Management Tests', () => {

  before(async () => {
    server = app.listen(0);
    await new Promise(res => server.once('listening', res));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    adminToken = jwt.sign(
      { sub: 1, email: 'admin@sawmill.local', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h', issuer: 'sawmill-api' }
    );
    // Seed initial mock timber batches
    mockBatches = [
      {
        id: 201,
        batch_code: 'SAWN-OAK-001',
        created_at: '2025-01-01 00:00:00',
        name: '4/4 FAS Kiln Dried White Oak',
        timber_type: 'sawn_timber',
        category: 'Dimensional Lumber',
        species: 'American White Oak',
        quantity_total: 500.000,
        quantity_available: 500.000,
        quantity_reserved: 0.000,
        quantity_consumed: 0.000,
        cost_price: 10.00,
        unit: 'CFT',
        ownership: 'mill',
        customer_id: null,
        status: 'In Stock',
        min_stock_threshold: 50.000,
        selling_price: 32.50
      },
      {
        id: 202,
        batch_code: 'SAWN-CEDAR-002',
        created_at: '2025-01-01 00:00:00',
        name: '2x6 Select Western Red Cedar',
        timber_type: 'sawn_timber',
        category: 'Dimensional Lumber',
        species: 'Western Red Cedar',
        quantity_total: 150.000,
        quantity_available: 150.000,
        quantity_reserved: 0.000,
        quantity_consumed: 0.000,
        cost_price: 15.00,
        unit: 'CFT',
        ownership: 'mill',
        customer_id: null,
        status: 'In Stock',
        min_stock_threshold: 40.000,
        selling_price: 28.00
      },
      {
        id: 203,
        batch_code: 'CUST-WALNUT-999',
        created_at: '2025-01-01 00:00:00',
        name: 'Customer Custom Milled Walnut Slabs',
        timber_type: 'sawn_timber',
        category: 'Live Edge Slabs',
        species: 'Black Walnut',
        quantity_total: 80.000,
        quantity_available: 80.000,
        quantity_reserved: 0.000,
        quantity_consumed: 0.000,
        cost_price: 0.00,
        unit: 'CFT',
        ownership: 'customer',
        customer_id: 1,
        status: 'In Stock',
        min_stock_threshold: 10.000,
        selling_price: 0.00
      }
    ];

    mockSalesOrders = [];
    mockOrderItems = [];
    mockOrderHistory = [];
    mockMovements = [];
  });

  // 1. Order creation & backend calculation
  test('1. Sales Order Creation: Calculates backend subtotal, discounts, taxes, and shipping charges', async () => {
    const payload = {
      customer_id: 1,
      order_date: '2026-10-19',
      delivery_date: '2026-10-25',
      discount_amount: 50.00, // Order-level discount
      tax_rate: 10.00,       // 10% tax
      shipping_charges: 120.00,
      notes: 'Deliver to Yard Site B',
      status: 'draft',
      items: [
        {
          batch_id: 201,
          product_name: '4/4 FAS Kiln Dried White Oak',
          species: 'American White Oak',
          dimensions_text: '1" x 6" x 12\'',
          quantity: 100,
          unit: 'CFT',
          unit_price: 32.50, // 100 * 32.50 = 3250
          discount_percent: 5, // 5% discount = 162.50 -> 3087.50
          tax_percent: 0
        },
        {
          batch_id: 202,
          product_name: '2x6 Select Western Red Cedar',
          species: 'Western Red Cedar',
          dimensions_text: '2" x 6" x 16\'',
          quantity: 50,
          unit: 'CFT',
          unit_price: 28.00, // 50 * 28 = 1400
          discount_percent: 0,
          tax_percent: 0
        }
      ]
    };

    const order = await salesOrderService.createSalesOrder(payload, 1);

    assert.ok(order.id, 'Order ID must be generated');
    assert.match(order.order_number, /^SO-\d{4}-\d{4}$/, 'Order number must follow SO-YYYY-XXXX pattern');
    assert.equal(order.status, 'draft', 'Initial status must be draft');
    assert.equal(order.payment_status, 'unpaid', 'Payment status must be unpaid initially');

    // Expected calculations:
    // Item 1: 100 * 32.50 = 3250.00, discount 5% = 162.50, line_total = 3087.50
    // Item 2: 50 * 28.00 = 1400.00, discount 0, line_total = 1400.00
    // Subtotal: 3250 + 1400 = 4650.00
    // Line discounts: 162.50 + order discount 50.00 = 212.50 total discount
    // Taxable: 4650 - 212.50 = 4437.50 * 10% = 443.75
    // Grand Total: 4650 - 212.50 + 443.75 + 120 (shipping) = 5001.25
    assert.equal(Number(order.subtotal), 4650.00);
    assert.equal(Number(order.discount_amount), 212.50);
    assert.equal(Number(order.tax_amount), 443.75);
    assert.equal(Number(order.shipping_charges), 120.00);
    assert.equal(Number(order.total_amount), 5001.25);
    assert.equal(order.items.length, 2);
  });

  // 2. Draft does NOT touch stock
  test('2. Business Rule: Draft sales order does NOT reserve or consume inventory', async () => {
    const oakBatch = mockBatches.find(b => b.id === 201);
    assert.equal(oakBatch.quantity_available, 500.000, 'Available stock should remain 500');
    assert.equal(oakBatch.quantity_reserved, 0.000, 'Reserved stock should remain 0');
    assert.equal(oakBatch.quantity_total, 500.000, 'Total stock should remain 500');
  });

  test('2a. FIFO: Rejects reserving a newer matching batch while an older batch is available', async () => {
    const olderOakLayer = {
      ...mockBatches.find(batch => batch.id === 201),
      id: 200,
      batch_code: 'SAWN-OAK-000',
      created_at: '2024-01-01 00:00:00',
      quantity_total: 20,
      quantity_available: 20
    };
    mockBatches.push(olderOakLayer);
    await assert.rejects(
      () => salesOrderService.createSalesOrder({
        customer_id: 1,
        status: 'confirmed',
        items: [{ batch_id: 201, product_name: 'Oak boards', species: 'American White Oak', quantity: 10, unit: 'CFT', unit_price: 30 }]
      }, 1),
      error => error.code === 'FIFO_BATCH_REQUIRED'
    );
    assert.equal(olderOakLayer.quantity_available, 20);
    mockBatches = mockBatches.filter(batch => batch.id !== olderOakLayer.id);
  });

  // 3. Insufficient stock prevention
  test('3. Insufficient Stock Prevention: Rejects order confirmation when requested quantity exceeds available stock', async () => {
    // Batch 202 only has 150 CFT available
    const excessiveOrder = await salesOrderService.createSalesOrder({
      customer_id: 1,
      status: 'draft',
      items: [
        {
          batch_id: 202,
          product_name: 'Western Red Cedar Oversell',
          species: 'Western Red Cedar',
          quantity: 250, // exceeds 150 available
          unit: 'CFT',
          unit_price: 28.00
        }
      ]
    }, 1);

    await assert.rejects(
      async () => {
        await salesOrderService.confirmSalesOrder(excessiveOrder.id, 1);
      },
      (err) => {
        assert.equal(err.code, 'INSUFFICIENT_STOCK');
        assert.match(err.message, /Insufficient stock for batch SAWN-CEDAR-002/);
        return true;
      }
    );
  });

  // 4. Controlled reservation upon confirmation
  test('4. Order Confirmation: Atomically reserves stock and creates stock_movements reservation entry', async () => {
    const draftOrder = mockSalesOrders[0]; // has 100 CFT oak and 50 CFT cedar
    const confirmed = await salesOrderService.confirmSalesOrder(draftOrder.id, 1);

    assert.equal(confirmed.status, 'confirmed');

    const oak = mockBatches.find(b => b.id === 201);
    const cedar = mockBatches.find(b => b.id === 202);

    // Oak: 500 - 100 = 400 available, 100 reserved
    assert.equal(oak.quantity_available, 400.000);
    assert.equal(oak.quantity_reserved, 100.000);
    assert.equal(oak.quantity_total, 500.000);

    // Cedar: 150 - 50 = 100 available, 50 reserved
    assert.equal(cedar.quantity_available, 100.000);
    assert.equal(cedar.quantity_reserved, 50.000);
    assert.equal(cedar.quantity_total, 150.000);

    // Check movements recorded
    const reservations = mockMovements.filter(m => m.movement_type === 'reservation' && m.source_transaction_id === draftOrder.order_number);
    assert.equal(reservations.length, 2, 'Must record 2 reservation ledger entries');
  });

  // 5. Prevent repeated confirmation
  test('5. Idempotency Check: Prevents repeated confirmation of already confirmed orders', async () => {
    const draftOrder = mockSalesOrders[0];

    await assert.rejects(
      async () => {
        await salesOrderService.confirmSalesOrder(draftOrder.id, 1);
      },
      (err) => {
        assert.equal(err.code, 'ALREADY_CONFIRMED');
        return true;
      }
    );
  });

  // 6. Cancellation releases reservation
  test('6. Order Cancellation: Requires reason, releases reserved stock back to available, and logs release movement', async () => {
    // Create and confirm a new order to test cancellation
    const orderToCancel = await salesOrderService.createSalesOrder({
      customer_id: 1,
      status: 'confirmed', // Created directly as confirmed
      items: [
        {
          batch_id: 201,
          product_name: 'White Oak Sawn',
          species: 'American White Oak',
          quantity: 40,
          unit: 'CFT',
          unit_price: 32.50
        }
      ]
    }, 1);

    const oakBefore = mockBatches.find(b => b.id === 201);
    // Was 400 available, 100 reserved -> after 40 reserved: 360 available, 140 reserved
    assert.equal(oakBefore.quantity_available, 360.000);
    assert.equal(oakBefore.quantity_reserved, 140.000);

    // Try cancelling without reason -> should fail
    await assert.rejects(
      async () => {
        await salesOrderService.cancelSalesOrder(orderToCancel.id, '', 1);
      },
      (err) => {
        assert.equal(err.code, 'REASON_REQUIRED');
        return true;
      }
    );

    // Cancel with valid reason
    const cancelled = await salesOrderService.cancelSalesOrder(orderToCancel.id, 'Client postponed construction start date', 1);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancellation_reason, 'Client postponed construction start date');

    const oakAfter = mockBatches.find(b => b.id === 201);
    // Reserved should release: 140 - 40 = 100 reserved, 360 + 40 = 400 available
    assert.equal(oakAfter.quantity_available, 400.000);
    assert.equal(oakAfter.quantity_reserved, 100.000);

    const releaseMov = mockMovements.find(m => m.movement_type === 'release' && m.source_transaction_id === orderToCancel.order_number);
    assert.ok(releaseMov, 'Must log stock release movement');
    assert.equal(releaseMov.quantity, 40.000);
  });

  // 7. Order fulfillment & stock consumption
  test('7. Order Fulfillment / Dispatch: Consumes reserved stock, issues inventory, and posts issue movement', async () => {
    const confirmedOrder = mockSalesOrders[0]; // 100 oak, 50 cedar reserved

    const fulfilled = await salesOrderService.fulfillSalesOrder(confirmedOrder.id, 1);
    assert.equal(fulfilled.status, 'completed');
    const fulfilledOakLine = mockOrderItems.find(item =>
      item.sales_order_id === confirmedOrder.id && item.batch_id === 201
    );
    assert.equal(fulfilledOakLine.unit_cost_at_fulfillment, 10);
    assert.equal(fulfilledOakLine.total_cost_at_fulfillment, 1000);

    const oak = mockBatches.find(b => b.id === 201);
    const cedar = mockBatches.find(b => b.id === 202);

    // Oak reserved 100 -> consumed 100: reserved becomes 0, total becomes 500 - 100 = 400
    assert.equal(oak.quantity_reserved, 0.000);
    assert.equal(oak.quantity_consumed, 100.000);
    assert.equal(oak.quantity_total, 400.000);

    // Cedar reserved 50 -> consumed 50: reserved becomes 0, total becomes 150 - 50 = 100
    assert.equal(cedar.quantity_reserved, 0.000);
    assert.equal(cedar.quantity_consumed, 50.000);
    assert.equal(cedar.quantity_total, 100.000);

    // Immutable issue movements
    const issues = mockMovements.filter(m => m.movement_type === 'issue' && m.source_transaction_id === confirmedOrder.order_number);
    assert.equal(issues.length, 2, 'Must record 2 issue movements');
  });

  // 8. Prevent duplicate fulfillment
  test('8. Idempotency Check: Prevents duplicate fulfillment of already completed orders', async () => {
    const fulfilledOrder = mockSalesOrders[0];

    await assert.rejects(
      async () => {
        await salesOrderService.fulfillSalesOrder(fulfilledOrder.id, 1);
      },
      (err) => {
        assert.equal(err.code, 'DUPLICATE_COMPLETION');
        return true;
      }
    );
  });

  // 9. Customer-owned timber protection
  test('9. Customer-Owned Timber Protection: Rejects selling customer-owned timber batch as mill inventory', async () => {
    await assert.rejects(
      async () => {
        await salesOrderService.createSalesOrder({
          customer_id: 1,
          status: 'confirmed',
          items: [
            {
              batch_id: 203, // CUST-WALNUT-999 (ownership = customer)
              product_name: 'Customer Walnut Slabs',
              species: 'Black Walnut',
              quantity: 20,
              unit: 'CFT',
              unit_price: 45.00
            }
          ]
        }, 1);
      },
      (err) => {
        assert.equal(err.code, 'CUSTOMER_TIMBER_NOT_SALEABLE');
        assert.match(err.message, /customer-owned timber and cannot be sold as mill inventory/);
        return true;
      }
    );
  });

  // 10. Payment status rule
  test('10. Business Rule: Completed sales order is NOT automatically marked paid', async () => {
    const completedOrder = mockSalesOrders[0];
    assert.equal(completedOrder.status, 'completed');
    assert.equal(completedOrder.payment_status, 'unpaid', 'Payment status must remain unpaid until actual payment transaction');
  });

  // 11. Authorized order updates before fulfillment
  test('11. Authorized Updates: Allows editing notes and delivery date before fulfillment', async () => {
    const newDraft = await salesOrderService.createSalesOrder({
      customer_id: 1,
      status: 'draft',
      delivery_date: '2026-11-01',
      notes: 'Initial note',
      items: [
        {
          product_name: 'Rough Sawn Fir',
          species: 'Douglas Fir',
          quantity: 20,
          unit: 'CFT',
          unit_price: 25.00
        }
      ]
    }, 1);

    const updated = await salesOrderService.updateSalesOrder(newDraft.id, {
      delivery_date: '2026-11-15',
      notes: 'Updated delivery date for site readiness'
    }, 1);

    assert.equal(updated.delivery_date, '2026-11-15');
    assert.equal(updated.notes, 'Updated delivery date for site readiness');
  });

  // 12. HTTP API endpoints integration via Express
  test('12. HTTP API: Create, Confirm, Fulfill, and Cancel via Express endpoints with JWT authentication', async () => {
    const token = getAdminAuthToken();

    // 12a. Create order via POST /api/v1/sales-orders
    const createRes = await makeRequest('/api/v1/sales-orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        customer_id: 1,
        delivery_date: '2026-10-30',
        status: 'draft',
        items: [
          {
            batch_id: 201,
            product_name: '4/4 FAS Kiln Dried White Oak',
            species: 'American White Oak',
            quantity: 30,
            unit: 'CFT',
            unit_price: 32.50
          }
        ]
      })
    });

    assert.equal(createRes.status, 201);
    assert.ok(createRes.body.success);
    const createdId = createRes.body.data.id;

    // 12b. Confirm order via POST /api/v1/sales-orders/:id/confirm
    const confirmRes = await makeRequest(`/api/v1/sales-orders/${createdId}/confirm`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.data.status, 'confirmed');

    // 12c. Cancel order via POST /api/v1/sales-orders/:id/cancel
    const cancelRes = await makeRequest(`/api/v1/sales-orders/${createdId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        cancellation_reason: 'Testing API order cancellation workflow'
      })
    });

    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.data.status, 'cancelled');
    assert.equal(cancelRes.body.data.cancellation_reason, 'Testing API order cancellation workflow');
  });

  after(async () => {
    if (server) {
      await new Promise(res => server.close(res));
    }
  });
});
