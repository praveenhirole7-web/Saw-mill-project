'use strict';
/**
 * test/cuttingJobs.test.js
 *
 * Automated tests for Sawmill Cutting Job Module:
 *   1. Draft cutting job creation does NOT consume stock
 *   2. Rejection of jobs with insufficient input stock
 *   3. Controlled workflow: starting job reserves input stock
 *   4. Job completion consumes input stock, calculates waste & charges
 *   5. Output posting generates traceable sawn lumber batches
 *   6. Customer-owned timber support (marks output as customer owned)
 *   7. Prevention of duplicate completion (idempotency check)
 *   8. Official cutting job report generation
 *   9. HTTP API integration via Express endpoints
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '5097';
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
    permissions: 'manage_users,view_inventory,manage_inventory,manage_cutting_jobs',
  },
  {
    id: 2,
    username: 'operator',
    email: 'operator@sawmill.local',
    role: 'operator',
    status: 'active',
    permissions: 'view_inventory,manage_cutting_jobs',
  }
];

let mockBatches = [];
let mockMovements = [];
let mockCuttingJobs = [];
let mockJobInputs = [];
let mockJobOutputs = [];

let nextJobId = 1;
let nextInputId = 1;
let nextOutputId = 1;
let nextBatchId = 100;
let nextMovementId = 100;

// Row lock simulation for transaction testing
const lockedJobIds = new Set();
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

  // 2. Timber Batches lookup
  if (norm.includes('from timber_batches tb where tb.id = ?') || norm.includes('from timber_batches where id = ?')) {
    const id = Number(params[0]);
    const b = mockBatches.find(x => x.id === id);
    return [b ? [b] : []];
  }
  if (norm.includes('from timber_batches where lower(batch_code) = lower(?)')) {
    const code = String(params[0]).toLowerCase();
    const b = mockBatches.find(x => x.batch_code.toLowerCase() === code);
    return [b ? [b] : []];
  }
  if (norm.includes('from timber_batches')) {
    return [mockBatches];
  }

  // 3. Customers lookup
  if (norm.includes('from customers c where c.id = ?')) {
    const id = Number(params[0]);
    return [[{ id, name: 'Heritage Custom Homebuilders', phone: '+1-555-0199' }]];
  }

  // 4. Cutting Jobs
  if (norm.includes('count(*) as total from cutting_jobs')) {
    return [[{ total: mockCuttingJobs.length }]];
  }
  if (norm.includes('select job_number from cutting_jobs where job_number like ?')) {
    const sorted = [...mockCuttingJobs].sort((a, b) => b.id - a.id);
    return [sorted.length > 0 ? [{ job_number: sorted[0].job_number }] : []];
  }
  if (norm.includes('from cutting_jobs cj') && norm.includes('where cj.id = ?')) {
    const id = Number(params[0]);
    const j = mockCuttingJobs.find(x => x.id === id);
    return [j ? [j] : []];
  }
  if (norm.includes('from cutting_job_inputs cji join timber_batches tb') && norm.includes('where cji.cutting_job_id = ?')) {
    const jId = Number(params[0]);
    const inps = mockJobInputs.filter(x => x.cutting_job_id === jId).map(inp => {
      const b = mockBatches.find(x => x.id === inp.batch_id);
      return {
        ...inp,
        batch_code: b?.batch_code,
        batch_name: b?.name,
        timber_type: b?.timber_type,
        species: b?.species,
        dimensions_text: b?.dimensions_text,
        batch_available: b?.quantity_available,
        batch_ownership: b?.ownership,
      };
    });
    return [inps];
  }
  if (norm.includes('from cutting_job_outputs cjo') && norm.includes('where cjo.cutting_job_id = ?')) {
    const jId = Number(params[0]);
    const outs = mockJobOutputs.filter(x => x.cutting_job_id === jId).map(out => {
      const b = mockBatches.find(x => x.id === out.generated_batch_id);
      return {
        ...out,
        generated_batch_code: b?.batch_code,
        generated_batch_available: b?.quantity_available,
      };
    });
    return [outs];
  }
  if (norm.includes('from cutting_jobs cj')) {
    return [mockCuttingJobs.map(j => ({ ...j, customer_name: 'Heritage Custom Homebuilders' }))];
  }

  // Audit logs & generic updates
  if (norm.includes('insert into audit_logs')) {
    return [{ insertId: 1 }];
  }
  if (norm.startsWith('update cutting_jobs set notes = concat')) {
    const id = Number(params[2]);
    const j = mockCuttingJobs.find(x => x.id === id);
    if (j) j.notes = (j.notes || '') + '\n' + params[1];
    return [{ affectedRows: 1 }];
  }

  return [[]];
};

// Mock withTransaction
db.withTransaction = async (callback) => {
  const conn = {
    execute: async (sql, params = []) => {
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      // Job number generator query
      if (norm.includes('select job_number from cutting_jobs where job_number like ?')) {
        const sorted = [...mockCuttingJobs].sort((a, b) => b.id - a.id);
        return [sorted.length > 0 ? [{ job_number: sorted[0].job_number }] : []];
      }

      // Lock row FOR UPDATE
      if (norm.includes('select * from cutting_jobs where id = ? for update')) {
        const id = Number(params[0]);
        if (lockedJobIds.has(id)) {
          throw new Error('Lock wait timeout exceeded');
        }
        lockedJobIds.add(id);
        const j = mockCuttingJobs.find(x => x.id === id);
        return [j ? [j] : []];
      }

      if (norm.includes('select * from timber_batches where id = ? for update')) {
        const id = Number(params[0]);
        lockedBatchIds.add(id);
        const b = mockBatches.find(x => x.id === id);
        return [b ? [b] : []];
      }

      if (norm.includes('from cutting_job_inputs cji join timber_batches tb') && norm.includes('where cji.cutting_job_id = ?')) {
        const jId = Number(params[0]);
        const inps = mockJobInputs.filter(x => x.cutting_job_id === jId).map(inp => {
          const b = mockBatches.find(x => x.id === inp.batch_id);
          return {
            ...inp,
            batch_code: b?.batch_code,
            species: b?.species,
            timber_type: b?.timber_type,
            ownership: b?.ownership,
            batch_customer_id: b?.customer_id,
            quantity_available: b?.quantity_available,
            quantity_reserved: b?.quantity_reserved,
            quantity_consumed: b?.quantity_consumed,
            quantity_total: b?.quantity_total,
          };
        });
        return [inps];
      }

      if (norm.includes('select * from cutting_job_outputs where cutting_job_id = ?')) {
        const jId = Number(params[0]);
        return [mockJobOutputs.filter(x => x.cutting_job_id === jId)];
      }

      // Insert cutting job
      if (norm.startsWith('insert into cutting_jobs')) {
        const id = nextJobId++;
        const record = {
          id,
          job_number: params[0],
          job_title: params[1],
          job_type: params[2],
          customer_id: params[3] ? Number(params[3]) : null,
          saw_line: params[4],
          operator_name: params[5],
          priority: params[6],
          requested_dimensions: params[7],
          kerf_allowance: params[8],
          status: params[9],
          input_total_volume: Number(params[10]),
          output_total_volume: Number(params[11]),
          waste_volume: Number(params[12]),
          recovery_rate: Number(params[13]),
          rate_per_cbf: Number(params[14]),
          labour_charges: Number(params[15]),
          total_charges: Number(params[16]),
          ownership: params[17],
          start_date: params[18],
          due_date: params[19],
          notes: params[20],
          created_by_id: params[21] ? Number(params[21]) : null,
          created_at: new Date().toISOString(),
        };
        mockCuttingJobs.push(record);
        return [{ insertId: id }];
      }

      // Insert cutting job input
      if (norm.startsWith('insert into cutting_job_inputs')) {
        const id = nextInputId++;
        const record = {
          id,
          cutting_job_id: Number(params[0]),
          batch_id: Number(params[1]),
          quantity_used: Number(params[2]),
          unit: params[3],
        };
        mockJobInputs.push(record);
        return [{ insertId: id }];
      }

      // Insert cutting job output
      if (norm.startsWith('insert into cutting_job_outputs')) {
        const id = nextOutputId++;
        const record = {
          id,
          cutting_job_id: Number(params[0]),
          generated_batch_id: params[1] ? Number(params[1]) : null,
          product_name: params[2],
          species: params[3],
          dimensions_text: params[4],
          thickness_inches: Number(params[5]),
          width_inches: Number(params[6]),
          length_feet: Number(params[7]),
          pieces_count: Number(params[8]),
          volume_cbf: Number(params[9]),
          unit: params[10],
          grade: params[11],
        };
        mockJobOutputs.push(record);
        return [{ insertId: id }];
      }

      // Update timber batch stock
      if (norm.startsWith('update timber_batches set quantity_available = quantity_available +')) {
        const availDelta = Number(params[0]);
        const resDelta = Number(params[1]);
        const consDelta = Number(params[2]);
        const totDelta = Number(params[3]);
        const bId = Number(params[4]);
        const b = mockBatches.find(x => x.id === bId);
        if (b) {
          b.quantity_available = Number((Number(b.quantity_available) + availDelta).toFixed(3));
          b.quantity_reserved = Number((Number(b.quantity_reserved) + resDelta).toFixed(3));
          b.quantity_consumed = Number((Number(b.quantity_consumed) + consDelta).toFixed(3));
          b.quantity_total = Number((Number(b.quantity_total) + totDelta).toFixed(3));
        }
        return [{ affectedRows: 1 }];
      }

      // Insert output batch in timber_batches
      if (norm.startsWith('insert into timber_batches')) {
        const id = nextBatchId++;
        const b = {
          id,
          batch_code: params[0],
          name: params[1],
          timber_type: 'sawn_timber',
          category: params[3],
          species: params[4],
          grade: params[5],
          dimensions_text: params[6],
          length_feet: Number(params[7]),
          width_inches: Number(params[8]),
          thickness_inches: Number(params[9]),
          unit: params[11],
          pieces_count: Number(params[12]),
          calculated_volume_cbf: Number(params[13]),
          calculated_board_feet: Number(params[14]),
          quantity_total: Number(params[15]),
          quantity_available: Number(params[16]),
          quantity_reserved: 0,
          quantity_consumed: 0,
          ownership: params[17],
          customer_id: params[18] ? Number(params[18]) : null,
          status: 'In Stock',
          yard_location: params[19],
          cost_price: Number(params[20]),
          selling_price: Number(params[21]),
          notes: params[22],
        };
        mockBatches.push(b);
        return [{ insertId: id }];
      }

      // Insert stock movement
      if (norm.startsWith('insert into stock_movements')) {
        const id = nextMovementId++;
        const m = {
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
        mockMovements.push(m);
        return [{ insertId: id }];
      }

      // Mark job completed
      if (norm.startsWith('update cutting_jobs set status = \'completed\'')) {
        const completionDate = params[0] || new Date().toISOString().split('T')[0];
        const inVol = Number(params[1]);
        const outVol = Number(params[2]);
        const wasteVol = Number(params[3]);
        const recRate = Number(params[4]);
        const ratePerCbf = Number(params[5]);
        const labourCharges = Number(params[6]);
        const totalCharges = Number(params[7]);
        const completedById = params[8] ? Number(params[8]) : null;
        const jId = Number(params[9]);

        const j = mockCuttingJobs.find(x => x.id === jId);
        if (j) {
          j.status = 'completed';
          j.completion_date = completionDate;
          j.input_total_volume = inVol;
          j.output_total_volume = outVol;
          j.waste_volume = wasteVol;
          j.recovery_rate = recRate;
          j.rate_per_cbf = ratePerCbf;
          j.labour_charges = labourCharges;
          j.total_charges = totalCharges;
          j.completed_by_id = completedById;
        }
        return [{ affectedRows: 1 }];
      }

      // Update status
      if (norm.startsWith('update cutting_jobs set status = ?')) {
        const status = params[0];
        const jId = Number(params[1]);
        const j = mockCuttingJobs.find(x => x.id === jId);
        if (j) j.status = status;
        return [{ affectedRows: 1 }];
      }

      // Update output generated batch ID
      if (norm.startsWith('update cutting_job_outputs set generated_batch_id')) {
        const bId = Number(params[0]);
        const oId = Number(params[1]);
        const o = mockJobOutputs.find(x => x.id === oId);
        if (o) o.generated_batch_id = bId;
        return [{ affectedRows: 1 }];
      }

      return [{ affectedRows: 0, insertId: 0 }];
    }
  };

  try {
    return await callback(conn);
  } finally {
    lockedJobIds.clear();
    lockedBatchIds.clear();
  }
};

const cuttingJobService = require('../src/services/cuttingJobService');
const app = require('../src/server');

let server;
let adminToken;
let baseUrl;

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

  // Seed sample input raw log batches
  mockBatches = [
    {
      id: 1,
      batch_code: 'LOG-WO-910',
      name: 'White Oak Veneer Sawlogs',
      timber_type: 'raw_log',
      category: 'Round Logs',
      species: 'White Oak',
      grade: 'Grade A',
      dimensions_text: '16 ft × 48" girth',
      length_feet: 16,
      girth_inches: 48,
      pieces_count: 10,
      unit: 'CFT',
      calculated_volume_cbf: 160.000,
      calculated_board_feet: 1920.000,
      quantity_total: 160.000,
      quantity_available: 160.000,
      quantity_reserved: 0.000,
      quantity_consumed: 0.000,
      ownership: 'mill',
      customer_id: null,
      status: 'In Stock',
      yard_location: 'Yard Bay A-1',
    },
    {
      id: 2,
      batch_code: 'LOG-CUST-77',
      name: 'Client Custom Walnut Logs',
      timber_type: 'raw_log',
      category: 'Round Logs',
      species: 'Black Walnut',
      grade: 'Select Prime',
      dimensions_text: '14 ft × 40" girth',
      length_feet: 14,
      girth_inches: 40,
      pieces_count: 5,
      unit: 'CFT',
      calculated_volume_cbf: 70.000,
      calculated_board_feet: 840.000,
      quantity_total: 70.000,
      quantity_available: 70.000,
      quantity_reserved: 0.000,
      quantity_consumed: 0.000,
      ownership: 'customer',
      customer_id: 10,
      status: 'In Stock',
      yard_location: 'Client Holding Bay C',
    }
  ];
});

after(async () => {
  if (server) {
    await new Promise(res => server.close(res));
  }
});

describe('Sawmill Cutting Job Module Tests', () => {

  test('1. Draft Cutting Job Creation: Does NOT consume input stock', async () => {
    const rawBatch = mockBatches[0];
    const initialAvailable = rawBatch.quantity_available;
    const initialReserved = rawBatch.quantity_reserved;
    const initialConsumed = rawBatch.quantity_consumed;

    const job = await cuttingJobService.createCuttingJob({
      job_title: 'Heavy Beam Sawn Flitch Run',
      job_type: 'customer_order',
      customer_id: 1,
      saw_line: 'Line 1 (60" Band Saw)',
      requested_dimensions: '4" x 10" x 16 ft Structural Beams',
      kerf_allowance: '0.125"',
      rate_per_cbf: 18.00,
      labour_charges: 150.00,
      inputs: [
        {
          batch_id: rawBatch.id,
          quantity_used: 60.000,
          unit: 'CFT',
        }
      ]
    }, 1);

    assert.ok(job.id, 'Job ID generated');
    assert.ok(job.job_number.startsWith('CJ-'), 'Job number starts with CJ-');
    assert.equal(job.status, 'draft', 'Initial status must be draft');
    assert.equal(Number(job.input_total_volume), 60.000);

    // Backend financial charge calculation check:
    // Milling fee = 60 * 18 = 1080. Total = 1080 + 150 = 1230.00
    assert.equal(Number(job.total_charges), 1230.00, 'Cutting charges accurately calculated on backend');

    // BUSINESS RULE 1: Draft job must NOT consume or deduct any stock!
    const batchAfter = mockBatches.find(b => b.id === rawBatch.id);
    assert.equal(batchAfter.quantity_available, initialAvailable, 'Available stock unchanged on draft creation');
    assert.equal(batchAfter.quantity_reserved, initialReserved, 'Reserved stock unchanged on draft creation');
    assert.equal(batchAfter.quantity_consumed, initialConsumed, 'Consumed stock unchanged on draft creation');
  });

  test('2. Insufficient Stock Prevention: Rejects job when input exceeds available batch stock', async () => {
    const rawBatch = mockBatches[0];

    // Attempting to request 999 CFT from batch with 160 CFT must throw INSUFFICIENT_STOCK
    await assert.rejects(
      async () => {
        await cuttingJobService.createCuttingJob({
          job_title: 'Oversized Request',
          requested_dimensions: '2" x 4" Lumber',
          inputs: [
            {
              batch_id: rawBatch.id,
              quantity_used: 999.000,
              unit: 'CFT',
            }
          ]
        }, 1);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.errorCode, 'INSUFFICIENT_STOCK');
        assert.match(err.message, /insufficient stock/i);
        return true;
      },
      'Should throw 400 INSUFFICIENT_STOCK when quantity exceeds available'
    );
  });

  test('3. Controlled Workflow: Starting job reserves input stock', async () => {
    const rawBatch = mockBatches[0];
    const job = mockCuttingJobs[0]; // created in test 1, input: 60 CFT
    const availableBefore = rawBatch.quantity_available;
    const reservedBefore = rawBatch.quantity_reserved;

    const started = await cuttingJobService.startCuttingJob(job.id, 1);
    assert.equal(started.status, 'in_progress', 'Job transitioned to in_progress');

    // Stock should now be reserved, not yet consumed
    const batchAfter = mockBatches.find(b => b.id === rawBatch.id);
    assert.equal(batchAfter.quantity_available, Number((availableBefore - 60).toFixed(3)), 'Available stock reduced by reserved amount');
    assert.equal(batchAfter.quantity_reserved, Number((reservedBefore + 60).toFixed(3)), 'Reserved stock increased');
  });

  test('4. Job Completion & Output Posting (Consumes Input Stock & Calculates Waste/Yield)', async () => {
    const job = mockCuttingJobs[0];
    const rawBatch = mockBatches[0];
    const initialBatchesCount = mockBatches.length;
    const initialMovementsCount = mockMovements.length;

    // Complete the run with 45 CFT of finished dimensional output (from 60 CFT input)
    // Yield = 45 / 60 = 75.00%, Waste = 60 - 45 = 15.000 CFT
    const result = await cuttingJobService.completeCuttingJob(
      job.id,
      {
        outputs: [
          {
            product_name: '4" x 10" x 16 ft Structural Timber',
            species: 'White Oak',
            thickness_inches: 4,
            width_inches: 10,
            length_feet: 16,
            pieces_count: 10, // (4 * 10 * 16 * 10) / 144 = 44.444 CFT
            volume_cbf: 45.000,
            unit: 'CFT',
            grade: 'Select Structural',
          }
        ]
      },
      1
    );

    assert.equal(result.job.status, 'completed', 'Job marked as completed');
    assert.equal(Number(result.job.input_total_volume), 60.000);
    assert.equal(Number(result.job.output_total_volume), 45.000);
    assert.equal(Number(result.job.waste_volume), 15.000, 'Waste volume is input - output = 15 CFT');
    assert.equal(Number(result.job.recovery_rate), 75.00, 'Recovery rate is 75%');

    // Verify input batch consumption:
    // Reserved stock cleared (-60), Consumed stock incremented (+60)
    const batchAfter = mockBatches.find(b => b.id === rawBatch.id);
    assert.equal(batchAfter.quantity_reserved, 0.000, 'Reserved stock cleared after run');
    assert.equal(batchAfter.quantity_consumed, 60.000, 'Input consumed stock incremented');

    // Verify finished sawn lumber batch generated in timber_batches:
    assert.equal(mockBatches.length, initialBatchesCount + 1, 'New finished lumber batch posted');
    const newLumberBatch = mockBatches[mockBatches.length - 1];
    assert.ok(newLumberBatch.batch_code.startsWith(`BATCH-${job.job_number}-OUT-`), 'Output batch has traceable code');
    assert.equal(newLumberBatch.timber_type, 'sawn_timber');
    assert.equal(Number(newLumberBatch.quantity_available), 45.000);
    assert.equal(newLumberBatch.status, 'In Stock');

    // Verify immutable ledger movements:
    // 1 issue movement for input consumption + 1 receipt movement for output batch
    assert.equal(mockMovements.length, initialMovementsCount + 2);
    const issueMov = mockMovements.find(m => m.batch_id === rawBatch.id && m.movement_type === 'issue');
    assert.ok(issueMov, 'Input consumption recorded in movement ledger');
    assert.equal(issueMov.quantity, 60.000);

    const receiptMov = mockMovements.find(m => m.batch_id === newLumberBatch.id && m.movement_type === 'receipt');
    assert.ok(receiptMov, 'Finished lumber intake recorded in movement ledger');
    assert.equal(receiptMov.quantity, 45.000);
  });

  test('5. Prevent Duplicate Completion (Idempotency Check)', async () => {
    const job = mockCuttingJobs[0];
    assert.equal(job.status, 'completed');
    const batchesCountBefore = mockBatches.length;
    const movementsCountBefore = mockMovements.length;

    // Second completion attempt MUST be rejected with 400 DUPLICATE_COMPLETION
    await assert.rejects(
      async () => {
        await cuttingJobService.completeCuttingJob(job.id, {}, 1);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.errorCode, 'DUPLICATE_COMPLETION');
        assert.match(err.message, /already been completed/i);
        return true;
      },
      'Must reject duplicate completion attempt'
    );

    // Verify no duplicate batches or ledger movements were created
    assert.equal(mockBatches.length, batchesCountBefore);
    assert.equal(mockMovements.length, movementsCountBefore);
  });

  test('6. Customer-Owned Timber Support (Segregated from Mill Stock)', async () => {
    const custBatch = mockBatches.find(b => b.ownership === 'customer');
    assert.ok(custBatch, 'Customer-owned log batch exists');

    // Create custom cutting job for client-owned timber
    const custJob = await cuttingJobService.createCuttingJob({
      job_title: 'Client Walnut Custom Milling',
      job_type: 'customer_order',
      customer_id: custBatch.customer_id,
      ownership: 'customer',
      requested_dimensions: '2" x 6" Live Edge Walnut Slabs',
      inputs: [
        {
          batch_id: custBatch.id,
          quantity_used: 40.000,
          unit: 'CFT',
        }
      ]
    }, 1);

    assert.equal(custJob.ownership, 'customer');

    // Complete job
    const completed = await cuttingJobService.completeCuttingJob(custJob.id, {
      outputs: [
        {
          product_name: '2" x 6" Live Edge Walnut Planks',
          species: 'Black Walnut',
          thickness_inches: 2,
          width_inches: 6,
          length_feet: 12,
          pieces_count: 20,
          volume_cbf: 30.000,
          unit: 'CFT',
          grade: 'Live Edge Slabs',
        }
      ]
    }, 1);

    assert.equal(completed.job.status, 'completed');

    // BUSINESS RULE 7: Generated batch must be customer-owned, not mill saleable stock!
    const generatedBatch = mockBatches.find(b => b.name === '2" x 6" Live Edge Walnut Planks');
    assert.ok(generatedBatch, 'Output batch created');
    assert.equal(generatedBatch.ownership, 'customer', 'Segregated as customer-owned stock');
    assert.equal(generatedBatch.customer_id, custBatch.customer_id, 'Linked to customer ID');
  });

  test('7. Cutting Job Report Generation', async () => {
    const job = mockCuttingJobs[0];
    const report = await cuttingJobService.getCuttingJobReport(job.id);

    assert.ok(report.jobDetails, 'Report contains jobDetails');
    assert.equal(report.jobDetails.jobNumber, job.job_number);
    assert.equal(report.yieldAnalysis.totalInputVolumeCbf, 60.000);
    assert.equal(report.yieldAnalysis.totalOutputVolumeCbf, 45.000);
    assert.equal(report.yieldAnalysis.wasteVolumeCbf, 15.000);
    assert.equal(report.yieldAnalysis.recoveryRatePercent, 75.00);
    assert.ok(report.yieldAnalysis.efficiencyRating.includes('Optimal Recovery'), 'Efficiency rating evaluated');
    assert.equal(report.financialSummary.totalCuttingCharges, 1230.00);
    assert.ok(report.sourceBatches.length > 0, 'Source batches included in report');
  });

  test('8. HTTP API: Create, Start, and Complete Job via Express Endpoints', async () => {
    // 1. POST /api/v1/cutting-jobs
    const createRes = await fetch(`${baseUrl}/api/v1/cutting-jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        job_title: 'API End-to-End Test Run',
        job_type: 'internal_production',
        saw_line: 'Line 2 (Twin Circular Edger)',
        requested_dimensions: '2" x 6" Framing Lumber',
        inputs: [
          {
            batch_id: mockBatches[0].id,
            quantity_used: 20.000,
            unit: 'CFT',
          }
        ]
      })
    });

    const createJson = await createRes.json();
    assert.equal(createRes.status, 201);
    assert.equal(createJson.success, true);
    assert.ok(createJson.data.job_number);
    const newJobId = createJson.data.id;

    // 2. POST /api/v1/cutting-jobs/:id/start
    const startRes = await fetch(`${baseUrl}/api/v1/cutting-jobs/${newJobId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      }
    });

    const startJson = await startRes.json();
    assert.equal(startRes.status, 200);
    assert.equal(startJson.data.status, 'in_progress');

    // 3. POST /api/v1/cutting-jobs/:id/complete
    const completeRes = await fetch(`${baseUrl}/api/v1/cutting-jobs/${newJobId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        outputs: [
          {
            product_name: '2" x 6" Framing Boards',
            species: 'White Oak',
            thickness_inches: 2,
            width_inches: 6,
            length_feet: 14,
            pieces_count: 10,
            volume_cbf: 14.000,
          }
        ]
      })
    });

    const completeJson = await completeRes.json();
    assert.equal(completeRes.status, 200);
    assert.equal(completeJson.data.job.status, 'completed');
    assert.equal(Number(completeJson.data.job.waste_volume), 6.000); // 20 - 14 = 6 CFT

    // 4. Duplicate completion call returns 400 DUPLICATE_COMPLETION
    const dupRes = await fetch(`${baseUrl}/api/v1/cutting-jobs/${newJobId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({})
    });

    const dupJson = await dupRes.json();
    assert.equal(dupRes.status, 400);
    assert.equal(dupJson.code, 'DUPLICATE_COMPLETION');

    // 5. GET /api/v1/cutting-jobs/:id/report
    const reportRes = await fetch(`${baseUrl}/api/v1/cutting-jobs/${newJobId}/report`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
      }
    });
    const reportJson = await reportRes.json();
    assert.equal(reportRes.status, 200);
    assert.equal(reportJson.data.yieldAnalysis.totalInputVolumeCbf, 20.000);
    assert.equal(reportJson.data.yieldAnalysis.wasteVolumeCbf, 6.000);
  });

});
