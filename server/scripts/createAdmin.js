#!/usr/bin/env node
'use strict';
/**
 * scripts/createAdmin.js
 *
 * Safe first-administrator bootstrap script.
 *
 * This script:
 *   1. Reads credentials ONLY from environment variables — never from argv.
 *   2. Creates the 'owner' role if it doesn't exist.
 *   3. Creates the initial owner account if the email doesn't already exist.
 *   4. Exits with a non-zero code on failure.
 *
 * There is NO HTTP endpoint that does this — it must be run locally by a
 * developer or sysadmin with database credentials.
 *
 * USAGE:
 *   Set the following environment variables before running:
 *
 *     ADMIN_USERNAME=admin
 *     ADMIN_EMAIL=admin@yourdomain.com
 *     ADMIN_PASSWORD=<strong-password-min-12-chars>
 *
 *   Then run:
 *     node scripts/createAdmin.js
 *
 *   Or with dotenv:
 *     node -r dotenv/config scripts/createAdmin.js
 *
 * REQUIREMENTS:
 *   • DB env vars (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME) must be set.
 *   • The current base schema and required catalogue/staff-permission migrations must be applied first.
 *   • ADMIN_PASSWORD must be at least 12 characters long.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, testConnection } = require('../src/config/db');

// ── Read credentials from env ─────────────────────────────────────────────────
const ADMIN_USERNAME = process.env.ADMIN_USERNAME?.trim();
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL?.trim()?.toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ── Validate inputs ───────────────────────────────────────────────────────────
const errors = [];
if (!ADMIN_USERNAME || ADMIN_USERNAME.length < 3) {
  errors.push('ADMIN_USERNAME must be at least 3 characters.');
}
if (!ADMIN_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL)) {
  errors.push('ADMIN_EMAIL must be a valid email address.');
}
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  errors.push('ADMIN_PASSWORD must be at least 12 characters.');
}

if (errors.length > 0) {
  console.error('\n❌ Missing or invalid environment variables:\n');
  errors.forEach((e) => console.error('   •', e));
  console.error('\n   Set ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD then re-run.\n');
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🪵  Saw Mill — Admin Bootstrap Script\n');

  // 1. Test DB connection
  const connected = await testConnection();
  if (!connected) {
    console.error('\n❌ Cannot connect to database. Fix the connection issue and try again.\n');
    process.exit(1);
  }

  // 2. Check for existing account and owner
  const [existing] = await query(
    'SELECT id FROM users WHERE email = ?',
    [ADMIN_EMAIL]
  );

  if (existing.length > 0) {
    console.log(`\n⚠️  A user with email '${ADMIN_EMAIL}' already exists (id: ${existing[0].id}).`);
    console.log('   No changes were made.\n');
    process.exit(0);
  }

  const [owners] = await query("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='owner' AND u.status='active'");
  if (owners.length) throw new Error('An active owner already exists. Create additional administrators in the application.');

  // 3. Ensure 'owner' role exists
  let adminRoleId;
  const [roleRows] = await query("SELECT id FROM roles WHERE name = 'owner'");

  if (roleRows.length === 0) {
    console.log("   Creating 'owner' role...");
    const [roleResult] = await query(
      "INSERT INTO roles (name, description) VALUES ('owner', 'Primary sawmill owner with full control')"
    );
    adminRoleId = roleResult.insertId;
    console.log(`   ✓ Role 'owner' created (id: ${adminRoleId}).`);
  } else {
    adminRoleId = roleRows[0].id;
    console.log(`   ✓ Role 'owner' found (id: ${adminRoleId}).`);
  }

  // 4. Hash password (cost factor 12 — strong but reasonable for a script)
  console.log('   Hashing password...');
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  // 5. Insert admin user
  const [insertResult] = await query(
    `INSERT INTO users (username, email, password_hash, role_id, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [ADMIN_USERNAME, ADMIN_EMAIL, passwordHash, adminRoleId]
  );

  console.log('\n✅ Owner account created successfully:');
  console.log(`   ID       : ${insertResult.insertId}`);
  console.log(`   Username : ${ADMIN_USERNAME}`);
  console.log(`   Email    : ${ADMIN_EMAIL}`);
  console.log(`   Role     : owner (id: ${adminRoleId})`);
  console.log('\n   Log in at  http://localhost:5000  using the credentials you set.\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Script failed:', err.message || err);
    process.exit(1);
  });
