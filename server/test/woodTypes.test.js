'use strict';

process.env.NODE_ENV = 'test';
process.env.PORT = '5101';
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

let requestedSql = '';
db.query = async (sql) => {
  if (/FROM wood_names\s+WHERE wood_type_id IN/i.test(sql)) {
    return [[{
      id: 11,
      wood_type_id: 4,
      language_code: 'hi',
      name: 'सागौन',
      name_kind: 'preferred',
      verified: false
    }]];
  }
  requestedSql = sql;
  return [[{
    id: 4,
    slug: 'teak',
    common_name_en: 'Teak',
    scientific_name: 'Tectona grandis',
    scientific_name_verified: true,
    common_name_verified: true,
    image_url: null
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

test('public wood type list includes stored regional names and verified scientific name', async () => {
  const response = await fetch(`${baseUrl}/api/v1/wood-types?search=${encodeURIComponent('Teak')}`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.items[0].common_name_en, 'Teak');
  assert.equal(body.data.items[0].scientific_name_verified, true);
  assert.equal(body.data.items[0].names[0].name, 'सागौन');
  assert.match(requestedSql, /wood_types/);
});

test('wood type edits require an authenticated administrator', async () => {
  const response = await fetch(`${baseUrl}/api/v1/wood-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'test', common_name_en: 'Test Wood' })
  });
  assert.equal(response.status, 401);
});
