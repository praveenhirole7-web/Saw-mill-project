#!/usr/bin/env node
'use strict';

// Secure, one-time owner designation for an existing legacy administrator.
// Run only after applying database/011_staff_permissions.sql.
require('dotenv').config();
const { query, withTransaction, testConnection } = require('../src/config/db');
const username = process.env.OWNER_USERNAME?.trim();

async function main() {
  if (!username) throw new Error('Set OWNER_USERNAME to the existing administrator username.');
  if (!await testConnection()) throw new Error('Cannot connect to the configured database.');
  await withTransaction(async (conn) => {
    const [ownerRole] = await conn.execute("SELECT id FROM roles WHERE name='owner'");
    const [adminRole] = await conn.execute("SELECT id FROM roles WHERE name='admin'");
    if (!ownerRole.length || !adminRole.length) throw new Error('Run the base schema and staff permissions migration first.');
    const [owners] = await conn.execute("SELECT id FROM users WHERE role_id=? AND status='active' FOR UPDATE", [ownerRole[0].id]);
    if (owners.length) throw new Error('An active owner already exists.');
    const [target] = await conn.execute('SELECT id, role_id, status FROM users WHERE LOWER(username)=LOWER(?) FOR UPDATE', [username]);
    if (!target.length || Number(target[0].role_id) !== Number(adminRole[0].id) || target[0].status !== 'active') {
      throw new Error('The selected username must be an active existing admin account.');
    }
    await conn.execute('UPDATE users SET role_id=?, token_version=token_version+1 WHERE id=?', [ownerRole[0].id, target[0].id]);
    await conn.execute('DELETE FROM refresh_tokens WHERE user_id=?', [target[0].id]);
    await conn.execute(
      "INSERT INTO audit_logs (user_id, action, table_name, record_id, description) VALUES (?, 'OWNER_DESIGNATED', 'users', ?, 'Owner designated by secure server bootstrap')",
      [target[0].id, target[0].id]
    );
    console.log(`Owner role assigned to account ${username} (id ${target[0].id}).`);
  });
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Owner setup failed:', err.message || err);
  process.exit(1);
});
