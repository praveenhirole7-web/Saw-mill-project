'use strict';
/**
 * server.js — Saw Mill Management System API entry point
 *
 * Startup order:
 *  1. Load .env before anything else
 *  2. Import modules (db.js validates env vars and exits on missing credentials)
 *  3. Apply security headers (helmet)
 *  4. Register middleware and routes
 *  5. Start listening
 *  6. Test the database connection (non-fatal)
 */

// ── 1. Environment ─────────────────────────────────────────────────────────────
require('dotenv').config();

function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== 'production') return;

  const errors = [];
  const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_SSL_CA', 'CLIENT_URL', 'HEALTH_CHECK_TOKEN'];
  for (const name of required) {
    if (!process.env[name]?.trim()) errors.push(`${name} must be set.`);
  }

  for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'HEALTH_CHECK_TOKEN']) {
    const value = process.env[name] || '';
    if (value.length < 32 || /replace|change_me|your_secret|placeholder/i.test(value)) {
      errors.push(`${name} must be a unique random value with at least 32 characters.`);
    }
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different values.');
  }
  if (process.env.DB_SSL !== 'true') errors.push('DB_SSL must be true in production.');
  if (!['Strict', 'Lax', 'None'].includes(process.env.COOKIE_SAME_SITE || 'Strict')) {
    errors.push('COOKIE_SAME_SITE must be Strict, Lax, or None.');
  }
  const proxyHops = process.env.TRUST_PROXY_HOPS || '0';
  if (!/^\d+$/.test(proxyHops)) errors.push('TRUST_PROXY_HOPS must be a non-negative whole number.');

  try {
    const clientUrl = new URL(process.env.CLIENT_URL || '');
    if (clientUrl.protocol !== 'https:' || clientUrl.origin !== process.env.CLIENT_URL) {
      errors.push('CLIENT_URL must be an HTTPS origin without a path or trailing slash.');
    }
  } catch {
    errors.push('CLIENT_URL must be a valid HTTPS origin.');
  }

  if (errors.length) {
    console.error('[startup] Production environment is incomplete:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
}

validateProductionEnvironment();

const express      = require('express');
const cors         = require('cors');
const morgan       = require('morgan');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');

const { testConnection, query } = require('./config/db');
const csrfProtection     = require('./middleware/csrf');
const errorHandler       = require('./middleware/errorHandler');
const dbHealthRouter     = require('./routes/dbHealth');
const authRouter         = require('./routes/auth');
const inventoryRouter    = require('./routes/inventory');
const customersRouter    = require('./routes/customers');
const suppliersRouter    = require('./routes/suppliers');
const purchasesRouter    = require('./routes/purchases');
const cuttingJobsRouter  = require('./routes/cuttingJobs');
const salesOrdersRouter  = require('./routes/salesOrders');
const invoicesRouter     = require('./routes/invoices');
const expensesRouter     = require('./routes/expenses');
const employeesRouter    = require('./routes/employees');
const deliveriesRouter   = require('./routes/deliveries');
const enquiriesRouter    = require('./routes/enquiries');
const reportsRouter      = require('./routes/reports');
const catalogRouter      = require('./routes/catalog');
const woodTypesRouter    = require('./routes/woodTypes');

// ── 2. App ─────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

// ── 3. Security headers ────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: IS_PRODUCTION,     // only enforce CSP in production
  })
);

// ── 4. Middleware ──────────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,    // required for cookies to be sent cross-origin
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Health-Token', 'X-Requested-With', 'X-CSRF-Token'],
}));

app.use(cookieParser());                       // must come before routes that read cookies
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(csrfProtection);                        // protects cookie-authenticated mutating requests

if (process.env.NODE_ENV !== 'test') {
  morgan.token('safe-path', (req) => req.path);
  app.use(morgan(IS_PRODUCTION ? ':method :safe-path :status :response-time ms' : 'dev'));
}

// ── 5. Routes ──────────────────────────────────────────────────────────────────

// Public health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success:     true,
    status:      'online',
    app:         'Saw Mill Management System API',
    version:     '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp:   new Date().toISOString(),
  });
});

// Readiness probe for the hosting platform. Unlike /api/health, it also
// checks the database and returns 503 until MySQL is reachable.
app.get('/api/ready', async (req, res) => {
  try {
    await query('SELECT 1 AS ready');
    return res.status(200).json({ success: true, status: 'ready' });
  } catch {
    return res.status(503).json({ success: false, status: 'not_ready' });
  }
});

// Public catalog includes only currently available, mill-owned finished inventory.
app.use('/api/v1/catalog', catalogRouter);
app.use('/api/v1/wood-types', woodTypesRouter);

// Authentication routes — v1
app.use('/api/v1/auth', authRouter);

// Inventory routes — v1
app.use('/api/v1/inventory', inventoryRouter);

// Customer management routes — v1
app.use('/api/v1/customers', customersRouter);

// Supplier management routes — v1
app.use('/api/v1/suppliers', suppliersRouter);

// Purchase & timber intake routes — v1
app.use('/api/v1/purchases', purchasesRouter);

// Cutting floor & resaw schedule routes — v1
app.use('/api/v1/cutting-jobs', cuttingJobsRouter);

// Wholesale sales orders & fulfillment routes — v1
app.use('/api/v1/sales-orders', salesOrdersRouter);

// Invoicing, customer payments, reversals, and PDF documents — v1
app.use('/api/v1/invoices', invoicesRouter);

// Expense ledger and employee management — v1
app.use('/api/v1/expenses', expensesRouter);
app.use('/api/v1/employees', employeesRouter);
app.use('/api/v1/deliveries', deliveriesRouter);
app.use('/api/v1/enquiries', enquiriesRouter);
app.use('/api/v1/reports', reportsRouter);

// Protected database health check
app.use('/api/db-health', dbHealthRouter);

// ── Future route groups ────────────────────────────────────────────────────────
// const authenticate = require('./middleware/authenticate');
// app.use('/api/v1/inventory', authenticate, require('./routes/inventory'));
// app.use('/api/v1/customers', authenticate, require('./routes/customers'));
// ... etc.

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error:   `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// ── 6. Centralized error handler (must be last) ───────────────────────────────
app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log(' 🪵  Saw Mill Management System — API Server           ');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Listening   : http://localhost:${PORT}`);
    console.log(`  Health      : http://localhost:${PORT}/api/health`);
    console.log(`  Auth Login  : POST http://localhost:${PORT}/api/v1/auth/login`);
    console.log('───────────────────────────────────────────────────────');

    await testConnection();

    console.log('═══════════════════════════════════════════════════════');
    console.log('');
  });
}

module.exports = app;
