# Saw Mill Management System — Initial Administrator Setup Guide

This guide details how to bootstrap the sawmill OWNER account safely and securely.

---

## Security Architecture Decisions

1. **No Public Admin Registration**: Staff may request accounts publicly, but every request remains pending until an authorized admin approves it. Admin accounts are created by the owner or through the secure server bootstrap.
2. **No Command-Line Arguments (`argv`)**: Credentials are read strictly from **environment variables** rather than CLI flags (such as `--password=...`) to prevent secret leakage in shell history (`~/.bash_history` or PowerShell `PSReadLine` history) and `ps` process tables.
3. **No Hardcoded Passwords**: The password is never stored or defaulted in source code.
4. **Strong Salted Hashing**: Passwords are encrypted using **bcrypt** with a cost factor of 12.
5. **Idempotent Execution**: If an account with the specified email already exists, the script halts safely without altering existing credentials.

---

## Prerequisites

1. Ensure MySQL is running and `sawmill_db` has the base schema and migrations applied:
   ```powershell
   mysql -u root -p sawmill_db < database/schema.sql
   mysql -u root -p sawmill_db < database/007_wood_type_catalogue.sql
   mysql -u root -p sawmill_db < database/009_additional_regional_wood_names.sql
   mysql -u root -p sawmill_db < database/010_invoice_wood_type_foreign_key.sql
   mysql -u root -p sawmill_db < database/011_staff_permissions.sql
   ```

2. Ensure `server/.env` contains your database connection credentials and JWT secrets:
   ```ini
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=sawmill_db

   JWT_SECRET=your_long_random_jwt_secret_minimum_32_characters
   JWT_REFRESH_SECRET=your_long_random_refresh_secret_minimum_32_characters
   ```

---

## Step-by-Step Execution

### New installation: bootstrap the owner

In PowerShell, set the environment variables within your current process session, execute the bootstrap script, and remove the password variable from memory:

```powershell
# 1. Navigate to the server folder
cd "c:\Users\PRAVEEN\OneDrive\Desktop\Saw Mill\server"

# 2. Define the bootstrap owner credentials
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_EMAIL    = "admin@timbercraft.com"
$env:ADMIN_PASSWORD = "StrongMasterAdminPassword2026!"   # Minimum 12 characters

# 3. Execute the bootstrap script
node scripts/createAdmin.js

# 4. Clear the password from PowerShell environment memory
Remove-Item Env:ADMIN_PASSWORD
```

For an existing installation that already has an admin account, choose the existing admin account explicitly and assign it as the owner once:

```powershell
$env:OWNER_USERNAME = "existing-admin"
node scripts/promoteOwner.js
Remove-Item Env:OWNER_USERNAME
```

The promotion script refuses to replace an existing active owner and revokes the selected account's sessions.

### Linux / macOS / Bash

```bash
cd server
ADMIN_USERNAME="admin" \
ADMIN_EMAIL="admin@timbercraft.com" \
ADMIN_PASSWORD="StrongMasterAdminPassword2026!" \
node scripts/createAdmin.js
```

---

## Expected Output

Upon successful execution, the script verifies the database connection, ensures the `owner` role exists, hashes the password, and creates the account:

```text
🪵  Saw Mill — Admin Bootstrap Script

   ✓ Database connection established.
   ✓ Role 'owner' found (id: 1).
   Hashing password...

✅ Owner account created successfully:
   ID       : 1
   Username : admin
   Email    : admin@timbercraft.com
   Role     : owner (id: 1)

   Log in at http://localhost:5000 using the credentials you set.
```

---

## Verifying Administrator Login

### 1. Via Frontend UI
1. Start the backend:
   ```powershell
   npm run dev
   ```
2. Start the client:
   ```powershell
   cd ../client
   npm run dev
   ```
3. Open `http://localhost:5173/login`, choose **Admin Login**, then sign in with the email or username and password you configured. You will be redirected to the `/admin` dashboard.

### 2. Via REST API (cURL / HTTP Client)
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -c cookies.txt \
  -d '{"email":"admin@timbercraft.com","password":"StrongMasterAdminPassword2026!"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "admin",
      "name": "admin",
      "email": "admin@timbercraft.com",
      "role": "admin",
      "status": "active",
      "permissions": [
        "manage_users",
        "view_inventory",
        "manage_inventory",
        "manage_purchases",
        "manage_cutting_jobs",
        "manage_invoices",
        "view_reports"
      ]
    }
  },
  "message": "Login successful."
}
```

The access and refresh tokens are set only in HttpOnly cookies; the API does not return token strings in JSON.

## Creating staff accounts

After signing in, open **Manage Users** to create staff accounts or review public registration requests. Approvals activate the account only after you choose its exact permissions. The login selection screen also links to **Staff Registration**; these accounts cannot sign in while pending or after rejection. The OWNER can create administrators and choose their permissions. Only the OWNER or an administrator explicitly granted `manage_admins` can create and manage other admin accounts. OWNER accounts cannot be disabled from the application.
 