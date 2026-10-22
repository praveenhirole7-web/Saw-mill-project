'use strict';
/**
 * test/inventory.test.js
 *
 * Automated tests for Saw Mill Timber Inventory module:
 *   1. Valid batch creation with automatic volume calculation (CFT & Board Feet)
 *   2. Raw log Hoppus Quarter-Girth calculation vs rectangular lumber calculation
 *   3. Filter batches by timber_type, species, and status
 *   4. Stock receipts (increases available & total, records in stock_movements)
 *   5. Stock issues (deducts available, records movement)
 *   6. Invalid quantity validation (rejects <= 0 quantities)
 *   7. Insufficient stock prevention (rejects overselling)
 *   8. Stock adjustment requires reason and audit trail
 *   9. Negative stock prevention (blocks negative stock unless authorized)
 *  10. Concurrent stock transactions (transactional row-locking prevents double-spend)
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

// In-memory mock inventory store
let mockBatches = [];
let mockMovements = [];
let nextBatchId = 1;
let nextMovementId = 1;

// Transaction lock simulation
let lockedBatchIds = new Set();

// Mock query router
db.query = async (sql, params = []) => {
  const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  // 1. SELECT user for authenticate middleware
  if (norm.includes('from users u') && norm.includes('where u.id = ?')) {
    const id = Number(params[0]);
    if (id === 1) {
      return [[{
        id: 1,
        username: 'admin',
        email: 'admin@sawmill.local',
        role: 'admin',
        status: 'active',
        permissions: 'manage_users,view_inventory,manage_inventory',
      }]];
    }
    return [[{
      id: 2,
      username: 'operator',
      email: 'operator@sawmill.local',
      role: 'operator',
      status: 'active',
      permissions: 'view_inventory',
    }]];
  }

  // 2. COUNT timber_batches
  if (norm.startsWith('select count(*) as total from timber_batches')) {
    return [[{ total: mockBatches.length }]];
  }

  // 3. SELECT single batch by id (MUST BE BEFORE LIST QUERY)
  if (norm.includes('where tb.id = ?')) {
    const id = Number(params[0]);
    const found = mockBatches.find(b => b.id === id);
    return [found ? [found] : []];
  }

  // 4. SELECT single batch by batch_code
  if (norm.includes('from timber_batches where lower(batch_code) = lower(?)')) {
    const code = String(params[0]).toLowerCase();
    const found = mockBatches.find(b => b.batch_code.toLowerCase() === code);
    return [found ? [found] : []];
  }

  // 5. SELECT timber_batches list
  if (norm.includes('from timber_batches tb')) {
    let items = [...mockBatches];
    if (norm.includes('tb.timber_type = ?')) {
      const type = params.find(p => p === 'raw_log' || p === 'sawn_timber');
      if (type) items = items.filter(b => b.timber_type === type);
    }
    return [items];
  }

  // 6. SELECT stock_movements
  if (norm.includes('from stock_movements sm where sm.batch_id = ?')) {
    const id = Number(params[0]);
    const found = mockMovements.filter(m => m.batch_id === id);
    return [found];
  }

  // 7. DELETE timber_batches
  if (norm.startsWith('delete from timber_batches where id = ?')) {
    const id = Number(params[0]);
    mockBatches = mockBatches.filter(b => b.id !== id);
    return [{ affectedRows: 1 }];
  }

  return [[]];
};

const batchLocks = new Map();

// Mock withTransaction supporting transactional row locking
db.withTransaction = async (callback) => {
  const releases = [];
  const mockConn = {
    execute: async (sql, params = []) => {
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      // SELECT FOR UPDATE (Row locking mutex)
      if (norm.includes('select * from timber_batches where id = ? for update')) {
        const id = Number(params[0]);

        while (batchLocks.has(id)) {
          await batchLocks.get(id);
        }

        let release;
        const p = new Promise(resolve => { release = resolve; });
        batchLocks.set(id, p);
        releases.push(() => {
          batchLocks.delete(id);
          release();
        });

        // Small simulated I/O delay so race conditions overlap
        await new Promise(r => setTimeout(r, 20));

        const found = mockBatches.find(b => b.id === id);
        return [found ? [{ ...found }] : []];
      }

      // INSERT INTO timber_batches
      if (norm.startsWith('insert into timber_batches')) {
        const newBatch = {
          id: nextBatchId++,
          batch_code: params[0],
          name: params[1],
          timber_type: params[2],
          category: params[3],
          species: params[4],
          wood_type_id: params[5],
          grade: params[6],
          dimensions_text: params[7],
          length_feet: params[8],
          width_inches: params[9],
          thickness_inches: params[10],
          girth_inches: params[11],
          unit: params[12],
          pieces_count: params[13],
          calculated_volume_cbf: params[14],
          calculated_board_feet: params[15],
          quantity_total: params[16],
          quantity_available: params[17],
          quantity_reserved: params[18],
          quantity_consumed: params[19],
          ownership: params[20],
          customer_id: params[21],
          status: params[22],
          yard_location: params[23],
          moisture_percent: params[24],
          min_stock_threshold: params[25],
          cost_price: params[26],
          selling_price: params[27],
          image_url: params[28],
          notes: params[29],
          created_at: new Date(),
          updated_at: new Date(),
        };
        mockBatches.push(newBatch);
        return [{ insertId: newBatch.id }];
      }

      // UPDATE timber_batches SET quantity_total
      if (norm.includes('update timber_batches set quantity_total = ?')) {
        const total = params[0];
        const available = params[1];
        const reserved = params[2];
        const consumed = params[3];
        const status = params[4];
        const id = Number(params[5]);

        const b = mockBatches.find(x => x.id === id);
        if (b) {
          b.quantity_total = total;
          b.quantity_available = available;
          b.quantity_reserved = reserved;
          b.quantity_consumed = consumed;
          b.status = status;
          b.updated_at = new Date();
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      }

      // INSERT INTO stock_movements
      if (norm.startsWith('insert into stock_movements')) {
        const movement = {
          id: nextMovementId++,
          batch_id: Number(params[0]),
          movement_type: params[1],
          quantity: params[2],
          previous_quantity: params[3],
          new_quantity: params[4],
          unit: params[5],
          source_transaction_type: params[6],
          source_transaction_id: params[7],
          reason: params[8],
          authorized_by_id: params[9],
          allow_negative: params[10],
          notes: params[11],
          created_at: new Date(),
        };
        mockMovements.push(movement);
        return [{ insertId: movement.id }];
      }

      // Fallback query within transaction
      return db.query(sql, params);
    },
  };

  try {
    return await callback(mockConn);
  } finally {
    releases.forEach((r) => r());
  }
};

const app = require('../src/server');
let server;
let baseUrl;
let adminAuthHeader;
let operatorAuthHeader;

before(async () => {
  const adminToken = jwt.sign(
    { sub: 1, email: 'admin@sawmill.local', role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h', issuer: 'sawmill-api' }
  );
  adminAuthHeader = {
    Authorization: `Bearer ${adminToken}`,
    'X-Requested-With': 'XMLHttpRequest',
  };

  const operatorToken = jwt.sign(
    { sub: 2, email: 'operator@sawmill.local', role: 'operator' },
    process.env.JWT_SECRET,
    { expiresIn: '1h', issuer: 'sawmill-api' }
  );
  operatorAuthHeader = {
    Authorization: `Bearer ${operatorToken}`,
    'X-Requested-With': 'XMLHttpRequest',
  };

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function api(path, { method = 'GET', headers = {}, body = null } = {}) {
  const url = `${baseUrl}${path}`;
  const reqHeaders = { ...adminAuthHeader, ...headers };
  let reqBody = null;

  if (body) {
    reqHeaders['Content-Type'] = 'application/json';
    reqBody = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers: reqHeaders, body: reqBody });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

describe('Timber Inventory Module Tests', () => {

  test('1. Valid sawn timber batch creation: calculates volume correctly (T*W*L*P/144)', async () => {
    // 2" x 6" x 14 ft, 100 pieces
    // CFT = (2 * 6 * 14 * 100) / 144 = 116.667 CFT
    // BF  = (2 * 6 * 14 * 100) / 12  = 1400 BF
    const res = await api('/api/v1/inventory', {
      method: 'POST',
      body: {
        name: 'Douglas Fir 2x6 Joists',
        sku: 'DF-2X6-14FT',
        species: 'Douglas Fir',
        timber_type: 'sawn_timber',
        category: 'Dimensional Lumber',
        thickness_inches: 2,
        width_inches: 6,
        length_feet: 14,
        pieces_count: 100,
        quantity: 116.67,
        unit: 'CFT',
        sellingPrice: 52.0,
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.sku, 'DF-2X6-14FT');
    assert.equal(res.body.data.volumeCbf, 116.667);
    assert.equal(res.body.data.boardFeet, 1400);
    assert.equal(res.body.data.quantityAvailable, 116.67);

    // Verify initial stock movement logged
    const logged = mockMovements.find(m => m.batch_id === res.body.data.id);
    assert.ok(logged, 'Initial stock movement must be posted to ledger');
    assert.equal(logged.movement_type, 'receipt');
  });

  test('2. Valid raw round log creation: calculates Hoppus Quarter-Girth volume', async () => {
    // Length: 12 ft, Girth: 36 inches, 1 piece
    // Hoppus: (36/4)^2 * 12 / 144 = 81 * 12 / 144 = 6.75 CFT
    const res = await api('/api/v1/inventory', {
      method: 'POST',
      body: {
        name: 'Burmese Teak Round Log #101',
        sku: 'LOG-TEAK-101',
        species: 'Teak',
        timber_type: 'raw_log',
        category: 'Round Logs',
        length_feet: 12,
        girth_inches: 36,
        pieces_count: 1,
        quantity: 6.75,
        unit: 'CFT',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.volumeCbf, 6.75);
    assert.equal(res.body.data.timberType, 'raw_log');
  });

  test('3. Invalid creation data: rejected when name or species missing', async () => {
    const res = await api('/api/v1/inventory', {
      method: 'POST',
      body: {
        sku: 'BAD-BATCH',
        quantity: 10,
      },
    });

    assert.equal(res.status, 422);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  test('Rejects unsupported units and incomplete wood measurements', async () => {
    const unsupportedUnit = await api('/api/v1/inventory', {
      method: 'POST',
      body: {
        name: 'Teak boards',
        sku: 'TEAK-BAD-UNIT',
        species: 'Teak',
        timber_type: 'sawn_timber',
        quantity: 10,
        unit: 'Buckets',
        thickness_inches: 2,
        width_inches: 6,
        length_feet: 10,
      },
    });
    assert.equal(unsupportedUnit.status, 422);
    assert.equal(unsupportedUnit.body.code, 'VALIDATION_ERROR');

    const missingDimensions = await api('/api/v1/inventory', {
      method: 'POST',
      body: {
        name: 'Teak boards',
        sku: 'TEAK-MISSING-DIMENSIONS',
        species: 'Teak',
        timber_type: 'sawn_timber',
        quantity: 10,
        unit: 'CFT',
        thickness_inches: 2,
        length_feet: 10,
      },
    });
    assert.equal(missingDimensions.status, 422);
    assert.equal(missingDimensions.body.code, 'VALIDATION_ERROR');
  });

  test('Keeps selected stock units separate from calculated wood volume', async () => {
    const cubicMetres = await api('/api/v1/inventory', {
      method: 'POST',
      body: {
        name: 'Teak boards',
        sku: 'TEAK-CUBIC-METRES',
        species: 'Teak',
        timber_type: 'sawn_timber',
        thickness_inches: 2,
        width_inches: 6,
        length_feet: 10,
        quantity: 3.25,
        unit: 'Cubic metres (m³)',
      },
    });
    assert.equal(cubicMetres.status, 201);
    assert.equal(cubicMetres.body.data.unit, 'Cubic metres (m³)');
    assert.equal(cubicMetres.body.data.quantityAvailable, 3.25);
    assert.equal(cubicMetres.body.data.volumeCbf, 0.833);

    const kilograms = await api('/api/v1/inventory', {
      method: 'POST',
      body: {
        name: 'Neem wood',
        sku: 'NEEM-KILOGRAMS',
        species: 'Neem',
        timber_type: 'sawn_timber',
        thickness_inches: 2,
        width_inches: 6,
        length_feet: 10,
        quantity: 75,
        unit: 'Kilograms (kg)',
      },
    });
    assert.equal(kilograms.status, 201);
    assert.equal(kilograms.body.data.unit, 'Kilograms (kg)');
    assert.equal(kilograms.body.data.quantityAvailable, 75);
  });

  test('4. Record stock receipt: increases available and total stock with audit ledger', async () => {
    const batchId = mockBatches[0].id;
    const initialQty = mockBatches[0].quantity_available;

    const res = await api(`/api/v1/inventory/${batchId}/receipt`, {
      method: 'POST',
      body: {
        quantity: 25,
        reason: 'Procurement shipment PO-771 received',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.quantityAvailable, initialQty + 25);
    assert.equal(res.body.data.quantityTotal, initialQty + 25);

    // Verify movement recorded
    const movement = mockMovements.find(m => Number(m.batch_id) === Number(batchId) && m.reason.includes('PO-771'));
    assert.ok(movement, 'Receipt movement must be recorded in ledger');
  });

  test('5. Record stock issue: deducts stock correctly', async () => {
    const batchId = mockBatches[0].id;
    const initialQty = mockBatches[0].quantity_available;

    const res = await api(`/api/v1/inventory/${batchId}/issue`, {
      method: 'POST',
      body: {
        quantity: 10,
        reason: 'Sales order dispatch SO-1029',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.quantityAvailable, initialQty - 10);
  });

  test('6. Invalid quantity rejected: zero or negative quantity for receipt/issue', async () => {
    const batchId = mockBatches[0].id;

    const res = await api(`/api/v1/inventory/${batchId}/receipt`, {
      method: 'POST',
      body: {
        quantity: -5,
        reason: 'Invalid negative receipt',
      },
    });

    assert.equal(res.status, 422);
    assert.equal(res.body.success, false);
  });

  test('7. Insufficient stock prevention: rejects issue exceeding available quantity', async () => {
    const batchId = mockBatches[0].id;
    const available = mockBatches[0].quantity_available;

    const res = await api(`/api/v1/inventory/${batchId}/issue`, {
      method: 'POST',
      body: {
        quantity: available + 500, // exceeds stock
        reason: 'Oversell attempt',
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'INSUFFICIENT_STOCK');
  });

  test('8. Stock adjustment requires valid explanation reason', async () => {
    const batchId = mockBatches[0].id;

    const res = await api(`/api/v1/inventory/${batchId}/adjust`, {
      method: 'POST',
      body: {
        adjustment_type: 'add',
        quantity: 5,
        reason: '', // missing reason
      },
    });

    assert.equal(res.status, 422);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  test('9. Negative stock prevention: blocks adjustment resulting in negative stock', async () => {
    const batchId = mockBatches[0].id;
    const available = mockBatches[0].quantity_available;

    const res = await api(`/api/v1/inventory/${batchId}/adjust`, {
      method: 'POST',
      body: {
        adjustment_type: 'deduct',
        quantity: available + 100,
        reason: 'Yard loss inspection',
        allow_negative: false,
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'NEGATIVE_STOCK_NOT_ALLOWED');
  });

  test('10. Concurrent stock transactions: prevents double-spend / overselling', async () => {
    // Create dedicated batch with exactly 50 CFT available
    const createRes = await api('/api/v1/inventory', {
      method: 'POST',
      body: {
        name: 'Concurrent Race Test Planks',
        sku: 'RACE-TEST-001',
        species: 'Oak',
        quantity: 50,
        unit: 'CFT',
      },
    });

    const testBatchId = createRes.body.data.id;

    // Send two concurrent issue requests of 35 CFT each (total 70 CFT, but only 50 available)
    const [res1, res2] = await Promise.all([
      api(`/api/v1/inventory/${testBatchId}/issue`, {
        method: 'POST',
        body: { quantity: 35, reason: 'Concurrent Buyer 1' },
      }),
      api(`/api/v1/inventory/${testBatchId}/issue`, {
        method: 'POST',
        body: { quantity: 35, reason: 'Concurrent Buyer 2' },
      }),
    ]);

    // Exactly one must succeed (200) and one must be rejected (400 INSUFFICIENT_STOCK)
    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [200, 400], 'One request must succeed and the other must fail due to lock');

    const failed = res1.status === 400 ? res1 : res2;
    assert.equal(failed.body.code, 'INSUFFICIENT_STOCK');

    // Final available stock must be 50 - 35 = 15 CFT (never negative)
    const finalBatch = mockBatches.find(b => b.id === testBatchId);
    assert.equal(finalBatch.quantity_available, 15);
  });

});
