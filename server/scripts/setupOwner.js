#!/usr/bin/env node
'use strict';

/**
 * scripts/setupOwner.js
 *
 * Secure Sawmill Owner Provisioning & Password Reset Tool.
 *
 * Features:
 *  - Interactive prompt (with hidden password input) or reads from env vars:
 *      OWNER_USERNAME, OWNER_PASSWORD, OWNER_EMAIL
 *  - Upsert semantics:
 *      • If an active owner account already exists: securely updates username &
 *        resets password (hashed with bcrypt cost 12), increments token_version
 *        and revokes old sessions.
 *      • If no owner exists: safely creates the initial owner account.
 *  - Never stores plain-text passwords or outputs passwords in logs.
 *  - Does NOT delete existing business records.
 *  - Assigns full owner permissions.
 */

require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { query, withTransaction, testConnection } = require('../src/config/db');

function askQuestion(queryText, isPassword = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    if (!isPassword) {
      rl.question(queryText, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    } else {
      // Hidden password input
      process.stdout.write(queryText);
      const stdin = process.stdin;
      const oldRaw = stdin.isRaw;
      if (stdin.setRawMode) stdin.setRawMode(true);
      stdin.resume();

      let password = '';
      const onData = (char) => {
        const c = char.toString('utf8');
        switch (c) {
          case '\n':
          case '\r':
          case '\u0004':
            stdin.removeListener('data', onData);
            if (stdin.setRawMode) stdin.setRawMode(oldRaw || false);
            stdin.pause();
            process.stdout.write('\n');
            rl.close();
            resolve(password);
            break;
          case '\u0003': // Ctrl+C
            process.exit(1);
            break;
          case '\u0008': // Backspace
          case '\x7f':
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
            break;
          default:
            password += c;
            process.stdout.write('*');
            break;
        }
      };
      stdin.on('data', onData);
    }
  });
}

async function main() {
  console.log('===========================================================');
  console.log('   🪵  TimberCraft Sawmill — Owner Account Setup Tool');
  console.log('===========================================================\n');

  // Verify database connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('\n❌ Could not connect to MySQL. Ensure your database is running and server/.env credentials are correct.\n');
    process.exit(1);
  }

  let username = process.env.OWNER_USERNAME?.trim();
  let email = process.env.OWNER_EMAIL?.trim()?.toLowerCase();
  let password = process.env.OWNER_PASSWORD;

  // Interactive prompts if not provided via env
  if (!username) {
    username = await askQuestion('Enter your preferred Admin Username: ');
  }
  if (!username || username.length < 3) {
    console.error('\n❌ Error: Username must be at least 3 characters long.\n');
    process.exit(1);
  }

  if (!email) {
    const enteredEmail = await askQuestion('Enter your Admin Email (or press Enter for default: owner@sawmill.local): ');
    email = enteredEmail ? enteredEmail.toLowerCase() : 'owner@sawmill.local';
  }

  if (!password) {
    password = await askQuestion('Enter your preferred Password (min 12 characters): ', true);
    if (!password || password.length < 12) {
      console.error('\n❌ Error: Password must be at least 12 characters long for security compliance.\n');
      process.exit(1);
    }

    const confirmPassword = await askQuestion('Confirm your Password: ', true);
    if (password !== confirmPassword) {
      console.error('\n❌ Error: Passwords do not match. Aborting.\n');
      process.exit(1);
    }
  } else if (password.length < 12) {
    console.error('\n❌ Error: OWNER_PASSWORD must be at least 12 characters long.\n');
    process.exit(1);
  }

  console.log('\n🔒 Hashing password securely with bcrypt (12 rounds)...');
  const passwordHash = await bcrypt.hash(password, 12);

  // Self-verification of hash
  const hashValid = await bcrypt.compare(password, passwordHash);
  if (!hashValid) {
    console.error('❌ Internal error: bcrypt hash verification failed.');
    process.exit(1);
  }

  await withTransaction(async (conn) => {
    // 1. Ensure 'owner' role exists
    let [ownerRole] = await conn.execute("SELECT id FROM roles WHERE name = 'owner'");
    let ownerRoleId;

    if (ownerRole.length === 0) {
      const [insertRole] = await conn.execute(
        "INSERT INTO roles (name, description) VALUES ('owner', 'Primary sawmill owner with comprehensive, unrestricted system authority')"
      );
      ownerRoleId = insertRole.insertId;
      console.log(`   ✓ Created 'owner' role (id: ${ownerRoleId})`);
    } else {
      ownerRoleId = ownerRole[0].id;
    }

    // 2. Grant all system permissions to owner role
    await conn.execute(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id)
       SELECT ?, p.id FROM permissions p`,
      [ownerRoleId]
    );

    // 3. Check for existing owner account
    const [existingOwners] = await conn.execute(
      "SELECT id, username, email FROM users WHERE role_id = ? ORDER BY id ASC LIMIT 1",
      [ownerRoleId]
    );

    if (existingOwners.length > 0) {
      // RESET / UPDATE EXISTING OWNER
      const ownerId = existingOwners[0].id;
      console.log(`   ℹ Found existing owner account (ID: ${ownerId}, previous username: '${existingOwners[0].username}')`);
      console.log(`   🔄 Updating owner account credentials and resetting password...`);

      // Check if username collision with another non-owner user
      const [collisions] = await conn.execute(
        "SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id <> ?",
        [username, ownerId]
      );
      if (collisions.length > 0) {
        throw new Error(`Username '${username}' is already in use by another user account (ID ${collisions[0].id}). Choose a different username.`);
      }

      await conn.execute(
        `UPDATE users
         SET username = ?,
             email = ?,
             password_hash = ?,
             status = 'active',
             token_version = token_version + 1,
             updated_at = NOW()
         WHERE id = ?`,
        [username, email, passwordHash, ownerId]
      );

      // Invalidate existing sessions
      await conn.execute("DELETE FROM refresh_tokens WHERE user_id = ?", [ownerId]);

      // Audit log
      await conn.execute(
        "INSERT INTO audit_logs (user_id, action, table_name, record_id, description) VALUES (?, 'OWNER_PASSWORD_RESET', 'users', ?, 'Owner account credentials updated via secure CLI tool')",
        [ownerId, ownerId]
      );

      console.log('\n===========================================================');
      console.log('   ✅ OWNER ACCOUNT CREDENTIALS UPDATED SUCCESSFULLY!');
      console.log('===========================================================');
      console.log(`   Owner User ID  : ${ownerId}`);
      console.log(`   Username       : ${username}`);
      console.log(`   Email          : ${email}`);
      console.log(`   Role           : owner`);
      console.log(`   Status         : active`);
      console.log('\n   You can now log in at http://localhost:5173/admin/login using your chosen credentials.\n');
    } else {
      // CREATE INITIAL OWNER
      console.log(`   ✨ No owner account found. Creating initial owner account...`);

      // Check if username or email already taken
      const [existingUser] = await conn.execute(
        "SELECT id, role_id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)",
        [username, email]
      );

      if (existingUser.length > 0) {
        // Upgrade existing user to owner and update credentials
        const targetId = existingUser[0].id;
        console.log(`   ℹ Existing user found with this username/email (ID: ${targetId}). Upgrading to owner...`);

        await conn.execute(
          `UPDATE users
           SET username = ?,
               email = ?,
               password_hash = ?,
               role_id = ?,
               status = 'active',
               token_version = token_version + 1,
               updated_at = NOW()
           WHERE id = ?`,
          [username, email, passwordHash, ownerRoleId, targetId]
        );

        await conn.execute("DELETE FROM refresh_tokens WHERE user_id = ?", [targetId]);
        await conn.execute(
          "INSERT INTO audit_logs (user_id, action, table_name, record_id, description) VALUES (?, 'OWNER_UPGRADED', 'users', ?, 'Account upgraded to owner via secure CLI tool')",
          [targetId, targetId]
        );

        console.log('\n===========================================================');
        console.log('   ✅ OWNER ACCOUNT CREATED & ASSIGNED SUCCESSFULLY!');
        console.log('===========================================================');
        console.log(`   Owner User ID  : ${targetId}`);
        console.log(`   Username       : ${username}`);
        console.log(`   Email          : ${email}`);
        console.log(`   Role           : owner`);
        console.log(`   Status         : active`);
        console.log('\n   You can now log in at http://localhost:5173/admin/login using your chosen credentials.\n');
      } else {
        // Brand new insert
        const [insertResult] = await conn.execute(
          `INSERT INTO users (username, email, password_hash, role_id, status)
           VALUES (?, ?, ?, ?, 'active')`,
          [username, email, passwordHash, ownerRoleId]
        );

        const newId = insertResult.insertId;
        await conn.execute(
          "INSERT INTO audit_logs (user_id, action, table_name, record_id, description) VALUES (?, 'OWNER_INITIALIZED', 'users', ?, 'Initial owner account bootstrapped via secure CLI tool')",
          [newId, newId]
        );

        console.log('\n===========================================================');
        console.log('   ✅ INITIAL OWNER ACCOUNT CREATED SUCCESSFULLY!');
        console.log('===========================================================');
        console.log(`   Owner User ID  : ${newId}`);
        console.log(`   Username       : ${username}`);
        console.log(`   Email          : ${email}`);
        console.log(`   Role           : owner`);
        console.log(`   Status         : active`);
        console.log('\n   You can now log in at http://localhost:5173/admin/login using your chosen credentials.\n');
      }
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Setup failed:', err.message || err);
    process.exit(1);
  });

