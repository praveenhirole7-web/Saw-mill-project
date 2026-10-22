'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'sawmill_test_db';
process.env.JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long_12345';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/db');
const authorize = require('../src/middleware/authorize');
const reportRepository = require('../src/repositories/reportRepository');
const reportService = require('../src/services/reportService');

let capturedQueries;
let queryMode;

beforeEach(() => {
  capturedQueries = [];
  queryMode = 'sales';
  db.pool.execute = async (sql, params = []) => {
    capturedQueries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (sql.includes('reporting_settings')) return [[{ inventory_costing_method: 'fifo' }]];
    if (queryMode === 'sales' && sql.includes('DATE_FORMAT(so.order_date')) {
      return [[{ period: '2026-10', order_count: 2, sales: 225 }]];
    }
    if (queryMode === 'sales' && sql.includes('SELECT COUNT(*) AS order_count')) {
      return [[{ order_count: 2, sales: 225 }]];
    }
    if (queryMode === 'profitability') {
      return [[{
        net_sales: 225,
        cost_of_goods_sold: 120,
        uncosted_line_count: 0,
        legacy_estimated_line_count: 1,
        operating_expenses: 25
      }]];
    }
    return [[]];
  };
});

describe('report filters and calculations', () => {
  test('sales reporting applies inclusive date filters and groups at requested frequency', async () => {
    const report = await reportService.getReport('sales-periods', {
      from: '2026-10-01',
      to: '2026-10-31',
      period: 'weekly'
    });
    assert.equal(report.summary.sales, 225);
    assert.equal(report.summary.order_count, 2);
    assert.equal(report.items[0].sales, 225);
    assert.equal(capturedQueries[0].params[0], '%x-W%v');
    assert.ok(capturedQueries[0].params.includes('2026-10-01'));
    assert.ok(capturedQueries[0].params.includes('2026-10-31'));
    assert.match(capturedQueries[0].sql, /so\.status = 'completed'/);
    assert.match(capturedQueries[0].sql, /subtotal - so\.discount_amount \+ so\.shipping_charges/);
  });

  test('rejects invalid and reversed report ranges before querying', async () => {
    await assert.rejects(
      () => reportService.getReport('sales-periods', { from: '2026-02-30' }),
      { errorCode: 'VALIDATION_ERROR' }
    );
    await assert.rejects(
      () => reportService.getReport('sales-periods', { from: '2026-10-31', to: '2026-10-01' }),
      { errorCode: 'VALIDATION_ERROR' }
    );
    assert.equal(capturedQueries.length, 0);
  });

  test('profitability uses net completed sales, FIFO cost and posted expenses without adding payments', async () => {
    queryMode = 'profitability';
    const report = await reportService.getReport('profitability', {
      from: '2026-10-01',
      to: '2026-10-31'
    });
    assert.equal(report.summary.net_sales, 225);
    assert.equal(report.summary.cost_of_goods_sold, 120);
    assert.equal(report.summary.gross_margin, 105);
    assert.equal(report.summary.operating_expenses, 25);
    assert.equal(report.summary.estimated_net_operating_profit, 80);
    assert.equal(report.summary.costing_method, 'fifo');
    assert.equal(report.summary.cost_complete, true);
    assert.equal(report.summary.legacy_estimated_line_count, 1);

    const financialQuery = capturedQueries.find(item => item.sql.includes('cost_of_goods_sold'));
    assert.ok(financialQuery.sql.includes('soi.total_cost_at_fulfillment'));
    assert.ok(financialQuery.sql.includes('tb.cost_price * soi.quantity'));
    assert.ok(financialQuery.sql.includes("e.status = 'posted'"));
    assert.ok(financialQuery.sql.includes('COALESCE(soi.total_cost_at_fulfillment, tb.cost_price * soi.quantity, 0) <= 0'));
    assert.equal(financialQuery.params.filter(value => value === '2026-10-01').length, 5);
    assert.equal(financialQuery.params.filter(value => value === '2026-10-31').length, 5);
    assert.doesNotMatch(financialQuery.sql, /customer_payments|payments/);
  });

  test('CSV export includes all report columns and safely escapes spreadsheet formulas', async () => {
    reportRepository.getReport = async () => ({
      items: [{ product_name: '=HYPERLINK("x")', species: 'Oak', unit: 'CFT', order_count: 1, quantity: 2, product_sales: 20 }],
      total: 1,
      summary: {}
    });
    const file = await reportService.exportCsv('sales-products', { from: '2026-10-01', to: '2026-10-31' });
    assert.match(file.filename, /2026-10-01-2026-10-31\.csv$/);
    assert.match(file.content, /"product_name","species","unit","order_count","quantity","product_sales"/);
    assert.match(file.content, /"'=HYPERLINK\(""x""\)"/);
    assert.match(file.content, /"20"/);
  });
});

describe('report permissions', () => {
  test('view_reports is required to access operational and financial reports', () => {
    let denied;
    authorize.permission('view_reports')(
      { user: { permissions: ['view_inventory'] } },
      {},
      error => { denied = error; }
    );
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.errorCode, 'INSUFFICIENT_PERMISSION');

    let allowed = false;
    authorize.permission('view_reports')(
      { user: { permissions: ['view_reports'] } },
      {},
      error => { allowed = error === undefined; }
    );
    assert.equal(allowed, true);
  });
});
