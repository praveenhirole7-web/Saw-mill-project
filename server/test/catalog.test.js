'use strict';

process.env.NODE_ENV = 'test';
process.env.PORT = '5100';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'sawmill_test_db';
process.env.JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long_12345';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_key_minimum_32_chars_12345';
process.env.CLIENT_URL = 'http://localhost:5173';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/db');

let capturedSql;
let capturedParams;
let includeWoodType = false;
let capturedQueries = [];
db.query = async (sql, params) => {
  capturedSql = sql;
  capturedParams = params;
  capturedQueries.push({ sql, params });
  if (/FROM wood_names\s+WHERE wood_type_id IN/i.test(sql)) {
    return [[{
      wood_type_id: 7,
      language_code: 'kn',
      name: 'ತೇಗ',
      name_kind: 'preferred',
      verified: false
    }]];
  }
  return [[{
    name: 'Sawn Timber',
    species: includeWoodType ? 'Teak' : 'Oak',
    category: 'Dimensional Lumber',
    grade: 'Select',
    dimensions_text: '2 x 6 x 12',
    unit: 'CFT',
    selling_price: 12.5,
    ...(includeWoodType ? {
      wood_type_id: 7,
      common_name_en: 'Teak',
      scientific_name: 'Tectona grandis',
      scientific_name_verified: true
    } : {})
  }]];
};

const app = require('../src/server');
let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('public catalog returns current product data without inventory quantity or costs', async () => {
  includeWoodType = false;
  capturedQueries = [];
  const response = await fetch(`${baseUrl}/api/v1/catalog/products?search=Oak&category=Dimensional%20Lumber`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.items.length, 1);
  assert.equal(body.data.items[0].species, 'Oak');
  assert.equal(body.data.items[0].indicativePrice, 12.5);
  assert.equal(body.data.items[0].availability, 'In stock');
  assert.equal(body.data.items[0].cost_price, undefined);
  assert.equal(body.data.items[0].quantity_available, undefined);
  assert.match(capturedSql, /ownership = 'mill'/);
  assert.match(capturedSql, /quantity_available > 0/);
  assert.doesNotMatch(capturedSql, /cost_price/);
  assert.deepEqual(capturedParams, ['%Oak%', '%Oak%', '%Oak%', '%Oak%', '%Oak%', '%Oak%', 'Dimensional Lumber']);
});

test('public catalogue searches regional names and returns saved translations', async () => {
  includeWoodType = true;
  capturedQueries = [];
  const response = await fetch(`${baseUrl}/api/v1/catalog/products?search=${encodeURIComponent('ತೇಗ')}`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.items[0].common_name_en, 'Teak');
  assert.equal(body.data.items[0].names[0].name, 'ತೇಗ');
  assert.match(capturedQueries[0].sql, /wood_names/);
  assert.deepEqual(capturedQueries[0].params.slice(0, 6), Array(6).fill('%ತೇಗ%'));
});
