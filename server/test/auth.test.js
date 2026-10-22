'use strict';
/**
 * test/auth.test.js
 *
 * End-to-end authentication security test suite for Saw Mill Management System.
 * Tests:
 *   1. Successful login with bcrypt password verification
 *   2. Invalid password rejection (401 INVALID_CREDENTIALS)
 *   3. Inactive account blocking (403 ACCOUNT_INACTIVE)
 *   4. Missing token on protected endpoint (401 NO_TOKEN)
 *   5. Valid token authentication (200 with safe user, no password hash)
 *   6. Expired token rejection (401 TOKEN_EXPIRED)
 *   7. Role and permission authorization / insufficient permissions (403 INSUFFICIENT_ROLE)
 *   8. Authorized administrative user creation (201 USER_CREATED)
 *   9. CSRF protection on cookie-authenticated requests (403 CSRF_MISSING_HEADER)
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
const http = require('node:http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Import DB module to mock query method
const db = require('../src/config/db');

// In-memory mock database state
let mockUsers = [];
let mockRefreshTokens = [];
let mockAuditLogs = [];

// Mock query router
db.query = async (sql, params = []) => {
  const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  // 1. SELECT user by email (login)
  if (norm.includes('from users u') && norm.includes('where lower(u.email) = ?')) {
    const email = String(params[0]).toLowerCase();
    const found = mockUsers.find((u) => u.email.toLowerCase() === email);
    if (!found) return [[]];
    return [[{
      id: found.id,
      username: found.username,
      email: found.email,
      password_hash: found.password_hash,
      status: found.status,
      created_at: found.created_at,
      role: found.role,
      permissions: found.permissions.join(','),
    }]];
  }

  if (norm.includes('from users u') && norm.includes('join roles r') && !norm.includes('where u.id = ?')) {
    return [mockUsers.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      status: user.status,
      created_at: user.created_at,
      role: user.role,
    }))];
  }

  // 2. SELECT user by id (/me or authenticate)
  if (norm.includes('from users u') && norm.includes('where u.id = ?')) {
    const id = Number(params[0]);
    const found = mockUsers.find((u) => u.id === id);
    if (!found) return [[]];
    return [[{
      id: found.id,
      username: found.username,
      email: found.email,
      status: found.status,
      created_at: found.created_at,
      role: found.role,
      permissions: found.permissions.join(','),
    }]];
  }

  // 3. INSERT refresh_tokens
  if (norm.startsWith('insert into refresh_tokens')) {
    mockRefreshTokens.push({
      user_id: params[0],
      token_hash: params[1],
      expires_at: params[2],
    });
    return [{ insertId: mockRefreshTokens.length }];
  }

  // 4. SELECT refresh_tokens
  if (norm.startsWith('select') && norm.includes('from refresh_tokens')) {
    const hash = params[0];
    const found = mockRefreshTokens.filter((t) => t.token_hash === hash);
    return [found];
  }

  // 5. DELETE refresh_tokens
  if (norm.startsWith('delete from refresh_tokens')) {
    const hashOrUser = params[0];
    mockRefreshTokens = mockRefreshTokens.filter((t) => t.token_hash !== hashOrUser && t.user_id !== hashOrUser);
    return [{ affectedRows: 1 }];
  }

  // 6. INSERT audit_logs
  if (norm.startsWith('insert into audit_logs')) {
    mockAuditLogs.push({ action: params[1], description: params[4] });
    return [{ insertId: mockAuditLogs.length }];
  }

  // 7. Check username/email uniqueness (createUser)
  if (norm.includes('from users where lower(email) = ? or lower(username) = ?')) {
    const email = String(params[0]).toLowerCase();
    const uname = String(params[1]).toLowerCase();
    const exists = mockUsers.filter((u) => u.email.toLowerCase() === email || u.username.toLowerCase() === uname);
    return [exists];
  }

  // 8. SELECT role by id or name
  if (norm.includes('from roles where id = ?')) {
    const id = Number(params[0]);
    if (id === 1) return [[{ id: 1, name: 'admin' }]];
    if (id === 2) return [[{ id: 2, name: 'operator' }]];
    return [[]];
  }
  if (norm.includes('from roles where lower(name) = ?')) {
    const name = String(params[0]).toLowerCase();
    if (name === 'admin') return [[{ id: 1, name: 'admin' }]];
    if (name === 'operator') return [[{ id: 2, name: 'operator' }]];
    return [[]];
  }

  // 9. INSERT INTO users
  if (norm.startsWith('insert into users')) {
    const newUser = {
      id: mockUsers.length + 1,
      username: params[0],
      email: params[1],
      password_hash: params[2],
      role_id: params[3],
      role: params[3] === 1 ? 'admin' : 'operator',
      status: params[4] || 'active',
      permissions: params[3] === 1 ? ['manage_users', 'view_inventory'] : ['view_inventory'],
      created_at: new Date(),
    };
    mockUsers.push(newUser);
    return [{ insertId: newUser.id }];
  }

  // 10. UPDATE users SET status
  if (norm.startsWith('update users set status = ?')) {
    const status = params[0];
    const id = Number(params[1]);
    const u = mockUsers.find((x) => x.id === id);
    if (u) {
      u.status = status;
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 0 }];
  }

  return [[]];
};

const app = require('../src/server');
let server;
let baseUrl;

before(async () => {
  // Hash passwords for seed test users
  const adminHash = await bcrypt.hash('CorrectAdminPass123!', 10);
  const operatorHash = await bcrypt.hash('OperatorPass123!', 10);

  mockUsers = [
    {
      id: 1,
      username: 'admin',
      email: 'admin@sawmill.local',
      password_hash: adminHash,
      role: 'admin',
      role_id: 1,
      status: 'active',
      permissions: ['manage_users', 'view_inventory', 'manage_inventory'],
      created_at: new Date(),
    },
    {
      id: 2,
      username: 'operator_bob',
      email: 'bob@sawmill.local',
      password_hash: operatorHash,
      role: 'operator',
      role_id: 2,
      status: 'active',
      permissions: ['view_inventory'],
      created_at: new Date(),
    },
    {
      id: 3,
      username: 'inactive_user',
      email: 'inactive@sawmill.local',
      password_hash: adminHash,
      role: 'operator',
      role_id: 2,
      status: 'inactive',
      permissions: ['view_inventory'],
      created_at: new Date(),
    },
  ];

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

// Helper for HTTP requests
async function apiRequest(path, { method = 'GET', headers = {}, body = null } = {}) {
  const url = `${baseUrl}${path}`;
  const reqHeaders = { ...headers };
  let reqBody = null;

  if (body) {
    reqHeaders['Content-Type'] = 'application/json';
    reqBody = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers: reqHeaders,
    body: reqBody,
  });

  const json = await response.json().catch(() => null);
  const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];

  return {
    status: response.status,
    headers: response.headers,
    cookies,
    body: json,
  };
}

describe('Saw Mill Authentication & Authorization Tests', () => {

  // Test 1: Successful Login
  test('1. Successful login: returns 200, safe user without password hash, sets HttpOnly cookies', async () => {
    const res = await apiRequest('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'admin@sawmill.local',
        password: 'CorrectAdminPass123!',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, 'admin@sawmill.local');
    assert.equal(res.body.data.user.role, 'admin');
    assert.equal(res.body.data.user.password_hash, undefined, 'password_hash must never be returned');
    assert.ok(res.body.data.accessToken, 'Access token returned in body');

    // Verify HttpOnly cookies
    const cookieHeaders = res.cookies.join('; ');
    assert.ok(cookieHeaders.includes('access_token='), 'access_token cookie must be set');
    assert.ok(cookieHeaders.includes('HttpOnly'), 'Cookie must have HttpOnly flag');
  });

  // Test 2: Invalid Password
  test('2. Invalid password: returns 401 INVALID_CREDENTIALS', async () => {
    const res = await apiRequest('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'admin@sawmill.local',
        password: 'WrongPassword999!',
      },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'INVALID_CREDENTIALS');
  });

  // Test 3: Inactive Account
  test('3. Inactive account: returns 403 ACCOUNT_INACTIVE', async () => {
    const res = await apiRequest('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'inactive@sawmill.local',
        password: 'CorrectAdminPass123!',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'ACCOUNT_INACTIVE');
  });

  // Test 4: Missing Token
  test('4. Missing token on protected GET /api/v1/auth/me: returns 401 NO_TOKEN', async () => {
    const res = await apiRequest('/api/v1/auth/me', {
      method: 'GET',
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'NO_TOKEN');
  });

  // Test 5: Valid Token Authentication
  test('5. Valid Bearer token on GET /api/v1/auth/me: returns 200 with user profile & permissions', async () => {
    const token = jwt.sign(
      { sub: 1, email: 'admin@sawmill.local', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '15m', issuer: 'sawmill-api' }
    );

    const res = await apiRequest('/api/v1/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.id, 1);
    assert.equal(res.body.data.user.role, 'admin');
    assert.equal(res.body.data.user.password_hash, undefined);
    assert.ok(res.body.data.user.permissions.includes('manage_users'));
  });

  test('Admin-only user listing returns safe account records', async () => {
    const adminToken = jwt.sign(
      { sub: 1, email: 'admin@sawmill.local', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '15m', issuer: 'sawmill-api' }
    );
    const operatorToken = jwt.sign(
      { sub: 2, email: 'bob@sawmill.local', role: 'operator' },
      process.env.JWT_SECRET,
      { expiresIn: '15m', issuer: 'sawmill-api' }
    );

    const allowed = await apiRequest('/api/v1/auth/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.data.items.length, mockUsers.length);
    assert.equal(allowed.body.data.items[0].password_hash, undefined);

    const denied = await apiRequest('/api/v1/auth/users', {
      headers: { Authorization: `Bearer ${operatorToken}` },
    });
    assert.equal(denied.status, 403);
  });

  // Test 6: Expired Token Behavior
  test('6. Expired token: returns 401 TOKEN_EXPIRED', async () => {
    // Issue token already expired in the past
    const expiredToken = jwt.sign(
      { sub: 1, email: 'admin@sawmill.local', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '-10s', issuer: 'sawmill-api' }
    );

    const res = await apiRequest('/api/v1/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${expiredToken}`,
      },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'TOKEN_EXPIRED');
  });

  // Test 7: Insufficient Permissions
  test('7. Insufficient permissions: non-admin cannot access admin endpoint (403 INSUFFICIENT_ROLE)', async () => {
    const operatorToken = jwt.sign(
      { sub: 2, email: 'bob@sawmill.local', role: 'operator' },
      process.env.JWT_SECRET,
      { expiresIn: '15m', issuer: 'sawmill-api' }
    );

    const res = await apiRequest('/api/v1/auth/users', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${operatorToken}`,
      },
      body: {
        username: 'new_worker',
        email: 'worker@sawmill.local',
        password: 'Password123!',
        role_id: 2,
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'INSUFFICIENT_ROLE');
  });

  // Test 8: Authorized Admin User Creation
  test('8. Authorized admin can create new user: returns 201', async () => {
    const adminToken = jwt.sign(
      { sub: 1, email: 'admin@sawmill.local', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '15m', issuer: 'sawmill-api' }
    );

    const res = await apiRequest('/api/v1/auth/users', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      body: {
        username: 'susan_operator',
        email: 'susan@sawmill.local',
        password: 'SecurePassword123!',
        role_id: 2,
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.userId);
  });

  // Test 9: CSRF Protection
  test('9. CSRF protection: Cookie-authenticated mutating request without X-Requested-With returns 403', async () => {
    const res = await apiRequest('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        Cookie: 'access_token=some_token; refresh_token=some_token',
        // Deliberately omit X-Requested-With and X-CSRF-Token
      },
      body: {},
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'CSRF_MISSING_HEADER');
  });

});
