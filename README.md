# Saw-mill-project

## Saw Mill Management System (TimberCraft)

> A complete professional web application featuring both a public-facing sawmill business website and an internal enterprise management dashboard for logs, sawn lumber inventory, custom sawing orders, and invoicing.

For online hosting, production environment variables, database migrations, TLS, backups, and restore steps, see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 🪵 Project Overview

**TimberCraft** is engineered specifically for timber mills and wood processing facilities. It bridges the gap between commercial clients seeking lumber or custom sawing services and internal yard operators managing raw log inventory, blade cutting schedules, and billing.

### Primary Capabilities (Roadmap)
1. **Public Sawmill Portal**:
   - Live catalog of mill-owned finished timber currently available in inventory.
   - Quote, service, and contact requests saved through the public enquiries API.
2. **Internal Management Dashboard**:
   - **Log Yard Inventory**: Raw log entry with length, girth, and volumetric calculation (Cubic Feet / CBF).
   - **Sawn Timber Batching**: Finished stock tracking by thickness, width, length, and storage rack.
   - **Milling & Sawing Orders**: Custom cutting job scheduling and progress tracking.
   - **Invoicing & PDF Receipts**: Automated invoice calculation and PDF export via PDFKit.
   - **Expenses & Employees**: Auditable expense management and role-restricted employee compensation.
   - **Analytics & Metrics**: Visual yield reports, expense summaries, and sales charts via Recharts.

---

## 🛠️ Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 + Vite | High-performance, reactive user interface |
| **Frontend Routing** | React Router v7 | Public & protected dashboard routes |
| **Frontend Styling** | Custom CSS Design System | Forest green, warm wood brown, natural cream palette |
| **Icons & Charts** | Lucide React & Recharts | Industrial icons & interactive business charts |
| **Backend Framework** | Node.js + Express | Modular REST API server |
| **Database** | MySQL (with `mysql2/promise`) | Relational storage with connection pooling |
| **Authentication** | JWT & bcryptjs | Secure token-based auth with encrypted passwords |
| **PDF Generation** | PDFKit | Server-side invoice generation |
| **Process Runner** | Concurrently | Single-command multi-process orchestration |

---

## 📁 Project Architecture & Directory Structure

```text
Saw Mill/
├── client/                     # Frontend React (Vite) Application
│   ├── public/                 # Static public assets
│   ├── src/
│   │   ├── assets/             # Images, brand marks
│   │   ├── components/         # Reusable UI components (Navbar, Cards, etc.)
│   │   │   ├── common/
│   │   │   └── layout/
│   │   ├── context/            # Global authentication context
│   │   ├── pages/              # Public & Dashboard pages
│   │   │   ├── public/         # Home, Services, Quote Request
│   │   │   ├── dashboard/      # Logs, Inventory, Orders, Invoices
│   │   │   └── auth/           # Login, Register
│   │   ├── services/           # API request client
│   │   ├── App.jsx             # Main Application root
│   │   ├── index.css           # Core Design System (Timber palette & tokens)
│   │   └── main.jsx            # React DOM mounting
│   ├── .env.example            # Client environment template
│   ├── index.html              # HTML shell with Google Fonts
│   ├── package.json            # Client dependencies and scripts
│   └── vite.config.js          # Vite build configuration
│
├── server/                     # Backend Node.js & Express API
│   ├── database/
│   │   └── schema.sql          # MySQL database initialization script
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js           # MySQL connection pool with graceful ping
│   │   ├── controllers/        # Business logic controllers
│   │   ├── middleware/         # Auth, validation, & error handling
│   │   │   └── errorHandler.js # Centralized error handler
│   │   ├── routes/             # Express API routes
│   │   ├── utils/              # PDF generator and math helpers
│   │   └── server.js           # Express app bootstrap & listener
│   ├── .env.example            # Server environment template
│   └── package.json            # Server dependencies and scripts
│
├── .env.example                # Unified reference template
├── .gitignore                  # Git ignore rules for node_modules, build & envs
├── package.json                # Root orchestration scripts
└── README.md                   # Project documentation
```

---

## ⚙️ Environment Configuration

Environment files store all database credentials, port configurations, and JWT secrets. Never commit actual `.env` files to source control.

### 1. Server Configuration (`server/.env`)
Copy `server/.env.example` to `server/.env`:
```bash
cp server/.env.example server/.env
```
Populate your local MySQL credentials:
```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_actual_mysql_password
DB_NAME=sawmill_db

JWT_SECRET=super_secret_jwt_key_replace_this
JWT_EXPIRES_IN=24h

CLIENT_URL=http://localhost:5173
```

### 2. Client Configuration (`client/.env`)
Copy `client/.env.example` to `client/.env`:
```bash
cp client/.env.example client/.env
```
```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_APP_TITLE=TimberCraft Saw Mill
```

---

## 🚀 Getting Started & Execution Commands

### Step 1: Install Dependencies
Dependencies for root, client, and server can be installed all at once:
```bash
npm run install:all
```
*(Or navigate to `client` and `server` independently and run `npm install`)*

### Step 2: Initialize Database (MySQL)
Make sure your MySQL service is running, then load the initial schema:
```bash
mysql -u root -p < server/database/schema.sql
```
*(Alternatively, copy and paste the contents of `server/database/schema.sql` into MySQL Workbench or phpMyAdmin)*

### Step 2a: Create the first administrator

There is no public registration page. After creating the database, create the first staff administrator from the server using the secure bootstrap script. From PowerShell:

```powershell
cd server
$env:ADMIN_USERNAME = "milladmin"
$env:ADMIN_EMAIL = "admin@your-mill.com"
$env:ADMIN_PASSWORD = "use-a-unique-password-of-at-least-12-characters"
node scripts/createAdmin.js
Remove-Item Env:ADMIN_PASSWORD
cd ..
```

Use your own email and a unique password. Then start the app with `npm run dev`, open `http://localhost:5173/login`, and sign in with those credentials. Do not commit the password or place it in the source code. See [server/ADMIN_SETUP.md](server/ADMIN_SETUP.md) for details. Staff can then open **Inventory** and choose **Add Inventory Batch** to record raw logs or finished timber.

Existing installations should apply `server/database/003_billing_sequences_and_idempotency.sql` once after the initial schema. It adds concurrency-safe billing number sequences and payment idempotency/balance snapshots.

Existing installations should also apply `server/database/004_expenses_and_employees.sql` once. It creates the expense ledger/category and employee tables, and grants expense and employee permissions. Expense editing and reversal are recorded in the audit log; reversals require `reverse_expenses`. Employee salary fields are returned only to users with `view_employee_salary`; only users with `manage_employee_salary` can set them. The default grants limit salary viewing to administrators and accountants and salary changes to administrators. Attendance and payroll tax calculations are not included.

Existing installations should also apply `server/database/005_deliveries_and_enquiries.sql` once. It creates delivery tracking and public enquiry tables and grants delivery/enquiry permissions. A delivery can be scheduled only once for a completed (fully inventory-fulfilled) sales order; delivery transitions and customer/staff enquiry changes are retained in history. Staff can convert qualified enquiries into customers or draft quotations.

Public quote and contact forms submit to `/api/v1/enquiries/public`. The endpoint validates input, rejects its honeypot field, and permits up to five requests per IP address per 15-minute window using the Express in-memory rate-limit store. Deployments with multiple server instances should configure a shared rate-limit store; deployments behind a reverse proxy should configure Express `trust proxy` for the actual proxy topology so client IP limits are reliable. Staff enquiry data, including messages and internal notes, is available only through authenticated permission-protected endpoints.

The public product catalogue is served by `GET /api/v1/catalog/products`. It exposes only available, mill-owned sawn-timber listings and does not expose customer-owned inventory, internal batch identifiers, or cost prices. Quote, contact, and service submissions are stored through the enquiries endpoint; references shown to users come from the API response.

The client uses `VITE_API_BASE_URL` (for example, `http://localhost:5000/api`) for all API requests, including authentication refreshes and PDF/report downloads. This variable is public configuration and must not contain server secrets. Administrative user listing and creation use admin-only `/api/v1/auth/users` endpoints. Mill settings and notification controls are not presented as working features because the server currently has no persistent API for them.

Existing installations should apply `server/database/006_reporting_fifo_costing.sql` once after migration 005. It adds sales-line fulfillment cost snapshots, creates the reporting costing setting, and grants `view_reports` to administrators, managers, and accountants. Fresh installations receive the same tables and grants from `server/database/schema.sql`. Reports and dashboard data are served by authenticated `/api/v1/reports` endpoints; the report catalogue, data, CSV, and PDF exports all require `view_reports`.

Fresh and existing installations that use the wood catalogue should apply `server/database/007_wood_type_catalogue.sql` after the base schema. Existing installations should then apply `server/database/008_invoice_language_and_dimensions.sql` once to add invoice language, cutting charge, catalogue-name snapshots, and dimension fields.

### Reporting definitions and financial caveats

The Reports page uses database records only. Date filters are inclusive and each report uses the business event date shown here; current inventory and low-stock reports are snapshots and therefore do not take a date range:

| Report | Source and calculation |
| --- | --- |
| Sales by period | Completed sales orders, grouped by day, ISO week, or month using `order_date`. Sales = order subtotal − order discount + shipping; sales tax is excluded. |
| Sales by product / wood type | Completed order lines using line total less line tax. Order-level discounts are not allocated among products. |
| Purchases by supplier | Received purchase orders, grouped by supplier using actual delivery date (or purchase creation date when unavailable). |
| Raw / finished inventory | Current mill-owned raw-log or sawn-timber batches. Inventory value = on-hand quantity × recorded batch cost. |
| Low-stock batches | Current mill-owned batches whose available quantity is no greater than the configured minimum. |
| Cutting output / charges | Completed cutting jobs, filtered by completion date; waste is the recorded input less output, and charges are reported separately from sales. |
| Customer balances | Non-voided invoices, filtered by invoice issue date and using each invoice's authoritative `amount_due`; payments are not added a second time. |
| Supplier obligations | Ordered and received purchases, using purchase total cost less `paid_amount`; payment-ledger rows are not added again. |
| Operating expenses | Posted expense entries only, grouped by category using expense date. Reversed entries are excluded. |
| Gross margin / estimated net operating profit | Completed-order sales less recorded cost of goods sold gives gross margin; subtract posted operating expenses for estimated net operating profit. Payroll, tax, cutting charges, unrecognized invoices, and other unrecorded costs are not included. |
| Delivery status | Delivery records using planned delivery date and current status. Delivery history remains in delivery management. |
| Public enquiry conversion | Enquiries grouped by current status and creation date; conversion rate = converted enquiries ÷ matching enquiries. |

FIFO is the configured costing method. New order reservations and fulfillment lock matching mill-owned stock layers and reject a newer batch while an older matching batch has available stock; matching uses timber type, category, species, grade, dimensions, unit, and product name. To fulfill a quantity spanning multiple layers, split the sales order quantity across lines/batches in FIFO order. Fulfillment cost snapshots use the issued batches' recorded cost prices. Legacy completed sales without snapshots fall back to their recorded batch cost and are flagged; lines without a positive recorded cost are identified as uncosted. Historical sales are not rewritten, so verify legacy records before treating historical margins as FIFO-certified. Cutting output costs are allocated from recorded input batch costs; purchase-level discounts and taxes are not distributed into unit cost.

Report tables are paginated (up to 200 rows per API page). CSV exports are capped at 10,000 rows and PDF exports at 1,000 rows. Exports use the same report filters and permission as the on-screen data. Tax and profit treatment is descriptive reporting logic, not tax or accounting advice; configure the business's jurisdictional rules before relying on statutory figures.

### Invoice and payment operations

Billing routes are available under `/api/v1/invoices` for authenticated `admin`, `manager`, and `accountant` users. Invoice line prices, discounts, taxable value, tax and totals are recalculated by the API and persisted using MySQL `DECIMAL` columns. The invoice form requires an explicit tax rate for every invoice; select the rate according to the applicable tax jurisdiction and business rules. The API does not supply a tax default. Item-level discounts and invoice discounts reduce taxable value; the configured tax is calculated on that value, then additional charges are added after tax. Confirm this treatment against local rules before use.

Payment posts are idempotent, transactional and limited to the outstanding invoice balance. Reversals retain the original payment, append an offsetting ledger entry, and require a reason. Configure real PDF business identity values (`MILL_NAME`, `MILL_ADDRESS`, `MILL_PHONE`, `MILL_EMAIL`, and `MILL_TAX_ID`) in `server/.env` before producing customer-facing PDFs. Invoice preview opens the PDF in the browser for printing; downloads and payment receipts are also available from the billing pages.

### Step 3: Run Development Servers

You have multiple options to start the application:

#### Option A: Run Both Together (Recommended)
From the project root:
```bash
npm run dev
```
This boots both the Express API server (port 5000) and the Vite development client (port 5173) concurrently.

#### Option B: Run Individually
- **Run Backend only**:
  ```bash
  npm run dev:server
  # or cd server && npm run dev
  ```
- **Run Frontend only**:
  ```bash
  npm run dev:client
  # or cd client && npm run dev
  ```

---

## 🔍 Verification & Health Check

1. **Frontend App**: Open [http://localhost:5173](http://localhost:5173) in your browser.
2. **Backend API Health Check**: Visit [http://localhost:5000/api/health](http://localhost:5000/api/health).
   - Expected JSON response:
     ```json
     {
       "status": "online",
       "app": "Saw Mill Management System API",
       "version": "1.0.0",
       "timestamp": "..."
     }
     ```
