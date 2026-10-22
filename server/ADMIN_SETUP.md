# Saw Mill Management System — Initial Administrator Setup Guide

This guide details the exact steps for bootstrapping the first system administrator account safely and securely.

---

## Security Architecture Decisions

1. **No Public Endpoint**: There is **no publicly accessible registration or privilege-elevation endpoint**. Creating an administrator requires direct server or database shell access.
2. **No Command-Line Arguments (`argv`)**: Credentials are read strictly from **environment variables** rather than CLI flags (such as `--password=...`) to prevent secret leakage in shell history (`~/.bash_history` or PowerShell `PSReadLine` history) and `ps` process tables.
3. **No Hardcoded Passwords**: The password is never stored or defaulted in source code.
4. **Strong Salted Hashing**: Passwords are encrypted using **bcrypt** with a cost factor of 12.
5. **Idempotent Execution**: If an account with the specified email already exists, the script halts safely without altering existing credentials.

---

## Prerequisites

1. Ensure MySQL is running and `sawmill_db` has the base schema and catalogue migrations applied:
   ```powershell
   mysql -u root -p sawmill_db < database/schema.sql
   mysql -u root -p sawmill_db < database/007_wood_type_catalogue.sql
   mysql -u root -p sawmill_db < database/009_additional_regional_wood_names.sql
   mysql -u root -p sawmill_db < database/010_invoice_wood_type_foreign_key.sql
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

### Option A: Windows PowerShell (Recommended for Windows)

In PowerShell, set the environment variables within your current process session, execute the bootstrap script, and remove the password variable from memory:

```powershell
# 1. Navigate to the server folder
cd "c:\Users\PRAVEEN\OneDrive\Desktop\Saw Mill\server"

# 2. Define the bootstrap administrator credentials
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_EMAIL    = "admin@timbercraft.com"
$env:ADMIN_PASSWORD = "StrongMasterAdminPassword2026!"   # Minimum 12 characters

# 3. Execute the bootstrap script
node scripts/createAdmin.js

# 4. Clear the password from PowerShell environment memory
Remove-Item Env:ADMIN_PASSWORD
```

### Option B: Linux / macOS / Bash

```bash
cd server
ADMIN_USERNAME="admin" \
ADMIN_EMAIL="admin@timbercraft.com" \
ADMIN_PASSWORD="StrongMasterAdminPassword2026!" \
node scripts/createAdmin.js
```

---

## Expected Output

Upon successful execution, the script verifies the database connection, ensures the `admin` role exists, hashes the password, and creates the account:

```text
🪵  Saw Mill — Admin Bootstrap Script

   ✓ Database connection established.
   ✓ Role 'admin' found (id: 1).
   Hashing password...

✅ Administrator account created successfully:
   ID       : 1
   Username : admin
   Email    : admin@timbercraft.com
   Role     : admin (id: 1)

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
3. Open `http://localhost:5173/login`.
4. Sign in using the email and password you configured. You will be authenticated and redirected to the `/admin` dashboard.

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
    },
    "accessToken": "eyJhbGciOi..."
  },
  "message": "Login successful."
}
```
