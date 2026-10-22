'use strict';
/**
 * test/purchases.test.js
 *
 * Automated tests for Customer, Supplier, and Purchase modules:
 *   1. Purchase draft creation with multiple items & volumetric calculation
 *   2. Verifies purchase draft does NOT create inventory batches or stock movements
 *   3. Goods receipt processing generates traceable timber batches & stock movements
 *   4. Duplicate receipt attempts are blocked with 400 DUPLICATE_RECEIPT error
 *   5. Validation of invalid supplier IDs and item quantities
 *   6. Customer creation, search, and dynamic outstanding balance calculation
 *   7. Supplier creation, search, and purchase history tracking
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '5099';
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
    permissions: 'manage_users,view_inventory,manage_inventory,manage_purchases,manage_invoices',
  },
];

let mockCustomers = [];
let mockSuppliers = [];
let mockPurchases = [];
let mockPurchaseItems = [];
let mockBatches = [];
let mockMovements = [];
let mockInvoices = [];
let mockPayments = [];

let nextCustId = 1;
let nextSupId = 1;
let nextPurchaseId = 1;
let nextItemId = 1;
let nextBatchId = 1;
let nextMovementId = 1;

// Row lock simulation for transaction testing
const lockedPurchaseIds = new Set();

// Mock query router
db.query = async (sql, params = []) => {
  const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  // 1. Auth check
  if (norm.includes('from users u') && norm.includes('where u.id = ?')) {
    const id = Number(params[0]);
    const u = mockUsers.find(x => x.id === id);
    return [u ? [u] : []];
  }

  // 2. Customers
  if (norm.startsWith('insert into customers')) {
    const id = nextCustId++;
    const record = {
      id,
      name: params[0],
      contact_person: params[1],
      company_name: params[2],
      email: params[3],
      phone: params[4],
      type: params[5],
      address: params[6],
      city: params[7],
      tax_gst_number: params[8],
      credit_limit: Number(params[9]),
      payment_terms: params[10],
      status: params[11],
      notes: params[12],
      created_at: new Date().toISOString(),
    };
    mockCustomers.push(record);
    return [{ insertId: id, affectedRows: 1 }];
  }

  if (norm.includes('count(*) as total from customers')) {
    return [[{ total: mockCustomers.length }]];
  }
  if (norm.includes('from customers c where c.id = ?')) {
    const id = Number(params[0]);
    const c = mockCustomers.find(x => x.id === id);
    if (!c) return [[]];
    // Calculate live balance
    const custInvoices = mockInvoices.filter(i => i.customer_id === id);
    const totalInvoiced = custInvoices.reduce((s, i) => s + Number(i.grand_total || 0), 0);
    const custPayments = mockPayments.filter(p => p.customer_id === id && p.type === 'customer_payment');
    const totalPaid = custPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

    return [[{
      ...c,
      orders_count: 0,
      total_invoiced: totalInvoiced,
      total_paid: totalPaid,
      outstanding_balance: totalInvoiced - totalPaid,
    }]];
  }
  if (norm.includes('from customers c')) {
    return [mockCustomers.map(c => {
      const custInvoices = mockInvoices.filter(i => i.customer_id === c.id);
      const totalInvoiced = custInvoices.reduce((s, i) => s + Number(i.grand_total || 0), 0);
      const custPayments = mockPayments.filter(p => p.customer_id === c.id && p.type === 'customer_payment');
      const totalPaid = custPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
      return {
        ...c,
        orders_count: 0,
        total_invoiced: totalInvoiced,
        total_paid: totalPaid,
        outstanding_balance: totalInvoiced - totalPaid,
      };
    })];
  }
  if (norm.includes('from sawing_jobs sj where sj.customer_id = ?')) {
    return [[]];
  }
  if (norm.includes('from invoices i where i.customer_id = ?')) {
    const id = Number(params[0]);
    return [mockInvoices.filter(i => i.customer_id === id)];
  }

  // 3. Suppliers
  if (norm.startsWith('insert into suppliers')) {
    const id = nextSupId++;
    const record = {
      id,
      company_name: params[0],
      rep_name: params[1],
      phone: params[2],
      email: params[3],
      region: params[4],
      specialty: params[5],
      payment_terms: params[6],
      status: params[7],
      rating: Number(params[8]),
      address: params[9],
      tax_id: params[10],
      notes: params[11],
      created_at: new Date().toISOString(),
    };
    mockSuppliers.push(record);
    return [{ insertId: id, affectedRows: 1 }];
  }

  if (norm.includes('count(*) as total from suppliers')) {
    return [[{ total: mockSuppliers.length }]];
  }
  if (norm.includes('from suppliers s where s.id = ?')) {
    const id = Number(params[0]);
    const s = mockSuppliers.find(x => x.id === id);
    if (!s) return [[]];
    const supPurchases = mockPurchases.filter(p => p.supplier_id === id);
    const totalPurchased = supPurchases.reduce((sum, p) => sum + Number(p.total_cost || 0), 0);
    const totalPaid = supPurchases.reduce((sum, p) => sum + Number(p.paid_amount || 0), 0);
    return [[{
      ...s,
      purchases_count: supPurchases.length,
      total_purchased: totalPurchased,
      total_paid: totalPaid,
      balance_due: totalPurchased - totalPaid,
    }]];
  }
  if (norm.includes('from suppliers s')) {
    return [mockSuppliers.map(s => {
      const supPurchases = mockPurchases.filter(p => p.supplier_id === s.id);
      const totalPurchased = supPurchases.reduce((sum, p) => sum + Number(p.total_cost || 0), 0);
      const totalPaid = supPurchases.reduce((sum, p) => sum + Number(p.paid_amount || 0), 0);
      return {
        ...s,
        purchases_count: supPurchases.length,
        total_purchased: totalPurchased,
        total_paid: totalPaid,
        balance_due: totalPurchased - totalPaid,
      };
    })];
  }
  if (norm.includes('from purchases p where p.supplier_id = ?')) {
    const id = Number(params[0]);
    return [mockPurchases.filter(p => p.supplier_id === id)];
  }

  // 4. Purchases
  if (norm.includes('count(*) as total from purchases p join suppliers s')) {
    return [[{ total: mockPurchases.length }]];
  }
  if (norm.includes('select purchase_number from purchases where purchase_number like ?')) {
    const sorted = [...mockPurchases].sort((a, b) => b.id - a.id);
    return [sorted.length > 0 ? [{ purchase_number: sorted[0].purchase_number }] : []];
  }
  if (norm.includes('from purchases p join suppliers s') && norm.includes('where p.id = ?')) {
    const id = Number(params[0]);
    const p = mockPurchases.find(x => x.id === id);
    if (!p) return [[]];
    const s = mockSuppliers.find(x => x.id === p.supplier_id);
    return [[{
      ...p,
      supplier_name: s ? s.company_name : 'Unknown Supplier',
      supplier_contact: s ? s.rep_name : '',
      supplier_phone: s ? s.phone : '',
      supplier_email: s ? s.email : '',
      received_by_username: 'admin',
    }]];
  }
  if (norm.includes('from purchase_items where purchase_id = ?')) {
    const pId = Number(params[0]);
    return [mockPurchaseItems.filter(it => it.purchase_id === pId)];
  }
  if (norm.includes('from purchases p join suppliers s')) {
    return [mockPurchases.map(p => {
      const s = mockSuppliers.find(x => x.id === p.supplier_id);
      return {
        ...p,
        supplier_name: s ? s.company_name : 'Unknown Supplier',
        supplier_contact: s ? s.rep_name : '',
        supplier_phone: s ? s.phone : '',
        supplier_email: s ? s.email : '',
      };
    })];
  }

  // Audit logs & insertions
  if (norm.includes('insert into audit_logs')) {
    return [{ insertId: 1 }];
  }

  return [[]];
};

// Mock withTransaction
db.withTransaction = async (callback) => {
  const conn = {
    execute: async (sql, params = []) => {
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      // Purchase Number generator query
      if (norm.includes('select purchase_number from purchases where purchase_number like ?')) {
        const sorted = [...mockPurchases].sort((a, b) => b.id - a.id);
        return [sorted.length > 0 ? [{ purchase_number: sorted[0].purchase_number }] : []];
      }

      // Lock row FOR UPDATE
      if (norm.includes('select * from purchases where id = ? for update')) {
        const id = Number(params[0]);
        if (lockedPurchaseIds.has(id)) {
          throw new Error('Lock wait timeout exceeded');
        }
        lockedPurchaseIds.add(id);
        const p = mockPurchases.find(x => x.id === id);
        return [p ? [p] : []];
      }

      // Fetch items in transaction
      if (norm.includes('select * from purchase_items where purchase_id = ?')) {
        const pId = Number(params[0]);
        return [mockPurchaseItems.filter(it => it.purchase_id === pId)];
      }

      // Insert purchase
      if (norm.startsWith('insert into purchases')) {
        const id = nextPurchaseId++;
        const record = {
          id,
          purchase_number: params[0],
          supplier_id: Number(params[1]),
          status: params[2],
          payment_status: params[3],
          payment_method: params[4],
          expected_delivery_date: params[5],
          actual_delivery_date: params[6],
          subtotal: Number(params[7]),
          discount_amount: Number(params[8]),
          tax_rate: Number(params[9]),
          tax_amount: Number(params[10]),
          total_cost: Number(params[11]),
          paid_amount: Number(params[12]),
          invoice_ref: params[13],
          notes: params[14],
          created_at: new Date().toISOString(),
        };
        mockPurchases.push(record);
        return [{ insertId: id }];
      }

      // Insert purchase item
      if (norm.startsWith('insert into purchase_items')) {
        const id = nextItemId++;
        const record = {
          id,
          purchase_id: Number(params[0]),
          timber_type: params[1],
          species: params[2],
          wood_type_id: params[3],
          grade: params[4],
          dimensions_text: params[5],
          length_feet: Number(params[6]),
          width_inches: Number(params[7]),
          thickness_inches: Number(params[8]),
          girth_inches: Number(params[9]),
          pieces_count: Number(params[10]),
          volume_cbf: Number(params[11]),
          unit: params[12],
          unit_price: Number(params[13]),
          total_price: Number(params[14]),
          generated_batch_id: null,
          received_at: null,
        };
        mockPurchaseItems.push(record);
        return [{ insertId: id }];
      }

      // Insert timber_batch during receipt
      if (norm.startsWith('insert into timber_batches')) {
        const id = nextBatchId++;
        const batch = {
          id,
          batch_code: params[0],
          name: params[1],
          timber_type: params[2],
          category: params[3],
          species: params[4],
          wood_type_id: params[5],
          grade: params[6],
          dimensions_text: params[7],
          length_feet: Number(params[8]),
          width_inches: Number(params[9]),
          thickness_inches: Number(params[10]),
          girth_inches: Number(params[11]),
          unit: params[12],
          pieces_count: Number(params[13]),
          calculated_volume_cbf: Number(params[14]),
          calculated_board_feet: Number(params[15]),
          quantity_total: Number(params[16]),
          quantity_available: Number(params[17]),
          quantity_reserved: 0,
          quantity_consumed: 0,
          ownership: 'mill',
          status: 'In Stock',
          yard_location: params[18],
          cost_price: Number(params[19]),
          selling_price: Number(params[20]),
          notes: params[21],
        };
        mockBatches.push(batch);
        return [{ insertId: id }];
      }

      // Insert stock_movement
      if (norm.startsWith('insert into stock_movements')) {
        const id = nextMovementId++;
        const movement = {
          id,
          batch_id: Number(params[0]),
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
          created_at: new Date().toISOString(),
        };
        mockMovements.push(movement);
        return [{ insertId: id }];
      }

      // Update purchase items with batch ID
      if (norm.startsWith('update purchase_items set generated_batch_id')) {
        const batchId = Number(params[0]);
        const itemId = Number(params[1]);
        const item = mockPurchaseItems.find(x => x.id === itemId);
        if (item) {
          item.generated_batch_id = batchId;
          item.received_at = new Date().toISOString();
        }
        return [{ affectedRows: 1 }];
      }

      // Update purchase to received
      if (norm.startsWith('update purchases set status = \'received\'')) {
        const deliveryDate = params[0] || new Date().toISOString().split('T')[0];
        const receivedById = Number(params[1]);
        const purchaseId = Number(params[2]);
        const p = mockPurchases.find(x => x.id === purchaseId);
        if (p) {
          p.status = 'received';
          p.actual_delivery_date = deliveryDate;
          p.received_by_id = receivedById;
        }
        return [{ affectedRows: 1 }];
      }

      return [{ affectedRows: 0, insertId: 0 }];
    },
  };

  try {
    return await callback(conn);
  } finally {
    lockedPurchaseIds.clear();
  }
};

// Import services and controllers
const customerService = require('../src/services/customerService');
const supplierService = require('../src/services/supplierService');
const purchaseService = require('../src/services/purchaseService');
const app = require('../src/server');

let server;
let adminToken;
let baseUrl;

before(async () => {
  // Start server on dynamic port
  server = app.listen(0);
  await new Promise(res => server.once('listening', res));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  adminToken = jwt.sign(
    { sub: 1, email: 'admin@sawmill.local', role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h', issuer: 'sawmill-api' }
  );
});

after(async () => {
  if (server) {
    await new Promise(res => server.close(res));
  }
});

describe('Sawmill Customer, Supplier, and Purchase Modules', () => {

  test('1. Customer Creation, Search, and Live Balance Calculation', async () => {
    // 1. Create a customer
    const newCust = await customerService.createCustomer({
      name: 'Timberline Construction Group',
      contactPerson: 'David Miller',
      phone: '+1-555-0199',
      email: 'david@timberline.example.com',
      creditLimit: 75000,
      paymentTerms: 'Net 30',
    }, 1);

    assert.ok(newCust.id, 'Customer ID should be generated');
    assert.equal(newCust.name, 'Timberline Construction Group');
    mockCustomers.push(newCust);

    // 2. Add sample invoice and payment to simulate financial records
    mockInvoices.push({
      id: 1,
      invoice_number: 'INV-2026-001',
      customer_id: newCust.id,
      grand_total: 12500.00,
      payment_status: 'partially_paid',
      due_date: '2026-11-01',
    });
    mockInvoices.push({
      id: 2,
      invoice_number: 'INV-2026-002',
      customer_id: newCust.id,
      grand_total: 8000.00,
      payment_status: 'unpaid',
      due_date: '2026-11-15',
    });
    mockPayments.push({
      id: 1,
      payment_number: 'PAY-2026-001',
      customer_id: newCust.id,
      type: 'customer_payment',
      amount: 5000.00,
    });

    // 3. Retrieve customer details with live calculated balance
    const details = await customerService.getCustomerDetails(newCust.id);
    assert.equal(Number(details.total_invoiced), 20500.00, 'Total invoiced should be 12500 + 8000 = 20500');
    assert.equal(Number(details.total_paid), 5000.00, 'Total paid should be 5000');
    assert.equal(Number(details.outstanding_balance), 15500.00, 'Outstanding balance should be 20500 - 5000 = 15500');
    assert.equal(details.invoices.length, 2, 'Should return customer invoice history');
  });

  test('2. Supplier Creation and Purchase Obligation Tracking', async () => {
    // Create supplier
    const newSup = await supplierService.createSupplier({
      companyName: 'Olympic Timber Reserves',
      repName: 'Sarah Jenkins',
      phone: '+1-555-8822',
      email: 's.jenkins@olympic-timber.example.com',
      region: 'Pacific Northwest',
      specialty: 'Douglas Fir Heavy Sawlogs',
      paymentTerms: 'Net 30 Days',
    }, 1);

    assert.ok(newSup.id, 'Supplier ID should be generated');
    assert.equal(newSup.company_name, 'Olympic Timber Reserves');
    mockSuppliers.push(newSup);

    const retrieved = await supplierService.getSupplierDetails(newSup.id);
    assert.equal(retrieved.company_name, 'Olympic Timber Reserves');
    assert.equal(Number(retrieved.purchases_count), 0, 'No purchases initially');
  });

  test('3. Purchase Draft Creation (Multi-Item & Volumetric Calculations)', async () => {
    const supplier = mockSuppliers[0];
    const initialBatchesCount = mockBatches.length;
    const initialMovementsCount = mockMovements.length;

    // Create purchase draft with multiple items
    const po = await purchaseService.createPurchase({
      supplier_id: supplier.id,
      status: 'draft',
      payment_status: 'pending',
      tax_rate: 10, // 10% tax
      discount_amount: 500, // $500 discount
      items: [
        {
          timber_type: 'raw_log',
          species: 'Douglas Fir Sawlogs',
          grade: 'Grade A',
          length_feet: 16,
          girth_inches: 48,
          pieces_count: 10,
          unit_price: 45.00, // $45 / CFT
        },
        {
          timber_type: 'sawn_timber',
          species: 'Western Red Cedar Beams',
          grade: 'Select Structural',
          length_feet: 12,
          width_inches: 8,
          thickness_inches: 4,
          pieces_count: 20,
          unit_price: 38.00,
        }
      ]
    }, 1);

    assert.ok(po.id, 'Purchase order ID should exist');
    assert.ok(po.purchase_number.startsWith('PO-'), 'Unique purchase number generated');
    assert.equal(po.status, 'draft', 'Status should be draft');

    // Volume assertions:
    // Item 1: Hoppus Quarter Girth for 48" girth, 16 ft, 10 logs:
    // Single log CFT = ((48/4)^2 * 16)/144 = (144 * 16)/144 = 16 CFT * 10 = 160 CFT
    // Item 2: Rectangular (4" * 8" * 12' * 20) / 144 = 53.333 CFT
    const items = po.items;
    assert.equal(items.length, 2, 'Should contain 2 line items');
    assert.equal(Number(items[0].volume_cbf), 160.000, 'Raw log Hoppus volume calculated correctly');
    assert.equal(Number(items[1].volume_cbf), 53.333, 'Rectangular volume calculated correctly');

    // Financial calculations:
    // Subtotal = (160 * 45) + (53.333 * 38) = 7200 + 2026.65 = 9226.65
    // Taxable = 9226.65 - 500 = 8726.65
    // Tax (10%) = 872.67
    // Total = 8726.65 + 872.67 = 9599.32
    assert.ok(Number(po.subtotal) > 9200, 'Subtotal correctly computed from items');
    assert.equal(Number(po.discount_amount), 500.00);
    assert.ok(Number(po.total_cost) > 9500, 'Total cost accurately includes discounts and taxes');

    // CRITICAL REQUIREMENT VERIFICATION:
    // "Do not treat a purchase draft as received inventory."
    assert.equal(mockBatches.length, initialBatchesCount, 'Draft purchase must NOT create timber batches');
    assert.equal(mockMovements.length, initialMovementsCount, 'Draft purchase must NOT create stock movements');
  });

  test('4. Goods Receipt Processing (Generates Timber Batches & Stock Movements)', async () => {
    const po = mockPurchases[0];
    const initialBatchesCount = mockBatches.length;
    const initialMovementsCount = mockMovements.length;

    // Process goods receipt intake
    const receiptResult = await purchaseService.receivePurchaseGoods(
      po.id,
      {
        deliveryDate: '2026-10-19',
        yardLocation: 'Yard Bay A-2',
        notes: 'Truck shipment arrived. Logs inspected and approved.',
      },
      1 // userId: 1
    );

    assert.ok(receiptResult.receiptSummary, 'Receipt summary returned');
    assert.equal(receiptResult.receiptSummary.purchaseNumber, po.purchase_number);
    assert.equal(receiptResult.purchase.status, 'received', 'Purchase status transitioned to received');

    // Verify traceable timber batches were generated:
    // PO had 2 items => 2 new batches in timber_batches
    assert.equal(mockBatches.length, initialBatchesCount + 2, 'Timber batches created for each received line item');

    const batch1 = mockBatches[initialBatchesCount];
    assert.ok(batch1.batch_code.startsWith(`BATCH-${po.purchase_number}`), 'Batch code is traceable to PO');
    assert.equal(batch1.species, 'Douglas Fir Sawlogs');
    assert.equal(batch1.timber_type, 'raw_log');
    assert.equal(Number(batch1.quantity_available), 160.000, 'Batch stock level matches scaled volume');
    assert.equal(batch1.status, 'In Stock');

    const batch2 = mockBatches[initialBatchesCount + 1];
    assert.equal(batch2.species, 'Western Red Cedar Beams');
    assert.equal(batch2.timber_type, 'sawn_timber');
    assert.equal(Number(batch2.quantity_available), 53.333);

    // Verify stock movement ledger entries:
    assert.equal(mockMovements.length, initialMovementsCount + 2, 'Immutable stock movements recorded in ledger');
    const m1 = mockMovements[initialMovementsCount];
    assert.equal(m1.batch_id, batch1.id);
    assert.equal(m1.movement_type, 'receipt');
    assert.equal(m1.source_transaction_type, 'purchase');
    assert.equal(m1.source_transaction_id, po.purchase_number);

    // Verify purchase items now reference the generated batches
    const updatedItems = mockPurchaseItems.filter(it => it.purchase_id === po.id);
    assert.equal(updatedItems[0].generated_batch_id, batch1.id);
    assert.ok(updatedItems[0].received_at, 'Line item received_at timestamp recorded');
  });

  test('5. Prevent Duplicate Goods Receipt Attempts (Idempotency Protection)', async () => {
    const po = mockPurchases[0];
    const batchesCountBefore = mockBatches.length;
    const movementsCountBefore = mockMovements.length;

    // Attempting to receive an already received PO MUST throw 400 DUPLICATE_RECEIPT
    await assert.rejects(
      async () => {
        await purchaseService.receivePurchaseGoods(po.id, {}, 1);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.errorCode, 'DUPLICATE_RECEIPT');
        assert.match(err.message, /already been received/i);
        return true;
      },
      'Should throw 400 DUPLICATE_RECEIPT error on second receipt attempt'
    );

    // Verify no duplicate batches or ledger movements were added
    assert.equal(mockBatches.length, batchesCountBefore, 'No duplicate batches created on rejected attempt');
    assert.equal(mockMovements.length, movementsCountBefore, 'No duplicate stock movements created');
  });

  test('6. Validation: Reject Purchase with Invalid Supplier or Missing Items', async () => {
    // 1. Missing supplier
    await assert.rejects(
      async () => {
        await purchaseService.createPurchase({ items: [{ species: 'Pine', volume_cbf: 50 }] }, 1);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );

    // 2. Non-existent supplier ID
    await assert.rejects(
      async () => {
        await purchaseService.createPurchase({ supplier_id: 99999, items: [{ species: 'Pine' }] }, 1);
      },
      (err) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.errorCode, 'SUPPLIER_NOT_FOUND');
        return true;
      }
    );

    // 3. Empty items array
    await assert.rejects(
      async () => {
        await purchaseService.createPurchase({ supplier_id: 1, items: [] }, 1);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  test('7. HTTP API: Create and Receive Purchase Order via Express Endpoint', async () => {
    // 1. Create via POST /api/v1/purchases
    const createRes = await fetch(`${baseUrl}/api/v1/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        supplier_id: mockSuppliers[0].id,
        status: 'draft',
        items: [
          {
            timber_type: 'raw_log',
            species: 'Spruce Sawlogs',
            length_feet: 14,
            girth_inches: 40,
            pieces_count: 5,
            unit_price: 32.00,
          }
        ]
      })
    });

    const createJson = await createRes.json();
    assert.equal(createRes.status, 201);
    assert.equal(createJson.success, true);
    assert.ok(createJson.data.purchase_number);
    const poId = createJson.data.id;

    // 2. Receive via POST /api/v1/purchases/:id/receive
    const receiveRes = await fetch(`${baseUrl}/api/v1/purchases/${poId}/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        yardLocation: 'Bay C-1',
        notes: 'Inspected upon unloading'
      })
    });

    const receiveJson = await receiveRes.json();
    assert.equal(receiveRes.status, 200);
    assert.equal(receiveJson.success, true);
    assert.equal(receiveJson.data.purchase.status, 'received');

    // 3. Second call must return 400 DUPLICATE_RECEIPT
    const duplicateRes = await fetch(`${baseUrl}/api/v1/purchases/${poId}/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({})
    });

    const duplicateJson = await duplicateRes.json();
    assert.equal(duplicateRes.status, 400);
    assert.equal(duplicateJson.success, false);
    assert.equal(duplicateJson.code, 'DUPLICATE_RECEIPT');
  });

});
